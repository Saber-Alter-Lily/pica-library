import { expect, test } from '@playwright/test'

test('JM settings remain visible in the hub and require complete preview before import', async ({
    page
}) => {
    await page.addInitScript(() => {
        localStorage.setItem('pica-library-language', 'zh-CN')
        localStorage.setItem(
            'pica-onboarding-state-v1',
            JSON.stringify({
                completedVersion: 2,
                dismissedVersion: 0,
                autoShow: true
            })
        )
    })
    const errors = [],
        commits = []
    let signedIn = false
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.route('**/api/v1/**', async (route) => {
        const url = new URL(route.request().url())
        let status = 200,
            body = {}
        if (url.pathname === '/api/v1/desktop/status')
            body = {
                configured: true,
                csrfToken: 'fixture-csrf',
                startupReady: true
            }
        else if (url.pathname === '/api/v1/desktop/sources/jm/status')
            body = {
                available: true,
                configured: signedIn,
                username: signedIn ? 'fixture-user' : ''
            }
        else if (url.pathname.endsWith('/sources/jm/login')) {
            signedIn = true
            body = {
                configured: true,
                username: 'fixture-user',
                remembered: false
            }
        } else if (url.pathname.endsWith('/sources/jm/preview'))
            body = { token: 'complete-fixture-preview', count: 2 }
        else if (url.pathname.endsWith('/sources/jm/confirm')) {
            commits.push(route.request().postDataJSON())
            body = { importedFavorites: 2 }
        } else {
            status = 503
            body = { error: 'isolated-browser-fixture' }
        }
        await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(body)
        })
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (await page.locator('#pica-disclaimer-gate').isVisible()) {
        await page.locator('#pica-disclaimer-check').check()
        await page.locator('#pica-disclaimer-accept').click()
    }
    await page.locator('nav [data-view="maintenance"]').click()
    const panel = page.locator('#a87-general-panel #settings-jm-account')
    await expect(panel).toBeVisible()
    await panel.locator(':scope > summary').click()
    await expect(page.locator('#jm-account-state')).toContainText('尚未登录')
    await expect(page.locator('#jm-confirm')).toBeHidden()
    await page.locator('#jm-username').fill('fixture-user')
    await page.locator('#jm-password').fill('not-a-real-secret')
    await page.locator('#jm-login').click()
    await expect(page.locator('#jm-account-state')).toContainText(
        'fixture-user'
    )
    await expect(page.locator('#jm-password')).toHaveValue('')
    await page.locator('#jm-preview').click()
    await expect(page.locator('#jm-account-message')).toContainText('2 本收藏')
    expect(commits).toEqual([])
    await page.locator('#jm-confirm').click()
    await expect(page.locator('#jm-account-message')).toContainText(
        '已导入 2 本收藏'
    )
    expect(commits).toEqual([{ token: 'complete-fixture-preview' }])
    await expect(page.locator('#jm-confirm')).toBeHidden()
    expect(errors).toEqual([])
})
