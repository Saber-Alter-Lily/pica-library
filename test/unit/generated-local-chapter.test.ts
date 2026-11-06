import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import {
    LocalLibraryIngestion,
    localInventoryKey,
    type LocalInventoryV1
} from '../../src/local-library/ingestion'
import type { GeneratedLocalChapter } from '../../src/local-library/types'
import { ReaderService } from '../../src/services/reader-service'

const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=',
    'base64'
)
const owned: Array<{ root: string; db: LibraryDatabase }> = []
function fixture() {
    const root = fs.realpathSync.native(
            fs.mkdtempSync(path.join(os.tmpdir(), 'pica-generated-local-'))
        ),
        data = path.join(root, 'data')
    fs.mkdirSync(data)
    const entry = {
        root,
        db: new LibraryDatabase(path.join(data, 'library.db'))
    }
    owned.push(entry)
    const importer = new LocalLibraryIngestion(entry.db, data)
    entry.db.setAppState('protected-tags-visual-recommendation-sync', {
        visual: 'OFF',
        privateLabel: 'keep',
        cycle: 'unchanged'
    })
    const chapter = (
        key = '1',
        order = 1,
        count = 2
    ): GeneratedLocalChapter => ({
        comicKey: 'a'.repeat(64),
        title: 'My chosen book',
        chapterKey: key.repeat(64),
        chapterTitle: 'Chapter ' + key,
        orderHint: order,
        pageCount: count,
        assertAccess: vi.fn(),
        readPage: vi.fn(async () => ({ data: png, extension: '.png' }))
    })
    const inventory = (comicId: string) =>
        entry.db.getAppState<LocalInventoryV1>(localInventoryKey(comicId))!
    const generations = (comicId: string) =>
        fs
            .readdirSync(path.join(data, 'local-library', comicId.slice(6)))
            .sort()
    return {
        root,
        data,
        db: entry.db,
        importer,
        chapter,
        inventory,
        generations,
        reopen: () => {
            entry.db.close()
            entry.db = new LibraryDatabase(path.join(data, 'library.db'))
            return entry.db
        }
    }
}
afterEach(() => {
    vi.restoreAllMocks()
    for (const entry of owned.splice(0)) {
        entry.db.close()
        if (
            !path.basename(entry.root).startsWith('pica-generated-local-') ||
            path.dirname(entry.root) === entry.root
        )
            throw Error('Unsafe generated fixture cleanup')
        fs.rmSync(entry.root, { recursive: true, force: true })
    }
})

describe('owned generated chapters reuse actual local inventory/SQLite/Reader, synthetic bytes only', () => {
    it('persists a real local comic, reads with the producer revoked and resumes after database reopen', async () => {
        const f = fixture(),
            input = f.chapter(),
            result = await f.importer.importGeneratedChapter(input)
        expect(result).toMatchObject({ imported: true, pages: 2, chapters: 1 })
        expect(f.db.getComic(result.comicId)).toMatchObject({
            providerId: 'local',
            isFavorite: false,
            title: 'My chosen book'
        })
        expect(input.readPage).toHaveBeenCalledTimes(2)
        const reader = new ReaderService(f.db, f.data),
            metadata = reader.chapter(result.comicId, result.episodeId)
        expect(reader.picture(metadata.pages[0].id).data).toEqual(png)
        reader.saveProgress(result.comicId, result.episodeId, 1)
        input.assertAccess = () => {
            throw Error('Source unavailable')
        }
        input.readPage = async () => {
            throw Error('No host permitted')
        }
        const reopened = f.reopen(),
            cold = new ReaderService(reopened, f.data)
        expect(
            cold.chapter(result.comicId, result.episodeId).progress?.pageIndex
        ).toBe(1)
        expect(cold.picture(metadata.pages[1].id).data).toEqual(png)
        expect(
            reopened.getAppState('protected-tags-visual-recommendation-sync')
        ).toEqual({ visual: 'OFF', privateLabel: 'keep', cycle: 'unchanged' })
    })
    it('adds out-of-order chapters to ONE local book, retains page/progress IDs, and keeps favorites/title', async () => {
        const f = fixture(),
            later = await f.importer.importGeneratedChapter(f.chapter('2', 20))
        const old = f.inventory(later.comicId),
            oldIds = old.pages.map((page) => page.id)
        f.db.setLocalFavoriteState(later.comicId, true)
        new ReaderService(f.db, f.data).saveProgress(
            later.comicId,
            later.episodeId,
            1
        )
        const input = f.chapter('1', 10)
        input.title = 'Provider retitled book'
        const earlier = await f.importer.importGeneratedChapter(input),
            current = f.inventory(later.comicId)
        expect(earlier.comicId).toBe(later.comicId)
        expect(current.chapters.map((chapter) => chapter.title)).toEqual([
            'Chapter 1',
            'Chapter 2'
        ])
        expect(
            current.pages
                .filter((page) => page.episodeId === later.episodeId)
                .map((page) => page.id)
        ).toEqual(oldIds)
        expect(
            new ReaderService(f.db, f.data).chapter(
                later.comicId,
                later.episodeId
            ).progress?.pageIndex
        ).toBe(1)
        expect(f.db.getComic(later.comicId)).toMatchObject({
            title: 'My chosen book',
            isFavorite: true,
            pagesCount: 4
        })
        expect(fs.existsSync(path.join(f.data, old.directory))).toBe(false)
        expect(f.generations(later.comicId)).toHaveLength(1)
        expect(input.readPage).toHaveBeenCalledTimes(2) // old chapter was copied/verified, not fetched again
    })
    it('replaces a chapter without changing its ID; shorter copies clamp progress and retain other chapters', async () => {
        const f = fixture(),
            first = await f.importer.importGeneratedChapter(f.chapter())
        await f.importer.importGeneratedChapter(f.chapter('2', 2))
        new ReaderService(f.db, f.data).saveProgress(
            first.comicId,
            first.episodeId,
            1
        )
        const replaced = await f.importer.importGeneratedChapter(
            f.chapter('1', 1, 1)
        )
        expect(replaced.episodeId).toBe(first.episodeId)
        expect(replaced).toMatchObject({ pages: 3, chapters: 2 })
        expect(
            new ReaderService(f.db, f.data).chapter(
                first.comicId,
                first.episodeId
            ).progress?.pageIndex
        ).toBe(0)
    })
    it('revocation after an uncooperative page result discards only the uncommitted generation', async () => {
        const f = fixture(),
            first = await f.importer.importGeneratedChapter(f.chapter()),
            before = f.inventory(first.comicId)
        let allowed = true,
            release!: (value: { data: Buffer; extension: string }) => void
        const input = f.chapter('2', 2)
        input.assertAccess = () => {
            if (!allowed) throw Error('Access revoked')
        }
        input.readPage = vi.fn(
            async () =>
                await new Promise((resolve) => {
                    release = resolve
                })
        )
        const pending = f.importer.importGeneratedChapter(input),
            outcome = expect(pending).rejects.toThrow('Access revoked')
        await vi.waitFor(() => expect(release).toBeTypeOf('function'))
        await expect(
            f.importer.importGeneratedChapter(f.chapter('3', 3))
        ).rejects.toThrow('Another local import')
        allowed = false
        release({ data: png, extension: '.png' })
        await outcome
        expect(f.inventory(first.comicId)).toEqual(before)
        expect(f.generations(first.comicId)).toHaveLength(1)
        expect(
            new ReaderService(f.db, f.data).chapter(
                first.comicId,
                first.episodeId
            ).pages
        ).toHaveLength(2)
    })
    it('a late fetch failure preserves the old SQLite inventory/files and permits a fresh explicit retry', async () => {
        const f = fixture(),
            first = await f.importer.importGeneratedChapter(f.chapter()),
            before = f.inventory(first.comicId)
        const input = f.chapter('2', 2)
        input.readPage = vi.fn(async (index) => {
            if (index === 1) throw Error('Synthetic page failed')
            return { data: png, extension: '.png' }
        })
        await expect(f.importer.importGeneratedChapter(input)).rejects.toThrow(
            'Synthetic page failed'
        )
        expect(f.inventory(first.comicId)).toEqual(before)
        expect(f.generations(first.comicId)).toHaveLength(1)
        expect(
            (await f.importer.importGeneratedChapter(f.chapter('2', 2)))
                .chapters
        ).toBe(2)
    })
    it('actual SQLite transaction failure after deleting old picture rows rolls back and preserves readable originals', async () => {
        const f = fixture(),
            first = await f.importer.importGeneratedChapter(f.chapter()),
            before = f.inventory(first.comicId)
        vi.spyOn(f.db, 'upsertPicture').mockImplementationOnce(() => {
            throw Error('Synthetic SQLite write failure')
        })
        await expect(
            f.importer.importGeneratedChapter(f.chapter('2', 2))
        ).rejects.toThrow('Synthetic SQLite write failure')
        expect(f.inventory(first.comicId)).toEqual(before)
        expect(f.generations(first.comicId)).toHaveLength(1)
        const reader = new ReaderService(f.db, f.data)
        expect(
            reader.picture(
                reader.chapter(first.comicId, first.episodeId).pages[0].id
            ).data
        ).toEqual(png)
    })
    it('detects corrupt prior page bytes before fetching anything new and never deletes that generation', async () => {
        const f = fixture(),
            first = await f.importer.importGeneratedChapter(f.chapter()),
            before = f.inventory(first.comicId)
        fs.writeFileSync(
            before.pages[0].localPath,
            Buffer.from('changed stored page')
        )
        const input = f.chapter('2', 2)
        await expect(f.importer.importGeneratedChapter(input)).rejects.toThrow(
            'Saved page changed'
        )
        expect(input.readPage).not.toHaveBeenCalled()
        expect(f.inventory(first.comicId)).toEqual(before)
        expect(fs.existsSync(path.join(f.data, before.directory))).toBe(true)
    })
    it('refuses forged saved paths before opening outside files; malformed inventory is not reset', async () => {
        const f = fixture(),
            first = await f.importer.importGeneratedChapter(f.chapter()),
            inventory = f.inventory(first.comicId)
        const sentinel = path.join(f.root, 'private-fixture.bin')
        fs.writeFileSync(sentinel, 'Not image data')
        inventory.pages[0].localPath = sentinel
        f.db.setAppState(localInventoryKey(first.comicId), inventory)
        const open = vi.spyOn(fs.promises, 'open')
        await expect(
            f.importer.importGeneratedChapter(f.chapter('2', 2))
        ).rejects.toThrow('Generated inventory is invalid')
        expect(
            open.mock.calls.some(([file]) => String(file) === sentinel)
        ).toBe(false)
        expect(f.inventory(first.comicId)).toEqual(inventory)
    })
    it.each([
        { comicKey: '../unsafe' },
        { chapterKey: 'not-a-digest' },
        { title: 'bad\0title' },
        { pageCount: 0 },
        { pageCount: 2001 },
        { orderHint: Number.NaN }
    ])(
        'rejects malformed producer metadata before calls/files (%j)',
        async (patch) => {
            const f = fixture(),
                input = { ...f.chapter(), ...patch }
            await expect(
                f.importer.importGeneratedChapter(input)
            ).rejects.toThrow('Invalid generated local chapter')
            expect(input.readPage).not.toHaveBeenCalled()
            expect(fs.existsSync(path.join(f.data, 'local-library'))).toBe(
                false
            )
        }
    )
    it('rejects SVG/mismatched image types and removes partial generation without a comic row', async () => {
        const f = fixture(),
            input = f.chapter()
        input.readPage = async () => ({
            data: Buffer.from('<svg>not allowed</svg>'),
            extension: '.svg'
        })
        await expect(f.importer.importGeneratedChapter(input)).rejects.toThrow(
            'Generated page type is invalid'
        )
        expect(f.db.listComics({})).toEqual([])
    })
    it('an exclusive generation collision is retained, not reused or deleted as our failed work', async () => {
        const f = fixture(),
            mkdir = fs.promises.mkdir
        let collision = ''
        vi.spyOn(fs.promises, 'mkdir').mockImplementation(
            async (file, options) => {
                if (
                    !collision &&
                    /[\\/]local-library[\\/][a-f0-9]{64}[\\/][a-f0-9-]{36}$/.test(
                        String(file)
                    )
                ) {
                    await mkdir(file, options)
                    collision = String(file)
                    fs.writeFileSync(
                        path.join(collision, 'not-owned-by-this-invocation'),
                        'keep'
                    )
                    throw Object.assign(
                        new Error('Synthetic competing creator'),
                        { code: 'EEXIST' }
                    )
                }
                return mkdir(file, options)
            }
        )
        await expect(
            f.importer.importGeneratedChapter(f.chapter())
        ).rejects.toThrow('Synthetic competing creator')
        expect(
            fs.readFileSync(
                path.join(collision, 'not-owned-by-this-invocation'),
                'utf8'
            )
        ).toBe('keep')
        expect(f.db.listComics({})).toEqual([])
    })
    it('another in-process writer cannot be overwritten by a stale generation', async () => {
        const f = fixture(),
            first = await f.importer.importGeneratedChapter(f.chapter())
        let release!: (value: { data: Buffer; extension: string }) => void
        const input = f.chapter('2', 2, 1)
        input.readPage = async () =>
            await new Promise((resolve) => {
                release = resolve
            })
        const pending = f.importer.importGeneratedChapter(input),
            outcome = expect(pending).rejects.toThrow('Local inventory changed')
        await vi.waitFor(() => expect(release).toBeTypeOf('function'))
        await new LocalLibraryIngestion(f.db, f.data).importGeneratedChapter(
            f.chapter('3', 3)
        )
        release({ data: png, extension: '.png' })
        await outcome
        expect(
            f.inventory(first.comicId).chapters.map((chapter) => chapter.title)
        ).toEqual(['Chapter 1', 'Chapter 3'])
        expect(f.generations(first.comicId)).toHaveLength(1)
    })
    it('post-commit old-generation cleanup failure retains both copies without undoing the healthy inventory', async () => {
        const f = fixture(),
            first = await f.importer.importGeneratedChapter(f.chapter()),
            before = f.inventory(first.comicId)
        const remove = fs.promises.rm
        vi.spyOn(fs.promises, 'rm').mockImplementation(
            async (file, options) => {
                if (String(file) === path.join(f.data, before.directory))
                    throw Error('Synthetic locked old generation')
                return remove(file, options)
            }
        )
        const result = await f.importer.importGeneratedChapter(
            f.chapter('2', 2)
        )
        expect(result.previousGenerationRetained).toBe(true)
        expect(f.generations(first.comicId)).toHaveLength(2)
        expect(
            new ReaderService(f.db, f.data).chapters(first.comicId)
        ).toHaveLength(2)
    })
    it('snapshots the producer plan and bound methods so mid-request metadata changes cannot grow the job', async () => {
        const f = fixture(),
            input = f.chapter('1', 1, 1)
        const read = input.readPage
        input.readPage = async (index) => {
            input.pageCount = 2001
            input.title = 'changed\0title'
            return read(index)
        }
        const result = await f.importer.importGeneratedChapter(input)
        expect(result.pages).toBe(1)
        expect(f.db.getComic(result.comicId)?.title).toBe('My chosen book')
    })
    it('keeps callback this-context across the shared commit helper', async () => {
        const f = fixture(),
            input = {
                ...f.chapter('1', 1, 1),
                allowed: true,
                assertAccess() {
                    if (!this.allowed) throw Error('Not allowed')
                },
                async readPage(_index: number) {
                    expect(this.allowed).toBe(true)
                    return { data: png, extension: '.png' }
                }
            }
        expect((await f.importer.importGeneratedChapter(input)).pages).toBe(1)
    })
    it('revocation after the synchronous atomic commit does not undo an already accepted local copy', async () => {
        const f = fixture(),
            input = f.chapter('1', 1, 1),
            commit = f.db.commitLocalInventory.bind(f.db)
        let allowed = true
        input.assertAccess = () => {
            if (!allowed) throw Error('Revoked')
        }
        vi.spyOn(f.db, 'commitLocalInventory').mockImplementationOnce(
            (inventory) => {
                commit(inventory)
                allowed = false
            }
        )
        const result = await f.importer.importGeneratedChapter(input),
            reader = new ReaderService(f.db, f.data)
        expect(
            reader.picture(
                reader.chapter(result.comicId, result.episodeId).pages[0].id
            ).data
        ).toEqual(png)
        expect(f.generations(result.comicId)).toHaveLength(1)
    })
})
