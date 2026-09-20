import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Android independent recommendation runtime and sync UI', () => {
    it('keeps the product recommendation tab local instead of requesting a Desktop runtime batch', () => {
        const home = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java'
        )
        const bridge = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/BridgeClient.java'
        )
        expect(home).toContain('Android 本机')
        expect(home).toContain('手机独立排序')
        expect(home).toContain('NativeRecommendationJobs.refresh')
        expect(home).toContain('PortableRecommendationPackageStore.load')
        expect(home).not.toContain('DESKTOP_SYNCED')
        expect(home).not.toContain(
            'BridgeClient.syncRecommendationState(this,true)'
        )
        expect(bridge).not.toContain('DESKTOP_SYNCED_V5_PORTABLE')
    })

    it('keeps Session Intent local while portable controls and evidence are syncable', () => {
        const store = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationPolicyStore.java'
        )
        const evidence = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationEvidenceStore.java'
        )
        expect(store).toContain('LOCAL_SESSION')
        expect(store).toContain('baseRevision')
        expect(store).toContain('baseControls')
        expect(store).toContain('RecommendationEvidenceStore.dirtyPayload')
        expect(store).not.toContain('body.put("sessionIntent"')
        expect(evidence).toContain('PROCESS_SESSION_ID')
        expect(evidence).toContain('recommend_impression')
        expect(evidence).toContain('recommend_detail_open')
        expect(evidence).toContain('reader_complete')
    })

    it('shows explicit two-way sync summary and three-way conflict choices', () => {
        const sync = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationSyncActivity.java'
        )
        expect(sync).toContain('手机 → 电脑')
        expect(sync).toContain('电脑 → 手机')
        expect(sync).toContain('人工冲突')
        expect(sync).toContain('使用电脑')
        expect(sync).toContain('使用手机')
        expect(sync).toContain('双向同步')
        expect(sync).toContain('电脑和手机各自拥有独立推荐周期')
        expect(sync).toContain('maybeOfferOnConnection')
        expect(sync).toContain('lastPromptSignature')
        expect(sync).toContain('连接时自动检查差异')
        expect(sync).toContain('普通变化弹窗提醒')
        expect(sync).toContain('偏好冲突弹窗提醒')
        expect(sync).toContain('RecommendationSyncPreferences.alertPortableChanges')
        expect(sync).toContain('RecommendationSyncPreferences.alertConflicts')
        expect(sync).toContain('全部用电脑')
        expect(sync).toContain('全部用手机')
        expect(sync).toContain('逐项处理')
        expect(sync).not.toContain('conflictCount>0?"处理冲突":"双向同步"')
    })

    it('exposes mobile profile, grouped 1-10 controls and compact help', () => {
        const profile = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationProfileActivity.java'
        )
        const controls = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationControlActivity.java'
        )
        const hub = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationStyleActivity.java'
        )
        const ui = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/Ui.java'
        )
        expect(profile).toContain('长期主要兴趣')
        expect(profile).toContain('当前手机推荐构成')
        expect(profile).toContain('本次手机 Session')
        expect(profile).toContain('RecommendationLocalProfile.inferred')
        expect(controls).toContain('人物与作品')
        expect(controls).toContain('内容与剧情')
        expect(controls).toContain('外观与画风')
        expect(controls).toContain('行为与偏好')
        expect(controls).toContain('形式与其他')
        expect(controls).toContain('SeekBar')
        expect(controls).toContain('NestedScrollView')
        expect(controls).toContain('expandedFacets')
        expect(controls).toContain('作为标签添加')
        expect(controls).toContain('本次想看')
        expect(hub).toContain('推荐画像')
        expect(hub).toContain('人工调整')
        expect(hub).toContain('推荐同步')
        expect(ui).toContain('static Button infoButton')
        expect(ui).toContain('setText("!")')
        expect(ui).toContain('int size=dp(c,24)')
        expect(ui).toContain('new TouchDelegate(hit,info)')
    })


    it('keeps ordinary sync differences quiet by default while preserving optional conflict alerts', () => {
        const prefs = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationSyncPreferences.java'
        )
        expect(prefs).toContain(
            'getBoolean(ALERT_PORTABLE_CHANGES,false)'
        )
        expect(prefs).toContain('getBoolean(ALERT_CONFLICTS,true)')
        expect(prefs).toContain('getBoolean(CHECK_ON_CONNECTION,true)')
        expect(prefs).toContain(
            '/** Background compare only. It never applies a sync. */'
        )
    })

    it('uses Desktop-equivalent 1-10 levelDelta magnitudes on Android', () => {
        const store = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationPolicyStore.java'
        )
        expect(store).toContain(
            'Math.min(0.27,Math.abs(row.optInt("levelDelta",0))*0.03)'
        )
        expect(store).toContain('double magnitude=controlMagnitude')
    })

    it('aligns item semantics and taste exclusion with Desktop without turning them into dislikes', () => {
        const policy = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationPolicyStore.java'
        )
        const dialog = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationItemControlDialog.java'
        )
        const detail = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/UnifiedComicDetailActivity.java'
        )
        const home = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java'
        )
        expect(policy).toContain('setTasteExcluded')
        expect(policy).toContain('setItemDisposition')
        expect(policy).toContain('tasteExcludedComicIds')
        expect(policy).toContain('itemDispositions')
        expect(dialog).toContain('保留收藏，但不用于推荐口味')
        expect(dialog).toContain('已经看过')
        expect(dialog).toContain('已经拥有')
        expect(dialog).toContain('重复上传')
        expect(dialog).toContain('暂时不想看（30 天）')
        expect(detail).toContain('RecommendationItemControlDialog.show')
        expect(home).toContain('⚙ 调节')
        expect(home).toContain(
            'RecommendationPolicyStore.setItemDisposition(this,item.comicId,"already_seen"'
        )
    })

    it('shows lifetime recent session and current-runtime structure on Android', () => {
        const profile = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationProfileActivity.java'
        )
        const evidence = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationEvidenceStore.java'
        )
        expect(profile).toContain('长期主要兴趣')
        expect(profile).toContain('最近 30 天主要兴趣')
        expect(profile).toContain('本次会话兴趣')
        expect(profile).toContain('当前手机推荐构成')
        expect(profile).toContain('主要依据')
        expect(evidence).toContain('topSignals')
        expect(evidence).toContain('"recommend_impression"')
    })

    it('uses Desktop heavy Visual only as a compact portable signal', () => {
        const engine = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationEngine.java'
        )
        const portable = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PortableRecommendationPackageStore.java'
        )
        const hub = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationStyleActivity.java'
        )
        const mobileVisual = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/MobileVisualPolicyStore.java'
        )
        expect(engine).toContain(
            'portable.visualAdjustment'
        )
        expect(engine).toContain('MobileVisualPolicyStore.live(app)')
        expect(engine).toContain('PORTABLE_RESERVOIR')
        expect(engine).toContain('portable.workId')
        expect(portable).toContain('identityByComic')
        expect(portable).toContain('visualAffinity')
        expect(portable).not.toContain('float[] vector')
        expect(portable).not.toContain('double[] vector')
        expect(hub).toContain(
            'DINOv2、全库向量和作者画风原型继续在 Windows 端批量处理'
        )
        expect(hub).toContain('手机画风接入模式')
        expect(mobileVisual).toContain('SHADOW')
        expect(mobileVisual).toContain('static boolean live')
    })

    it('keeps the baked Android runtime policy baseline stable when Desktop state syncs', () => {
        const store = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationPolicyStore.java'
        )
        const engine = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationEngine.java'
        )
        expect(engine).toContain('RecommendationPolicyStore.markCacheBaseline(app)')
        const acknowledge = store.slice(
            store.indexOf('static void acknowledge(Context c,JSONObject response,String expectedMutationId)')
        )
        expect(acknowledge).not.toContain('saveCacheBaseline(c,value)')
        expect(store).toContain(
            'adjustment(current,item)-adjustment(baseline,item)'
        )
    })

    it('returns phone-discovered recommendation metadata with portable evidence, not ranked answers', () => {
        const store = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationPolicyStore.java'
        )
        const server = read('src/recommendation-v5/policy-store.ts')
        expect(store).toContain('catalogEvidencePayload')
        expect(store).toContain('body.put("catalogEvidence"')
        expect(server).toContain('input.catalogEvidence')
        expect(server).toContain("'android-recommendation-sync'")
        expect(store).not.toContain('current recommendation batch')
    })

    it('imports Desktop feedback and recent evidence without echoing it as a local Session', () => {
        const bridge = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/BridgeClient.java'
        )
        const feedback = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationFeedbackStore.java'
        )
        const evidence = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationEvidenceStore.java'
        )
        const sync = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationSyncActivity.java'
        )
        expect(bridge).toContain('RecommendationFeedbackStore.importSynced')
        expect(bridge).toContain('RecommendationEvidenceStore.importSynced')
        expect(feedback).toContain('p.getBoolean(DIRTY+id,false)')
        expect(evidence).toContain('row.put("sessionId","DESKTOP_SYNC")')
        expect(evidence).toContain('row.put("dirty",false)')
        expect(sync).toContain('behaviorGeneration')
    })

    it('registers mobile recommendation surfaces while keeping post-pairing content sync opt-in', () => {
        const manifest = read(
            'mobile/android-alpha2/app/src/main/AndroidManifest.xml'
        )
        const pairing = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PairingActivity.java'
        )
        expect(manifest).toContain('.RecommendationProfileActivity')
        expect(manifest).toContain('.RecommendationSyncActivity')
        expect(manifest).toContain('.RecommendationControlActivity')
        expect(pairing).toContain(
            'RecommendationSyncActivity.offerAfterPairing(this)'
        )
        expect(pairing).toContain('同步收藏')
        expect(pairing).toContain('同步书架')
        expect(pairing).toContain('推荐同步')
        expect(pairing).toContain('内容同步均为可选')
        expect(pairing).not.toContain('offerFavoriteImport')
        expect(pairing).not.toContain('setCancelable(false)')
        expect(pairing).not.toContain(
            'try{ShelfStore.syncWithDesktop(this);}catch'
        )
        expect(pairing).not.toContain(
            'BridgeClient.syncRecommendationState(this,false)'
        )
    })
})
