import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    defaultPortablePolicyStateV5,
    normalizeControlV5,
    normalizeLevelDeltaV5
} from '../../src/recommendation-v5/portable-policy'
import { explicitRetrievalIntentsV5 } from '../../src/recommendation-v5/explicit-intents'
import { releasedUpdateBaseline } from '../../src/update/released-baselines'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('v0.4.2 product contracts', () => {
    it('exposes voluntary AFDIAN support in both client settings', () => {
        const web = read('web/alpha8-product.js')
        const settings = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/SettingsActivity.java'
        )
        const support = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/SupportActivity.java'
        )
        expect(web).toContain('https://afdian.com/a/PicaLibrary')
        expect(web).toContain('赞助不会解锁额外功能、内容或权限')
        expect(settings).toContain('"支持项目"')
        expect(settings).toContain('SupportActivity.class')
        expect(support).toContain('https://afdian.com/a/PicaLibrary')
        expect(support).toContain('赞助完全自愿')
        expect(support).toContain('不会解锁额外功能')
    })

    it('uses a real 0-10 manual preference contract with neutral 5', () => {
        const web = read('web/recommendation-v5.js')
        const android = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationControlActivity.java'
        )
        const store = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationPolicyStore.java'
        )
        expect(web).toContain('完整画像与微调 · 0–10 档')
        expect(web).toContain('min="0" max="10"')
        expect(web).toContain('0 = 强烈减少，5 = 中性，10 = 非常喜欢')
        expect(android).toContain('slider.setMax(10)')
        expect(android).toContain('5 是中性起点')
        expect(android).toContain('0 是最强软减少')
        expect(store).toContain('Math.max(-10,Math.min(10')
        expect(normalizeLevelDeltaV5(-99)).toBe(-10)
        expect(normalizeLevelDeltaV5(99)).toBe(10)
    })

    it('lets users create initial tag preferences without collection inference', () => {
        const web = read('web/recommendation-v5.js')
        const android = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationControlActivity.java'
        )
        expect(web).toContain('还没有收藏画像也可以先配置推荐')
        expect(web).toContain('作为标签添加')
        expect(android).toContain('还没有收藏画像也可以先配置推荐')
        expect(android).toContain('作为标签添加')
        expect(android).not.toContain(
            'if(inferred.length()==0){\n            content.addView'
        )
    })

    it('turns positive initial controls into provider recall seeds', () => {
        const state = defaultPortablePolicyStateV5()
        state.controls = [
            normalizeControlV5({
                targetType: 'TAG',
                key: 'example',
                label: 'Example',
                direction: 'MORE',
                scope: 'PERSISTENT',
                source: 'DESKTOP',
                updatedAt: new Date(0).toISOString(),
                levelDelta: 1
            })
        ]
        const intents = explicitRetrievalIntentsV5(state)
        expect(intents).toHaveLength(1)
        expect(intents[0].intentId).toContain('V5_EXPLICIT:TAG:example')

        const androidEngine = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationEngine.java'
        )
        expect(androidEngine).toContain('buildExplicitIntents(policyState)')
        expect(androidEngine).toContain('V5_EXPLICIT:')
        expect(androidEngine).not.toContain(
            'if(favorites.isEmpty())throw new IllegalStateException'
        )
        expect(androidEngine).toContain('设置为 6–10')
    })

    it('keeps software update actions in separate non-overlapping layout regions', () => {
        const polish = read('web/ui-polish-v5.js')
        const css = read('web/ui-polish-v5.css')
        expect(polish).toContain("panel.classList.add('ux-update-panel')")
        expect(polish).toContain("localActions.className = 'actions ux-local-update-actions'")
        expect(polish).toContain("actions?.classList.add('ux-update-primary-actions')")
        expect(css).toContain('#settings-update.ux-update-panel')
        expect(css).toContain('grid-template-columns: minmax(0, 1fr)')
        expect(css).toContain('#settings-update .ux-update-primary-actions')
        expect(css).toContain('#settings-update .ux-local-update-actions')
        expect(css).toContain('#settings-update #a83-update-live')
    })
    it('pins one coordinated v0.4.2 / Android 44 release and v0.4.1 incremental baseline', () => {
        const pkg = JSON.parse(read('package.json'))
        const gradle = read('mobile/android-alpha2/app/build.gradle')
        const windows = read('scripts/build-windows-package.ps1')
        expect(pkg.version).toBe('0.4.2')
        expect(gradle).toContain("PICA_ANDROID_VERSION_CODE') ?: '44'")
        expect(gradle).toContain("PICA_ANDROID_VERSION_NAME') ?: '0.4.2'")
        expect(releasedUpdateBaseline('0.4.1')).toMatchObject({
            appApiVersion: 2,
            advertisedDatabaseSchemaVersion: 13,
            actualMigrationVersion: 13
        })
        expect(windows).toContain("$version -eq '0.4.2'")
        expect(windows).toContain('Pica-Library-v0.4.1-windows-x64.zip')
        expect(windows).toContain(
            '88d87a8f0e5a8413656751ff344052eccbfa796e663e4acc8c7fe4a0e0866b3d'
        )
    })

})
