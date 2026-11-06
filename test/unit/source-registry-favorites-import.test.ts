import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { ProviderRegistry } from '../../src/providers/provider-registry'
import { ProviderFavoritesImport } from '../../src/providers/favorites-import'
import { ProviderService } from '../../src/services/provider-service'
import { JmProvider } from '../../src/providers/jm-provider'
import { jmProxyConfiguration } from '../../src/providers/jm-worker'
import { LibraryQueryService } from '../../src/services/library-query-service'
import type {
    AccountComicProvider,
    ComicProvider,
    ProviderComic,
    ProviderFavoritesPage
} from '../../src/providers/types'
import { enabledFixtureSources } from "../helpers/source-runtime-fixture"

const cleanups: Array<() => void> = []
afterEach(() => {
    for (const close of cleanups.splice(0)) close()
})
function database() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-source-contract-'))
    const db = new LibraryDatabase(path.join(root, 'library.db'))
    cleanups.push(() => {
        db.close()
        fs.rmSync(root, { recursive: true, force: true })
    })
    return db
}
function comic(id: number): ProviderComic {
    return {
        providerId: 'jm',
        providerRemoteId: String(id),
        comicId: `jm:${id}`,
        title: `Work ${id}`,
        alternateTitles: [],
        author: 'Writer',
        authors: ['Writer'],
        circle: null,
        description: '',
        chineseTeam: '',
        categories: [],
        tags: ['story'],
        canonicalTags: [],
        completionStatus: 'UNKNOWN',
        providerMetadata: {}
    }
}
const caps = {
    publicBrowse: true,
    search: true,
    metadata: true,
    chapters: true,
    pages: true,
    imageFetch: true,
    account: true,
    remoteFavoritesRead: true,
    remoteFavoritesWrite: false,
    exHentai: false
}
function fixture(pages: ProviderFavoritesPage[]): AccountComicProvider {
    return {
        id: 'jm',
        capabilities: caps,
        search: vi.fn(async () => []),
        details: vi.fn(async () => comic(1)),
        episodes: vi.fn(async () => []),
        pages: vi.fn(async () => []),
        fetchPage: vi.fn(async () => ({
            data: Buffer.from('image'),
            contentType: 'image/png'
        })),
        accountStatus: vi.fn(async () => ({
            configured: true,
            accountId: 'fixture-account'
        })),
        login: vi.fn(async () => ({
            configured: true,
            accountId: 'fixture-account'
        })),
        clearAccount: vi.fn(async () => {}),
        favoritesPage: vi.fn(async (page) => pages[page - 1])
    }
}
const page = (
    number: number,
    items: ProviderComic[],
    total = 2,
    pages = 2
): ProviderFavoritesPage => ({
    accountId: 'fixture-account',
    page: number,
    pages,
    total,
    folderId: 0,
    folders: { '0': 'All' },
    items
})

describe('source routing and bounded account-favorite imports', () => {
    it('inherits the local HTTP proxy without silently bypassing unsupported authenticated proxies', () => {
        expect(jmProxyConfiguration('')).toEqual({
            proxyHost: '',
            proxyPort: 0
        })
        expect(jmProxyConfiguration('http://127.0.0.1:7890')).toEqual({
            proxyHost: '127.0.0.1',
            proxyPort: 7890
        })
        for (const proxy of [
            'socks5://localhost:1080',
            'https://localhost:7890',
            'http://fixture:private@localhost:7890'
        ])
            expect(() => jmProxyConfiguration(proxy)).toThrow('HTTP')
    })

    it('retains enriched details when the next favorite snapshot only contains summary metadata', async () => {
        const db = database(),
            summary = {
                ...comic(1),
                author: '',
                tags: [],
                providerMetadata: { metadataCompleteness: 'SUMMARY' }
            }
        const provider = fixture([page(1, [summary], 1, 1)]),
            importer = new ProviderFavoritesImport()
        db.importCatalog(
            [
                {
                    comicId: 'jm:1',
                    title: 'Detailed',
                    author: 'Known author',
                    description: 'Detailed description',
                    tags: ['Detailed tag'],
                    categories: ['Detailed category'],
                    finished: false,
                    pagesCount: 24,
                    epsCount: 2,
                    providerId: 'jm',
                    providerRemoteId: '1',
                    providerMetadata: { metadataCompleteness: 'DETAIL' }
                }
            ],
            'fixture:detail'
        )
        const preview = await importer.scan(provider)
        importer.confirm(
            preview.token,
            { configured: true, accountId: 'fixture-account' },
            db
        )
        expect(db.getComic('jm:1')).toMatchObject({
            author: 'Known author',
            description: 'Detailed description',
            tags: ['Detailed tag'],
            pagesCount: 24,
            epsCount: 2,
            providerMetadata: { metadataCompleteness: 'DETAIL' }
        })
    })
    it('preserves raw Pica IDs and EH identities, while unknown namespaces cannot fall through', () => {
        const jm = fixture([]),
            pica = { ...jm, id: 'pica' } as ComicProvider,
            eh = { ...jm, id: 'eh' } as ComicProvider
        const registry = new ProviderRegistry([pica, eh, jm])
        expect(registry.forComic('legacy-raw-id')).toBe(pica)
        expect(registry.forComic('eh:123:abc')).toBe(eh)
        expect(registry.forSource('exh')).toBe(eh)
        expect(registry.forComic('jm:123')).toBe(jm)
        expect(() => registry.forComic('missing:123')).toThrow('Unrecognized')
        expect(() => registry.register(jm)).toThrow('already registered')
    })

    it('only commits a complete confirmed snapshot, adds no explicit Likes, and is idempotent', async () => {
        const db = database(),
            provider = fixture([page(1, [comic(1)]), page(2, [comic(2)])]),
            importer = new ProviderFavoritesImport()
        const preview = await importer.scan(provider)
        expect(db.favoriteIds()).toEqual([])
        expect(preview.count).toBe(2)
        expect(
            importer.confirm(
                preview.token,
                { configured: true, accountId: 'fixture-account' },
                db
            )
        ).toMatchObject({
            importedFavorites: 2,
            explicitLikesCreated: 0,
            remoteMutations: 0
        })
        expect(db.favoriteIds()).toEqual(['jm:1', 'jm:2'])
        expect(db.getComic('jm:1')).toMatchObject({
            providerId: 'jm',
            providerRemoteId: '1'
        })
        const queries = new LibraryQueryService(db)
        expect(
            queries
                .query({ scope: 'favorites', providerIds: ['jm'] })
                .items.map((item) => item.comicId)
        ).toEqual(['jm:1', 'jm:2'])
        expect(
            queries.query({ scope: 'favorites', providerIds: ['pica'] }).items
        ).toEqual([])
        db.importFavorites(
            [
                {
                    comicId: 'pica-legacy',
                    title: 'Pica',
                    author: 'Writer',
                    tags: [],
                    categories: [],
                    finished: false
                }
            ],
            'pica:fixture',
            true
        )
        expect(db.favoriteIds()).toContain('jm:1')
        const again = await importer.scan(provider)
        importer.confirm(
            again.token,
            { configured: true, accountId: 'fixture-account' },
            db
        )
        expect(
            queries.query({ scope: 'favorites', providerIds: ['jm'] }).items
        ).toHaveLength(2)
        expect(() =>
            importer.confirm(
                again.token,
                { configured: true, accountId: 'fixture-account' },
                db
            )
        ).toThrow('失效')
    })

    it.each([
        'missing',
        'changed-account',
        'changed-count',
        'duplicate',
        'empty-page'
    ])('cannot import an incomplete %s scan', async (failure) => {
        const first = page(1, [comic(1)]),
            second = page(2, [comic(2)])
        if (failure === 'changed-account') second.accountId = 'other'
        if (failure === 'changed-count') second.total = 3
        if (failure === 'duplicate') second.items = [comic(1)]
        if (failure === 'empty-page') second.items = []
        const provider = fixture([first, second])
        if (failure === 'missing')
            vi.mocked(provider.favoritesPage).mockImplementation(
                async (index) => {
                    if (index === 2) throw new Error('network')
                    return first
                }
            )
        await expect(
            new ProviderFavoritesImport().scan(provider)
        ).rejects.toThrow()
    })

    it('rejects account changes, expired previews and cancellation without modifying existing collections', async () => {
        const db = database(),
            provider = fixture([page(1, [comic(1)], 1, 1)]),
            importer = new ProviderFavoritesImport()
        const preview = await importer.scan(provider)
        expect(() =>
            importer.confirm(
                preview.token,
                { configured: true, accountId: 'other' },
                db
            )
        ).toThrow('失效')
        importer.clear()
        expect(() =>
            importer.confirm(
                preview.token,
                { configured: true, accountId: 'fixture-account' },
                db
            )
        ).toThrow('失效')
        await expect(
            importer.scan(provider, 0, async () => {
                importer.clear()
            })
        ).rejects.toThrow('取消')
        expect(db.favoriteIds()).toEqual([])
    })

    it('routes JM details, chapters and account-scoped cache without connecting Pica', async () => {
        const db = database(),
            connect = vi.fn(async () => {
                throw new Error('must not connect Pica')
            })
        const transport = {
            available: true,
            close: vi.fn(),
            request: vi.fn(async (op: string) =>
                op === 'details'
                    ? comic(1)
                    : op === 'episodes'
                      ? []
                      : { configured: true, accountId: 'jm-user' }
            )
        }
        const jm = new JmProvider(
            transport as ConstructorParameters<typeof JmProvider>[0]
        )
        const service = new ProviderService(connect, db, undefined, jm, enabledFixtureSources())
        expect((await service.getComicDetails('jm:1')).providerId).toBe('jm')
        await service.getEpisodes('jm:1')
        await jm.login('fixture', 'not-a-real-secret')
        expect(service.cacheScope('jm:1')).toMatch(/^jm:/)
        expect(service.cacheScope('jm:1')).not.toContain('jm-user')
        expect(connect).not.toHaveBeenCalled()
        await expect(service.getComicDetails('unknown:1')).rejects.toThrow(
            'Unrecognized'
        )
        await expect(
            service.search('', ['pica', 'unknown' as 'pica'])
        ).rejects.toThrow('not available')
        expect(connect).not.toHaveBeenCalled()
    })
})
