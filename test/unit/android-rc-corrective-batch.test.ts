import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => fs.readFileSync(path, 'utf8')

describe('Android RC corrective batch', () => {
    it('uses bounded Pica favorite reconciliation before full pagination', () => {
        const quick = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaFavoriteQuickSync.java'
        )
        const engine = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationEngine.java'
        )
        expect(engine).toContain('PicaFavoriteQuickSync.sync')
        expect(engine).not.toContain('client.favoritesAll(')
        expect(quick).toContain('MAX_QUICK_PAGES=3')
        expect(quick).toContain('first.total==priorIds.size()')
        expect(quick).toContain('prefixMatches')
        expect(quick).toContain('first.total>priorIds.size()')
        expect(quick).toContain('FULL_AUDIT_MS')
        expect(quick).toContain('正在完整读取 Pica 收藏')
    })

    it('keeps ordinary preference edits local instead of rebuilding the whole profile', () => {
        const controls = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationControlActivity.java'
        )
        const slider = controls.slice(
            controls.indexOf('private void renderSignal'),
            controls.indexOf('private JSONObject findControl')
        )
        expect(slider).toContain('refreshPolicySnapshotOnly()')
        expect(slider).not.toContain('loadAsync()')
        expect(controls).toContain('facetScrollY')
        expect(controls).toContain('setOnScrollChangeListener')
        expect(controls).toContain('scroll.post(()->scroll.scrollTo(0,restoreY))')
    })

    it('shows explicit library/work-identity loading feedback and detail page count', () => {
        const home = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java'
        )
        const detail = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UnifiedComicDetailActivity.java'
        )
        expect(home).toContain('正在检查书库变化')
        expect(home).toContain('正在检查电脑端书库')
        expect(home).toContain('正在检查远程书库')
        expect(detail).toContain('同一作品 · 检测中…')
        expect(detail).toContain('entry.knownPictures+" 页"')
    })
})
