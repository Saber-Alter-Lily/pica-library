import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
    MacKeychainCredentialStore,
    SecretServiceCredentialStore,
    credentialStoreForPlatform
} from '../../src/desktop/credentials'

const roots: string[] = []

function result(
    status: number | null,
    stdout = '',
    stderr = '',
    error?: Error
) {
    return {
        pid: 1,
        output: [null, stdout, stderr],
        stdout,
        stderr,
        status,
        signal: null,
        error
    } as never
}

afterEach(() => {
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('Desktop secure credential backends P4B', () => {
    it('stores macOS Keychain payload through stdin instead of command arguments', () => {
        const credentials = {
            account: 'synthetic-account',
            password: 'synthetic-password'
        }
        const calls: Array<{
            command: string
            args: readonly string[]
            input?: string
        }> = []
        const runner = ((
            command: string,
            args: readonly string[],
            options: { input?: string }
        ) => {
            calls.push({ command, args, input: options.input })
            if (args[0] === 'find-generic-password')
                return result(0, JSON.stringify(credentials) + '\n')
            return result(0)
        }) as never

        const store = new MacKeychainCredentialStore(runner)
        store.save(credentials)
        expect(store.load()).toEqual(credentials)
        expect(calls[0].command).toBe('/usr/bin/security')
        expect(calls[0].args).toContain('add-generic-password')
        expect(calls[0].args.at(-1)).toBe('-w')
        expect(calls[0].args.join(' ')).not.toContain(
            credentials.password
        )
        expect(calls[0].input).toContain(credentials.password)
    })

    it('stores Linux Secret Service payload through stdin and fixed non-secret attributes', () => {
        const credentials = {
            account: 'linux-account',
            password: 'linux-secret'
        }
        const calls: Array<{
            command: string
            args: readonly string[]
            input?: string
        }> = []
        const runner = ((
            command: string,
            args: readonly string[],
            options: { input?: string }
        ) => {
            calls.push({ command, args, input: options.input })
            if (args[0] === 'lookup')
                return result(0, JSON.stringify(credentials))
            return result(0)
        }) as never

        const store = new SecretServiceCredentialStore(runner)
        store.save(credentials)
        expect(store.load()).toEqual(credentials)
        expect(calls[0].command).toBe('secret-tool')
        expect(calls[0].args).toEqual([
            'store',
            '--label=Pica Library',
            'application',
            'pica-library',
            'purpose',
            'desktop-credentials'
        ])
        expect(calls[0].args.join(' ')).not.toContain(credentials.password)
        expect(calls[0].input).toBe(JSON.stringify(credentials))
    })

    it('selects secure native stores when available without changing the Windows DPAPI path', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-credential-'))
        roots.push(dir)
        const file = path.join(dir, 'credentials.dat')
        const ok = (() => result(0, '')) as never

        const windows = credentialStoreForPlatform(file, 'win32')
        expect(windows.status).toMatchObject({
            kind: 'windows-dpapi',
            securePersistence: true,
            sessionOnly: false
        })
        expect((windows.store as { file?: string }).file).toBe(file)

        const mac = credentialStoreForPlatform(file, 'darwin', {
            runner: ok,
            fileExists: (candidate) => candidate === '/usr/bin/security'
        })
        expect(mac.status).toMatchObject({
            kind: 'macos-keychain',
            securePersistence: true,
            sessionOnly: false
        })

        const linux = credentialStoreForPlatform(file, 'linux', {
            runner: ok,
            fileExists: () => false
        })
        expect(linux.status).toMatchObject({
            kind: 'linux-secret-service',
            securePersistence: true,
            sessionOnly: false
        })
    })

    it('falls back only to session memory when a secure OS backend is unavailable', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-session-'))
        roots.push(dir)
        const file = path.join(dir, 'credentials.dat')
        const missing = (() =>
            result(
                null,
                '',
                '',
                Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
            )) as never

        const linux = credentialStoreForPlatform(file, 'linux', {
            runner: missing
        })
        expect(linux.status).toMatchObject({
            kind: 'session-memory',
            securePersistence: false,
            sessionOnly: true
        })
        linux.store.save({ account: 'a', password: 'b' })
        expect(linux.store.load()).toEqual({ account: 'a', password: 'b' })
        expect(fs.existsSync(file)).toBe(false)
    })

    it('publishes credential backend status without exposing credential values', () => {
        const main = fs.readFileSync('src/desktop/main.ts', 'utf8')
        expect(main).toContain(
            'const credentialBackend = credentialStoreForPlatform(paths.credentials)'
        )
        expect(main).toContain('credentialBackend: credentialBackend.status')
        expect(main).toContain(
            'credentialBackend.status.securePersistence'
        )
        expect(main).not.toContain(
            'credentialBackend: credentials'
        )
    })
})
