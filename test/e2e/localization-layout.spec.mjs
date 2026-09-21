import { expect, test } from '@playwright/test'
import { translations } from '../../web/i18n.js'

const languages = ['zh-CN', 'ja', 'en']
const viewports = [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'narrow', width: 768, height: 900 },
    { name: 'desktop', width: 1280, height: 800 }
]

const zhPhrases = [...new Set(Object.values(translations['zh-CN']))]
    .filter((value) => typeof value === 'string' && value.length >= 3)
    .filter((value) => /[\u3400-\u9fff]/.test(value))
    .sort((a, b) => b.length - a.length)

async function boot(page, language) {
    await page.addInitScript((lang) => {
        localStorage.setItem('pica-library-language', lang)
        localStorage.setItem('pica-onboarding-state-v1', JSON.stringify({ completedVersion: 1, dismissedVersion: 0, autoShow: true }))
    }, language)
    await page.route('**/api/v1/**', async (route) => {
        await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'localization-layout-smoke-offline' })
        })
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const disclaimer = page.locator('#pica-disclaimer-gate')
    if (await disclaimer.isVisible().catch(() => false)) {
        await page.locator('#pica-disclaimer-check').check()
        await page.locator('#pica-disclaimer-accept').click()
    }
}

async function openSettings(page) {
    await page.locator('nav [data-view="maintenance"]').click()
    await expect(page.locator('#a87-hub-layout')).toBeVisible()
}

async function visibleText(page) {
    return await page.locator('body').evaluate((body) => {
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
        const values = []
        let node
        while ((node = walker.nextNode())) {
            const parent = node.parentElement
            if (!parent) continue
            if (parent.closest('#a87-language-panel, .language-control')) continue
            const style = getComputedStyle(parent)
            if (style.display === 'none' || style.visibility === 'hidden') continue
            const rect = parent.getBoundingClientRect()
            if (rect.width <= 0 || rect.height <= 0) continue
            const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
            if (text) values.push(text)
        }
        return values.join('\n')
    })
}

async function visibleAttributes(page) {
    return await page.locator('body').evaluate(() => {
        const attrs = ['aria-label', 'placeholder', 'title', 'data-info-tip']
        const values = []
        for (const el of document.querySelectorAll('*')) {
            if (el.closest('#a87-language-panel, .language-control')) continue
            const style = getComputedStyle(el)
            const rect = el.getBoundingClientRect()
            if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0)
                continue
            for (const attr of attrs) {
                const value = (el.getAttribute(attr) || '').replace(/\s+/g, ' ').trim()
                if (value) values.push(`${attr}: ${value}`)
            }
        }
        return values.join('\n')
    })
}

function japaneseLeaks(text) {
    return zhPhrases
        .filter((phrase) => {
            const key = Object.keys(translations['zh-CN']).find(
                (candidate) => translations['zh-CN'][candidate] === phrase
            )
            return !key || translations.ja[key] !== phrase
        })
        .filter((phrase) => text.includes(phrase))
        .slice(0, 40)
}

async function surfaceSnapshot(page) {
    return await page.locator('body').evaluate((body) => {
        const textValues = []
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
        let node
        while ((node = walker.nextNode())) {
            const parent = node.parentElement
            if (!parent || parent.closest('#a87-language-panel, .language-control')) continue
            const style = getComputedStyle(parent)
            const rect = parent.getBoundingClientRect()
            if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) continue
            const value = (node.textContent || '').replace(/\s+/g, ' ').trim()
            if (value) textValues.push(value)
        }

        const attributeValues = []
        const attrs = ['aria-label', 'placeholder', 'title', 'data-info-tip']
        for (const el of document.querySelectorAll('*')) {
            if (el.closest('#a87-language-panel, .language-control')) continue
            const style = getComputedStyle(el)
            const rect = el.getBoundingClientRect()
            if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) continue
            for (const attr of attrs) {
                const value = (el.getAttribute(attr) || '').replace(/\s+/g, ' ').trim()
                if (value) attributeValues.push(`${attr}: ${value}`)
            }
        }

        const selector = [
            'button', 'select', 'input', 'textarea', 'summary', 'label',
            '.a87-hub-nav', '.a87-hub-panel.active', '.actions', '.toolbar',
            '.a83-row', '.mobile-pair-value'
        ].join(',')
        const problems = []
        for (const el of document.querySelectorAll(selector)) {
            const style = getComputedStyle(el)
            const rect = el.getBoundingClientRect()
            if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) continue
            if (el.tagName === 'INPUT' && el.getAttribute('type') === 'file' && rect.width <= 3) continue
            const text = (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 120)
            if (el.scrollWidth > el.clientWidth + 3 && style.overflowX !== 'auto')
                problems.push({ kind: 'horizontal-overflow', tag: el.tagName, text, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })
            if (rect.left < -3 || rect.right > innerWidth + 3)
                problems.push({ kind: 'outside-viewport', tag: el.tagName, text, left: Math.round(rect.left), right: Math.round(rect.right), viewport: innerWidth })
            if (el.tagName === 'BUTTON') {
                const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.25
                const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
                const contentHeight = Math.max(0, rect.height - verticalPadding)
                if (contentHeight > lineHeight * 2.35)
                    problems.push({ kind: 'button-too-many-lines', tag: el.tagName, text, height: Math.round(rect.height), lineHeight })
            }
        }
        return {
            combined: `${textValues.join('\n')}\n${attributeValues.join('\n')}`,
            problems: problems.slice(0, 40)
        }
    })
}

async function assertLocalizedSurface(page, language, label) {
    const snapshot = await surfaceSnapshot(page)
    expect(snapshot.problems, `${label}\n${JSON.stringify(snapshot.problems, null, 2)}`).toEqual([])

    const combined = snapshot.combined
    if (language === 'en') {
        expect(
            combined.match(/[\u3400-\u9fff]/g) ?? [],
            `${label}\n${combined.slice(0, 8000)}`
        ).toEqual([])
    } else if (language === 'ja') {
        const leaked = japaneseLeaks(combined)
        expect(leaked, `${label}\n${combined.slice(0, 8000)}`).toEqual([])
    }
}

async function geometryProblems(page) {
    return await page.locator('body').evaluate(() => {
        const selector = [
            'button', 'select', 'input', 'textarea', 'summary', 'label',
            '.a87-hub-nav', '.a87-hub-panel.active', '.actions', '.toolbar',
            '.a83-row', '.mobile-pair-value'
        ].join(',')
        const problems = []
        for (const el of document.querySelectorAll(selector)) {
            const style = getComputedStyle(el)
            const rect = el.getBoundingClientRect()
            if (
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                rect.width <= 0 ||
                rect.height <= 0
            ) continue
            if (el.tagName === 'INPUT' && el.getAttribute('type') === 'file' && rect.width <= 3) continue
            const text = (el.textContent || el.getAttribute('aria-label') || '')
                .replace(/\s+/g, ' ').trim().slice(0, 120)
            if (el.scrollWidth > el.clientWidth + 3 && style.overflowX !== 'auto') {
                problems.push({ kind: 'horizontal-overflow', tag: el.tagName, text, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })
            }
            if (rect.left < -3 || rect.right > innerWidth + 3) {
                problems.push({ kind: 'outside-viewport', tag: el.tagName, text, left: Math.round(rect.left), right: Math.round(rect.right), viewport: innerWidth })
            }
            if (el.tagName === 'BUTTON') {
                const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.25
                const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
                const contentHeight = Math.max(0, rect.height - verticalPadding)
                if (contentHeight > lineHeight * 2.35)
                    problems.push({ kind: 'button-too-many-lines', tag: el.tagName, text, height: Math.round(rect.height), lineHeight })
            }
        }
        return problems.slice(0, 40)
    })
}

for (const viewport of viewports) {
    for (const language of languages) {
        test(`${language} UI fits at ${viewport.name}`, async ({ page }) => {
            await page.setViewportSize({ width: viewport.width, height: viewport.height })
            await boot(page, language)

            for (const view of ['home', 'library', 'shelves', 'discover', 'downloads', 'downloaded']) {
                const nav = page.locator(`nav [data-view="${view}"]`)
                if (await nav.isVisible().catch(() => false)) {
                    await nav.click()
                    await expect(page.locator(`#${view}`)).toHaveClass(/\bactive\b/)
                    await assertLocalizedSurface(page, language, `view:${view}`)
                }
            }
            await openSettings(page)
            for (const id of ['general','recommendations','connections','appearance','storage','maintenance','software']) {
                const tab = page.locator(`#a87-${id}-tab`)
                await expect(tab).toBeVisible()
                await tab.click()
                await expect(page.locator(`#a87-${id}-panel`)).toBeVisible()
                await assertLocalizedSurface(page, language, `settings:${id}`)
            }

            if (language === 'ja') {
                const missing = await page.evaluate(
                    () => [...(window.__picaRuntimeTranslationMissing || [])]
                )
                expect(missing, JSON.stringify(missing, null, 2)).toEqual([])
            }
        })
    }
}
