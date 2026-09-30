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
    expect(await page.evaluate(() => sessionStorage.getItem('pica-onboarding-session-dismissed-v1'))).toBe('2')
    expect(await page.evaluate(() => localStorage.getItem('pica-onboarding-state-v1'))).toBeNull()
})

test('do-not-show persists but Settings replay remains available', async ({ page }) => {
    await boot(page)
    await expect(page.locator('#pica-onboarding-welcome')).toBeVisible({ timeout: 5000 })
    await page.locator('#pica-onboarding-never').check()
    await page.locator('#pica-onboarding-later').click()
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('pica-onboarding-state-v1')))
    expect(state.autoShow).toBe(false)
    expect(state.dismissedVersion).toBe(2)

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

    for (let i = 0; i < 20; i += 1) {
        if (!(await page.locator('body').evaluate((body) => body.classList.contains('driver-active')))) break
        const next = page.locator('.driver-popover-next-btn')
        await expect(next).toBeVisible()
        await next.click()
        await page.waitForTimeout(260)
    }
    await expect(page.locator('body')).not.toHaveClass(/driver-active/)
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('pica-onboarding-state-v1')))
    expect(state.completedVersion).toBe(2)
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
    expect(state.dismissedVersion).toBe(2)
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


test('task tour keeps every late Settings step anchored to the correct visible panel', async ({ page }) => {
    await boot(page, 'zh-CN')
    await expect(page.locator('#pica-onboarding-welcome')).toBeVisible({ timeout: 5000 })
    await page.locator('#pica-onboarding-start').click()

    const steps = [
        { title: '统一书库', view: 'library' },
        { title: '先同步收藏', view: 'library' },
        { title: '搜索与筛选', view: 'library' },
        { title: '建立书架', view: 'shelves' },
        { title: '新建与管理书架', view: 'shelves' },
        { title: '推荐与在线发现', view: 'discover' },
        { title: '专属推荐', view: 'discover' },
        { title: '设置中心', view: 'maintenance' },
        { title: '推荐与画风', view: 'maintenance', panel: 'recommendations' },
        { title: '画风接入模式', view: 'maintenance', panel: 'recommendations' },
        { title: '画风影响强度', view: 'maintenance', panel: 'recommendations' },
        { title: '连接与同步', view: 'maintenance', panel: 'connections' },
        { title: '先看连接状态', view: 'maintenance', panel: 'connections' },
        { title: '手机直接读取电脑内容', view: 'maintenance', panel: 'connections' },
        { title: 'E-H 登录方式', view: 'maintenance', panel: 'general' },
        { title: '语言与地区', view: 'maintenance', panel: 'general' },
        { title: '软件更新', view: 'maintenance', panel: 'maintenance' }
    ]

    for (let index = 0; index < steps.length; index += 1) {
        const expected = steps[index]
        await expect(page.locator('.driver-popover-title')).toHaveText(expected.title)
        await expect(page.locator('#' + expected.view)).toHaveClass(/\bactive\b/)
        if (expected.panel) {
            await expect(page.locator('#a87-' + expected.panel + '-panel')).toBeVisible()
            await expect(page.locator('#a87-' + expected.panel + '-tab')).toHaveAttribute('aria-selected', 'true')
        }
        const active = page.locator('.driver-active-element')
        await expect(active).toBeVisible()
        const box = await active.boundingBox()
        expect(box, 'step ' + (index + 1) + ' should have a real spotlight target').not.toBeNull()
        expect(box.width).toBeGreaterThan(0)
        expect(box.height).toBeGreaterThan(0)

        const before = await page.locator('.driver-popover-progress-text').textContent()
        await page.locator('.driver-popover-next-btn').click()
        await page.waitForTimeout(120)
        if (index < steps.length - 1) {
            const after = await page.locator('.driver-popover-progress-text').textContent()
            expect(after).not.toBe(before)
        }
    }

    await expect(page.locator('.driver-popover-title')).toHaveText('已经准备好了')
    await page.locator('.driver-popover-next-btn').click()
    await expect(page.locator('body')).not.toHaveClass(/driver-active/)
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('pica-onboarding-state-v1')))
    expect(state.completedVersion).toBe(2)
})
