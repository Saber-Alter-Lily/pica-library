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

function comic(comicId = 'c1'): StoredComic {
    return {
        comicId,
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
}

describe('library organizer', () => {
    it('builds author and circle views over stable objects asynchronously', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-organizer-'))
        try {
            fs.mkdirSync(path.join(dir, 'library', 'objects', 'c1'), {
                recursive: true
            })
            const current = comic()
            const progress: number[] = []
            const result = await organizeLibraryViews(dir, [current], {
                yieldEvery: 1,
                onProgress: (value) => progress.push(value.done)
            })
            expect(result.linked + result.manifests).toBe(2)
            expect(progress).toEqual([1])
            expect(
                fs.existsSync(path.join(result.viewsRoot, 'index.json'))
            ).toBe(true)
            const portable = path.join(dir, 'portable')
            expect(portableComicFolder(current)).toBe(
                '[Alice] A _ Work [c1]'
            )
            expect(
                (
                    await materializePortableLibrary(
                        dir,
                        [current],
                        portable,
                        { yieldEvery: 1 }
                    )
                ).copied
            ).toBe(1)
            expect(
                fs.existsSync(path.join(portable, '[Alice] A _ Work [c1]'))
            ).toBe(true)
        } finally {
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })

    it('keeps the previous published index when cancellation arrives before publication', async () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-organizer-cancel-')
        )
        try {
            const current = comic()
            fs.mkdirSync(path.join(dir, 'library', 'objects', 'c1'), {
                recursive: true
            })
            const viewsRoot = path.join(dir, 'library', 'views')
            fs.mkdirSync(viewsRoot, { recursive: true })
            const indexFile = path.join(viewsRoot, 'index.json')
            fs.writeFileSync(indexFile, '{"generation":"previous"}', 'utf8')

            let cancel = false
            await expect(
                organizeLibraryViews(dir, [current], {
                    onProgress: () => {
                        cancel = true
                    },
                    checkpoint: () => {
                        if (cancel) throw new Error('cancelled for test')
                    }
                })
            ).rejects.toThrow('cancelled for test')

            expect(fs.readFileSync(indexFile, 'utf8')).toBe(
                '{"generation":"previous"}'
            )
        } finally {
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })

    it('keeps the previous portable manifest when cancellation arrives before publication', async () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-portable-cancel-')
        )
        try {
            const current = comic()
            fs.mkdirSync(path.join(dir, 'library', 'objects', 'c1'), {
                recursive: true
            })
            const portable = path.join(dir, 'portable')
            fs.mkdirSync(portable, { recursive: true })
            const manifest = path.join(
                portable,
                'pica-library-manifest.json'
            )
            fs.writeFileSync(
                manifest,
                '{"generation":"previous"}',
                'utf8'
            )

            let cancel = false
            await expect(
                materializePortableLibrary(dir, [current], portable, {
                    onProgress: () => {
                        cancel = true
                    },
                    checkpoint: () => {
                        if (cancel) throw new Error('cancelled for test')
                    }
                })
            ).rejects.toThrow('cancelled for test')

            expect(fs.readFileSync(manifest, 'utf8')).toBe(
                '{"generation":"previous"}'
            )
        } finally {
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })
})
