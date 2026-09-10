import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    materializePortableLibrary,
    organizeLibraryViews,
    portableComicFolder
} from '../../src/library/organizer'
import type { StoredComic } from '../../src/library/types'

describe('library organizer', () => {
    it('builds author and circle views over stable objects', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-organizer-'))
        try {
            fs.mkdirSync(path.join(dir, 'library', 'objects', 'c1'), {
                recursive: true
            })
            const comic: StoredComic = {
                comicId: 'c1',
                title: 'A / Work',
                author: 'Moon (Alice)',
                canonicalAuthor: 'Alice',
                circle: 'Moon',
                authorId: 'a1',
                categories: [],
                tags: [],
                finished: false,
                isFavorite: true,
                firstSeenAt: '2026-01-01',
                lastSeenAt: '2026-01-01',
                knownEpisodes: 0,
                knownPictures: 0,
                downloadedPictures: 0
            }
            const result = organizeLibraryViews(dir, [comic])
            expect(result.linked + result.manifests).toBe(2)
            expect(
                fs.existsSync(path.join(result.viewsRoot, 'index.json'))
            ).toBe(true)
            const portable = path.join(dir, 'portable')
            expect(portableComicFolder(comic)).toBe('[Alice] A _ Work [c1]')
            expect(
                materializePortableLibrary(dir, [comic], portable).copied
            ).toBe(1)
            expect(
                fs.existsSync(path.join(portable, '[Alice] A _ Work [c1]'))
            ).toBe(true)
        } finally {
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })
})
