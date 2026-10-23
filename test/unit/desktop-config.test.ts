import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
    buildConfig,
    buildLocalConfig,
    buildSettingsConfig,
    hasStoredCredentials,
    mergePicaSetupCredentials,
    connectionProxy,
    credentialedProxy,
    connectionEnvironment,
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
    it('applies a saved public proxy without a Pica account or credential file', () => {
        const config = { ...buildLocalConfig({ libraryDirectory: path.resolve('synthetic-library'), profile: 'balanced' }), proxyUrl: 'http://127.0.0.1:7890' }
        expect(connectionEnvironment(config, null)).toEqual({ PICA_PROXY: 'http://127.0.0.1:7890' })
        expect(connectionEnvironment(null, null)).toEqual({})
        expect(config.proxyUrl).toBe('http://127.0.0.1:7890')
    })
    it('keeps proxy authentication separate from source identities and omits incomplete Pica credentials', () => {
        const config = { ...buildLocalConfig({ libraryDirectory: path.resolve('synthetic-library'), profile: 'balanced' }), proxyUrl: 'http://127.0.0.1:7890' }
        const stored = { account: '', password: '', jmUsername: 'fixture-jm', jmPassword: 'fixture-jm-secret', proxyUsername: 'proxy-user', proxyPassword: 'proxy-secret' }
        expect(connectionEnvironment(config, stored)).toEqual({ PICA_PROXY: 'http://proxy-user:proxy-secret@127.0.0.1:7890' })
        expect(connectionEnvironment(config, { account: 'partial', password: '' })).not.toHaveProperty('PICA_ACCOUNT')
        expect(connectionEnvironment(config, { account: 'fixture-pica', password: 'fixture-password' })).toMatchObject({ PICA_ACCOUNT: 'fixture-pica', PICA_PASSWORD: 'fixture-password' })
        expect(stored.account).toBe('')
    })
    it('lets existing local libraries change storage and public proxy without synthesizing credentials or weakening Pica login validation', () => {
        const current = buildLocalConfig({ libraryDirectory: path.resolve('synthetic-library'), profile: 'balanced' })
        const input = { account: '', password: '', libraryDirectory: current.libraryDirectory, profile: 'fast' as const }
        const local = buildSettingsConfig(input, current)
        expect(local.config.profile).toBe('fast')
        expect(hasStoredCredentials(local.credentials)).toBe(false)
        expect(hasStoredCredentials(buildSettingsConfig({ ...input, proxyUrl: 'http://127.0.0.1:7890' }, current).credentials)).toBe(false)
        expect(hasStoredCredentials(buildSettingsConfig({ ...input, proxyUrl: 'http://synthetic-user:synthetic-secret@127.0.0.1:7890' }, current).credentials)).toBe(true)
        expect(() => buildSettingsConfig({ ...input, account: 'partial-account' }, current)).toThrow(/password/)
        expect(() => buildSettingsConfig(input, null)).toThrow(/Pica account/)
    })
    it('sets up a local library without any source credentials and preserves existing unrelated configuration', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-local-library-')); directories.push(directory)
        const file = path.join(directory, 'config.json')
        const config = buildLocalConfig({ libraryDirectory: path.join(directory, 'library'), profile: 'balanced' })
        saveConfig(file, config)
        expect(loadConfig(file)).toEqual(config)
        expect(fs.readdirSync(directory)).toEqual(['config.json'])
        expect(config).not.toHaveProperty('account')
        const existing = { ...config, openBrowser: false, preferredPort: 4811, proxyUrl: 'http://127.0.0.1:7890' }
        expect(buildLocalConfig({ libraryDirectory: config.libraryDirectory, profile: 'fast' }, existing)).toEqual({ ...existing, profile: 'fast' })
        expect(() => buildLocalConfig({ libraryDirectory: 'relative', profile: 'balanced' })).toThrow(/absolute/)
        expect(() => buildConfig({ account: '', password: '', libraryDirectory: config.libraryDirectory, profile: 'balanced' })).toThrow(/Pica account/)
    })
    it('preserves JM, EH, all WebDAV target credentials and proxy identity when only the Pica account changes', () => {
        const previous = { account: 'old', password: 'old-secret', ehMemberId: 'fixture-id', ehPassHash: 'fixture-hash', jmUsername: 'fixture-jm', jmPassword: 'fixture-jm-secret', remoteStorageCredentials: { one: { username: 'fixture-one', password: 'fixture-secret' }, two: { password: 'fixture-two' } }, proxyUsername: 'proxy-user', proxyPassword: 'proxy-secret' }
        expect(mergePicaSetupCredentials({ account: 'new', password: 'new-secret' }, previous, true)).toEqual({ ...previous, account: 'new', password: 'new-secret' })
        expect(previous.account).toBe('old')
        expect(mergePicaSetupCredentials({ account: 'new', password: 'new-secret', proxyUsername: undefined, proxyPassword: undefined }, previous, false).proxyPassword).toBeUndefined()
    })
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
