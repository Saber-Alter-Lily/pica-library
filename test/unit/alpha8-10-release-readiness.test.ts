import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Alpha8.10 release readiness', () => {
    it('stages the next desktop and Android release trains', () => {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        const gradle = fs.readFileSync('mobile/android-alpha2/app/build.gradle', 'utf8')
        const windows = fs.readFileSync('scripts/build-windows-package.ps1', 'utf8')
        expect(pkg.version).toBe('0.3.10')
        expect(gradle).toContain('versionCode 37')
        expect(gradle).toContain("versionName '0.1.0-alpha8.10-release-readiness'")
        expect(windows).toContain("$version -eq '0.3.10'")
        expect(windows).toContain('Pica-Library-v0.3.9-windows-x64.zip')
    })

    it('removes teaser microcopy and redundant release helper copy', () => {
        const product = fs.readFileSync('web/alpha8-product.js', 'utf8')
        const hub = fs.readFileSync('web/alpha8-7-desktop-hub.js', 'utf8')
        const star = fs.readFileSync('web/alpha8-star-access.js', 'utf8')
        const home = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java', 'utf8')
        const appearance = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/AppearanceActivity.java', 'utf8')
        const themes = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ThemePackActivity.java', 'utf8')

        for (const source of [product, home]) expect(source).not.toContain('GitHub 收藏项目有小惊喜')
        expect(product).not.toContain('基础明暗模式永久免费')
        expect(product).not.toContain('<p class="eyebrow">支持者功能</p>')
        expect(star).not.toContain('<p class="eyebrow">GitHub Account</p>')
        expect(hub).not.toContain('账号、连接、外观、存储、维护和软件更新统一在这里管理。')
        expect(appearance).not.toContain('不会再通过公开用户名直接验证')
        expect(themes).not.toContain('不再通过公开用户名判断 Star')
        expect(home).toContain('感谢你使用 Pica Library。')
    })

    it('requires authenticated GitHub account proof before Desktop themes unlock', () => {
        const product = fs.readFileSync('web/alpha8-product.js', 'utf8')
        const star = fs.readFileSync('web/alpha8-star-access.js', 'utf8')
        const service = fs.readFileSync('src/services/personalization-service.ts', 'utf8')
        const main = fs.readFileSync('src/desktop/main.ts', 'utf8')

        expect(product).toContain("p.starUnlocked === true && Number(p.starUserId || 0) > 0 && p.starAuthMethod === 'github-account-device-flow'")
        expect(star).toContain("p?.starUnlocked===true&&Number(p?.starUserId||0)>0&&p?.starAuthMethod==='github-account-device-flow'")
        expect(star).not.toContain('p.starUnlocked||p.supporter')
        expect(service).toContain('return Boolean(this.starProof())')
        expect(service).toContain('const proof = this.starProof()')
        expect(main).not.toContain('personalization.installBundledTesterGrant()')
    })

    it('keeps Android theme storage and activation locked behind authenticated proof', () => {
        const access = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/StarAccessStore.java', 'utf8')
        const store = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ThemePackStore.java', 'utf8')
        const activity = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ThemePackActivity.java', 'utf8')
        const sync = fs.readFileSync('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ThemePackSync.java', 'utf8')

        expect(access).toContain('OfficialBuildGate.isOfficial(c)&&userId(c)>0&&!user(c).isEmpty()&&AUTH_METHOD.equals(authMethod(c))')
        expect(store).toContain('if(!StarAccessStore.enabled(c))throw new SecurityException("个性化装扮尚未解锁")')
        expect(store).toContain('static boolean applyToUi(Context c,boolean dark){if(!StarAccessStore.enabled(c))return false;')
        expect(activity).toContain('if(!StarAccessStore.enabled(this))')
        expect(activity).toContain('if(!StarAccessStore.enabled(this)){Toast.makeText(this,"请先完成 GitHub 验证"')
        expect(sync).toContain('if(!StarAccessStore.enabled(c))throw new SecurityException')
    })

    it('does not serve Desktop theme packs to paired mobile clients before Star authentication', () => {
        const bridge = fs.readFileSync('src/mobile/bridge-server.ts', 'utf8')
        const marker = "GitHub Star authentication required"
        expect(bridge.split(marker).length - 1).toBeGreaterThanOrEqual(2)
        expect(bridge).toMatch(/\/mobile\/v1\/themes'[\s\S]*?personalization\.starProof\(\)/)
        expect(bridge).toMatch(/themeRoute[\s\S]*?personalization\.starProof\(\)/)
    })
})
