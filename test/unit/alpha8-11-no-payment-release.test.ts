import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => fs.readFileSync(path, 'utf8')

describe('Alpha8.11 no-payment release baseline', () => {
    it('removes every bundled payment QR destination and renderer', () => {
        expect(fs.existsSync('web/support-wechat.svg')).toBe(false)
        expect(fs.existsSync('web/support-alipay.svg')).toBe(false)
        expect(
            fs.existsSync(
                'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/SupportQr.java'
            )
        ).toBe(false)

        const desktop = read('web/alpha8-product.js')
        const android = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java'
        )
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

    it('keeps support non-monetary and points only to the GitHub project', () => {
        const desktop = read('web/alpha8-product.js')
        const android = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java'
        )
        for (const source of [desktop, android]) {
            expect(source).toContain('支持项目')
            expect(source).toContain('GitHub 项目主页')
            expect(source).not.toMatch(/赞助|捐赠|充电|收款|付款|打赏/)
        }
    })

    it('does not market GitHub Star as the personalization selling point in release docs', () => {
        const docs = [
            'README.md',
            'README.en.md',
            'docs/desktop-guide.zh-CN.md',
            'docs/android-guide.zh-CN.md'
        ].map(read).join('\n')
        expect(docs).not.toContain('个性化装扮与 GitHub Star')
        expect(docs).not.toContain('个性化主题属于 GitHub Star 解锁功能')
        expect(docs).not.toContain('Personalization:\nThe official-build personalization gate is a GitHub Star')
    })

    it('stages Desktop v0.3.11 and Android v38', () => {
        const pkg = JSON.parse(read('package.json')) as { version: string }
        const gradle = read('mobile/android-alpha2/app/build.gradle')
        expect(pkg.version).toBe('0.3.11')
        expect(gradle).toContain('versionCode 38')
        expect(gradle).toContain("versionName '0.1.0-alpha8.11-no-payment'")
    })
})
