import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { sqliteDiskFilename } from '../storage/sqlite/filename'
import type { FullApplicationUpdaterInstruction, UpdateProgress } from './types'

function writeProgress(file: string, value: Omit<UpdateProgress, 'updatedAt'>) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(
        file,
        JSON.stringify({ ...value, updatedAt: new Date().toISOString() }),
        'utf8'
    )
}

/** Status storage must never prevent recovery of the application or user state. */
function reportRecoveryProgress(
    file: string,
    value: Omit<UpdateProgress, 'updatedAt'>
) {
    try {
        writeProgress(file, value)
    } catch {
        console.error('Upgrade recovery continues; status could not be saved.')
    }
}

function alive(pid: number) {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

async function waitForExit(pid: number, timeoutMs = 30_000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
        if (!alive(pid)) return
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Pica Library did not exit before the full-upgrade timeout')
}

function normalized(value: string) {
    return path.resolve(value)
}

function assertOutside(child: string, parent: string, label: string) {
    const candidate = normalized(child)
    const root = normalized(parent)
    const relative = path.relative(root, candidate)
    if (
        candidate === root ||
        (!relative.startsWith('..' + path.sep) &&
            relative !== '..' &&
            !path.isAbsolute(relative))
    )
        throw new Error(label + ' must be outside the application directory')
}

function requiredApplicationFiles(root: string) {
    return [
        'Pica Library.exe',
        path.join('runtime', 'node.exe'),
        path.join('app', 'desktop.js'),
        path.join('app', 'updater.js'),
        path.join('app', 'full-upgrader.js'),
        'SOURCE_SHA.txt'
    ].map((item) => path.join(root, item))
}

function validateStagedApplication(
    instruction: FullApplicationUpdaterInstruction
) {
    if (process.platform !== 'win32')
        throw new Error(
            'Universal full-application upgrade is currently supported on Windows only'
        )
    sqliteDiskFilename(path.resolve(instruction.libraryDirectory, 'library.db'))
    assertOutside(
        instruction.bootstrapRoot,
        instruction.applicationRoot,
        'Upgrade bootstrap directory'
    )
    assertOutside(
        instruction.desktopHomeRoot,
        instruction.applicationRoot,
        'Desktop user-data directory'
    )
    assertOutside(
        instruction.libraryDirectory,
        instruction.applicationRoot,
        'Library directory'
    )
    assertOutside(
        instruction.stagedApplicationRoot,
        instruction.applicationRoot,
        'Staged application directory'
    )
    assertOutside(
        instruction.backupRoot,
        instruction.applicationRoot,
        'Application backup directory'
    )
    for (const file of requiredApplicationFiles(
        instruction.stagedApplicationRoot
    ))
        if (!fs.existsSync(file))
            throw new Error(
                'Staged full application is incomplete: ' +
                    path.relative(instruction.stagedApplicationRoot, file)
            )
    const sourceSha = fs
        .readFileSync(
            path.join(instruction.stagedApplicationRoot, 'SOURCE_SHA.txt'),
            'utf8'
        )
        .trim()
    if (sourceSha !== instruction.targetSourceSha)
        throw new Error('Staged full application source SHA does not match')
}

function copyTree(source: string, destination: string) {
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.cpSync(source, destination, {
        recursive: true,
        force: true,
        errorOnExist: false
    })
}

function snapshotUserState(instruction: FullApplicationUpdaterInstruction) {
    const snapshot = path.join(instruction.bootstrapRoot, 'user-state-snapshot')
    fs.rmSync(snapshot, { recursive: true, force: true })
    fs.mkdirSync(snapshot, { recursive: true })

    const config = path.join(instruction.desktopHomeRoot, 'config')
    if (fs.existsSync(config)) copyTree(config, path.join(snapshot, 'config'))

    const database = path.join(instruction.libraryDirectory, 'library.db')
    const databaseSnapshot = path.join(snapshot, 'database')
    fs.mkdirSync(databaseSnapshot, { recursive: true })
    for (const suffix of ['', '-wal', '-shm']) {
        const source = database + suffix
        if (fs.existsSync(source))
            fs.copyFileSync(
                source,
                path.join(databaseSnapshot, 'library.db' + suffix)
            )
    }
    return snapshot
}

function restoreUserState(
    instruction: FullApplicationUpdaterInstruction,
    snapshot: string
) {
    const savedConfig = path.join(snapshot, 'config')
    const config = path.join(instruction.desktopHomeRoot, 'config')
    if (fs.existsSync(savedConfig)) {
        fs.rmSync(config, { recursive: true, force: true })
        copyTree(savedConfig, config)
    }

    const database = path.join(instruction.libraryDirectory, 'library.db')
    const savedDatabase = path.join(snapshot, 'database')
    for (const suffix of ['', '-wal', '-shm']) {
        const target = database + suffix
        fs.rmSync(target, { force: true })
        const source = path.join(savedDatabase, 'library.db' + suffix)
        if (fs.existsSync(source)) {
            fs.mkdirSync(path.dirname(target), { recursive: true })
            fs.copyFileSync(source, target)
        }
    }
}

async function launchApplication(root: string) {
    const launcher = path.join(root, 'Pica Library.exe')
    if (!fs.existsSync(launcher))
        throw new Error('Pica Library launcher is missing after replacement')
    const child = spawn(launcher, ['--no-open'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        cwd: root
    })
    // spawn() returns before CreateProcess/exec has succeeded. Keep its error in
    // the transaction rather than crashing this helper via an unhandled event.
    await new Promise<void>((resolve, reject) => {
        child.once('error', reject)
        child.once('spawn', resolve)
    })
    child.unref()
}

function readInstance(file: string) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8')) as {
            pid?: number
            url?: string
        }
    } catch {
        return null
    }
}

function safeLoopbackUrl(value: unknown) {
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

async function health(instruction: FullApplicationUpdaterInstruction) {
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

async function stopPublishedInstance(instanceFile: string) {
    const instance = readInstance(instanceFile)
    const pid = Number(instance?.pid ?? 0)
    if (!Number.isInteger(pid) || pid <= 0 || !alive(pid)) return
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
                    return
                }
            }
        } catch {
            // A partially started/broken replacement may not expose its controller.
        }
    }
    try {
        process.kill(pid)
    } catch {
        if (!alive(pid)) return
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
}

function removeApplicationTree(root: string) {
    // Node's bounded retry handles Windows launcher/child/antivirus lock release.
    fs.rmSync(root, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100
    })
}

function cleanupHealthyRecovery(
    instruction: FullApplicationUpdaterInstruction,
    snapshot: string
) {
    try {
        removeApplicationTree(instruction.backupRoot)
        removeApplicationTree(snapshot)
    } catch {
        writeProgress(instruction.progressFile, {
            phase: 'complete',
            targetVersion: instruction.targetVersion,
            message:
                'Update completed; temporary recovery files were retained for later cleanup.'
        })
    }
}

function openBrowserFallback(value: string | null) {
    if (!value || process.platform !== 'win32') return
    const url = safeLoopbackUrl(value)
    if (!url) return
    const child = spawn(
        'rundll32.exe',
        ['url.dll,FileProtocolHandler', url.origin],
        { detached: true, stdio: 'ignore', windowsHide: true }
    )
    child.once('error', () => {
        // Browser opening is a convenience after proven health, not a commit gate.
    })
    child.unref()
}

function replaceApplication(
    instruction: FullApplicationUpdaterInstruction,
    backedUp: () => void
) {
    if (fs.existsSync(instruction.backupRoot))
        throw new Error(
            'Application backup directory already exists: ' +
                instruction.backupRoot
        )
    fs.renameSync(instruction.applicationRoot, instruction.backupRoot)
    // Record ownership immediately after the rename. A partial copy must use the
    // same outer recovery path, including user-state restoration and awaited launch.
    backedUp()
    copyTree(instruction.stagedApplicationRoot, instruction.applicationRoot)
}

function rollbackApplication(instruction: FullApplicationUpdaterInstruction) {
    if (!fs.existsSync(instruction.backupRoot))
        throw new Error('Application backup is unavailable for rollback')
    removeApplicationTree(instruction.applicationRoot)
    fs.renameSync(instruction.backupRoot, instruction.applicationRoot)
}

export async function runFullApplicationUpgrade(
    instruction: FullApplicationUpdaterInstruction
) {
    process.chdir(instruction.bootstrapRoot)
    validateStagedApplication(instruction)
    let snapshot = ''
    let replaced = false
    let committed = false
    try {
        writeProgress(instruction.progressFile, {
            phase: 'waiting-for-exit',
            targetVersion: instruction.targetVersion
        })
        await waitForExit(instruction.parentPid)
        fs.rmSync(instruction.instanceFile, { force: true })

        writeProgress(instruction.progressFile, {
            phase: 'preparing-backup',
            targetVersion: instruction.targetVersion
        })
        snapshot = snapshotUserState(instruction)

        writeProgress(instruction.progressFile, {
            phase: 'replacing-files',
            targetVersion: instruction.targetVersion
        })
        replaceApplication(instruction, () => { replaced = true })

        const installedSource = fs
            .readFileSync(
                path.join(instruction.applicationRoot, 'SOURCE_SHA.txt'),
                'utf8'
            )
            .trim()
        if (installedSource !== instruction.targetSourceSha)
            throw new Error('Installed application source SHA does not match')

        writeProgress(instruction.progressFile, {
            phase: 'starting',
            targetVersion: instruction.targetVersion
        })
        await launchApplication(instruction.applicationRoot)

        writeProgress(instruction.progressFile, {
            phase: 'health-check',
            targetVersion: instruction.targetVersion
        })
        const healthy = await health(instruction)
        if (!healthy.ok)
            throw new Error(
                'Updated application failed its startup/migration health check'
            )

        committed = true

        writeProgress(instruction.progressFile, {
            phase: 'complete',
            targetVersion: instruction.targetVersion
        })

        if (
            healthy.url &&
            instruction.previousUrl &&
            safeLoopbackUrl(instruction.previousUrl)?.origin !== healthy.url
        )
            openBrowserFallback(healthy.url)

        cleanupHealthyRecovery(instruction, snapshot)
    } catch (error) {
        if (committed) {
            // Reporting/cleanup failure after proven health must not undo a good installation.
            try {
                writeProgress(instruction.progressFile, {
                    phase: 'complete',
                    targetVersion: instruction.targetVersion,
                    message:
                        'Update completed; recovery/report cleanup is pending.'
                })
            } catch {
                /* Preserve the healthy application and recovery files. */
            }
            return
        }
        reportRecoveryProgress(instruction.progressFile, {
            phase: 'rollback',
            targetVersion: instruction.targetVersion,
            message: error instanceof Error ? error.message : String(error)
        })
        try {
            await stopPublishedInstance(instruction.instanceFile)
            fs.rmSync(instruction.instanceFile, { force: true })
            if (replaced) rollbackApplication(instruction)
            if (snapshot) restoreUserState(instruction, snapshot)
            await launchApplication(instruction.applicationRoot)
        } catch (rollbackError) {
            reportRecoveryProgress(instruction.progressFile, {
                phase: 'failed',
                targetVersion: instruction.targetVersion,
                message:
                    'Full update and rollback failed: ' +
                    (rollbackError instanceof Error
                        ? rollbackError.message
                        : String(rollbackError))
            })
            throw rollbackError
        }
        reportRecoveryProgress(instruction.progressFile, {
            phase: 'failed',
            targetVersion: instruction.targetVersion,
            message: error instanceof Error ? error.message : String(error)
        })
        throw error
    }
}

export const fullUpgradeInternals = {
    stopPublishedInstance,
    removeApplicationTree,
    rollbackApplication,
    cleanupHealthyRecovery
}

async function main() {
    const instructionFile = process.argv[2]
    if (!instructionFile)
        throw new Error('Full-upgrader instruction is required')
    const instruction = JSON.parse(
        fs.readFileSync(instructionFile, 'utf8')
    ) as FullApplicationUpdaterInstruction
    await runFullApplicationUpgrade(instruction)
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
    void main().catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
