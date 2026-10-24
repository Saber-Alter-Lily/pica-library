import fs from 'node:fs'
import path from 'node:path'
import { spawn, type SpawnOptions } from 'node:child_process'
import type { UpdateProgress } from './types'
export interface UpgradeHealthInput {
    instanceFile: string
    healthTimeoutMs: number
    targetVersion: string
}

export async function launchDetached(
    executable: string,
    args: readonly string[],
    options: Pick<SpawnOptions, 'cwd' | 'env'> = {}
) {
    const child = spawn(executable, [...args], {
        ...options,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
    })
    await new Promise<void>((resolve, reject) => {
        child.once('error', reject)
        child.once('spawn', resolve)
    })
    child.unref()
    return child
}

export function writeProgress(
    file: string,
    value: Omit<UpdateProgress, 'updatedAt'>
) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(
        file,
        JSON.stringify({ ...value, updatedAt: new Date().toISOString() }),
        'utf8'
    )
}

export function reportRecoveryProgress(
    file: string,
    value: Omit<UpdateProgress, 'updatedAt'>
) {
    try {
        writeProgress(file, value)
    } catch {
        console.error('Upgrade recovery continues; status could not be saved.')
    }
}

export function alive(pid: number) {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

export async function waitForExit(pid: number, timeoutMs = 30_000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
        if (!alive(pid)) return
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Pica Library did not exit before the full-upgrade timeout')
}

export async function launchApplication(root: string) {
    const launcher = path.join(root, 'Pica Library.exe')
    if (!fs.existsSync(launcher))
        throw new Error('Pica Library launcher is missing after replacement')
    return launchDetached(launcher, ['--no-open'], { cwd: root })
}

export function readInstance(file: string) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8')) as {
            pid?: number
            url?: string
        }
    } catch {
        return null
    }
}

export function safeLoopbackUrl(value: unknown) {
    try {
        const url = new URL(String(value ?? ''))
        if (
            url.protocol !== 'http:' ||
            !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        )
            return null
        return url
    } catch {
        return null
    }
}

export async function health(instruction: UpgradeHealthInput) {
    const started = Date.now()
    while (Date.now() - started < instruction.healthTimeoutMs) {
        try {
            const instance = readInstance(instruction.instanceFile)
            const url = safeLoopbackUrl(instance?.url)
            if (url) {
                const response = await fetch(
                    new URL('/api/v1/capabilities', url),
                    { signal: AbortSignal.timeout(1500) }
                )
                const value = (await response.json()) as {
                    appVersion?: string
                }
                if (
                    response.ok &&
                    value.appVersion === instruction.targetVersion
                )
                    return {
                        ok: true as const,
                        url: url.origin
                    }
            }
        } catch {
            // Expected while the replacement application starts/migrates.
        }
        await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return { ok: false as const, url: null }
}

/** False means ownership/exit is unknown, never permission to overwrite live files. */
export async function stopPublishedInstance(
    instanceFile: string
): Promise<boolean> {
    const instance = readInstance(instanceFile)
    const pid = Number(instance?.pid ?? 0)
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false
    if (!alive(pid)) return true
    const url = safeLoopbackUrl(instance?.url)
    if (url) {
        try {
            const status = await fetch(`${url.origin}/api/v1/desktop/status`, {
                signal: AbortSignal.timeout(1500)
            })
            const desktop = (await status.json()) as { csrfToken?: string }
            if (
                status.ok &&
                typeof desktop.csrfToken === 'string' &&
                desktop.csrfToken.length <= 256
            ) {
                const stopped = await fetch(
                    `${url.origin}/api/v1/desktop/shutdown`,
                    {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json',
                            'x-pica-csrf': desktop.csrfToken,
                            Origin: url.origin
                        },
                        body: '{}',
                        signal: AbortSignal.timeout(3000)
                    }
                )
                if (stopped.ok) {
                    await waitForExit(pid, 8_000)
                    return true
                }
            }
        } catch {
            // A partially started/broken replacement may not expose its controller.
        }
    }
    try {
        process.kill(pid)
    } catch {
        if (!alive(pid)) return true
        throw new Error(
            'The replacement process could not be stopped for rollback'
        )
    }
    try {
        await waitForExit(pid, 8_000)
    } catch {
        try {
            process.kill(pid, 'SIGKILL')
        } catch {
            if (alive(pid))
                throw new Error(
                    'The replacement process is still running; application backup retained'
                )
        }
        await waitForExit(pid, 8_000)
    }
    return true
}
