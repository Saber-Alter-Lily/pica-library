import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { EhProvider } from '../../src/providers/eh-provider'
import type { Pica } from '../../src/sdk'
import { LibraryService } from '../../src/library/service'
import { OnlineReaderService } from '../../src/services/online-reader-service'
import { PreviewCacheManager } from '../../src/services/preview-cache-manager'
import { PreviewService } from '../../src/services/preview-service'
import { ProviderService } from '../../src/services/provider-service'
import type { Episode, Picture } from '../../src/types'

const roots: string[] = []
const originalPicaAccount = process.env.PICA_ACCOUNT

function root(prefix: string) {
    const value = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    roots.push(value)
    return value
}

afterEach(() => {
    if (originalPicaAccount === undefined) delete process.env.PICA_ACCOUNT
    else process.env.PICA_ACCOUNT = originalPicaAccount
    while (roots.length)
        fs.rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('P2 E2 provider-scoped cache identity', () => {
    it('changes ProviderService cache scope with account, session, surface, and comic revision without exposing raw credentials', () => {
        const dir = root('pica-p2e2-provider-')
        const database = new LibraryDatabase(path.join(dir, 'library.db'))
        database.importCatalog(
            [
                {
                    comicId: 'pica-cache',
                    providerId: 'pica',
                    providerRemoteId: 'remote-pica-cache',
                    title: 'Pica Cache',
                    author: 'A',
                    categories: [],
                    tags: [],
                    finished: false,
                    updatedAt: '2026-09-24T01:00:00.000Z'
                },
                {
                    comicId: 'eh:123:abcdef1234',
                    providerId: 'eh',
                    providerRemoteId: '123:abcdef1234',
                    title: 'EH Cache',
                    author: 'B',
                    categories: [],
                    tags: [],
                    finished: false,
                    updatedAt: '2026-09-24T01:00:00.000Z',
                    providerMetadata: { preferredSurface: 'exh' }
                }
            ],
            'p2-e2-cache-scope'
        )
        const eh = new EhProvider()
        const service = new ProviderService(
            async () => ({}) as Pica,
            database,
            eh
        )

        process.env.PICA_ACCOUNT = 'account-one@example.test'
        const picaOne = service.cacheScope('pica-cache')
        process.env.PICA_ACCOUNT = 'account-two@example.test'
        const picaTwo = service.cacheScope('pica-cache')
        expect(picaTwo).not.toBe(picaOne)
        expect(picaOne).not.toContain('account-one@example.test')
        expect(picaTwo).not.toContain('account-two@example.test')

        const ehAnonymous = service.cacheScope('eh:123:abcdef1234')
        expect(ehAnonymous.startsWith('eh:eh:')).toBe(true)

        eh.setSession({
            memberId: 'member-one',
            passHash: 'secret-pass-hash',
            igneous: 'secret-igneous'
        })
        const ehMemberOne = service.cacheScope('eh:123:abcdef1234')
        expect(ehMemberOne.startsWith('eh:exh:')).toBe(true)
        expect(ehMemberOne).not.toBe(ehAnonymous)
        expect(ehMemberOne).not.toContain('member-one')
        expect(ehMemberOne).not.toContain('secret-pass-hash')
        expect(ehMemberOne).not.toContain('secret-igneous')

        eh.setSession({
            memberId: 'member-two',
            passHash: 'other-secret'
        })
        const ehMemberTwo = service.cacheScope('eh:123:abcdef1234')
        expect(ehMemberTwo).not.toBe(ehMemberOne)
        expect(ehMemberTwo).not.toContain('member-two')
        expect(ehMemberTwo).not.toContain('other-secret')

        database.importCatalog(
            [
                {
                    comicId: 'pica-cache',
                    providerId: 'pica',
                    providerRemoteId: 'remote-pica-cache',
                    title: 'Pica Cache',
                    author: 'A',
                    categories: [],
                    tags: [],
                    finished: false,
                    updatedAt: '2026-09-24T02:00:00.000Z'
                }
            ],
            'p2-e2-cache-revision'
        )
        expect(service.cacheScope('pica-cache')).not.toBe(picaTwo)
        database.close()
    })

    it('invalidates Preview pages on provider scope or locator changes and never persists raw source identity', async () => {
        const dir = root('pica-p2e2-preview-')
        const database = new LibraryDatabase(path.join(dir, 'library.db'))
        database.importCatalog([
            {
                comicId: 'preview-cache',
                title: 'Preview Cache',
                author: 'A',
                categories: [],
                tags: [],
                finished: false
            }
        ])

        let scope = 'scope-one'
        let locator = 'https://media.example/account-one/page.jpg'
        const fetchPage = vi.fn(async (url: string) => ({
            data: Buffer.from(url),
            contentType: 'image/jpeg'
        }))
        const provider = {
            cacheScope: () => scope,
            getEpisodes: vi.fn(async () => [
                { id: 'episode-1', title: 'Chapter', order: 1 }
            ]),
            getEpisodePages: vi.fn(
                async () => [{ url: locator }] as Picture[]
            ),
            fetchPage
        } as unknown as ProviderService
        const cacheDir = path.join(dir, 'preview-cache')
        const service = new PreviewService(
            database,
            provider,
            new PreviewCacheManager(cacheDir)
        )

        await service.prepare('preview-cache', 0, 1)
        expect(fetchPage).toHaveBeenCalledTimes(1)
        expect(
            service.page('preview-cache', 'episode-1', 0).data.toString()
        ).toContain('account-one')

        await service.prepare('preview-cache', 0, 1)
        expect(fetchPage).toHaveBeenCalledTimes(1)

        scope = 'scope-two'
        expect(() =>
            service.page('preview-cache', 'episode-1', 0)
        ).toThrow(/current provider scope/)
        await service.prepare('preview-cache', 0, 1)
        expect(fetchPage).toHaveBeenCalledTimes(2)

        locator = 'https://media.example/account-two/new-page.jpg'
        await service.prepare('preview-cache', 0, 1)
        expect(fetchPage).toHaveBeenCalledTimes(3)
        expect(
            service.page('preview-cache', 'episode-1', 0).data.toString()
        ).toContain('new-page')

        const metadataText = fs
            .readdirSync(cacheDir)
            .filter((name) => name.endsWith('.json'))
            .map((name) => fs.readFileSync(path.join(cacheDir, name), 'utf8'))
            .join('\n')
        expect(metadataText).toContain('sourceFingerprint')
        expect(metadataText).not.toContain('scope-one')
        expect(metadataText).not.toContain('scope-two')
        expect(metadataText).not.toContain('media.example')
        database.close()
    })

    it('partitions Online Reader metadata, page cache, and in-flight image requests by provider scope', async () => {
        const dir = root('pica-p2e2-reader-')
        const database = new LibraryDatabase(path.join(dir, 'library.db'))
        let scope = 'reader-scope-one'
        let version = 'one'
        const getEpisodes = vi.fn(
            async () =>
                [
                    {
                        id: 'episode-1',
                        title: `Chapter ${version}`,
                        order: 1
                    }
                ] as Episode[]
        )
        const getEpisodePages = vi.fn(
            async () =>
                [
                    {
                        url: `https://media.example/${version}.jpg`
                    }
                ] as Picture[]
        )
        const fetchPage = vi.fn(async (url: string) => ({
            data: Buffer.from(url),
            contentType: 'image/jpeg'
        }))
        const provider = {
            cacheScope: () => scope,
            getEpisodes,
            getEpisodePages,
            fetchPage
        }
        const reader = new OnlineReaderService(
            database,
            provider,
            new PreviewCacheManager(path.join(dir, 'reader-cache'))
        )

        expect((await reader.chapters('comic'))[0].title).toBe('Chapter one')
        await Promise.all([
            reader.picture('comic', 'episode-1', 0),
            reader.picture('comic', 'episode-1', 0)
        ])
        await reader.picture('comic', 'episode-1', 0)
        expect(getEpisodes).toHaveBeenCalledTimes(1)
        // Concurrent first-page calls may independently resolve chapter metadata;
        // the established in-flight contract deduplicates image fetches.
        expect(getEpisodePages).toHaveBeenCalledTimes(2)
        expect(fetchPage).toHaveBeenCalledTimes(1)

        scope = 'reader-scope-two'
        version = 'two'
        expect((await reader.chapters('comic'))[0].title).toBe('Chapter two')
        const refreshed = await reader.picture('comic', 'episode-1', 0)
        expect(refreshed.data.toString()).toContain('/two.jpg')
        expect(getEpisodes).toHaveBeenCalledTimes(2)
        expect(getEpisodePages).toHaveBeenCalledTimes(3)
        expect(fetchPage).toHaveBeenCalledTimes(2)
        database.close()
    })

    it('resets the cached Pica SDK session when saved Pica credentials change', () => {
        const serviceSource = fs.readFileSync(
            'src/library/service.ts',
            'utf8'
        )
        const desktopSource = fs.readFileSync(
            'src/desktop/main.ts',
            'utf8'
        )
        expect(serviceSource).toContain('resetPicaSession()')
        expect(serviceSource).toContain('this.pica = null')
        expect(desktopSource).toContain('const picaCredentialsChanged =')
        expect(desktopSource).toContain(
            'if (picaCredentialsChanged) service?.resetPicaSession()'
        )
    })
})
