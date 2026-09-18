import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import { LibraryDatabase } from '../../src/library/database'
import {
    buildWorkIdentityAuditV5,
    WORK_IDENTITY_RESOLVER_VERSION
} from '../../src/recommendation-v5/work-identity-foundation'
import { defaultPortablePolicyStateV5 } from '../../src/recommendation-v5/portable-policy'

function comic(
    input: Partial<StoredComic> & Pick<StoredComic, 'comicId' | 'title'>
): StoredComic {
    return {
        comicId: input.comicId,
        title: input.title,
        author: input.author ?? '',
        canonicalAuthor: input.canonicalAuthor ?? input.author ?? '',
        circle: input.circle ?? null,
        authorId: input.authorId ?? null,
        tags: input.tags ?? [],
        categories: input.categories ?? [],
        finished: input.finished ?? true,
        isFavorite: input.isFavorite ?? false,
        firstSeenAt: input.firstSeenAt ?? new Date(0).toISOString(),
        lastSeenAt: input.lastSeenAt ?? new Date(0).toISOString(),
        knownEpisodes: input.knownEpisodes ?? 1,
        knownPictures: input.knownPictures ?? input.pagesCount ?? 0,
        downloadedPictures: input.downloadedPictures ?? 0,
        pagesCount: input.pagesCount ?? 0,
        inLibrary: input.inLibrary ?? false,
        providerId: input.providerId
    } as StoredComic
}

describe('Canonical Work Identity foundation', () => {
    it('adds the identity schema without rewriting existing comic identity', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-work-id-'))
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        const status = database.workIdentityStorageStatus()

        expect(status.appliedSchemaVersion).toBe(
            status.expectedSchemaVersion
        )
        expect(status.expectedSchemaVersion).toBeGreaterThanOrEqual(12)
        for (const present of Object.values(status.tables))
            expect(present).toBe(true)
        expect(status.counts.bindings).toBe(0)
        expect(status.counts.evidence).toBe(0)
        expect(status.counts.decisions).toBe(0)

        // Existing comic IDs stay canonical upload IDs; migration 12 does not
        // require or pre-create a work binding.
        database.importCatalog(
            [
                {
                    comicId: 'pica:original',
                    title: 'Original',
                    author: 'Artist',
                    tags: [],
                    categories: [],
                    finished: true
                }
            ],
            'test'
        )
        expect(database.getComic('pica:original')?.comicId).toBe(
            'pica:original'
        )
        expect(database.workIdentityStorageStatus().counts.bindings).toBe(0)

        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('surfaces conservative same-work candidates without binding them', () => {
        const state = defaultPortablePolicyStateV5()
        const result = buildWorkIdentityAuditV5(
            [
                comic({
                    comicId: 'pica:1',
                    providerId: 'pica',
                    title: 'Work Title',
                    author: 'Artist',
                    pagesCount: 24
                }),
                comic({
                    comicId: 'eh:2',
                    providerId: 'eh',
                    title: '[Chinese] Work Title',
                    author: 'Artist',
                    pagesCount: 25
                }),
                comic({
                    comicId: 'eh:3',
                    providerId: 'eh',
                    title: 'Work Title',
                    author: 'Different Artist',
                    pagesCount: 24
                })
            ],
            state
        )
        expect(result.mode).toBe('READ_ONLY')
        expect(result.resolverVersion).toBe(WORK_IDENTITY_RESOLVER_VERSION)
        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0]).toMatchObject({
            leftComicId: 'pica:1',
            rightComicId: 'eh:2',
            crossProvider: true,
            relation: 'PROBABLE_SAME_WORK'
        })
    })

    it('respects an explicit keep-separate override from the existing policy', () => {
        const state = {
            ...defaultPortablePolicyStateV5(),
            explicitDistinctPairs: ['eh:2\u0000pica:1']
        }
        const result = buildWorkIdentityAuditV5(
            [
                comic({
                    comicId: 'pica:1',
                    title: 'Same',
                    author: 'Artist',
                    pagesCount: 20
                }),
                comic({
                    comicId: 'eh:2',
                    title: 'Same',
                    author: 'Artist',
                    pagesCount: 20
                })
            ],
            state
        )
        expect(result.candidates).toHaveLength(0)
    })
})
