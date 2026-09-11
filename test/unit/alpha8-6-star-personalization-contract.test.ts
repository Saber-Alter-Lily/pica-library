import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Alpha8.6 Star personalization contracts after Alpha8.8 migration', () => {
    it('keeps the official signing gate and authenticated Star proof store', () => {
        const gate = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/OfficialBuildGate.java',
            'utf8'
        )
        const access = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/StarAccessStore.java',
            'utf8'
        )
        expect(gate).toContain('EXPECTED_SHA256')
        expect(access).toContain('OfficialBuildGate.isOfficial(c)')
        expect(access).toContain('github_user_id')
        expect(access).toContain('github-account-device-flow')
    })

    it('keeps GitHub Star as the theme gate but now requires authenticated account proof', () => {
        const service = fs.readFileSync('src/services/personalization-service.ts', 'utf8')
        const store = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ThemePackStore.java',
            'utf8'
        )
        const sync = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ThemePackSync.java',
            'utf8'
        )
        const appearance = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/AppearanceActivity.java',
            'utf8'
        )
        const activity = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ThemePackActivity.java',
            'utf8'
        )
        expect(service).toContain('installAuthenticatedStarProof')
        expect(service).toContain('github-star-proof-v2.json')
        expect(service).toContain('github-account-device-flow')
        expect(store).toContain('StarAccessStore.enabled(c)')
        expect(sync).toContain('/mobile/v1/star-access')
        expect(appearance).toContain('StarAccessStore.enabled(this)')
        expect(activity).toContain('StarAccessStore.enabled(this)')
        expect(activity).toContain('GitHubAccountAuth.start')
        expect(activity).toContain('从电脑同步已验证账号')
        expect(appearance).not.toContain('SupporterEntitlement.themePacksEnabled')
        expect(activity).not.toContain('SupporterEntitlement.themePacksEnabled')
    })

    it('prevents the double file-picker trigger and header mascot collision', () => {
        const studio = fs.readFileSync('web/alpha8-theme-help.js', 'utf8')
        const product = fs.readFileSync('web/alpha8-product.js', 'utf8')
        expect(studio).not.toContain('refDrop.onclick = () => refInput.click()')
        expect(studio).not.toContain('themeDrop.onclick = () => themeInput.click()')
        expect(product).not.toContain('drop.onclick = () => input.click()')
        expect(studio).not.toContain("$('.app-header').appendChild(image)")
    })

    it('ships the fixed brand icon and full Pica Violet Star theme', () => {
        expect(fs.existsSync('web/pica-library-icon.webp')).toBe(true)
        expect(fs.existsSync('web/pica-violet-default.pica-theme')).toBe(true)
        expect(
            fs.existsSync(
                'mobile/android-alpha2/app/src/main/res/drawable/pica_library_brand.webp'
            )
        ).toBe(true)
    })
})
