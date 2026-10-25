import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SourceRuntime, initialSourcePolicy } from '../../src/sources/source-policy'
import { cliSourcePolicy, cliSourcePolicyFromArgs } from '../../src/sources/cli-source-policy'
import { buildLocalConfig, sourcePolicyForConfig } from '../../src/desktop/config'
import { LibraryService } from '../../src/library/service'
import { LibraryDatabase } from '../../src/library/database'
import { ProviderService } from '../../src/services/provider-service'
import { JmProvider } from '../../src/providers/jm-provider'
import type { JmTransport } from '../../src/providers/jm-worker'

const cleanup: Array<() => void> = []
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); vi.unstubAllEnvs() })
function storage() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-source-idle-'))
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    cleanup.push(() => { database.close(); fs.rmSync(root, {recursive: true, force: true}) })
    return {root, database}
}
function jm(available = true) {
    const transport = {available, request: vi.fn(async () => ({configured: false})), close: vi.fn()}
    const provider = new JmProvider(transport as unknown as JmTransport)
    const sources = new SourceRuntime(initialSourcePolicy(true))
    provider.setSourceAccess(sources.acquire)
    return {provider, sources, transport}
}

describe('local reader defaults require explicit source permission', () => {
    it('core defaults are local-only; source acquisition cannot enable an adapter', () => {
        const sources = new SourceRuntime()
        expect(sources.snapshot().enabled).toEqual([])
        for (const id of ['pica', 'eh', 'jm'] as const)
            expect(() => sources.acquire(id)).toThrow('disabled')
        expect(sources.snapshot()).toEqual(initialSourcePolicy())
    })
    it('actual LibraryService and ProviderService inherit local-only defaults even with credentials present', async () => {
        vi.stubEnv('PICA_ACCOUNT', 'synthetic-remembered-account')
        vi.stubEnv('PICA_PASSWORD', 'synthetic-secret-never-used')
        const {root, database} = storage(), service = new LibraryService(database, root)
        const connect = vi.fn(async () => { throw new Error('Unexpected provider connection') })
        const providers = new ProviderService(connect, database)
        expect(service.sources.snapshot().enabled).toEqual([])
        expect(providers.sources.snapshot().enabled).toEqual([])
        await expect(service.connect()).rejects.toMatchObject({code: 'SOURCE_DISABLED'})
        await expect(providers.prepareSource('jm:123')).rejects.toMatchObject({code: 'SOURCE_DISABLED'})
        expect(connect).not.toHaveBeenCalled()
        for (const capability of Object.values(providers.providerStatus()))
            expect(Object.values(capability).every(value => value === false)).toBe(true)
        service.setJmCredentials('synthetic-user', 'synthetic-secret')
        expect(await service.jmAccountStatus()).toEqual({configured: false, enabled: false, remembered: true, verification: 'NOT_CHECKED'})
    })
    it('keeps pre-policy Desktop compatibility at the config adapter, not in new core instances', () => {
        const fresh = buildLocalConfig({libraryDirectory: path.resolve('synthetic-not-created-idle-library'), profile: 'balanced'})
        expect(sourcePolicyForConfig(null).enabled).toEqual([])
        expect(fresh.externalSources?.enabled).toEqual([])
        const old = {...fresh}; delete old.externalSources
        expect(sourcePolicyForConfig(old).enabled).toEqual(['pica', 'eh', 'jm'])
        expect(sourcePolicyForConfig({...fresh, externalSources: {schemaVersion: 1, revision: 8, enabled: ['eh']}})).toEqual({schemaVersion: 1, revision: 8, enabled: ['eh']})
        expect(fs.existsSync(fresh.libraryDirectory)).toBe(false)
    })
    it('CLI absence and explicit none are local-only; exact named choices remain independent', () => {
        for (const value of [undefined, 'none']) expect(cliSourcePolicy(value).enabled).toEqual([])
        expect(cliSourcePolicy('pica').enabled).toEqual(['pica'])
        expect(cliSourcePolicy('jm, eh').enabled).toEqual(['eh', 'jm'])
        expect(cliSourcePolicyFromArgs(['serve', '--json']).enabled).toEqual([])
        expect(cliSourcePolicyFromArgs(['sync', '--sources', 'pica']).enabled).toEqual(['pica'])
        expect(cliSourcePolicyFromArgs(['search', '--sources=jm,eh', '--json']).enabled).toEqual(['eh', 'jm'])
    })
    it('rejects malformed, missing, repeated or unknown source flags before creating storage', () => {
        for (const value of ['', 'pica,pica', 'none,pica', 'exh', 'unknown', 'pica,']) expect(() => cliSourcePolicy(value)).toThrow()
        for (const args of [['serve', '--sources'], ['serve', '--sources', '--json'], ['serve', '--sources='], ['serve', '--sources=pica', '--sources=jm']])
            expect(() => cliSourcePolicyFromArgs(args)).toThrow()
        const source = fs.readFileSync('src/library-cli.ts', 'utf8')
        expect(source.indexOf('cliSourcePolicyFromArgs(argv)')).toBeLessThan(source.indexOf('new LibraryDatabase(databaseFile)'))
        expect(source).toContain("'sources'")
        expect(source).toContain('--sources IDS')
    })
})

describe('JM passive state versus explicit connection', () => {
    it('opening state with saved credentials never requests/starts/restores the worker', () => {
        const f = jm(); f.provider.setRememberedCredentials('saved-user', 'saved-secret')
        for (let index = 0; index < 5; index++)
            expect(f.provider.accountSnapshot()).toEqual({configured: false, enabled: true, remembered: true, verification: 'NOT_CHECKED'})
        expect(f.transport.request).not.toHaveBeenCalled()
        expect(f.transport.close).not.toHaveBeenCalled()
    })
    it('an explicit connection restores once; repeated passive reads are cached and allowlisted', async () => {
        const f = jm(); f.provider.setRememberedCredentials('saved-user', 'saved-secret')
        f.transport.request.mockResolvedValue({configured: true, accountId: 'fixture-id', username: 'fixture-user', password: 'worker-private', token: 'worker-private'} as never)
        await f.provider.connectAccount()
        expect(f.transport.request).toHaveBeenCalledTimes(1)
        expect(f.transport.request).toHaveBeenCalledWith('login', {username: 'saved-user', password: 'saved-secret'})
        const snapshot = f.provider.accountSnapshot()
        expect(snapshot).toEqual({configured: true, accountId: 'fixture-id', username: 'fixture-user', enabled: true, remembered: true, verification: 'CACHED'})
        snapshot.configured = false
        expect(f.provider.accountSnapshot().configured).toBe(true)
        expect(JSON.stringify(f.provider.accountSnapshot())).not.toContain('private')
        expect(f.transport.request).toHaveBeenCalledTimes(1)
    })
    it('does not convert disabled or unavailable status into a connection or source activation', () => {
        const f = jm(); f.provider.setRememberedCredentials('saved-user', 'saved-secret')
        f.sources.apply(f.sources.prepare([], 0))
        expect(f.provider.accountSnapshot()).toMatchObject({enabled: false, remembered: true, configured: false})
        expect(() => f.provider.connectAccount()).toThrow('disabled')
        expect(f.transport.request).not.toHaveBeenCalled()
        expect(f.sources.snapshot().enabled).toEqual([])
        const missing = jm(false)
        expect(missing.provider.accountSnapshot().verification).toBe('NOT_CHECKED')
        expect(() => missing.provider.connectAccount()).toThrow('运行组件')
        expect(missing.transport.request).not.toHaveBeenCalled()
    })
    it('only another explicit connect retries a failed remembered sign-in', async () => {
        const f = jm(); f.provider.setRememberedCredentials('saved-user', 'saved-secret')
        f.transport.request.mockRejectedValueOnce(new Error('synthetic login failure')).mockResolvedValue({configured: true} as never)
        await expect(f.provider.connectAccount()).rejects.toThrow('synthetic')
        f.provider.accountSnapshot()
        expect(f.transport.request).toHaveBeenCalledTimes(1)
        await f.provider.connectAccount()
        expect(f.transport.request).toHaveBeenCalledTimes(2)
        expect(f.provider.accountSnapshot().verification).toBe('CACHED')
    })
    it('anonymous explicit connect requests status; close loses cached session but retains remembered credentials', async () => {
        const f = jm()
        await f.provider.connectAccount()
        expect(f.transport.request).toHaveBeenCalledTimes(1)
        expect(f.transport.request).toHaveBeenCalledWith('status', undefined)
        f.provider.setRememberedCredentials('saved-user', 'saved-secret')
        f.transport.request.mockResolvedValue({configured: true} as never)
        await f.provider.connectAccount()
        f.provider.close()
        expect(f.provider.accountSnapshot()).toMatchObject({configured: false, remembered: true, verification: 'NOT_CHECKED'})
    })
})
