import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { ProviderService } from '../../src/services/provider-service'
import type { Pica } from '../../src/sdk'
import type { Comic } from '../../src/types'

const directories: string[] = []

function comic(isFavourite: boolean): Comic {
    return {
        _id: 'favorite-comic',
        title: 'Favorite candidate',
        author: 'Alice',
        description: '',
        chineseTeam: '',
        categories: [],
        tags: [],
        finished: false,
        created_at: '',
        updated_at: '',
        totalLikes: 0,
        totalViews: 0,
        isFavourite
    }
}

function fixture(provider: Partial<Pica>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-provider-'))
    directories.push(root)
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    database.importCatalog([
        {
            comicId: 'favorite-comic',
            title: 'Favorite candidate',
            author: 'Alice',
            categories: [],
            tags: [],
            finished: false
        }
    ])
    return {
        database,
        service: new ProviderService(async () => provider as Pica, database)
    }
}

afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

describe('ProviderService Pica favorite mutation', () => {
    it('updates local favorite only after remote state is confirmed', async () => {
        const fav = vi.fn(async () => ({}))
        const comicInfo = vi
            .fn()
            .mockResolvedValueOnce(comic(false))
            .mockResolvedValueOnce(comic(true))
        const { database, service } = fixture({ fav, comicInfo })
        await expect(
            service.addFavorite('favorite-comic')
        ).resolves.toMatchObject({
            changed: true,
            isFavorite: true
        })
        expect(fav).toHaveBeenCalledOnce()
        expect(database.getComic('favorite-comic')?.isFavorite).toBe(true)
        database.close()
    })

    it('does not toggle an already-favorite comic', async () => {
        const fav = vi.fn()
        const { database, service } = fixture({
            fav,
            comicInfo: vi.fn(async () => comic(true))
        })
        await expect(
            service.addFavorite('favorite-comic')
        ).resolves.toMatchObject({
            changed: false,
            already: true
        })
        expect(fav).not.toHaveBeenCalled()
        database.close()
    })

    it('fails closed and keeps local state when remote confirmation fails', async () => {
        const { database, service } = fixture({
            fav: vi.fn(async () => ({})),
            comicInfo: vi.fn(async () => comic(false))
        })
        await expect(service.addFavorite('favorite-comic')).rejects.toThrow(
            /未能得到远端确认/
        )
        expect(database.getComic('favorite-comic')?.isFavorite).toBe(false)
        database.close()
    })

    it.each([
        ['authentication', new Error('401 authentication failed')],
        ['rate limit', new Error('429 rate limit')],
        ['network', new Error('proxy timeout')]
    ])(
        'preserves provider %s failures without local mutation',
        async (_, error) => {
            const { database, service } = fixture({
                comicInfo: vi.fn().mockRejectedValue(error),
                fav: vi.fn()
            })
            await expect(
                service.addFavorite('favorite-comic')
            ).rejects.toThrow()
            expect(database.getComic('favorite-comic')?.isFavorite).toBe(false)
            database.close()
        }
    )
})
