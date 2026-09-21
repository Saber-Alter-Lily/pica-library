import { expect, test } from '@playwright/test'

async function boot(page, language = 'zh-CN', state = null) {
    await page.addInitScript(({ language, state }) => {
        localStorage.setItem('pica-library-language', language)
        localStorage.removeItem('pica-onboarding-state-v1')
        sessionStorage.removeItem('pica-onboarding-session-dismissed-v1')
        if (state) localStorage.setItem('pica-onboarding-state-v1', JSON.stringify(state))
    }, { language, state })
    await page.route('**/api/v1/**', async (route) => {
        await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'onboarding-smoke-offline' })
        })
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const disclaimer = page.locator('#pica-disclaimer-gate')
    if (await disclaimer.isVisible().catch(() => false)) {
        await page.locator('#pica-disclaimer-check').check()
        await page.locator('#pica-disclaimer-accept').click()
    }
}

test('first supported version prompts and Later only dismisses this session', async ({ page }) => {
    await boot(page)
    const dialog = page.locator('#pica-onboarding-welcome')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog).toContainText('设置 → 帮助与新手引导')
    await page.locator('#pica-onboarding-later').click()
    await expect(dialog).toBeHidden()
    expect(await page.evaluate(() => sessionStorage.getItem('pica-onboarding-session-dismissed-v1'))).toBe('1')
    expect(await page.evaluate(() => localStorage.getItem('pica-onboarding-state-v1'))).toBeNull()
})

test('do-not-show persists but Settings replay remains available', async ({ page }) => {
    await boot(page)
    await expect(page.locator('#pica-onboarding-welcome')).toBeVisible({ timeout: 5000 })
    await page.locator('#pica-onboarding-never').check()
    await page.locator('#pica-onboarding-later').click()
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('pica-onboarding-state-v1')))
    expect(state.autoShow).toBe(false)
    expect(state.dismissedVersion).toBe(1)

    await page.locator('nav [data-view="maintenance"]').click()
    await expect(page.locator('#a89-onboarding-panel')).toBeVisible()
    await page.locator('#a89-onboarding-replay').click()
    await expect(page.locator('.driver-popover')).toBeVisible()
    await expect(page.locator('.pica-tour-skip')).toBeVisible()
})

test('tour completion records the onboarding version', async ({ page }) => {
    await boot(page, 'en')
    await expect(page.locator('#pica-onboarding-welcome')).toBeVisible({ timeout: 5000 })
    await page.locator('#pica-onboarding-start').click()
    await expect(page.locator('.driver-popover')).toBeVisible()

    for (let i = 0; i < 16; i += 1) {
        if (!(await page.locator('body').evaluate((body) => body.classList.contains('driver-active')))) break
        const next = page.locator('.driver-popover-next-btn')
        await expect(next).toBeVisible()
        await next.click()
        await page.waitForTimeout(260)
    }
    await expect(page.locator('body')).not.toHaveClass(/driver-active/)
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('pica-onboarding-state-v1')))
    expect(state.completedVersion).toBe(1)
})

test('tour Skip confirms replay location and records dismissedVersion', async ({ page }) => {
    await boot(page, 'ja')
    await expect(page.locator('#pica-onboarding-welcome')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('#pica-onboarding-start')).toHaveText('ガイドを開始')
    await page.locator('#pica-onboarding-start').click()
    await expect(page.locator('.pica-tour-skip')).toHaveText('スキップ')
    await page.locator('.pica-tour-skip').click()

    const confirm = page.locator('#app-confirm-dialog')
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText('設定 → ヘルプと初回ガイド')
    await page.locator('#app-confirm-submit').click()
    await expect(page.locator('body')).not.toHaveClass(/driver-active/)
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('pica-onboarding-state-v1')))
    expect(state.dismissedVersion).toBe(1)
})

for (const [language, start] of [
    ['zh-CN', '开始引导'],
    ['ja', 'ガイドを開始'],
    ['en', 'Start tour']
]) {
    test(`welcome copy is localized in ${language}`, async ({ page }) => {
        await boot(page, language)
        await expect(page.locator('#pica-onboarding-welcome')).toBeVisible({ timeout: 5000 })
        await expect(page.locator('#pica-onboarding-start')).toHaveText(start)
    })
}
