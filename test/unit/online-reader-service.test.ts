import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { OnlineReaderService } from '../../src/services/online-reader-service'
import { PreviewCacheManager } from '../../src/services/preview-cache-manager'
import type { Episode, Picture } from '../../src/types'

const cleanup: Array<() => void> = []
function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'online-reader-'))
    const db = new LibraryDatabase(path.join(dir, 'library.db'))
    cleanup.push(() => {
        db.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })
    const provider = {
        getEpisodes: vi.fn(
            async () =>
                [
                    { _id: 'episode-1', title: 'Chapter 1', order: 1 }
                ] as Episode[]
        ),
        getEpisodePages: vi.fn(
            async () =>
                [
                    { url: 'https://media.example/static/demo.png' },
                    { url: 'https://media.example/static/demo2.png' }
                ] as Picture[]
        ),
        fetchPage: vi.fn(async () => ({
            data: Buffer.from('fixture-image'),
            contentType: 'image/png'
        }))
    }
    const reader = new OnlineReaderService(
        db,
        provider,
        new PreviewCacheManager(path.join(dir, 'cache'))
    )
    return { reader, provider, db, dir }
}
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
describe('independent online reader', () => {
    it('can prepare never-downloaded comics, exposes local URLs only, does not eagerly fetch images', async () => {
        const { reader, provider, db } = fixture()
        expect(await reader.chapters('new-comic')).toEqual([
            {
                id: 'episode-1',
                title: 'Chapter 1',
                order: 1,
                source: 'provider'
            }
        ])
        const chapter = await reader.chapter('new-comic', 'episode-1')
        expect(chapter.pages).toHaveLength(2)
        expect(chapter.pages[0].url).toBe(
            '/api/v1/online-reader/comics/new-comic/chapters/episode-1/pages/0'
        )
        expect(JSON.stringify(chapter)).not.toContain('media.example')
        expect(provider.fetchPage).not.toHaveBeenCalled()
        expect(db.listReaderEpisodes('new-comic')).toEqual([])
    })
    it('fetches requested page once, reuses cache and deduplicates concurrent image requests', async () => {
        const { reader, provider } = fixture()
        await reader.chapter('comic', 'episode-1')
        await Promise.all([
            reader.picture('comic', 'episode-1', 0),
            reader.picture('comic', 'episode-1', 0)
        ])
        await reader.picture('comic', 'episode-1', 0)
        expect(provider.fetchPage).toHaveBeenCalledTimes(1)
        expect(provider.fetchPage).toHaveBeenCalledWith(
            'https://media.example/static/demo.png'
        )
    })
    it('persists online progress without downloaded comic/episode foreign keys or fake local downloads', async () => {
        const { reader, db, provider, dir } = fixture()
        await reader.saveProgress('comic', 'episode-1', 1)
        const restarted = new OnlineReaderService(
            db,
            provider,
            new PreviewCacheManager(path.join(dir, 'cache'))
        )
        expect(restarted.recentProgress()[0]).toMatchObject({
            comicId: 'comic',
            episodeId: 'episode-1',
            pageIndex: 1
        })
        expect(
            (await restarted.chapter('comic', 'episode-1')).progress?.pageIndex
        ).toBe(1)
        expect(db.readingProgress()).toEqual([])
        expect(db.listReaderEpisodes('comic')).toEqual([])
    })
    it('rejects invalid pages, foreign episodes and arbitrary URL-like IDs', async () => {
        const { reader, provider } = fixture()
        await expect(reader.picture('comic', 'episode-1', -1)).rejects.toThrow()
        await expect(reader.picture('comic', 'episode-1', 2)).rejects.toThrow()
        await expect(
            reader.saveProgress('comic', 'episode-1', 1.5)
        ).rejects.toThrow()
        await expect(
            reader.chapter('comic', 'foreign-episode')
        ).rejects.toThrow()
        await expect(reader.chapters('http://127.0.0.1')).rejects.toThrow()
        expect(provider.fetchPage).not.toHaveBeenCalled()
    })
    it('allows retry after a transient image failure without retaining a rejected promise', async () => {
        const { reader, provider } = fixture()
        provider.fetchPage.mockRejectedValueOnce(new Error('offline'))
        await expect(reader.picture('comic', 'episode-1', 0)).rejects.toThrow(
            'offline'
        )
        await expect(
            reader.picture('comic', 'episode-1', 0)
        ).resolves.toMatchObject({ contentType: 'image/png' })
    })
})
