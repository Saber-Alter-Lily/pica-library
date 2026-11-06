import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { sanitizedChildEnv, windowsExecutable } from '../desktop/child-process'
import { assertLegacyTransitionLockOwned, type LegacyTransitionLock } from './legacy-transition-lock'
import {
    checkedLegacyTransitionAuthority, legacyInstalledTreeIdentity, readLegacyRegularFile,
    type LegacyTransitionAuthority
} from './legacy-transition-identity'

export interface LegacyTransitionGuard {
    authority: LegacyTransitionAuthority
    installedTreeSha256: string
    profile: { home: string; library: string; configSha256: string | null }
    lock: LegacyTransitionLock
}

/** Read-only OS proof. Never terminate a PID supplied by a profile/instance file. */
export function assertLegacyApplicationStopped(applicationRoot: string, instanceFile?: string) {
    if (process.platform !== 'win32') throw Error('LEGACY_PROCESS_PROOF_WINDOWS_ONLY')
    let profilePid: number | null = null
    if (instanceFile) {
        try {
            if (path.basename(instanceFile) !== 'instance.json' || path.basename(path.dirname(instanceFile)) !== 'runtime-state') throw Error('unexpected instance path')
            const bytes = readLegacyRegularFile(path.dirname(path.dirname(instanceFile)), 'runtime-state/instance.json', 16 * 1024)
            const value = JSON.parse(bytes.toString('utf8')) as { pid?: unknown }
            if (!Number.isSafeInteger(value.pid) || Number(value.pid) <= 0) throw Error('invalid instance')
            profilePid = Number(value.pid)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw Error('LEGACY_PROFILE_INSTANCE_UNREADABLE')
        }
    }
    // Only an integer derived above is interpolated, never a path, URL or user text.
    const filter = "Name='node.exe' OR Name='Pica Library.exe' OR Name='java.exe' OR Name='javaw.exe'" +
        (profilePid === null ? '' : ' OR ProcessId=' + profilePid)
    const result = spawnSync(windowsExecutable('System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
        '$ErrorActionPreference="Stop";[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);' +
        '@(Get-CimInstance Win32_Process -Filter "' + filter + '" ' +
        '| Select-Object ProcessId,ExecutablePath) | ConvertTo-Json -Compress'
    ], { encoding: 'utf8', windowsHide: true, env: sanitizedChildEnv(), timeout: 10_000, maxBuffer: 4 * 1024 * 1024 })
    if (result.error || result.status !== 0 || result.signal) throw Error('LEGACY_PROCESS_PROOF_UNAVAILABLE')
    let values: unknown
    try { values = JSON.parse(result.stdout.trim() || '[]') } catch { throw Error('LEGACY_PROCESS_PROOF_INVALID') }
    const rows: unknown[] = Array.isArray(values) ? values : [values]
    const root = fs.realpathSync.native(applicationRoot).toLowerCase()
    for (const row of rows) {
        if (!row || typeof row !== 'object' || !('ProcessId' in row) || !('ExecutablePath' in row) ||
            !Number.isSafeInteger(row.ProcessId) || Number(row.ProcessId) <= 0 || typeof row.ExecutablePath !== 'string' || !row.ExecutablePath)
            throw Error('LEGACY_PROCESS_OWNERSHIP_UNKNOWN')
        let executable: string
        try { executable = fs.realpathSync.native(row.ExecutablePath).toLowerCase() }
        catch { throw Error('LEGACY_PROCESS_OWNERSHIP_UNKNOWN') }
        if (row.ProcessId === profilePid) throw Error('CLOSE_SELECTED_PROFILE_APPLICATION_FIRST')
        const relative = path.relative(root, executable)
        if (relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
            throw Error('CLOSE_SELECTED_LEGACY_APPLICATION_FIRST')
    }
}

/** The SAME transaction helper repeats old-tree and exit proof after its coordinator exits. */
export function assertLegacyTransitionPreApply(input: {
    applicationRoot: string; targetVersion: string; targetSourceSha: string; instanceFile: string
    desktopHomeRoot: string; libraryDirectory: string
    legacyTransition?: LegacyTransitionGuard
}) {
    const guard = input.legacyTransition
    if (!guard) return
    assertLegacyTransitionLockOwned(guard.lock, input.applicationRoot)
    try {
        const authority = checkedLegacyTransitionAuthority({ authority: guard.authority, platform: process.platform,
            toolRoot: '', localAppData: '' })
        if (authority.target.channel !== 'stable' || authority.target.sourceSha !== input.targetSourceSha ||
            authority.target.version !== input.targetVersion || !/^[a-f0-9]{64}$/.test(guard.installedTreeSha256) ||
            legacyInstalledTreeIdentity(input.applicationRoot, authority) !== guard.installedTreeSha256)
            throw Error('LEGACY_TRANSITION_IDENTITY_CHANGED')
        if (guard.profile.home !== input.desktopHomeRoot || guard.profile.library !== input.libraryDirectory)
            throw Error('LEGACY_TRANSITION_PROFILE_CHANGED')
        let digest: string | null = null
        try {
            digest = createHash('sha256').update(readLegacyRegularFile(input.desktopHomeRoot, 'config/config.json', 1024 * 1024)).digest('hex')
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        if (digest !== guard.profile.configSha256) throw Error('LEGACY_TRANSITION_PROFILE_CHANGED')
    } catch { throw Error('LEGACY_TRANSITION_IDENTITY_CHANGED') }
    assertLegacyApplicationStopped(input.applicationRoot, input.instanceFile)
}
