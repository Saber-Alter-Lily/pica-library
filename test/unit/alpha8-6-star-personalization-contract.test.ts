import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Alpha8.6 Star personalization contracts', () => {
    it('keeps the official mobile navigation and compact header actions', () => {
        const home = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java',
            'utf8'
        )
        const ui = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/Ui.java',
            'utf8'
        )
        expect(home).toContain('书库')
        expect(home).toContain('推荐')
        expect(home).toContain('在线')
        expect(home).toContain('连接')
        expect(home).toContain('R.drawable.ic_refresh_24')
        expect(home).toContain('R.drawable.ic_person_24')
        expect(ui).toContain('static ImageButton iconButton')
    })

    it('uses GitHub Star rather than supporter entitlement across the whole mobile theme entry path', () => {
        const service = fs.readFileSync(
            'src/services/personalization-service.ts',
            'utf8'
        )
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
        expect(service).toContain('verifyGitHubStar')
        expect(service).toContain('github-star-proof-v1.json')
        expect(store).toContain('StarAccessStore.enabled(c)')
        expect(sync).toContain('/mobile/v1/star-access')
        expect(appearance).toContain('StarAccessStore.enabled(this)')
        expect(activity).toContain('StarAccessStore.enabled(this)')
        expect(activity).toContain('StarAccessStore.verify(this')
        expect(activity).toContain('从已配对电脑同步解锁与装扮')
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
                'mobile/android-alpha2/app/src/main/res/drawable-nodpi/pica_launcher.webp'
            )
        ).toBe(true)
        expect(
            fs.existsSync(
                'mobile/android-alpha2/app/src/main/assets/pica-violet-default.pica-theme'
            )
        ).toBe(true)
    })
})
