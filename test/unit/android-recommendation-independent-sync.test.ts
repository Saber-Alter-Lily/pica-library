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
        expect(sync).toContain('两端推荐周期保持独立')
        expect(sync).toContain('maybeOfferOnConnection')
        expect(sync).toContain('lastPromptSignature')
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
        expect(engine).toContain(
            'PortableRecommendationPackageStore.visualAdjustment'
        )
        expect(engine).toContain('PORTABLE_RESERVOIR')
        expect(engine).toContain('portable.workId')
        expect(portable).toContain('identityByComic')
        expect(portable).toContain('visualAffinity')
        expect(portable).not.toContain('float[] vector')
        expect(portable).not.toContain('double[] vector')
        expect(hub).toContain(
            'DINOv2、全库向量和作者画风原型继续在 Windows 端批量处理'
        )
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

    it('registers the new mobile recommendation surfaces and prompts after pairing', () => {
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
        expect(pairing).not.toContain(
            'BridgeClient.syncRecommendationState(this,false)'
        )
    })
})
