import fs from 'node:fs'
import path from 'node:path'
import type { ChildProcess, SpawnOptions } from 'node:child_process'
import { launchDetached } from './process-lifecycle'

export interface HelperReadiness {
    readyFile?: string
    readyNonce?: string
    parentPid: number
    progressFile: string
    bootstrapRoot?: string
}
export type UpgradeHelperKind = 'incremental' | 'full-application'
export class UpgradeHelperStopError extends Error {}

/** Additive internal handshake. Legacy direct invocations may omit both fields. */
export function publishHelperReady(
    input: HelperReadiness,
    kind: UpgradeHelperKind
) {
    if (input.readyFile === undefined && input.readyNonce === undefined) return
    if (
        !input.readyFile ||
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(
            input.readyNonce ?? ''
        )
    )
        throw new Error('Invalid upgrade helper readiness identity')
    const parent = path.dirname(path.resolve(input.readyFile))
    if (
        path.basename(input.readyFile) !==
            `helper-ready-${input.readyNonce}.json` ||
        ![
            path.dirname(path.resolve(input.progressFile)),
            ...(input.bootstrapRoot ? [path.resolve(input.bootstrapRoot)] : [])
        ].includes(parent)
    )
        throw new Error(
            'Upgrade helper readiness path is outside its private state directory'
        )
    if (fs.existsSync(input.readyFile))
        throw new Error('Upgrade helper readiness file already exists')
    const temporary = input.readyFile + '.new'
    fs.writeFileSync(
        temporary,
        JSON.stringify({
            schemaVersion: 1,
            kind,
            nonce: input.readyNonce,
            parentPid: input.parentPid,
            pid: process.pid
        }),
        { encoding: 'utf8', flag: 'wx' }
    )
    fs.renameSync(temporary, input.readyFile)
}

/** An unacknowledged orphan must never apply an update when the user later closes the app. */
export async function prepareHelperStartup(
    input: HelperReadiness,
    kind: UpgradeHelperKind,
    timeoutMs = 15_000
) {
    publishHelperReady(input, kind)
    if (!input.readyFile) return
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
        let value: Record<string, unknown> | null = null
        try {
            value = JSON.parse(
                fs.readFileSync(input.readyFile + '.accepted', 'utf8')
            )
        } catch {
            /* Parent has not accepted yet. */
        }
        if (value) {
            if (
                value.nonce !== input.readyNonce ||
                value.pid !== process.pid ||
                value.parentPid !== input.parentPid ||
                value.kind !== kind
            )
                throw new Error(
                    'Upgrade helper acceptance does not match this invocation'
                )
            return
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(
        'Upgrade helper was not accepted; no application or user data was changed'
    )
}

export async function waitForHelperReady(
    child: ChildProcess,
    input: HelperReadiness,
    kind: UpgradeHelperKind,
    timeoutMs = 15_000
) {
    if (!input.readyFile || !input.readyNonce)
        throw new Error('Upgrade helper readiness is required before app exit')
    let exited = child.exitCode !== null && child.exitCode !== undefined,
        failure: Error | null = null
    const onExit = () => {
            exited = true
        },
        onError = (error: Error) => {
            failure = error
        }
    child.once('exit', onExit)
    child.once('error', onError)
    const started = Date.now()
    try {
        while (Date.now() - started < timeoutMs) {
            if (exited || child.exitCode != null || child.signalCode != null)
                throw new Error(
                    'Upgrade helper exited before startup confirmation; current app was kept running'
                )
            if (failure) throw failure
            let value: Record<string, unknown> | null = null
            try {
                value = JSON.parse(fs.readFileSync(input.readyFile, 'utf8'))
            } catch {
                /* Not yet published, or an incomplete write. */
            }
            if (value) {
                if (
                    value.schemaVersion !== 1 ||
                    value.kind !== kind ||
                    value.nonce !== input.readyNonce ||
                    value.parentPid !== input.parentPid ||
                    value.pid !== child.pid
                )
                    throw new Error(
                        'Upgrade helper startup confirmation does not match this invocation'
                    )
                fs.writeFileSync(
                    input.readyFile + '.accepted',
                    JSON.stringify(value),
                    { encoding: 'utf8', flag: 'wx' }
                )
                return
            }
            await new Promise((resolve) => setTimeout(resolve, 50))
        }
        throw new Error(
            'Upgrade helper startup confirmation timed out; current app was kept running'
        )
    } finally {
        child.off('exit', onExit)
        child.off('error', onError)
    }
}

async function stopUnreadyHelper(child: ChildProcess) {
    if (child.exitCode != null || child.signalCode != null) return
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup()
            reject(
                new UpgradeHelperStopError(
                    'Unconfirmed upgrade helper is still running; retry is unsafe'
                )
            )
        }, 3000)
        const done = () => {
            cleanup()
            resolve()
        }
        const cleanup = () => {
            clearTimeout(timeout)
            child.off('exit', done)
        }
        child.once('exit', done)
        try {
            if (!child.kill()) {
                cleanup()
                reject(
                    new UpgradeHelperStopError(
                        'Unconfirmed upgrade helper could not be stopped'
                    )
                )
            }
        } catch {
            cleanup()
            reject(
                new UpgradeHelperStopError(
                    'Unconfirmed upgrade helper could not be stopped'
                )
            )
        }
    })
}

/** Only the child created here can be stopped; never a PID from a user instance file. */
export async function startUpgradeHelper(
    executable: string,
    args: readonly string[],
    options: Pick<SpawnOptions, 'cwd' | 'env'>,
    input: HelperReadiness,
    kind: UpgradeHelperKind
) {
    const child = await launchDetached(executable, args, options)
    try {
        await waitForHelperReady(child, input, kind)
        return child
    } catch (error) {
        await stopUnreadyHelper(child)
        throw error
    }
}
