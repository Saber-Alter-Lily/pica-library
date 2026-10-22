import { expect, test } from '@playwright/test'
import { guideCatalog } from '../../web/guide-catalog.js'

async function boot(page, language = 'zh-CN', state = null) {
    const errors = [], writes = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.addInitScript(({ language, state }) => {
        localStorage.setItem('pica-library-language', language)
        if (state && !localStorage.getItem('pica-onboarding-state-v1')) localStorage.setItem('pica-onboarding-state-v1', JSON.stringify(state))
    }, { language, state })
    await page.route('**/api/v1/**', async route => {
        if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) writes.push(route.request().url())
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'guide-offline-fixture' }) })
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (await page.locator('#pica-disclaimer-gate').isVisible().catch(() => false)) {
        await page.locator('#pica-disclaimer-check').check(); await page.locator('#pica-disclaimer-accept').click()
    }
    return { errors, writes }
}
async function next(page) {
    const title = await page.locator('.driver-popover-title').textContent()
    await page.locator('.driver-popover-next-btn').click()
    await expect(async () => {
        if (await page.locator('.driver-popover-title').count()) expect(await page.locator('.driver-popover-title').textContent()).not.toBe(title)
    }).toPass()
}
async function skip(page) {
    await page.locator('.pica-tour-skip').click()
    await expect(page.locator('#app-confirm-dialog')).toBeVisible()
    await page.locator('#app-confirm-submit').click()
    await expect(page.locator('body')).not.toHaveClass(/driver-active/)
}

test('welcome separates daily from optional advanced; Later is session-only', async ({ page }) => {
    await boot(page)
    await expect(page.locator('#pica-onboarding-welcome')).toBeVisible()
    await expect(page.locator('#pica-onboarding-start')).toHaveText('日常使用入门')
    await expect(page.locator('#pica-onboarding-advanced')).toHaveText('高级功能指南')
    await page.locator('#pica-onboarding-later').click()
    expect(await page.evaluate(() => sessionStorage.getItem('pica-onboarding-session-dismissed-v1'))).toBe('3')
    expect(await page.evaluate(() => localStorage.getItem('pica-onboarding-state-v1'))).toBeNull()
    await page.reload(); await expect(page.locator('#pica-onboarding-welcome')).toHaveCount(0)
})

test('old v2 completion is respected and both replays remain available', async ({ page }) => {
    await boot(page, 'zh-CN', { completedVersion: 2, autoShow: false })
    await page.locator('nav [data-view="maintenance"]').click()
    await expect(page.locator('#a89-onboarding-replay')).toBeVisible()
    await expect(page.locator('#a89-onboarding-auto')).not.toBeChecked()
    await page.locator('#a89-onboarding-advanced').click()
    await expect(page.locator('#pica-advanced-guide')).toBeVisible()
    await expect(page.locator('[data-guide-chapter]')).toHaveCount(7)
    await expect(page.locator('#pica-onboarding-welcome')).toHaveCount(0)
})

test('daily is short, never enters advanced controls or writes, and restores the original view', async ({ page }) => {
    const evidence = await boot(page)
    await expect(page.locator('#pica-onboarding-welcome')).toBeVisible()
    const originalView = await page.locator('section.view.active').getAttribute('id')
    await page.locator('#pica-onboarding-start').click()
    for (const step of guideCatalog(zh => zh).daily) {
        await expect(page.locator('.driver-popover-title')).toHaveText(step.title)
        await expect(page.locator('#' + step.view)).toHaveClass(/\bactive\b/)
        await expect(page.locator(step.selector)).toBeVisible()
        await next(page)
    }
    await expect(page.locator('.driver-popover-title')).toHaveText('日常入门完成'); await next(page)
    await expect(page.locator('body')).not.toHaveClass(/driver-active/)
    await expect(page.locator('#' + originalView)).toHaveClass(/\bactive\b/)
    const state = await page.evaluate(() => window.picaOnboarding.state())
    expect(state.daily.completedVersion).toBe(3)
    expect(Object.values(state.chapters).every(p => p.completedVersion === 0)).toBe(true)
    expect(evidence.writes).toEqual([]); expect(evidence.errors).toEqual([])
    await page.reload(); await expect(page.locator('#pica-onboarding-welcome')).toHaveCount(0)
})

test('advanced chapters locate their owners, complete independently and make no writes', async ({ page }) => {
    test.setTimeout(90_000)
    const evidence = await boot(page, 'zh-CN', { completedVersion: 2, autoShow: false })
    for (const chapter of guideCatalog(zh => zh).chapters) {
        await page.evaluate(() => window.picaOnboarding.advanced())
        await page.locator(`[data-guide-chapter="${chapter.id}"]`).click()
        for (const step of chapter.steps) {
            await expect(page.locator('.driver-popover-title')).toHaveText(step.title)
            await expect(page.locator('#' + step.view)).toHaveClass(/\bactive\b/)
            if (step.panel) await expect(page.locator('#a87-' + step.panel + '-panel')).toBeVisible()
            await expect(page.locator(step.selector)).toBeVisible()
            await next(page)
        }
        await expect(page.locator('.driver-popover-title')).toHaveText('本章已读'); await next(page)
        await expect(page.locator('body')).not.toHaveClass(/driver-active/)
        expect(await page.evaluate(id => window.picaOnboarding.state().chapters[id].completedVersion, chapter.id)).toBe(3)
    }
    expect(evidence.writes).toEqual([]); expect(evidence.errors).toEqual([])
})

test('skip preserves position across reload; advanced never dismisses daily', async ({ page }) => {
    await boot(page)
    await expect(page.locator('#pica-onboarding-welcome')).toBeVisible()
    await page.locator('#pica-onboarding-advanced').click(); await page.locator('[data-guide-chapter="preferences"]').click()
    await next(page)
    const title = await page.locator('.driver-popover-title').textContent(); await skip(page)
    const state = await page.evaluate(() => window.picaOnboarding.state())
    expect(state.daily.completedVersion).toBe(0); expect(state.daily.dismissedVersion).toBe(0)
    expect(state.chapters.preferences.position).toBe(1); expect(state.chapters.preferences.completedVersion).toBe(0)
    await page.reload(); await page.evaluate(() => window.picaOnboarding.advanced())
    await page.locator('[data-guide-chapter="preferences"]').click()
    await expect(page.locator('.driver-popover-title')).toHaveText(title); await skip(page)
})

for (const [language, start] of [['zh-CN','日常使用入门'], ['en','Daily-use tour'], ['ja','日常操作ガイド']]) {
    test(`both guides are localized and fit a narrow viewport in ${language}`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        const evidence = await boot(page, language)
        await expect(page.locator('#pica-onboarding-welcome')).toBeVisible()
        await expect(page.locator('#pica-onboarding-start')).toHaveText(start)
        await page.locator('#pica-onboarding-advanced').click(); await expect(page.locator('#pica-advanced-guide')).toBeVisible()
        const box = await page.locator('#pica-advanced-guide').boundingBox()
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390)
        await page.screenshot({ path: `_validation/ux-dual-onboarding-20261022/advanced-${language}.png` })
        expect(evidence.errors).toEqual([])
    })
}
