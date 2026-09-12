import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { RemoteLibrarySyncService } from '../../src/remote-storage/sync-service'
import {
    removeRemoteCopies,
    selectedComicIds
} from '../../src/remote-storage/remove-copies'
import { remoteLayout } from '../../src/remote-storage/layout'
import { WebDavStorageProvider } from '../../src/remote-storage/webdav'
import type {
    RemoteStorageProvider,
    RemoteLibraryCatalog,
    RemoteLibraryPointer
} from '../../src/remote-storage/types'

function memoryProvider() {
    const objects = new Map<string, unknown>()
    const deletes: string[] = [],
        puts: string[] = []
    const provider: RemoteStorageProvider = {
        kind: 'webdav',
        withExclusiveLibraryWrite: async (work) => work(),
        test: async () => ({ success: true, status: 207 }),
        ensureDirectory: async () => {},
        exists: async (key) => objects.has(key),
        get: async () => null,
        getJson: async <T>(key: string) =>
            (objects.get(key) ?? null) as T | null,
        put: async (key, value) => {
            puts.push(key)
            objects.set(key, value)
        },
        putJson: async (key, value) => {
            puts.push(key)
            objects.set(key, value)
        },
        getJsonVersioned: async <T>(key: string) => ({
            exists: objects.has(key),
            value: (objects.get(key) ?? null) as T | null,
            etag: '"version-1"'
        }),
        putJsonConditional: async (key, value) => {
            objects.set(key, value)
            return true
        },
        deleteComic: async (id) => {
            deletes.push(id)
        }
    }
    return { provider, objects, puts, deletes }
}
const cleanup: Array<() => void> = []
afterEach(() => {
    vi.unstubAllGlobals()
    cleanup.splice(0).forEach((fn) => fn())
})
function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-selected-'))
    const db = new LibraryDatabase(path.join(root, 'library.db'))
    cleanup.push(() => {
        db.close()
        fs.rmSync(root, { recursive: true, force: true })
    })
    for (const id of ['comic-a', 'comic-b']) {
        db.importCatalog([
            {
                comicId: id,
                title: id,
                author: 'Demo',
                tags: [],
                categories: [],
                finished: true
            }
        ])
        db.upsertEpisode({
            id: `${id}-ep`,
            comicId: id,
            title: 'Demo chapter',
            order: 1
        })
        db.upsertPicture({
            id: `${id}-pic`,
            comicId: id,
            episodeId: `${id}-ep`,
            position: 1,
            originalName: 'page.png',
            mediaPath: 'page.png',
            fileServer: 'https://example.test'
        })
        const file = path.join(root, `${id}.png`)
        fs.writeFileSync(file, 'fixture-raster')
        db.markPictureDownloaded(`${id}-pic`, file, 14, 'test-hash')
    }
    const memory = memoryProvider()
    return {
        root,
        db,
        ...memory,
        service: new RemoteLibrarySyncService(db, root, memory.provider)
    }
}
describe('selected cloud uploads and remote-only deletion', () => {
    it('uploads only selected comics and retains unselected remote comics', async () => {
        const { service, provider, puts } = fixture()
        await service.sync(['comic-b'])
        puts.length = 0
        await service.sync(['comic-a'])
        expect(puts.some((key) => key.startsWith('v1/comics/comic-b/'))).toBe(
            false
        )
        const pointer = (await provider.getJson<RemoteLibraryPointer>(
            remoteLayout.current
        ))!
        const catalog = (await provider.getJson<RemoteLibraryCatalog>(
            pointer.catalogPath
        ))!
        expect(catalog.comics.map((entry) => entry.comicId).sort()).toEqual([
            'comic-a',
            'comic-b'
        ])
    })
    it('reports current catalog presence without requiring a scan/upload', async () => {
        const { service } = fixture()
        expect(
            (await service.inventory()).comics.every(
                (item) => item.state === 'not-uploaded'
            )
        ).toBe(true)
        await service.sync(['comic-a'])
        const inventory = (await service.inventory()).comics
        expect(
            inventory.find((item) => item.comicId === 'comic-a')?.state
        ).toBe('remote-present')
        expect(
            inventory.find((item) => item.comicId === 'comic-b')?.state
        ).toBe('not-uploaded')
    })
    it('rejects empty selections and directory traversal rather than falling back to the entire library', () => {
        for (const value of [[], undefined, ['..'], ['a/b'], ['%2e%2e']])
            expect(() => selectedComicIds(value)).toThrow()
        expect(selectedComicIds(['comic-a', 'comic-a'])).toEqual(['comic-a'])
    })
    it('removes only selected cloud entries and leaves all local downloads intact', async () => {
        const { root, db, service, provider, deletes } = fixture()
        await service.sync()
        const unpublished = vi.fn()
        const result = await removeRemoteCopies(
            provider,
            ['comic-a'],
            unpublished
        )
        expect(result).toMatchObject({
            success: true,
            localFilesDeleted: false
        })
        expect(deletes).toEqual(['comic-a'])
        expect(unpublished).toHaveBeenCalledTimes(1)
        expect(fs.readFileSync(path.join(root, 'comic-a.png'), 'utf8')).toBe(
            'fixture-raster'
        )
        expect(db.listDownloadedPictures('comic-a-ep')).toHaveLength(1)
        expect(
            (await service.inventory()).comics.find(
                (item) => item.comicId === 'comic-b'
            )?.state
        ).toBe('remote-present')
    })
    it('deletes no files when the catalog changed concurrently', async () => {
        const { service, provider, deletes } = fixture()
        await service.sync()
        provider.putJsonConditional = async () => false
        await expect(
            removeRemoteCopies(provider, ['comic-a'], vi.fn())
        ).rejects.toThrow('其他设备')
        expect(deletes).toEqual([])
    })
    it('reports partial deletion truthfully and allows cleanup retry', async () => {
        const { service, provider } = fixture()
        await service.sync()
        provider.deleteComic = vi
            .fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValue(undefined)
        const first = await removeRemoteCopies(provider, ['comic-a'], vi.fn())
        expect(first).toMatchObject({
            success: false,
            pendingComicIds: ['comic-a'],
            deletedComicIds: []
        })
        expect(
            (await removeRemoteCopies(provider, ['comic-a'], vi.fn())).success
        ).toBe(true)
    })
    it('rejects an obsolete displayed catalog generation before any mutation', async () => {
        const { service, provider, puts, deletes } = fixture()
        await service.sync()
        puts.length = 0
        await expect(
            removeRemoteCopies(provider, ['comic-a'], vi.fn(), 'outdated')
        ).rejects.toThrow('目录已变化')
        expect(puts).toEqual([])
        expect(deletes).toEqual([])
    })
    it('does not mislabel missing/corrupt remote catalog as not uploaded', async () => {
        const { service, objects } = fixture()
        objects.set(remoteLayout.current, { catalogPath: 'missing' })
        await expect(service.inventory()).rejects.toThrow('目录缺失')
    })
    it('WebDAV DELETE is confined to a validated comic subtree and issued once', async () => {
        const calls: Array<{ url: string; method: string }> = []
        vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
            calls.push({ url, method: String(init.method) })
            return new Response(null, {
                status:
                    init.method === 'LOCK'
                        ? 200
                        : ['DELETE', 'UNLOCK'].includes(String(init.method))
                          ? 204
                          : 404,
                headers:
                    init.method === 'LOCK'
                        ? { 'Lock-Token': '<urn:uuid:fixture-lock>' }
                        : undefined
            })
        })
        const provider = new WebDavStorageProvider({
            kind: 'webdav',
            baseUrl: 'https://dav.example',
            root: 'PicaLibrary'
        })
        await expect(provider.deleteComic('../library.db')).rejects.toThrow(
            'Unsafe'
        )
        expect(calls).toEqual([])
        await provider.withExclusiveLibraryWrite(() =>
            provider.deleteComic('comic-a')
        )
        expect(
            calls.filter((call) => ['DELETE', 'HEAD'].includes(call.method))
        ).toEqual([
            {
                url: 'https://dav.example/PicaLibrary/v1/comics/comic-a',
                method: 'DELETE'
            },
            {
                url: 'https://dav.example/PicaLibrary/v1/comics/comic-a',
                method: 'HEAD'
            }
        ])
    })
    it('does not unpublish or delete without a server-enforced exclusive lock', async () => {
        const { service, provider, deletes, puts } = fixture()
        await service.sync()
        puts.length = 0
        provider.withExclusiveLibraryWrite = undefined
        await expect(
            removeRemoteCopies(provider, ['comic-a'], vi.fn())
        ).rejects.toThrow('锁定')
        expect(deletes).toEqual([])
        expect(puts).toEqual([])
    })
    it('refuses deletion when the lease is lost and never reacquires it automatically', async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(null, {
                    status: 200,
                    headers: { 'Lock-Token': '<urn:uuid:fixture-lock>' }
                })
            )
            .mockResolvedValueOnce(new Response(null, { status: 412 }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
        vi.stubGlobal('fetch', fetcher)
        const provider = new WebDavStorageProvider({
            kind: 'webdav',
            baseUrl: 'https://dav.example',
            root: 'PicaLibrary'
        })
        await expect(
            provider.withExclusiveLibraryWrite(() =>
                provider.deleteComic('comic-a')
            )
        ).rejects.toThrow('失效')
        expect(fetcher.mock.calls.map((call) => call[1].method)).toEqual([
            'LOCK',
            'LOCK',
            'UNLOCK'
        ])
        expect(
            new Headers(fetcher.mock.calls[1][1].headers).get('If')
        ).toContain('<https://dav.example/PicaLibrary/v1>')
    })
})
