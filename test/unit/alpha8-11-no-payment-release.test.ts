import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => fs.readFileSync(path, 'utf8')

describe('Alpha8.11 no-embedded-payment release baseline', () => {
    it('removes every bundled payment QR destination and renderer', () => {
        expect(fs.existsSync('web/support-wechat.svg')).toBe(false)
        expect(fs.existsSync('web/support-alipay.svg')).toBe(false)
        expect(fs.existsSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/SupportQr.java')).toBe(false)

        const desktop = read('web/alpha8-product.js')
        const android = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/AboutActivity.java')
        const gradle = read('mobile/android-alpha2/app/build.gradle')
        const combined = desktop + android + gradle

        expect(combined).not.toContain('support-wechat')
        expect(combined).not.toContain('support-alipay')
        expect(combined).not.toContain('SupportQr')
        expect(combined).not.toContain('微信支付')
        expect(combined).not.toContain('支付宝')
        expect(combined).not.toContain('wxp://')
        expect(combined).not.toContain('qr.alipay.com')
        expect(gradle).not.toContain('com.google.zxing')
    })

    it('allows voluntary external sponsorship without bundling payment flows or capability gates', () => {
        const desktop = read('web/alpha8-product.js')
        const support = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/SupportActivity.java')
        const settings = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/SettingsActivity.java')
        expect(desktop).toContain('支持项目')
        expect(desktop).toContain('https://afdian.com/a/PicaLibrary')
        expect(desktop).toContain('赞助不会解锁额外功能、内容或权限')
        expect(settings).toContain('SupportActivity.class')
        expect(support).toContain('https://afdian.com/a/PicaLibrary')
        expect(support).toContain('赞助完全自愿')
        expect(support).toContain('不会解锁额外功能')
        expect(desktop).toContain('GitHub 项目主页')
        expect(support).toContain('GitHub 项目主页')
    })

    it('does not market GitHub Star as the personalization selling point in release docs', () => {
        const docs = ['README.md','README.en.md','docs/desktop-guide.zh-CN.md','docs/android-guide.zh-CN.md'].map(read).join('\n')
        expect(docs).not.toContain('个性化装扮与 GitHub Star')
        expect(docs).not.toContain('个性化主题属于 GitHub Star 解锁功能')
        expect(docs).not.toContain('Personalization:\nThe official-build personalization gate is a GitHub Star')
    })

    it('retains the no-embedded-payment baseline in subsequent versions', () => {
        const pkg = JSON.parse(read('package.json')) as { version: string }
        const gradle = read('mobile/android-alpha2/app/build.gradle')
        const [major, minor, patch] = pkg.version.split('.').map(Number)
        expect(major * 1000000 + minor * 1000 + patch).toBeGreaterThanOrEqual(3011)
        const androidVersionCode = Number(
            gradle.match(/PICA_ANDROID_VERSION_CODE'\)\s*\?:\s*'(\d+)'/)?.[1] || 0
        )
        expect(androidVersionCode).toBeGreaterThanOrEqual(38)
    })
})
