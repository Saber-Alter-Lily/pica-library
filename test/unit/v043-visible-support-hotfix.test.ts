import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('v0.4.3 visible support hotfix', () => {
    it('shows project support from the Android main Settings tab', () => {
        const home = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java')
        const support = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/SupportActivity.java')
        expect(home).toContain('SettingsRow.row(this,"支持项目","爱发电 / GitHub · 支持开源开发"')
        expect(home).toContain('new Intent(this,SupportActivity.class)')
        expect(support).toContain('https://afdian.com/a/PicaLibrary')
    })

    it('keeps Desktop support prominent instead of appending it to the bottom', () => {
        const product = read('web/alpha8-product.js')
        const support = product.slice(
            product.indexOf('function supportPanel()'),
            product.indexOf('async function personalizationPanel()')
        )
        expect(support).toContain("const appearance = $('#a83-appearance')")
        expect(support).toContain("appearance.insertAdjacentElement('afterend', panel)")
        expect(support).not.toContain('settings.appendChild(panel)')
        expect(support).toContain('https://afdian.com/a/PicaLibrary')
    })

    it('shows the actual 0-10 range in the Android recommendation hub', () => {
        const hub = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationStyleActivity.java')
        const control = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationControlActivity.java')
        expect(hub).toContain('"0–10 档 / 屏蔽 / 本次想看"')
        expect(control).toContain('slider.setMax(10)')
        expect(control).toContain('还没有收藏画像也可以先配置推荐')
    })
})
