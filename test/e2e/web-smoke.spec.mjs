import { expect, test } from '@playwright/test'

test('Web boots and primary navigation stays interactive', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem(
            'pica-onboarding-state-v1',
            JSON.stringify({ completedVersion: 1, dismissedVersion: 0, autoShow: true })
        )
    })
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

    const settingsNav = page.locator('nav [data-view="maintenance"]')
    await settingsNav.click()
    await expect(page.locator('#a87-hub-layout')).toBeVisible()

    const support = page.locator('#a87-general-panel #a83-support')
    await expect(support).toBeVisible()
    await expect(support.locator('#a83-afdian')).toBeVisible()
    await expect(support.locator('#a83-star')).toBeVisible()

    await page.locator('#a87-appearance-tab').click()
    const appearance = page.locator('#a87-appearance-panel #a83-appearance')
    await expect(appearance).toBeVisible()

    await page.locator('nav [data-view="library"]').click()
    await expect(page.locator('#library')).toHaveClass(/\bactive\b/)

    const help = page.locator('#library .info-tip').first()
    await expect(help).toBeVisible()
    await help.hover()
    const popover = page.locator('#pica-info-tip-popover')
    await expect(popover).toHaveAttribute('data-open', 'true')
    await help.click()
    await expect(popover).toHaveAttribute('data-pinned', 'true')
    await page.keyboard.press('Escape')
    await expect(popover).toHaveAttribute('data-open', 'false')

    expect(pageErrors, pageErrors.join('\n\n')).toEqual([])
    expect(consoleErrors, consoleErrors.join('\n\n')).toEqual([])
})
