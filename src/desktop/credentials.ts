import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { StoredCredentials } from './types'
import { sanitizedChildEnv } from './child-process'

export interface CredentialStore {
    load(): StoredCredentials | null
    save(value: StoredCredentials): void
}

export type CredentialBackendKind =
    | 'windows-dpapi'
    | 'macos-keychain'
    | 'linux-secret-service'
    | 'session-memory'

export interface CredentialBackendStatus {
    kind: CredentialBackendKind
    securePersistence: boolean
    sessionOnly: boolean
    reason?: string
}

type SyncRunner = (
    command: string,
    args: readonly string[],
    options: {
        input?: string
        encoding: 'utf8'
        windowsHide: boolean
        env: NodeJS.ProcessEnv
        maxBuffer: number
        timeout: number
    }
) => SpawnSyncReturns<string>

const SERVICE = 'org.picalibrary.desktop'
const ACCOUNT = 'desktop-credentials'
const LINUX_ATTRIBUTES = [
    'application',
    'pica-library',
    'purpose',
    'desktop-credentials'
] as const

const protectScript = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$inputText=[Console]::In.ReadToEnd()
$bytes=[Text.Encoding]::UTF8.GetBytes($inputText)
$protected=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Convert]::ToBase64String($protected))
`
const unprotectScript = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$inputText=[Console]::In.ReadToEnd().Trim()
$bytes=[Convert]::FromBase64String($inputText)
$plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain))
`

function windowsPowerShell() {
    const executable = path.join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe'
    )
    if (!fs.existsSync(executable))
        throw new Error('Windows credential protection is unavailable')
    return executable
}

function powershell(script: string, stdin: string) {
    const result = spawnSync(
        windowsPowerShell(),
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
        {
            input: stdin,
            encoding: 'utf8',
            windowsHide: true,
            env: sanitizedChildEnv(),
            maxBuffer: 1024 * 1024
        }
    )
    if (result.status !== 0)
        throw new Error('Windows credential protection is unavailable')
    return result.stdout
}

function secureCommand(
    runner: SyncRunner,
    command: string,
    args: readonly string[],
    input?: string
) {
    return runner(command, args, {
        input,
        encoding: 'utf8',
        windowsHide: true,
        env: sanitizedChildEnv(),
        maxBuffer: 1024 * 1024,
        timeout: 3_000
    })
}

function credentialJson(value: string, backend: string) {
    try {
        const parsed = JSON.parse(value.trim())
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            throw new Error('Credential payload is not an object')
        return parsed as StoredCredentials
    } catch {
        throw new Error(`${backend} returned invalid credential data`)
    }
}

export class DpapiCredentialStore implements CredentialStore {
    constructor(readonly file: string) {}

    load() {
        if (!fs.existsSync(this.file)) return null
        const json = powershell(
            unprotectScript,
            fs.readFileSync(this.file, 'utf8')
        )
        return credentialJson(json, 'Windows DPAPI')
    }

    save(value: StoredCredentials) {
        if (process.platform !== 'win32')
            throw new Error(
                'Secure credential persistence requires Windows DPAPI'
            )
        const protectedValue = powershell(protectScript, JSON.stringify(value))
        fs.mkdirSync(path.dirname(this.file), { recursive: true })
        const temporary = `${this.file}.tmp`
        fs.writeFileSync(temporary, protectedValue, {
            encoding: 'utf8',
            mode: 0o600
        })
        fs.renameSync(temporary, this.file)
    }
}

export class MacKeychainCredentialStore implements CredentialStore {
    constructor(
        private readonly runner: SyncRunner = spawnSync as SyncRunner,
        private readonly executable = '/usr/bin/security'
    ) {}

    load() {
        const result = secureCommand(
            this.runner,
            this.executable,
            [
                'find-generic-password',
                '-a',
                ACCOUNT,
                '-s',
                SERVICE,
                '-w'
            ]
        )
        if (result.status === 0)
            return credentialJson(result.stdout, 'macOS Keychain')
        const error = String(result.stderr ?? '')
        if (
            /could not be found|SecKeychainSearchCopyNext|specified item.*not.*found/i.test(
                error
            )
        )
            return null
        throw new Error('macOS Keychain credential retrieval is unavailable')
    }

    save(value: StoredCredentials) {
        const serialized = JSON.stringify(value)
        const result = secureCommand(
            this.runner,
            this.executable,
            [
                'add-generic-password',
                '-U',
                '-a',
                ACCOUNT,
                '-s',
                SERVICE,
                '-w',
                serialized
            ]
        )
        if (result.status !== 0)
            throw new Error('macOS Keychain credential persistence is unavailable')
    }
}

export class SecretServiceCredentialStore implements CredentialStore {
    constructor(
        private readonly runner: SyncRunner = spawnSync as SyncRunner,
        private readonly executable = 'secret-tool'
    ) {}

    load() {
        const result = secureCommand(
            this.runner,
            this.executable,
            ['lookup', ...LINUX_ATTRIBUTES]
        )
        if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT')
            throw new Error('Linux Secret Service tooling is unavailable')
        if (result.status === 0)
            return result.stdout.trim()
                ? credentialJson(result.stdout, 'Linux Secret Service')
                : null
        if (!String(result.stderr ?? '').trim()) return null
        throw new Error('Linux Secret Service credential retrieval is unavailable')
    }

    save(value: StoredCredentials) {
        const result = secureCommand(
            this.runner,
            this.executable,
            [
                'store',
                '--label=Pica Library',
                ...LINUX_ATTRIBUTES
            ],
            JSON.stringify(value)
        )
        if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT')
            throw new Error('Linux Secret Service tooling is unavailable')
        if (result.status !== 0)
            throw new Error('Linux Secret Service credential persistence is unavailable')
    }
}

export class MemoryCredentialStore implements CredentialStore {
    value: StoredCredentials | null = null
    load() {
        return this.value ? { ...this.value } : null
    }
    save(value: StoredCredentials) {
        this.value = { ...value }
    }
}

function linuxSecretServiceProbe(runner: SyncRunner) {
    const result = secureCommand(runner, 'secret-tool', [
        'lookup',
        ...LINUX_ATTRIBUTES
    ])
    if (
        result.error &&
        (result.error as NodeJS.ErrnoException).code === 'ENOENT'
    )
        return {
            available: false,
            reason: 'Secret Service tooling is unavailable'
        }
    if (
        result.error ||
        result.signal ||
        (result.status !== 0 && String(result.stderr ?? '').trim())
    )
        return {
            available: false,
            reason: 'Secret Service is unavailable in this session'
        }
    // secret-tool exits non-zero with no stderr when the service is reachable
    // but no matching credential exists yet. That is still a usable backend.
    return { available: true, reason: undefined }
}

export function credentialStoreForPlatform(
    file: string,
    platform: NodeJS.Platform = process.platform,
    options: {
        runner?: SyncRunner
        fileExists?: (file: string) => boolean
    } = {}
): {
    store: CredentialStore
    status: CredentialBackendStatus
} {
    const runner = options.runner ?? (spawnSync as SyncRunner)
    const fileExists = options.fileExists ?? fs.existsSync
    if (platform === 'win32')
        return {
            store: new DpapiCredentialStore(file),
            status: {
                kind: 'windows-dpapi',
                securePersistence: true,
                sessionOnly: false
            }
        }
    if (platform === 'darwin' && fileExists('/usr/bin/security'))
        return {
            store: new MacKeychainCredentialStore(runner),
            status: {
                kind: 'macos-keychain',
                securePersistence: true,
                sessionOnly: false
            }
        }
    let linuxProbe:
        | { available: boolean; reason?: string }
        | undefined
    if (platform === 'linux') {
        linuxProbe = linuxSecretServiceProbe(runner)
        if (linuxProbe.available)
            return {
                store: new SecretServiceCredentialStore(runner),
                status: {
                    kind: 'linux-secret-service',
                    securePersistence: true,
                    sessionOnly: false
                }
            }
    }
    return {
        store: new MemoryCredentialStore(),
        status: {
            kind: 'session-memory',
            securePersistence: false,
            sessionOnly: true,
            reason:
                platform === 'darwin'
                    ? 'macOS Keychain tooling is unavailable'
                    : platform === 'linux'
                      ? linuxProbe?.reason ??
                        'Secret Service is unavailable in this session'
                      : 'No secure persistent credential backend is configured'
        }
    }
}
