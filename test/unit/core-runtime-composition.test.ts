import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryQueryService } from '../../src/services/library-query-service'
import { ShelfService } from '../../src/services/shelf-service'
import { ReaderService } from '../../src/services/reader-service'
import { LocalLibraryIngestion } from '../../src/local-library/ingestion'
import {
    createCoreLibraryPorts, createCoreLocalRuntime
} from '../../src/library/core-runtime-composition'

const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=',
    'base64'
)
const closers: Array<() => void> = []
afterEach(() => {
    for (const fn of closers.splice(0).reverse()) fn()
    vi.restoreAllMocks()
})

describe('CORE-LIB-04c shared real runtime composition', () => {
    it('reuses exactly original SQLite/LibraryQuery/Shelf/Reader/ingestion without any provider', async () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-source-free-composition-'))
        const data = path.join(home, 'data')
        const source = path.join(home, 'my-local-comic')
        fs.mkdirSync(data)
        fs.mkdirSync(source)
        fs.writeFileSync(path.join(source, '01.png'), png)
        const db = new LibraryDatabase(path.join(data, 'library.db'))
        closers.push(() => {
            db.close()
            fs.rmSync(home, { recursive: true, force: true })
        })
        const core = createCoreLocalRuntime({ database: db, dataDir: data })
        expect(core.libraryQueries).toBeInstanceOf(LibraryQueryService)
        expect(core.shelfService).toBeInstanceOf(ShelfService)
        expect(core.readerService).toBeInstanceOf(ReaderService)
        const preview = await core.localImport.previewChosen('folder', async () => source)
        expect('cancelled' in preview).toBe(false)
        if ('cancelled' in preview) throw new Error('Unexpected picker cancellation')
        const imported = await core.localImport.confirm(preview.token)
        expect(db.getComic(imported.comicId)?.providerId).toBe('local')
        const chapters = core.readerService.chapters(imported.comicId)
        expect(chapters).toHaveLength(1)
        const chapter = core.readerService.chapter(
            imported.comicId, chapters[0].id
        )
        expect(chapter.pages).toHaveLength(1)
        const shelf = core.shelfService.create('Local-only originals')
        expect(core.shelfService.add(shelf.id, [imported.comicId]))
            .toMatchObject({ added: 1 })
        expect(core.shelfService.contents(shelf.id))
            .toMatchObject([expect.objectContaining({
                comicId: imported.comicId
            })])
        expect(core.libraryQueries.query({
            scope: 'catalog', providerIds: ['local'], limit: 50
        }).items).toMatchObject([expect.objectContaining({
            comicId: imported.comicId
        })])
        expect(fs.readFileSync(path.join(source, '01.png'))).toEqual(png)
    })

    it('keeps OS file launch absent by default and only via trusted Desktop injection', () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-core-launch-'))
        const db = new LibraryDatabase(path.join(home, 'library.db'))
        closers.push(() => {
            db.close()
            fs.rmSync(home, { recursive: true, force: true })
        })
        const ports = createCoreLibraryPorts(db)
        expect(ports.shelfService).toBeInstanceOf(ShelfService)
        const core = createCoreLocalRuntime({ database: db, dataDir: home })
        const owned = path.join(home, 'local.png')
        fs.writeFileSync(owned, png)
        expect(() => core.readerService.openDefault(owned))
            .toThrow(/not configured/)
        const opener = { openDefault: vi.fn(() => ({ opened: true })) }
        const trusted = createCoreLocalRuntime({
            database: db, dataDir: home, externalFileOpener: opener
        })
        expect(trusted.readerService.openDefault(owned))
            .toEqual({ opened: true })
        expect(opener.openDefault).toHaveBeenCalledWith(owned)
        expect(() => trusted.readerService.openDefault('/not-owned/secret'))
            .toThrow()
    })

    it('the common runtime has no executable source SDK, Host or Desktop reverse import', () => {
        const file = 'src/library/core-runtime-composition.ts'
        const value = fs.readFileSync(file, 'utf8')
        const ast = ts.createSourceFile(file, value,
            ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
        const imports = ast.statements
            .filter(ts.isImportDeclaration)
            .filter(a => !a.importClause?.isTypeOnly)
            .map(a => (a.moduleSpecifier as ts.StringLiteral).text)
        expect(imports).toEqual([
            '../services/library-query-service',
            '../services/shelf-service',
            '../services/reader-service',
            '../local-library/ingestion',
            './core-local-import'
        ])
        expect(value).not.toMatch(/from ['"][^'"]*(?:\/sdk|providers\b|source-hosts|desktop\/|provider-service|library\/service)/)
    })
})
