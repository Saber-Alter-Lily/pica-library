import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { ProviderService } from '../../src/services/provider-service'
import type { Comic, PageFavorites } from '../../src/types'
import type { Pica } from '../../src/sdk'

const roots: string[] = []

function comic(id: string): Comic {
    return {
        _id: id,
        title: `Comic ${id}`,
        author: 'Author',
        description: '',
        chineseTeam: '',
        categories: [],
        tags: [],
        finished: false,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        totalLikes: 0,
        totalViews: 0
    }
}

function setup(count = 1773) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-fast-sync-'))
    roots.push(root)
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    const records = Array.from({ length: count }, (_, index) =>
        comic(`known-${index}`)
    )
    database.importFavorites(
        records.map((item) => ({
            comicId: item._id,
            title: item.title,
            author: item.author,
            categories: [],
            tags: [],
            finished: false
        })),
        'pica:favorites:full'
    )
    const now = new Date().toISOString()
    database.saveFavoritesSyncState({
        lastFullSyncAt: now,
        lastQuickSyncAt: now,
        previousRemoteCount: count,
        lastHeadIds: records.slice(0, 20).map((item) => item._id),
        lastHeadFingerprint: 'fixture',
        lastKnownPageSize: 20,
        lastFullReconcileCount: count
    })
    return { database, records }
}

function page(
    docs: Comic[],
    current: number,
    pages: number,
    total: number
): PageFavorites {
    return { docs, page: current, pages, total, limit: 20 }
}

afterEach(() => {
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('fast favorites synchronization', () => {
    it('quick_sync_one_new_item_page1_only', async () => {
        const { database, records } = setup()
        const favorites = vi.fn(async () =>
            page([comic('new-1'), ...records.slice(0, 19)], 1, 89, 1774)
        )
        const provider = { favorites } as unknown as Pica
        const result = await new ProviderService(
            async () => provider,
            database
        ).syncFavorites('quick')
        expect(result).toMatchObject({
            syncMode: 'quick',
            pagesChecked: 1,
            foundNew: 1
        })
        expect(favorites).toHaveBeenCalledTimes(1)
        expect(database.favoriteIds()).toContain('new-1')
        database.close()
    })

    it('quick_sync_multiple_new_items', async () => {
        const { database, records } = setup()
        const provider = {
            favorites: vi.fn(async () =>
                page(
                    [comic('new-1'), comic('new-2'), ...records.slice(0, 18)],
                    1,
                    89,
                    1775
                )
            )
        } as unknown as Pica
        const result = await new ProviderService(
            async () => provider,
            database
        ).syncFavorites('quick')
        expect(result).toMatchObject({ syncMode: 'quick', foundNew: 2 })
        database.close()
    })

    it('quick_sync_stable_overlap', async () => {
        const { database, records } = setup(30)
        const favorites = vi.fn(async (current: number) =>
            current === 1
                ? page(
                      [
                          ...Array.from({ length: 12 }, (_, index) =>
                              comic(`new-${index}`)
                          ),
                          ...records.slice(0, 8)
                      ],
                      1,
                      3,
                      42
                  )
                : page(records.slice(8, 28), 2, 3, 42)
        )
        const result = await new ProviderService(
            async () => ({ favorites }) as unknown as Pica,
            database
        ).syncFavorites('quick')
        expect(result).toMatchObject({ syncMode: 'quick', pagesChecked: 1 })
        database.close()
    })

    it('quick_sync_does_not_stop_on_single_known_id', async () => {
        const { database, records } = setup(30)
        const favorites = vi.fn(async (current: number) =>
            current === 1
                ? page(
                      [
                          ...Array.from({ length: 19 }, (_, index) =>
                              comic(`new-${index}`)
                          ),
                          records[0]
                      ],
                      1,
                      3,
                      49
                  )
                : page(records.slice(1, 21), 2, 3, 49)
        )
        const result = await new ProviderService(
            async () => ({ favorites }) as unknown as Pica,
            database
        ).syncFavorites('quick')
        expect(result).toMatchObject({ syncMode: 'quick', pagesChecked: 2 })
        database.close()
    })

    it.each([
        'quick_sync_remote_count_consistent',
        'quick_sync_large_1773_favorites_bounded_pages'
    ])('%s', async () => {
        const { database, records } = setup()
        const favorites = vi.fn(async () =>
            page([comic('new'), ...records.slice(0, 19)], 1, 89, 1774)
        )
        const result = await new ProviderService(
            async () => ({ favorites }) as unknown as Pica,
            database
        ).syncFavorites('quick')
        expect(result.pagesChecked).toBeLessThanOrEqual(2)
        database.close()
    })

    it.each([
        'quick_sync_detects_count_anomaly',
        'quick_sync_falls_back_full_reconcile',
        'quick_sync_removed_old_favorite_reconcile'
    ])('%s', async () => {
        const { database, records } = setup(30)
        const fullRecords = [comic('new'), ...records.slice(0, 29)]
        const provider = {
            favorites: vi.fn(async () =>
                page([comic('new'), ...records.slice(0, 19)], 1, 2, 30)
            ),
            favoritesAll: vi.fn(async (_all, onPage) => {
                onPage?.({ page: 1, pages: 2, fetched: 20, total: 30 })
                onPage?.({ page: 2, pages: 2, fetched: 30, total: 30 })
                return { comics: fullRecords, pages: 2 }
            })
        } as unknown as Pica
        const result = await new ProviderService(
            async () => provider,
            database
        ).syncFavorites('quick')
        expect(result).toMatchObject({
            syncMode: 'full',
            fallbackReason: 'remote-count-anomaly'
        })
        expect(database.favoriteIds()).not.toContain('known-29')
        database.close()
    })

    it('full_sync_exact_membership', async () => {
        const { database } = setup(10)
        const exact = [comic('exact-1'), comic('exact-2')]
        const provider = {
            favoritesAll: vi.fn(async (_all, onPage) => {
                onPage?.({ page: 1, pages: 1, fetched: 2, total: 2 })
                return { comics: exact, pages: 1 }
            })
        } as unknown as Pica
        await new ProviderService(async () => provider, database).syncFavorites(
            'full'
        )
        expect(database.favoriteIds()).toEqual(['exact-1', 'exact-2'])
        database.close()
    })

    it('full_sync_preserves_provider_order_across_pages', async () => {
        const { database } = setup(2)
        const providerOrder = [
            comic('newest-page-1'),
            comic('page-1-tail'),
            comic('page-2-head'),
            comic('oldest-page-2')
        ]
        const provider = {
            favoritesAll: vi.fn(async (_all, onPage) => {
                onPage?.({ page: 1, pages: 2, fetched: 2, total: 4 })
                onPage?.({ page: 2, pages: 2, fetched: 4, total: 4 })
                return { comics: providerOrder, pages: 2 }
            })
        } as unknown as Pica
        const result = await new ProviderService(
            async () => provider,
            database
        ).syncFavorites('full')
        expect(result.favoriteOrderIds).toEqual(
            providerOrder.map((item) => item._id)
        )
        expect(result.favoritePageSize).toBe(2)
        database.close()
    })

    it('quick_sync_no_duplicate_ids', async () => {
        const { database, records } = setup(20)
        const provider = {
            favorites: vi.fn(async () =>
                page(
                    [records[0], records[0], ...records.slice(1, 19)],
                    1,
                    1,
                    20
                )
            ),
            favoritesAll: vi.fn(async () => ({ comics: records, pages: 1 }))
        } as unknown as Pica
        const result = await new ProviderService(
            async () => provider,
            database
        ).syncFavorites('quick')
        expect(result.syncMode).toBe('full')
        expect(new Set(database.favoriteIds()).size).toBe(20)
        database.close()
    })
})
