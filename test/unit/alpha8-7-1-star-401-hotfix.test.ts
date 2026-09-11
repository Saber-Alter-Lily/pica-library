import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Alpha8.7.1 migration boundary', () => {
    it('retires public username Star inference in Alpha8.8', () => {
        const desktop = fs.readFileSync('src/services/personalization-service.ts', 'utf8')
        const web = fs.readFileSync('web/alpha8-star-access.js', 'utf8')
        const androidStore = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/StarAccessStore.java',
            'utf8'
        )
        expect(desktop).toContain('公开用户名 Star 验证已停用')
        expect(web).not.toContain('GitHub 用户名<input')
        expect(web).not.toContain("personalizationAction:'verify-star'")
        expect(androidStore).not.toContain('/users/')
        expect(androidStore).not.toContain('/stargazers')
    })

    it('keeps proxy fallback from sending authenticated GitHub requests through direct retry', () => {
        const source = fs.readFileSync('src/update/application-fetch.ts', 'utf8')
        expect(source).toContain('publicGitHubRead')
        expect(source).toContain("!headers.has('authorization')")
        expect(source).toContain("!headers.has('cookie')")
        expect(source).toContain('return await nativeFetch(input, init)')
    })

    it('uses authenticated current-user Star endpoint on both clients', () => {
        const desktop = fs.readFileSync('src/services/github-account-auth.ts', 'utf8')
        const android = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/GitHubAccountAuth.java',
            'utf8'
        )
        expect(desktop).toContain('/user/starred/Saber-Alter-Lily/pica-library')
        expect(desktop).toContain("authorization: `Bearer ${token}`")
        expect(android).toContain('https://api.github.com/user/starred/'+ '"+REPOSITORY')
        expect(android).toContain('setRequestProperty("Authorization","Bearer "+token)')
    })
})
