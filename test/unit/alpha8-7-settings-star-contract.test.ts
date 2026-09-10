import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonalizationService } from '../../src/services/personalization-service'

const roots: string[] = []
const originalFetch = globalThis.fetch

function root() {
    const value = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-alpha87-'))
    roots.push(value)
    return value
}

function response(status: number, value: unknown) {
    return new Response(JSON.stringify(value), {
        status,
        headers: { 'content-type': 'application/json' }
    })
}

afterEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = originalFetch
    for (const value of roots.splice(0))
        fs.rmSync(value, { recursive: true, force: true })
})

describe('Alpha8.7 desktop/mobile convergence', () => {
    it('verifies a public stargazer from the repository list and persists the proof', async () => {
        const calls: string[] = []
        globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
            const url = String(input)
            calls.push(url)
            return response(200, [
                { login: 'someone-else' },
                { login: 'Saber-Alter-Lily' }
            ])
        }) as typeof fetch

        const service = new PersonalizationService(root())
        await expect(
            service.verifyGitHubStar('saber-alter-lily')
        ).resolves.toMatchObject({
            starUnlocked: true,
            starUser: 'saber-alter-lily'
        })
        expect(calls).toEqual([
            'https://api.github.com/repos/Saber-Alter-Lily/pica-library/stargazers?per_page=100&page=1'
        ])
        expect(service.starProof()).toMatchObject({
            unlocked: true,
            githubUser: 'saber-alter-lily'
        })
    })

    it('paginates public stargazers before deciding that a user is absent', async () => {
        const first = Array.from({ length: 100 }, (_, index) => ({
            login: `reader-${index}`
        }))
        globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
            const url = String(input)
            if (url.endsWith('page=1')) return response(200, first)
            return response(200, [{ login: 'Target-Reader' }])
        }) as typeof fetch

        const service = new PersonalizationService(root())
        await expect(
            service.verifyGitHubStar('target-reader')
        ).resolves.toMatchObject({ starUnlocked: true })
        expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    })

    it('uses the same stargazer contract on Android and removes the invalid exact-user endpoint', () => {
        const desktop = fs.readFileSync(
            'src/services/personalization-service.ts',
            'utf8'
        )
        const android = fs.readFileSync(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/StarAccessStore.java',
            'utf8'
        )
        for (const source of [desktop, android]) {
            expect(source).toContain('/stargazers?per_page=100&page=')
            expect(source).not.toMatch(/users\/.+starred\/Saber-Alter-Lily\/pica-library/)
        }
        expect(android).toContain('equalsIgnoreCase')
    })

    it('collapses only completed/cancelled download history while retaining failed jobs', () => {
        const hub = fs.readFileSync('web/alpha8-7-desktop-hub.js', 'utf8')
        expect(hub).toContain("status === 'COMPLETED' || status === 'CANCELLED'")
        expect(hub).toContain("pica-show-finished-downloads")
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
        expect(hub).toContain("maintenanceNav.textContent = text().nav")
        expect(hub).toContain("panels.get('software').appendChild(software)")
    })

    it('keeps personalization full-width instead of the squeezed layout reported in acceptance testing', () => {
        const hub = fs.readFileSync('web/alpha8-7-desktop-hub.js', 'utf8')
        expect(hub).toContain('#a87-appearance-panel #a83-personalization')
        expect(hub).toContain('grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr)')
        expect(hub).toContain('.a86-star-actions{display:grid!important;grid-template-columns:1fr!important')
        expect(hub).toContain('.a86-star-field input{width:100%!important')
    })
})
