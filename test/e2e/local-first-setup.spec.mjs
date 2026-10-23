import { expect, test } from '@playwright/test'
import { translate } from '../../web/i18n.js'

for (const [language, label] of [
    ['zh-CN', '只配置本地书库'],
    ['en', 'Set up local library only'],
    ['ja', 'ローカルライブラリだけを設定']
]) {
    test(`local setup needs no provider account or automatic recommendation request (${language})`, async ({
        page
    }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.addInitScript((language) => {
            localStorage.setItem('pica-library-language', language)
            localStorage.setItem(
                'pica-onboarding-state-v1',
                JSON.stringify({ completedVersion: 2, autoShow: false })
            )
        }, language)
        let configured = false
        const settings = [],
            requests = [],
            errors = []
        page.on('pageerror', (error) => errors.push(String(error)))
        await page.route('**/api/v1/**', async (route) => {
            const request = route.request(),
                url = new URL(request.url()),
                method = request.method()
            requests.push(`${method} ${url.pathname}`)
            let body = { error: 'synthetic-local-only-fixture' },
                status = 503
            if (url.pathname === '/api/v1/desktop/status') {
                status = 200
                body = {
                    application: 'Pica Library',
                    version: '0.5.0-local-fixture',
                    configured,
                    startupReady: true,
                    csrfToken: 'fixture-local-only',
                    libraryDirectory: 'C:\\synthetic-local-books',
                    profile: 'balanced',
                    picaAccount: { configured: false },
                    ehAccount: { configured: false }
                }
            } else if (url.pathname === '/api/v1/capabilities') {
                status = 200
                body = {
                    appVersion: '0.5.0-local-fixture',
                    appApiVersion: 2,
                    features: { updatePackages: false },
                    capabilityStates: {}
                }
            } else if (
                url.pathname === '/api/v1/desktop/settings' &&
                method === 'POST'
            ) {
                settings.push(request.postDataJSON())
                configured = true
                status = 200
                body = { success: true, restarting: false, localOnly: true }
            } else if (url.pathname === '/api/v1/status') {
                status = 200
                body = {
                    application: 'Pica Library',
                    status: 'Connected',
                    summary: {}
                }
            } else if (
                [
                    '/api/v1/comics',
                    '/api/v1/authors',
                    '/api/v1/recommendation-feedback'
                ].includes(url.pathname)
            ) {
                status = 200
                body = []
            } else if (url.pathname === '/api/v1/library/query') {
                status = 200
                body = {
                    items: [],
                    total: 0,
                    facets: { authors: [], tags: [] },
                    query: request.postDataJSON()
                }
            } else if (
                url.pathname === '/api/v1/recommendation-sessions/status'
            ) {
                status = 200
                body = { activeCycleId: null, buildingCycleId: null }
            } else if (url.pathname === '/api/v1/desktop/browser-session') {
                status = 200
                body = { success: true }
            }
            await route.fulfill({
                status,
                contentType: 'application/json',
                body: JSON.stringify(body)
            })
        })
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        if (
            await page
                .locator('#pica-disclaimer-gate')
                .isVisible()
                .catch(() => false)
        ) {
            await page.locator('#pica-disclaimer-check').check()
            await page.locator('#pica-disclaimer-accept').click()
        }
        await expect(page.locator('#setup')).toHaveClass(/\bactive\b/)
        await expect(page.locator('#setup-local')).toHaveText(label)
        expect(await page.locator('#setup-account').inputValue()).toBe('')
        expect(await page.locator('#setup-password').inputValue()).toBe('')
        await Promise.all([
            page.waitForEvent('domcontentloaded'),
            page.locator('#setup-local').click()
        ])
        await expect(page.locator('#mode')).toHaveText(
            translate(language, 'mode.connected')
        )
        await expect.poll(() => settings.length).toBe(1)
        expect(settings[0]).toEqual({
            setupMode: 'local',
            libraryDirectory: 'C:\\synthetic-local-books',
            profile: 'balanced'
        })
        await expect
            .poll(() =>
                requests.includes('GET /api/v1/recommendation-sessions/status')
            )
            .toBe(true)
        await expect(page.locator('#setup')).not.toHaveClass(/\bactive\b/)
        await page.locator('nav [data-view="library"]').click()
        await expect(page.locator('#library')).toHaveClass(/\bactive\b/)
        expect(requests).not.toContain('POST /api/v1/recommendation-sessions')
        expect(requests).not.toContain('POST /api/v1/recommendations')
        expect(
            requests.some((value) =>
                /(?:sync-favorites|test-connection|register-account|\/search)/.test(
                    value
                )
            )
        ).toBe(false)
        expect(errors).toEqual([])
    })
}
