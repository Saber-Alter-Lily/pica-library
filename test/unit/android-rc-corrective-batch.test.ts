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

    it('keeps favorite collection order distinct from comic update time', () => {
        const catalog = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UnifiedCatalogStore.java'
        )
        const filter = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UnifiedLibraryFilter.java'
        )
        const home = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java'
        )
        expect(catalog).toContain('favoriteRank=-1')
        expect(filter).toContain('FAVORITE_NEWEST')
        expect(filter).toContain('FAVORITE_OLDEST')
        expect(home).toContain('"最近收藏","最早收藏","最近更新"')
    })

    it('bounds author exposure across batches while allowing explicit author session intent', () => {
        const engine = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationEngine.java'
        )
        expect(engine).toContain('cycleAuthorExposure')
        expect(engine).toContain('targetAuthorKey')
        expect(engine).toContain('{{4,2,4,4,2},{5,3,6,5,3}')
        expect(engine).toContain('cycleAuthor.getOrDefault(authorKey,0)>=cycleAuthorCap')
    })

    it('balances positive and negative detail recommendation controls', () => {
        const dialog = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationItemControlDialog.java'
        )
        expect(dialog).toContain('更多推荐此作者')
        expect(dialog).toContain('本次想看此作者')
        expect(dialog).toContain('减少推荐此作者')
        expect(dialog).toContain('屏蔽此作者')
    })

    it('shares long-press contextual selection across Library and Shelves', () => {
        const adapter = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UnifiedComicCollectionAdapter.java'
        )
        const selection = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/CollectionSelectionController.java'
        )
        const shelf = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ShelfStore.java'
        )
        const home = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java'
        )
        expect(adapter).toContain('setOnLongClickListener')
        expect(adapter).toContain('selection.active()')
        expect(selection).not.toContain('ActionMode.Callback')
        expect(selection).not.toContain('import android.view.ActionMode')
        expect(selection).toContain('void selectAll()')
        expect(selection).toContain('void clearSelection()')
        expect(selection).toContain('void addSelectionToShelf()')
        expect(selection).toContain('void removeSelection()')
        expect(selection).toContain('onCollectionSelectionStateChanged')
        expect(shelf).toContain('setMemberships(Context context')
        expect(home).toContain('showSelectionBottomNavigation')
        expect(home).toContain('showNormalBottomNavigation')
        expect(home).toContain('完成 · ')
        expect(home).toContain('"加入书架"')
        expect(home).toContain('"取消收藏"')
        expect(home).toContain('"移出书架"')
        expect(home).toContain('if(collectionSelection!=null&&collectionSelection.active())')
        expect(home).toContain('addSelectedToShelf')
        expect(home).toContain('removeSelectedFromShelf')
        expect(home).toContain('removeSelectedFavorites')
    })

    it('expands onboarding into shelf, recommendation and visual workflows', () => {
        const onboarding = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/AndroidOnboarding.java'
        )
        const store = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/OnboardingStore.java'
        )
        const style = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationStyleActivity.java'
        )
        expect(store).toContain('CURRENT_VERSION=2')
        expect(onboarding).toContain('showLibraryWorkflowTour')
        expect(onboarding).toContain('showRecommendationWorkflowTour')
        expect(onboarding).toContain('startRecommendationStyleTour')
        expect(style).toContain('REC_VISUAL_MODE')
        expect(style).toContain('REC_VISUAL_STRENGTH')
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
