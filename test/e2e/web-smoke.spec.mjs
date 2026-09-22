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

    await page.evaluate(() => {
        const filler = document.createElement('div')
        filler.id = 'scroll-regression-filler'
        filler.style.height = '2200px'
        document.querySelector('#library')?.appendChild(filler)
        window.scrollTo(0, 900)
    })
    await page.waitForFunction(() => window.scrollY >= 850)
    const scrollBeforeDetail = await page.evaluate(() => window.scrollY)
    await page.evaluate(() => {
        const dialog = document.querySelector('#recommend-detail-dialog')
        if (!(dialog instanceof HTMLDialogElement))
            throw new Error('recommend detail dialog missing')
        dialog.showModal()
    })
    await page.waitForTimeout(50)
    const scrollWhileDetailOpen = await page.evaluate(() => window.scrollY)
    expect(Math.abs(scrollWhileDetailOpen - scrollBeforeDetail)).toBeLessThanOrEqual(2)
    await page.evaluate(() =>
        document.querySelector('#recommend-detail-dialog')?.close()
    )
    await page.waitForTimeout(50)
    const scrollAfterDetail = await page.evaluate(() => window.scrollY)
    expect(Math.abs(scrollAfterDetail - scrollBeforeDetail)).toBeLessThanOrEqual(2)
    await page.evaluate(() => {
        document.querySelector('#scroll-regression-filler')?.remove()
        window.scrollTo(0, 0)
    })

    await page.evaluate(() => {
        const dialog = document.querySelector('#recommend-detail-dialog')
        const content = document.querySelector('#recommend-detail-content')
        if (!(dialog instanceof HTMLDialogElement) || !content)
            throw new Error('recommend detail surface missing')
        dialog.dataset.comicId = 'origin'
        dialog.dataset.context = 'recommendation'
        content.innerHTML =
            '<details id="work-variants-panel" open><summary>Same work</summary><div data-work-variants-list><article class="work-variant-card" data-work-variant-open="eh:test" tabindex="0"><span id="work-variant-child">Variant title</span></article></div></details>'
        const panel = document.querySelector('#work-variants-panel')
        panel._workVariantPayload = {
            count: 1,
            favoriteCount: 1,
            downloadedCount: 0,
            items: [
                {
                    comicId: 'eh:test',
                    providerId: 'eh',
                    title: 'Variant title',
                    author: 'Variant author',
                    canonicalAuthor: 'Variant author',
                    description: '',
                    tags: [],
                    finished: true,
                    totalLikes: 0,
                    isFavorite: true,
                    downloadedPictures: 0
                }
            ]
        }
        dialog.showModal()
    })
    await page.locator('#work-variant-child').click()
    await expect(page.locator('#recommend-detail-dialog')).toHaveAttribute(
        'data-comic-id',
        'eh:test'
    )
    await expect(page.locator('#recommend-detail-content h2')).toHaveText(
        'Variant title'
    )
    await expect(
        page.locator('#recommend-detail-content [data-detail-favorite]')
    ).toBeDisabled()
    await page.locator('#recommend-detail-close').click()

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
