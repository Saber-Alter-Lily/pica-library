import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('correctness foundation P1', () => {
    it('queries a single comic directly instead of routing through a full catalog list', () => {
        const database = read('src/library/database.ts')
        const start = database.indexOf('getComic(comicId: string)')
        const end = database.indexOf('\n    private recomputeFavoriteState', start)
        const method = database.slice(start, end)
        expect(method).toContain('WHERE c.id = ?')
        expect(method).toContain('.get(id)')
        expect(method).not.toContain('listComics(')
        expect(database).toContain('function storedComicFromRow(row: SqlRow)')
    })

    it('uses the normal Android activity back stack for comic-to-comic navigation', () => {
        const manifest = read(
            'mobile/android-alpha2/app/src/main/AndroidManifest.xml'
        )
        const match = manifest.match(
            /<activity android:name="\.UnifiedComicDetailActivity"[^>]*\/>/
        )
        expect(match?.[0]).toBeTruthy()
        expect(match?.[0]).not.toContain('launchMode="singleTop"')
    })

    it('invalidates stale Web preview responses when the detail comic changes', () => {
        const app = read('web/app.js')
        expect(app).toContain('let recommendationPreviewRequestId = 0')
        expect(app).toContain(
            'const requestId = ++recommendationPreviewRequestId'
        )
        expect(app).toContain(
            'requestId !== recommendationPreviewRequestId'
        )
        expect(app).toContain("dialog.dataset.comicId !== comicId")
    })

    it('writes the Android unified catalog through AtomicFile recovery semantics', () => {
        const catalog = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UnifiedCatalogStore.java'
        )
        expect(catalog).toContain('import android.util.AtomicFile;')
        expect(catalog).toContain('atomic.openRead()')
        expect(catalog).toContain('atomic.startWrite()')
        expect(catalog).toContain('atomic.finishWrite(out)')
        expect(catalog).toContain('atomic.failWrite(out)')
    })
})
