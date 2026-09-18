import { expect, test } from '@playwright/test'

test('Web boots and primary navigation stays interactive', async ({ page }) => {
    const pageErrors = []
    const consoleErrors = []

    page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)))
    page.on('console', (message) => {
        if (
            message.type() === 'error' &&
            !message.text().includes('Failed to load resource')
        )
            consoleErrors.push(message.text())
    })

    await page.route('**/api/v1/**', async (route) => {
        await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'browser-smoke-offline' })
        })
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const mode = page.locator('#mode')
    await expect(mode).not.toHaveText('正在检测模式', { timeout: 10_000 })

    const disclaimer = page.locator('#pica-disclaimer-gate')
    if (await disclaimer.isVisible()) {
        await page.locator('#pica-disclaimer-check').check()
        await page.locator('#pica-disclaimer-accept').click()
        await expect(disclaimer).toBeHidden()
    }

    for (const view of [
        'library',
        'shelves',
        'discover',
        'chronicle',
        'downloads',
        'downloaded',
        'maintenance',
        'home'
    ]) {
        const button = page.locator(`nav [data-view="${view}"]`)
        await expect(button).toBeVisible()
        await button.click()
        await expect(page.locator(`#${view}`)).toHaveClass(/\bactive\b/)
    }

    await page.locator('button[data-go="library"]').click()
    await expect(page.locator('#library')).toHaveClass(/\bactive\b/)

    expect(pageErrors, pageErrors.join('\n\n')).toEqual([])
    expect(consoleErrors, consoleErrors.join('\n\n')).toEqual([])
})
