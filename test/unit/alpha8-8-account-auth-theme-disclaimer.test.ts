import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PersonalizationService } from '../../src/services/personalization-service'

const roots: string[] = []
afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('Alpha8.8 account auth, theme decoupling and disclaimer', () => {
    it('binds a Star proof to authenticated GitHub account id and never upgrades legacy proof implicitly', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-alpha88-proof-'))
        roots.push(root)
        fs.writeFileSync(
            path.join(root, 'github-star-proof-v1.json'),
            JSON.stringify({ githubUser: 'Saber-Alter-Lily', verifiedAt: new Date().toISOString() })
        )
        const service = new PersonalizationService(root)
        expect(service.starProof()).toBeNull()
        service.installAuthenticatedStarProof({ githubUser: 'Saber-Alter-Lily', githubUserId: 197705186 })
        expect(service.status()).toMatchObject({
            starUnlocked: true,
            starUser: 'Saber-Alter-Lily',
            starUserId: 197705186,
            starAuthMethod: 'github-account-device-flow'
        })
    })

    it('keeps OAuth access tokens transient and verifies the authenticated current user', () => {
        const desktop = fs.readFileSync('src/services/github-account-auth.ts', 'utf8')
        const android = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/GitHubAccountAuth.java',
            'utf8'
        )
        expect(desktop).toContain('https://api.github.com/user')
        expect(desktop).toContain('https://api.github.com/user/starred/Saber-Alter-Lily/pica-library')
        expect(desktop).toContain("if (starResponse.status !== 204)")
        expect(desktop).not.toMatch(/writeFileSync\([^\n]*access_token/i)
        expect(android).toContain('https://api.github.com/user')
        expect(android).toContain('https://api.github.com/user/starred/'+ '"+REPOSITORY')
        expect(android).not.toContain('getSharedPreferences("github-token')
    })

    it('uses the same public GitHub App client id slot on Desktop and Android and blocks auth until configured', () => {
        const desktop = fs.readFileSync('src/services/github-account-auth.ts', 'utf8')
        const android = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/GitHubAccountAuth.java',
            'utf8'
        )
        const desktopId = desktop.match(/GITHUB_APP_CLIENT_ID\s*=\s*'([^']*)'/)?.[1]
        const androidId = android.match(/CLIENT_ID="([^"]*)"/)?.[1]
        expect(desktopId).toBeDefined()
        expect(androidId).toBeDefined()
        expect(desktopId).toBe(androidId)
        expect(desktop).toContain('GitHub 账号认证尚未配置')
        expect(android).toContain('GitHub 账号认证尚未配置')
    })

    it('syncs theme packs but never imports Desktop activeThemeId into Android active state', () => {
        const sync = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ThemePackSync.java',
            'utf8'
        )
        expect(sync).toContain('String activeBefore=ThemePackStore.activeId(c)')
        expect(sync).toContain('Deliberately ignore Desktop activeThemeId')
        expect(sync).not.toContain('root.optString("activeThemeId"')
        expect(sync).not.toContain('ThemePackStore.deactivate(c);else')
    })

    it('labels theme selection as device-local in the Android UI', () => {
        const source = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ThemePackActivity.java',
            'utf8'
        )
        expect(source).toContain('Desktop 和 Android 各自保存当前启用主题')
        expect(source).toContain('仅在本机使用此装扮')
        expect(source).toContain('当前手机主题保持不变')
        expect(source).not.toContain('EditText username')
    })

    it('replaces the Desktop username form with GitHub account authorization actions', () => {
        const web = fs.readFileSync('web/alpha8-star-access.js', 'utf8')
        const main = fs.readFileSync('src/desktop/main.ts', 'utf8')
        expect(web).toContain("personalizationAction:'github-auth-start'")
        expect(web).toContain("personalizationAction:'github-auth-poll'")
        expect(web).toContain("import './alpha8-disclaimer.js'")
        expect(web).not.toContain('a86-github-user')
        expect(main).toContain("personalizationAction === 'github-auth-start'")
        expect(main).toContain("personalizationAction === 'github-auth-poll'")
        expect(main).toContain('installAuthenticatedStarProof(githubAuth.identity)')
    })

    it('gates both Desktop/Web and Android startup with a versioned disclaimer', () => {
        const web = fs.readFileSync('web/alpha8-disclaimer.js', 'utf8')
        const disclaimer = fs.readFileSync('DISCLAIMER.md', 'utf8')
        const manifest = fs.readFileSync('mobile/android-alpha2/app/src/main/AndroidManifest.xml', 'utf8')
        const android = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/DisclaimerActivity.java',
            'utf8'
        )
        expect(web).toContain("DISCLAIMER_VERSION = '1'")
        expect(web).toContain('我已阅读并理解上述提示')
        expect(disclaimer).toContain('禁止未经授权的再分发')
        expect(disclaimer).toContain('非官方关系')
        expect(manifest).toContain('<activity android:name=".DisclaimerActivity" android:exported="true">')
        expect(manifest).not.toMatch(/HomeActivity[\s\S]{0,160}android.intent.action.MAIN/)
        expect(android).toContain('VERSION="1"')
        expect(android).toContain('同意并继续')
    })

    it('keeps the Alpha8.8 disclaimer packaging baseline in later release trains', () => {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string }
        const gradle = fs.readFileSync('mobile/android-alpha2/app/build.gradle', 'utf8')
        const windows = fs.readFileSync('scripts/build-windows-package.ps1', 'utf8')
        const desktopPatch = Number(pkg.version.split('.')[2] ?? 0)
        const androidVersionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1] ?? 0)
        expect(pkg.version.startsWith('0.3.')).toBe(true)
        expect(desktopPatch).toBeGreaterThanOrEqual(8)
        expect(androidVersionCode).toBeGreaterThanOrEqual(35)
        expect(gradle).toContain("versionName '0.1.0-alpha8.")
        expect(windows).toContain("'DISCLAIMER.md'")
        expect(windows).toContain("$version -eq '0.3.8'")
    })
})
