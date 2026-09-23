import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('library query completeness P2A', () => {
    it('uses an explicit complete catalog read for library query evaluation', () => {
        const database = read('src/library/database.ts')
        const service = read('src/services/library-query-service.ts')

        expect(database).toContain('listAllComics(query: ComicQuery = {})')
        expect(database).toContain('limit: Number.MAX_SAFE_INTEGER')
        expect(database).toContain('offset: 0')
        expect(service).toContain('.listComicsForLibraryQueryBase(query)')
        expect(service).not.toContain('.listComics({ limit: 5000 })')
        expect(service).toContain('total: evaluated.items.length')
        expect(service).toContain('private evaluate(')
    })

    it('keeps bulk selection independent from page size', () => {
        const service = read('src/services/library-query-service.ts')
        const allIds = service.slice(
            service.indexOf('allIds(input: LibraryFacetQuery)'),
            service.lastIndexOf('}')
        )
        expect(allIds).toContain("this.evaluate({ ...input, offset: 0 })")
        expect(allIds).not.toContain('limit: 5000')
    })

    it('opens a library detail from the current query page instead of the legacy first-5000 cache', () => {
        const app = read('web/app.js')
        expect(app).toContain(
            'state.libraryQueryResult?.items ?? state.records'
        )
    })

    it('does not silently stop Android desktop catalog synchronization at 20k', () => {
        const catalog = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UnifiedCatalogStore.java'
        )
        const start = catalog.indexOf('static Snapshot refreshDesktop(')
        const end = catalog.indexOf(
            'static Snapshot refreshRemote(',
            start
        )
        const method = catalog.slice(start, end)

        expect(method).not.toContain('offset<20000')
        expect(method).toContain('while(offset<total)')
        expect(method).toContain(
            'Desktop catalog sync exceeded safety page limit'
        )
        expect(method).toContain(
            'Desktop catalog sync ended before reported total'
        )
        expect(method).toContain('Desktop catalog sync incomplete')
    })
})
