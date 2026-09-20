import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => fs.readFileSync(path, 'utf8')

describe('Recommendation V4 mobile settings surface', () => {
    it('exposes a visible recommendation and visual-style settings entry', () => {
        const settings = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/SettingsActivity.java')
        const activity = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationStyleActivity.java')
        expect(settings).toContain('推荐与画风')
        expect(settings).toContain('RecommendationStyleActivity.class')
        expect(activity).toContain('DINOv2、全库向量和作者画风原型继续在 Windows 端批量处理')
        expect(activity).toContain('PortableRecommendationPackageStore')
        expect(activity).toContain('RecommendationProfileActivity.class')
        expect(activity).toContain('RecommendationSyncActivity.class')
        expect(activity).toContain('BridgeClient.visualStatus')
        expect(activity).toContain('BridgeClient.updateVisualSettings')
    })

    it('keeps Visual independently switchable with device-local strength and fast mobile batch paging', () => {
        const activity = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationStyleActivity.java')
        const policy = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/MobileVisualPolicyStore.java')
        const engine = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationEngine.java')
        const main = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/MainActivity.java')
        const web = read('web/index.html')
        const app = read('web/app.js')
        expect(policy).toContain('STANDARD="STANDARD"')
        expect(policy).toContain('关闭 · 不影响常规推荐')
        expect(activity).toContain('chooseMobileVisualStrength()')
        expect(activity).toContain('Desktop 画风影响强度')
        expect(engine).toContain('MobileVisualPolicyStore.strength(app)')
        expect(web).toContain('启用画风推荐模块（关闭时不影响常规推荐）')
        expect(web).toContain('id="visual-strength"')
        expect(app).toContain("strength: $('#visual-strength').value")
        expect(main).toContain('switchNativeRecommendationBatch(1)')
        expect(main).toContain('renderNativeRecommendationBatch')
        expect(main).not.toContain('NativeRecommendationStore.nextBatch(this);showTab()')
    })

    it('keeps E-H with Pica in General instead of a separate desktop account section', () => {
        const hub = read('web/alpha8-7-desktop-hub.js')
        expect(hub).not.toContain("['accounts', 'accounts']")
        expect(hub).toContain("panels.get('general').appendChild(ehAccount)")
        expect(hub).toContain("['recommendations', 'recommendations']")
    })
})
