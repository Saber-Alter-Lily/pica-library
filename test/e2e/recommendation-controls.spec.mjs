import { expect, test } from '@playwright/test'

test('recommendation controls render persisted adjustments after localization', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('pica-library-language', 'zh-CN')
        localStorage.setItem(
            'pica-onboarding-state-v1',
            JSON.stringify({ completedVersion: 1, dismissedVersion: 0, autoShow: true })
        )
    })

    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)))

    const snapshot = {
        policyVersion: 'V5',
        revision: 9,
        counts: { owned: 1825, favorites: 1825, controls: 1, blockedTargets: 0, hardSuppressed: 0 },
        sessionIntent: { mode: 'DEFAULT' },
        inferred: [
            {
                targetType: 'TAG',
                key: 'story-focus',
                label: '剧情向',
                facet: 'GENRE_THEME',
                supportCount: 320,
                supportShare: 0.175,
                baselineLevel: 7
            }
        ],
        controls: [
            {
                targetType: 'TAG',
                key: 'story-focus',
                label: '剧情向',
                direction: 'MORE',
                levelDelta: 1,
                scope: 'PERSISTENT'
            }
        ]
    }
    const timescales = {
        layers: {
            inferred: {
                lifetime: {
                    positiveItemCount: 1825,
                    positive: {
                        authors: [],
                        tags: [{ key: 'story-focus', label: '剧情向', score: 1, supportItems: 320 }],
                        categories: []
                    }
                },
                days30: { positiveItemCount: 20, positive: { authors: [], tags: [], categories: [] } },
                session: { positiveItemCount: 0, positive: { authors: [], tags: [], categories: [] } }
            }
        }
    }
    const channels = {
        servingImpact: false,
        summary: { enabledChannelCount: 1, families: { TAG: 1 } },
        providerBudgets: { pica: { plannedRequests: 1, maxRequests: 2, eligible: true } },
        channels: [
            {
                enabled: true,
                sourceLayer: 'EXPLICIT_PERSISTENT',
                family: 'TAG',
                priority: 10,
                anchors: [{ key: 'story-focus', label: '剧情向' }]
            }
        ]
    }
    const serving = {
        available: true,
        batchIndex: 0,
        itemCount: 12,
        primaryFamilies: { SEMANTIC_ANCHOR: 12 },
        primaryIntents: [{ type: 'SEMANTIC_ANCHOR', count: 12, anchors: ['剧情向'] }]
    }

    await page.route('**/api/v1/**', async (route) => {
        const url = new URL(route.request().url())
        let body = null
        if (url.pathname === '/api/v1/recommendation-v5') body = snapshot
        else if (url.pathname === '/api/v1/recommendation-v5/preference-timescales') body = timescales
        else if (url.pathname === '/api/v1/recommendation-v5/candidate-channels') body = channels
        else if (url.pathname === '/api/v1/recommendation-v5/serving-composition') body = serving
        if (body) {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
            return
        }
        await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'recommendation-controls-smoke-offline' })
        })
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const disclaimer = page.locator('#pica-disclaimer-gate')
    if (await disclaimer.isVisible().catch(() => false)) {
        await page.locator('#pica-disclaimer-check').check()
        await page.locator('#pica-disclaimer-accept').click()
    }

    await expect(page.locator('#v5-policy-status')).toContainText('你调整 1 项', { timeout: 10_000 })
    await expect(page.locator('#v5-shadow-summary')).toContainText('1 条实验通道')
    await expect(page.locator('#v5-control-list .v5-control-chip')).toContainText('剧情向')
    await expect(page.locator('#v5-control-list .v5-control-chip')).toContainText('8/10')
    const row = page.locator('[data-v5-signal="TAG:story-focus"]')
    await expect(row).toBeVisible()
    await expect(row.locator('input[type="range"]')).toHaveValue('8')
    await expect(page.locator('#v5-policy-status')).not.toContainText('暂不可用')
    expect(pageErrors, pageErrors.join('\n\n')).toEqual([])
})
