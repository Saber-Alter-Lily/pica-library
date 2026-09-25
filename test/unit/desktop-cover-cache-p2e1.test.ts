import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Pica } from '../../src/sdk'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'

const roots: string[] = []

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-p2e1-cover-'))
    roots.push(root)
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    const fetchImage = vi.fn(
        async (locator: string) => ({
            data: Buffer.from(locator.includes('cover-v2') ? 'cover-v2' : 'cover-v1'),
            contentType: 'image/jpeg'
        })
    )
    const provider = {
        fetchImage
    } as unknown as Pica
    const service = new LibraryService(database, root, provider)
    return { root, database, service, fetchImage }
}

function record(coverUrl: string, updatedAt: string) {
    return {
        comicId: 'cover-cache-comic',
        providerId: 'pica' as const,
        providerRemoteId: 'remote-cover-cache-comic',
        title: 'Cover Cache Work',
        author: 'Cover Author',
        categories: [],
        tags: [],
        finished: false,
        coverUrl,
        updatedAt
    }
}

afterEach(() => {
    while (roots.length)
        fs.rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('P2 E1 Desktop cover cache source identity', () => {
    it('reuses unchanged covers but refreshes when the source identity changes', async () => {
        const { root, database, service, fetchImage } = fixture()
        const v1 = 'https://media.example/cover-v1.jpg'
        const v2 = 'https://media.example/cover-v2.jpg'

        database.importCatalog(
            [record(v1, '2026-09-24T01:00:00.000Z')],
            'p2-e1-cover-v1'
        )

        const first = await service.cover('cover-cache-comic')
        expect(first.cached).toBe(false)
        expect(first.data.toString()).toBe('cover-v1')
        expect(fetchImage).toHaveBeenCalledTimes(1)
        expect(fetchImage).toHaveBeenLastCalledWith(v1, 20 * 1024 * 1024)

        const cached = await service.cover('cover-cache-comic')
        expect(cached.cached).toBe(true)
        expect(cached.data.toString()).toBe('cover-v1')
        expect(fetchImage).toHaveBeenCalledTimes(1)

        database.importCatalog(
            [record(v2, '2026-09-24T02:00:00.000Z')],
            'p2-e1-cover-v2'
        )

        const refreshed = await service.cover('cover-cache-comic')
        expect(refreshed.cached).toBe(false)
        expect(refreshed.data.toString()).toBe('cover-v2')
        expect(fetchImage).toHaveBeenCalledTimes(2)
        expect(fetchImage).toHaveBeenLastCalledWith(v2, 20 * 1024 * 1024)

        const cachedV2 = await service.cover('cover-cache-comic')
        expect(cachedV2.cached).toBe(true)
        expect(cachedV2.data.toString()).toBe('cover-v2')
        expect(fetchImage).toHaveBeenCalledTimes(2)

        database.importCatalog(
            [record(v2, '2026-09-24T03:00:00.000Z')],
            'p2-e1-cover-v2-revision'
        )
        const sameLocatorNewRevision =
            await service.cover('cover-cache-comic')
        expect(sameLocatorNewRevision.cached).toBe(false)
        expect(sameLocatorNewRevision.data.toString()).toBe('cover-v2')
        expect(fetchImage).toHaveBeenCalledTimes(3)

        const stableRevision = await service.cover('cover-cache-comic')
        expect(stableRevision.cached).toBe(true)
        expect(fetchImage).toHaveBeenCalledTimes(3)

        const cacheKey = createHash('sha256')
            .update('cover-cache-comic')
            .digest('hex')
        const metadataFile = path.join(
            root,
            'cover-cache',
            `${cacheKey}.json`
        )
        const metadata = JSON.parse(
            fs.readFileSync(metadataFile, 'utf8')
        ) as Record<string, unknown>
        expect(metadata).toMatchObject({
            contentType: 'image/jpeg'
        })
        expect(String(metadata.sourceFingerprint ?? '')).toMatch(
            /^[a-f0-9]{64}$/
        )
        expect(JSON.stringify(metadata)).not.toContain(v2)

        database.close()
    })

    it('refreshes a legacy cache entry once when sourceFingerprint is absent', async () => {
        const { root, database, service, fetchImage } = fixture()
        const coverUrl = 'https://media.example/cover-v1.jpg'
        database.importCatalog(
            [record(coverUrl, '2026-09-24T01:00:00.000Z')],
            'p2-e1-legacy-cover'
        )

        await service.cover('cover-cache-comic')
        expect(fetchImage).toHaveBeenCalledTimes(1)

        const cacheKey = createHash('sha256')
            .update('cover-cache-comic')
            .digest('hex')
        const metadataFile = path.join(
            root,
            'cover-cache',
            `${cacheKey}.json`
        )
        fs.writeFileSync(
            metadataFile,
            JSON.stringify({ contentType: 'image/jpeg' }),
            'utf8'
        )

        const migrated = await service.cover('cover-cache-comic')
        expect(migrated.cached).toBe(false)
        expect(fetchImage).toHaveBeenCalledTimes(2)

        const stable = await service.cover('cover-cache-comic')
        expect(stable.cached).toBe(true)
        expect(fetchImage).toHaveBeenCalledTimes(2)

        database.close()
    })
})
