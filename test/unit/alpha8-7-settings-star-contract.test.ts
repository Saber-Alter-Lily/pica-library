import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PersonalizationService } from '../../src/services/personalization-service'

const roots: string[] = []

function root() {
    const value = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-alpha88-'))
    roots.push(value)
    return value
}

afterEach(() => {
    for (const value of roots.splice(0))
        fs.rmSync(value, { recursive: true, force: true })
})

describe('Alpha8.7/8.8 desktop/mobile convergence', () => {
    it('persists only account-authenticated GitHub Star proof with immutable user id', () => {
        const service = new PersonalizationService(root())
        expect(
            service.installAuthenticatedStarProof({
                githubUser: 'Saber-Alter-Lily',
                githubUserId: 197705186
            })
        ).toMatchObject({
            starUnlocked: true,
            starUser: 'Saber-Alter-Lily',
            starUserId: 197705186,
            starAuthMethod: 'github-account-device-flow'
        })
        expect(service.starProof()).toMatchObject({
            schema: 2,
            unlocked: true,
            githubUser: 'Saber-Alter-Lily',
            githubUserId: 197705186,
            authMethod: 'github-account-device-flow'
        })
    })

    it('does not accept legacy username-only proof as authentication', async () => {
        const directory = root()
        const service = new PersonalizationService(directory)
        fs.writeFileSync(
            path.join(directory, 'github-star-proof-v1.json'),
            JSON.stringify({
                unlocked: true,
                githubUser: 'Saber-Alter-Lily',
                verifiedAt: new Date().toISOString()
            })
        )
        expect(service.starProof()).toBeNull()
        await expect(service.verifyGitHubStar()).rejects.toThrow(
            /公开用户名 Star 验证已停用/
        )
    })

    it('removes public username Star lookup from the active Desktop and Android gates', () => {
        const desktop = fs.readFileSync(
            'src/services/personalization-service.ts',
            'utf8'
        )
        const android = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/StarAccessStore.java',
            'utf8'
        )
        expect(desktop).not.toContain('/stargazers?per_page=100&page=')
        expect(desktop).not.toContain('/users/${encodeURIComponent(githubUser)}/starred')
        expect(android).not.toContain('checkRepositoryStargazers')
        expect(android).not.toContain('checkUserStars')
        expect(android).toContain('github_user_id')
        expect(android).toContain('github-account-device-flow')
    })

    it('collapses only completed/cancelled download history while retaining failed jobs', () => {
        const hub = fs.readFileSync('web/alpha8-7-desktop-hub.js', 'utf8')
        expect(hub).toContain("status === 'COMPLETED' || status === 'CANCELLED'")
        expect(hub).toContain('pica-show-finished-downloads')
        expect(hub).toContain("url.pathname !== '/api/v1/downloads'")
        expect(hub).not.toContain("status === 'FAILED' || status === 'COMPLETED'")
    })

    it('replaces the duplicate Maintenance/Settings top-level model with one six-section hub', () => {
        const hub = fs.readFileSync('web/alpha8-7-desktop-hub.js', 'utf8')
        for (const section of [
            '基本设置',
            '连接与同步',
            '外观与个性化',
            '下载与存储',
            '维护工具',
            '软件更新'
        ])
            expect(hub).toContain(section)
        expect(hub).toContain('#settings-nav{display:none!important}')
        expect(hub).toContain('maintenanceNav.textContent = text().nav')
        expect(hub).toContain("panels.get('software').appendChild(software)")
    })

    it('keeps personalization full-width instead of the squeezed layout reported in acceptance testing', () => {
        const hub = fs.readFileSync('web/alpha8-7-desktop-hub.js', 'utf8')
        expect(hub).toContain('#a87-appearance-panel #a83-personalization')
        expect(hub).toContain('grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr)')
        expect(hub).toContain('.a86-star-actions{display:grid!important;grid-template-columns:1fr!important')
    })
})
