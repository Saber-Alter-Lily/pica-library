import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
    buildConfig,
    connectionProxy,
    credentialedProxy,
    loadConfig,
    saveConfig
} from '../../src/desktop/config'
import {
    DpapiCredentialStore,
    MemoryCredentialStore
} from '../../src/desktop/credentials'
import { redactLog } from '../../src/desktop/logging'

const directories: string[] = []
afterEach(() =>
    directories
        .splice(0)
        .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }))
)

describe('desktop configuration security', () => {
    it.runIf(process.platform === 'win32')(
        'round-trips credentials through Windows DPAPI',
        () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-dpapi-'))
            directories.push(dir)
            const file = path.join(dir, 'credentials.dat')
            const store = new DpapiCredentialStore(file)
            const credentials = {
                account: 'synthetic-account',
                password: 'synthetic-password'
            }
            store.save(credentials)
            expect(fs.readFileSync(file, 'utf8')).not.toContain(
                credentials.password
            )
            expect(store.load()).toEqual(credentials)
        }
    )

    it('keeps credentials out of non-secret configuration', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-config-'))
        directories.push(dir)
        const file = path.join(dir, 'config.json')
        const built = buildConfig({
            account: 'private-account',
            password: 'private-password',
            libraryDirectory: path.join(dir, 'library'),
            profile: 'balanced',
            proxyUrl: 'http://proxy-user:proxy-password@127.0.0.1:7890'
        })
        saveConfig(file, built.config)
        const stored = fs.readFileSync(file, 'utf8')
        expect(stored).not.toMatch(
            /private-account|private-password|proxy-user|proxy-password/
        )
        expect(loadConfig(file)).toEqual(built.config)
        expect(built.credentials).toMatchObject({
            account: 'private-account',
            password: 'private-password'
        })
        expect(
            credentialedProxy(built.config.proxyUrl, built.credentials)
        ).toContain('proxy-user:proxy-password@')
    })

    it('does not fall back to a plaintext credential file', () => {
        const store = new MemoryCredentialStore()
        store.save({ account: 'a', password: 'b' })
        expect(store.load()).toEqual({ account: 'a', password: 'b' })
        expect(JSON.stringify(store)).not.toContain('credentials.dat')
    })

    it('redacts account, password, token and proxy credentials in logs', () => {
        const value = redactLog(
            'account=a password=b token=c proxy=http://user:pass@127.0.0.1:7890'
        )
        expect(value).not.toMatch(/account=a|password=b|token=c|user:pass/)
    })

    it('accepts only HTTP and HTTPS proxy URLs', () => {
        expect(() =>
            buildConfig({
                account: 'a',
                password: 'b',
                libraryDirectory: path.resolve('library'),
                profile: 'balanced',
                proxyUrl: 'socks5://127.0.0.1:1080'
            })
        ).toThrow('Only HTTP and HTTPS')
    })

    it('uses the saved proxy unless the connection test disables it', () => {
        const credentials = {
            account: 'a',
            password: 'b',
            proxyUsername: 'saved-user',
            proxyPassword: 'saved-password'
        }
        expect(
            connectionProxy(undefined, 'http://127.0.0.1:7890', credentials)
        ).toBe('http://saved-user:saved-password@127.0.0.1:7890')
        expect(
            connectionProxy('', 'http://127.0.0.1:7890', credentials)
        ).toBeUndefined()
        expect(
            connectionProxy(
                'http://new-user:new-password@127.0.0.1:7891',
                'http://127.0.0.1:7890',
                credentials
            )
        ).toBe('http://new-user:new-password@127.0.0.1:7891')
    })
})
