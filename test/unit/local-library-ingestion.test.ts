import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    LocalLibraryIngestion,
    localInventoryKey,
    type LocalInventoryV1
} from '../../src/local-library/ingestion'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { ReaderService } from '../../src/services/reader-service'
import { LibraryQueryService } from '../../src/services/library-query-service'
import { comicTagProviderV1, normalizeTagPolicyV1 } from '../../src/tags/policy'
import { favoritesFromCsv, favoritesToCsv } from '../../src/library/csv'

const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=',
    'base64'
)
const owned: Array<{ root: string; db: LibraryDatabase }> = []
function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-local-import-'))
    const data = path.join(root, 'library'),
        original = path.join(root, 'original')
    fs.mkdirSync(data)
    fs.mkdirSync(original)
    const db = new LibraryDatabase(path.join(data, 'library.db'))
    owned.push({ root, db })
    const importer = new LocalLibraryIngestion(db, data)
    const page = (name: string, bytes = png) => {
        const file = path.join(original, name)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, bytes)
        return file
    }
    return { root, data, original, db, importer, page }
}
afterEach(() => {
    vi.restoreAllMocks()
    for (const { root, db } of owned.splice(0)) {
        db.close()
        fs.rmSync(root, { recursive: true, force: true })
    }
})

describe('local-first owned media ingestion (synthetic, no provider)', () => {
    it('never sends local IDs to the legacy direct-Pica related fallback', async () => {
        const f = fixture()
        f.page('1.png')
        const preview = await f.importer.preview(f.original, 'folder')
        await f.importer.confirm(preview.token)
        f.db.setLocalFavoriteState(preview.comicId, true)
        const related = vi.fn(async () => [])
        const sdk = {
            related,
            Order: { loved: 'loved' },
            search: async () => ({ docs: [], pages: 1 }),
            comicsPage: async () => ({ docs: [], pages: 1 })
        }
        const service = new LibraryService(f.db, f.data, sdk as never)
        await service.recommendations({ limit: 1 })
        expect(related).not.toHaveBeenCalled()
        f.db.importFavorites(
            [
                {
                    comicId: 'legacy-pica-seed',
                    providerId: 'pica',
                    title: 'Synthetic Pica seed',
                    author: 'Fixture',
                    categories: [],
                    tags: [],
                    finished: false
                }
            ],
            'test',
            true
        )
        await service.recommendations({ limit: 1 })
        expect(related.mock.calls).toEqual([['legacy-pica-seed']])
    })
    it('refuses its own library, ancestors and symlinked source folders', async () => {
        const f = fixture()
        f.page('1.png')
        await expect(f.importer.preview(f.data, 'folder')).rejects.toThrow(
            /Library root/
        )
        await expect(f.importer.preview(f.root, 'folder')).rejects.toThrow(
            /Library root/
        )
        const link = path.join(f.root, 'linked-original')
        fs.symlinkSync(
            f.original,
            link,
            process.platform === 'win32' ? 'junction' : 'dir'
        )
        await expect(f.importer.preview(link, 'folder')).rejects.toThrow(
            /regular comic folder/
        )
        expect(f.db.listComics({})).toHaveLength(0)
    })
    it('previews without database/media writes; imports naturally ordered chapters and reads after restart', async () => {
        const f = fixture()
        f.page('Chapter 10/2.png')
        f.page('Chapter 2/10.png')
        f.page('Chapter 2/2.png')
        const before = f.db.summary()
        const preview = await f.importer.preview(f.original, 'folder')
        expect(preview).toMatchObject({
            pages: 3,
            chapters: 2,
            existing: false
        })
        expect(f.db.summary()).toEqual(before)
        expect(fs.readdirSync(f.data).some((p) => p === 'local-library')).toBe(
            false
        )
        expect(JSON.stringify(preview)).not.toContain(f.original)
        const result = await f.importer.confirm(preview.token)
        const comic = f.db.getComic(result.comicId)!
        expect(comic).toMatchObject({
            providerId: 'local',
            pagesCount: 3,
            inLibrary: true,
            isFavorite: false
        })
        expect(comicTagProviderV1(comic)).toBe('local')
        expect(
            new LibraryQueryService(f.db).query({ providerIds: ['local'] })
                .total
        ).toBe(1)
        const reader = new ReaderService(f.db, f.data)
        const chapters = reader.chapters(result.comicId)
        expect(chapters.map((c) => c.title)).toEqual([
            'Chapter 2',
            'Chapter 10'
        ])
        const pages = f.db.listDownloadedPictures(chapters[0].id)
        expect(pages.map((p) => p.originalName)).toEqual(['2.png', '10.png'])
        expect(reader.picture(pages[0].id).data).toEqual(png)
        reader.saveProgress(result.comicId, chapters[0].id, 1)
        const connect = vi
            .spyOn(LibraryService.prototype, 'connect')
            .mockRejectedValue(new Error('Must not connect'))
        const service = new LibraryService(f.db, f.data)
        expect((await service.cover(result.comicId)).data).toEqual(png)
        await service.providerService().setFavorite(result.comicId, true)
        expect(connect).not.toHaveBeenCalled()
        await expect(
            service.providerService().getEpisodes(result.comicId)
        ).rejects.toThrow(/source/i)
        expect(connect).not.toHaveBeenCalled()
        expect(favoritesFromCsv(favoritesToCsv([comic]))[0].providerId).toBe(
            'local'
        )
        f.db.close()
        const reopened = new LibraryDatabase(path.join(f.data, 'library.db'))
        owned[0].db = reopened
        expect(
            new ReaderService(reopened, f.data).chapter(
                result.comicId,
                chapters[0].id
            ).progress?.pageIndex
        ).toBe(1)
        expect(
            fs.readFileSync(path.join(f.original, 'Chapter 2/2.png'))
        ).toEqual(png)
    })

    it('retains stable IDs, logical page progress, favorites and private state on reimport/removal', async () => {
        const f = fixture()
        f.page('2.png')
        f.page('10.png')
        const first = await f.importer.preview(f.original, 'folder')
        await f.importer.confirm(first.token)
        const reader = new ReaderService(f.db, f.data),
            chapter = reader.chapters(first.comicId)[0]
        reader.saveProgress(first.comicId, chapter.id, 1)
        const old = f.db.listDownloadedPictures(chapter.id)[1]
        f.db.setLocalFavoriteState(first.comicId, true)
        f.db.setAppState('private-sentinel', {
            label: 'mine',
            ids: [first.comicId]
        })
        f.page('1.png')
        const second = await f.importer.preview(f.original, 'folder')
        await f.importer.confirm(second.token)
        expect(second.comicId).toBe(first.comicId)
        expect(f.db.readingProgress(first.comicId)[0].pageIndex).toBe(2)
        expect(f.db.listDownloadedPictures(chapter.id)[2].id).toBe(old.id)
        expect(f.db.getComic(first.comicId)?.isFavorite).toBe(true)
        expect(f.db.getAppState('private-sentinel')).toEqual({
            label: 'mine',
            ids: [first.comicId]
        })
        fs.unlinkSync(path.join(f.original, '10.png'))
        const third = await f.importer.preview(f.original, 'folder')
        expect(third.removedPages).toBe(1)
        await f.importer.confirm(third.token)
        expect(f.db.getDownloadedPicture(old.id)).toBeUndefined()
        expect(f.db.readingProgress(first.comicId)[0].pageIndex).toBe(1)
    })

    it('keeps originals and old inventory intact on changed inputs and database failure; tokens are single-use', async () => {
        const f = fixture()
        f.page('1.png')
        const first = await f.importer.preview(f.original, 'folder')
        await f.importer.confirm(first.token)
        const previous = f.db.getAppState<LocalInventoryV1>(
            localInventoryKey(first.comicId)
        )!
        const changed = await f.importer.preview(f.original, 'folder')
        f.page('2.png')
        await expect(f.importer.confirm(changed.token)).rejects.toThrow(
            /changed/
        )
        await expect(f.importer.confirm(changed.token)).rejects.toThrow(
            /expired/
        )
        expect(f.db.getAppState(localInventoryKey(first.comicId))).toEqual(
            previous
        )
        const preview = await f.importer.preview(f.original, 'folder')
        const originalSet = f.db.setAppState.bind(f.db)
        vi.spyOn(f.db, 'setAppState').mockImplementation((key, value) => {
            if (key.startsWith('local-library.inventory.'))
                throw new Error('synthetic sqlite failure')
            return originalSet(key, value)
        })
        await expect(f.importer.confirm(preview.token)).rejects.toThrow(
            /sqlite failure/
        )
        expect(f.db.getAppState(localInventoryKey(first.comicId))).toEqual(
            previous
        )
        expect(
            f.db.listDownloadedPictures(previous.chapters[0].id)
        ).toHaveLength(1)
        expect(
            fs.readdirSync(path.dirname(previous.pages[0].localPath))
        ).toHaveLength(1)
        expect(fs.readdirSync(f.original)).toHaveLength(2)
    })

    it('imports CBZ without trusting archive paths; refuses non-raster, links and size/CRC lies', async () => {
        const f = fixture(),
            archive = path.join(f.root, 'comic.cbz')
        const write = (
            name: string,
            data = png,
            change?: (zip: AdmZip) => void
        ) => {
            const zip = new AdmZip()
            zip.addFile(name, data)
            change?.(zip)
            fs.writeFileSync(archive, zip.toBuffer())
        }
        write('chapter/1.png')
        const good = await f.importer.preview(archive, 'cbz')
        await f.importer.confirm(good.token)
        expect(f.db.getComic(good.comicId)?.providerMetadata?.localFormat).toBe(
            'cbz'
        )
        write('a.svg', Buffer.from('<svg/>'))
        await expect(f.importer.preview(archive, 'cbz')).rejects.toThrow(
            /No supported/
        )
        write('1.png', Buffer.from('<html/>'))
        await expect(f.importer.preview(archive, 'cbz')).rejects.toThrow(
            /raster/
        )
        write('aa/evil.png')
        const traversal = fs.readFileSync(archive)
        for (
            let at = 0;
            (at = traversal.indexOf('aa/evil.png', at)) >= 0;
            at += 11
        )
            traversal.write('../evil.png', at)
        fs.writeFileSync(archive, traversal)
        await expect(f.importer.preview(archive, 'cbz')).rejects.toThrow(
            /Unsafe/
        )
        write('1.png', png, (zip) => {
            zip.getEntries()[0].attr = 0xa1ff0000
        })
        await expect(f.importer.preview(archive, 'cbz')).rejects.toThrow(
            /linked/
        )
        write('1.png', Buffer.concat([png, Buffer.alloc(21 * 1024 * 1024)]))
        const bomb = fs.readFileSync(archive),
            central = bomb.indexOf(Buffer.from([0x50, 0x4b, 1, 2]))
        bomb.writeUInt32LE(68, central + 24)
        fs.writeFileSync(archive, bomb)
        await expect(f.importer.preview(archive, 'cbz')).rejects.toThrow()
        expect(f.db.listComics({ limit: 100 })).toHaveLength(1)
    })

    it('rejects ambiguous case-folded paths, expires/cancels previews and preserves local tag namespace', async () => {
        const f = fixture(),
            archive = path.join(f.root, 'comic.cbz'),
            zip = new AdmZip()
        zip.addFile('1.png', png)
        zip.addFile('1.PNG', png)
        zip.writeZip(archive)
        await expect(f.importer.preview(archive, 'cbz')).rejects.toThrow(
            /Duplicate/
        )
        f.page('1.png')
        const preview = await f.importer.preview(f.original, 'folder')
        f.importer.cancel(preview.token)
        await expect(f.importer.confirm(preview.token)).rejects.toThrow(
            /expired/
        )
        const expires = await f.importer.preview(f.original, 'folder')
        vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60 * 1000)
        await expect(f.importer.confirm(expires.token)).rejects.toThrow(
            /expired/
        )
        expect(
            normalizeTagPolicyV1({
                schemaVersion: 1,
                mode: 'SELECTED',
                selected: ['local|line'],
                disabled: [],
                privateTags: []
            }).selected
        ).toEqual(['local|line'])
    })
})
