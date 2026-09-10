import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { PreviewCacheManager } from '../../src/services/preview-cache-manager'
import { PreviewService } from '../../src/services/preview-service'
import type { ProviderService } from '../../src/services/provider-service'

const directories: string[] = []

function root() {
    const value = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-preview-'))
    directories.push(value)
    return value
}

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('Preview cache and bounded preview fetching', () => {
    it('hits cache, evicts LRU, expires TTL and clears safely', () => {
        let now = 1_000
        const cache = new PreviewCacheManager(root(), {
            maxBytes: 6,
            ttlMs: 100,
            now: () => now
        })
        cache.put('first', Buffer.from('111'), 'image/jpeg')
        now += 1
        cache.put('second', Buffer.from('222'), 'image/png')
        expect(cache.get('first')?.data.toString()).toBe('111')
        now += 1
        cache.put('third', Buffer.from('333'), 'image/webp')
        expect(cache.get('second')).toBeNull()
        expect(cache.get('first')).not.toBeNull()
        now += 101
        expect(cache.get('first')).toBeNull()
        expect(cache.clear()).toMatchObject({ bytes: 0 })
    })

    it('loads only the initial three provider pages and reuses cache', async () => {
        const directory = root()
        const database = new LibraryDatabase(path.join(directory, 'library.db'))
        database.importCatalog([
            {
                comicId: 'preview',
                title: 'Preview',
                author: 'Alice',
                categories: [],
                tags: [],
                finished: false
            }
        ])
        const fetchPage = vi.fn(async () => ({
            data: Buffer.from('image'),
            contentType: 'image/jpeg'
        }))
        const provider = {
            getEpisodes: vi.fn(async () => [
                { id: 'episode', title: 'Chapter 1', order: 1, updated_at: '' }
            ]),
            getEpisodePages: vi.fn(async () =>
                Array.from({ length: 20 }, (_, index) => ({
                    id: `p-${index}`,
                    name: `${index}.jpg`,
                    path: `${index}.jpg`,
                    fileServer: 'https://media.example',
                    url: `https://media.example/${index}.jpg`,
                    epTitle: 'Chapter 1',
                    media: {
                        originalName: `${index}.jpg`,
                        path: `${index}.jpg`,
                        fileServer: 'https://media.example'
                    }
                }))
            ),
            fetchPage
        } as unknown as ProviderService
        const service = new PreviewService(
            database,
            provider,
            new PreviewCacheManager(path.join(directory, 'cache'))
        )
        const first = await service.prepare('preview')
        expect(first).toMatchObject({
            source: 'provider',
            episodeTitle: 'Chapter 1',
            hasMore: true
        })
        expect(first.pages).toHaveLength(3)
        expect(fetchPage).toHaveBeenCalledTimes(3)
        await service.prepare('preview')
        expect(fetchPage).toHaveBeenCalledTimes(3)
        await service.prepare('preview', 3, 3)
        expect(fetchPage).toHaveBeenCalledTimes(6)
        database.close()
    })

    it('prefers downloaded local pages and never calls provider', async () => {
        const directory = root()
        const database = new LibraryDatabase(path.join(directory, 'library.db'))
        database.importCatalog([
            {
                comicId: 'local',
                title: 'Local',
                author: 'Alice',
                categories: [],
                tags: [],
                finished: false
            }
        ])
        database.upsertEpisode({
            id: 'local-ep',
            comicId: 'local',
            title: 'Downloaded chapter',
            order: 1
        })
        const page = path.join(directory, 'page.jpg')
        fs.writeFileSync(page, 'image')
        database.upsertPicture({
            id: 'local-page',
            comicId: 'local',
            episodeId: 'local-ep',
            position: 1,
            originalName: 'page.jpg',
            mediaPath: 'page.jpg',
            fileServer: 'https://media.example'
        })
        database.markPictureDownloaded('local-page', page, 5, 'hash')
        const provider = {
            getEpisodes: vi.fn()
        } as unknown as ProviderService
        const service = new PreviewService(
            database,
            provider,
            new PreviewCacheManager(path.join(directory, 'cache'))
        )
        const result = await service.prepare('local')
        expect(result).toMatchObject({ source: 'local', episodeId: 'local-ep' })
        expect(result.pages[0].url).toContain('/api/v1/reader/pictures/')
        expect(provider.getEpisodes).not.toHaveBeenCalled()
        database.close()
    })
})
