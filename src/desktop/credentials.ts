import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { StoredCredentials } from './types'
import { sanitizedChildEnv } from './child-process'

export interface CredentialStore {
    load(): StoredCredentials | null
    save(value: StoredCredentials): void
}

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

export class DpapiCredentialStore implements CredentialStore {
    constructor(readonly file: string) {}

    load() {
        if (!fs.existsSync(this.file)) return null
        const json = powershell(
            unprotectScript,
            fs.readFileSync(this.file, 'utf8')
        )
        return JSON.parse(json) as StoredCredentials
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

export class MemoryCredentialStore implements CredentialStore {
    value: StoredCredentials | null = null
    load() {
        return this.value ? { ...this.value } : null
    }
    save(value: StoredCredentials) {
        this.value = { ...value }
    }
}
