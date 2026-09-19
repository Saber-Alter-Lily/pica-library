import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Pica } from '../../src/sdk'
import { LibraryDatabase } from '../../src/library/database'
import { ProviderService } from '../../src/services/provider-service'

function picaComic(id: string) {
    return {
        _id: id,
        title: id,
        author: 'Alice',
        description: '',
        chineseTeam: '',
        categories: ['Fantasy'],
        tags: ['tag-a'],
        finished: true,
        totalLikes: 1,
        totalViews: 2,
        pagesCount: 20,
        epsCount: 1
    }
}

function fixture() {
    const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-provider-shadow-')
    )
    const database = new LibraryDatabase(
        path.join(dir, 'library.sqlite')
    )
    const bounded = picaComic('bounded-result')
    const legacy = picaComic('legacy-result')
    const related = picaComic('related-result')
    const fake = {
        Order: { loved: 'ld' },
        search: vi.fn(async () => ({
            docs: [bounded],
            page: 1,
            pages: 5,
            total: 200
        })),
        searchAll: vi.fn(async () => [legacy]),
        comicsPage: vi.fn(async () => ({
            docs: [bounded],
            page: 1,
            pages: 5,
            total: 200
        })),
        comicsAll: vi.fn(async () => [legacy]),
        related: vi.fn(async () => [related])
    } as unknown as Pica
    const service = new ProviderService(
        async () => fake,
        database
    )
    return {
        dir,
        database,
        fake: fake as unknown as {
            search: ReturnType<typeof vi.fn>
            searchAll: ReturnType<typeof vi.fn>
            comicsPage: ReturnType<typeof vi.fn>
            comicsAll: ReturnType<typeof vi.fn>
            related: ReturnType<typeof vi.fn>
        },
        service
    }
}

describe('ProviderService shadow retrieval support', () => {
    it('uses a single bounded Pica page when SearchRequest.page is present', async () => {
        const value = fixture()
        const records = await value.service.search(
            {
                keyword: 'query',
                page: 2,
                limit: 40
            },
            ['pica'],
            'recommendations',
            { persist: false }
        )
        expect(records.map((item) => item.comicId)).toEqual([
            'bounded-result'
        ])
        expect(value.fake.search).toHaveBeenCalledTimes(1)
        expect(value.fake.search).toHaveBeenCalledWith(
            'query',
            2,
            'ld',
            []
        )
        expect(value.fake.searchAll).not.toHaveBeenCalled()
        expect(
            value.database.getComic('bounded-result')
        ).toBeUndefined()
        value.database.close()
        fs.rmSync(value.dir, { recursive: true, force: true })
    })

    it('preserves legacy all-pages behavior when page is omitted', async () => {
        const value = fixture()
        const records = await value.service.search(
            { keyword: 'query', limit: 40 },
            ['pica'],
            'discover'
        )
        expect(records.map((item) => item.comicId)).toEqual([
            'legacy-result'
        ])
        expect(value.fake.searchAll).toHaveBeenCalledTimes(1)
        expect(value.database.getComic('legacy-result')).toBeTruthy()
        value.database.close()
        fs.rmSync(value.dir, { recursive: true, force: true })
    })

    it('supports non-persisting Pica related retrieval for shadow evaluation', async () => {
        const value = fixture()
        const records = await value.service.relatedPica(
            'seed-comic',
            'recommendations',
            { persist: false }
        )
        expect(records.map((item) => item.comicId)).toEqual([
            'related-result'
        ])
        expect(value.fake.related).toHaveBeenCalledWith('seed-comic')
        expect(
            value.database.getComic('related-result')
        ).toBeUndefined()
        value.database.close()
        fs.rmSync(value.dir, { recursive: true, force: true })
    })
})
