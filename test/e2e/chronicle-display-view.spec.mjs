import { expect, test } from '@playwright/test'

test('atlas view is opt-in, persistent, read-only and never exports a filtered objective card', async ({
    page
}, testInfo) => {
    const pageErrors = [],
        writes = [],
        viewQueries = []
    page.on('pageerror', (error) =>
        pageErrors.push(String(error.stack || error))
    )
    await page.addInitScript(() => {
        localStorage.setItem('pica-library-language', 'zh-CN')
        localStorage.setItem(
            'pica-onboarding-state-v1',
            JSON.stringify({ completedVersion: 2, autoShow: false })
        )
    })
    const blocked = {
        canonicalKey: 'fiction',
        label: '测试作品',
        facet: 'FANDOM_IP',
        supportCount: 8,
        supportShare: 0.8,
        facetConditionalShare: 0.8
    }
    const less = {
        canonicalKey: 'eyes',
        label: '测试外观',
        facet: 'APPEARANCE_TRAIT',
        supportCount: 6,
        supportShare: 0.6,
        facetConditionalShare: 0.6
    }
    const snapshot = {
        snapshotVersion: 2,
        snapshotId: 'fixture-snapshot',
        generatedAt: '2026-01-01T00:00:00Z',
        favoriteCount: 10,
        globalStats: { authors: 3, canonicalInterests: 2 },
        facetBands: [blocked, less].map((item) => ({
            facet: item.facet,
            comicCount: 10,
            interests: [item]
        })),
        themes: [blocked, less].map((item) => ({
            themeId: item.canonicalKey,
            type: 'SEMANTIC_SINGLE',
            family: 'SEMANTIC',
            displayName: item.label,
            supportCount: item.supportCount,
            anchors: [item],
            representativeWorks: []
        })),
        themeEdges: [],
        authorPreferences: [],
        fandomPreferences: [blocked],
        circlePreferences: [],
        combinations: [],
        collectionStyle: [],
        reportNarratives: { summary: '客观原始统计', privacy: 'fixture only' }
    }
    await page.route('**/api/v1/**', async (route) => {
        const url = new URL(route.request().url())
        const method = route.request().method()
        if (method !== 'GET') writes.push(url.pathname)
        let body
        if (url.pathname === '/api/v1/status')
            body = {
                application: 'Pica Library',
                mode: 'connected',
                summary: { comics: 0, favorites: 0 }
            }
        else if (
            [
                '/api/v1/comics',
                '/api/v1/authors',
                '/api/v1/recommendation-feedback'
            ].includes(url.pathname)
        )
            body = []
        else if (url.pathname === '/api/v1/library/query')
            body = {
                items: [],
                total: 0,
                facets: { authors: [], tags: [] },
                query: { scope: 'library', tags: [] }
            }
        else if (url.pathname === '/api/v1/recommendation-sessions/status')
            body = { buildingCycleId: 'fixture' }
        else if (url.pathname === '/api/v1/recommendation/profile/view') {
            viewQueries.push(url.search)
            const hideBlocked = url.searchParams.get('hideBlocked') === 'true'
            const hideLess = url.searchParams.get('hideLess') === 'true'
            const hidden = new Set([
                ...(hideBlocked ? ['fiction'] : []),
                ...(hideLess ? ['eyes'] : [])
            ])
            body = {
                available: true,
                snapshot: {
                    ...snapshot,
                    facetBands: snapshot.facetBands.filter(
                        (band) => !hidden.has(band.interests[0].canonicalKey)
                    ),
                    themes: snapshot.themes.filter(
                        (theme) => !hidden.has(theme.themeId)
                    ),
                    fandomPreferences: hideBlocked
                        ? []
                        : snapshot.fandomPreferences
                },
                view: {
                    mode: hidden.size
                        ? 'FILTERED_COLLECTION'
                        : 'OBJECTIVE_COLLECTION',
                    supported: true,
                    registryAvailable: true,
                    hiddenInterests: hidden.size,
                    hiddenThemes: hidden.size,
                    hiddenAuthors: 0,
                    originalFavoriteCount: 10,
                    generatedAt: snapshot.generatedAt
                }
            }
        }
        await route.fulfill({
            status: body ? 200 : 503,
            contentType: 'application/json',
            body: JSON.stringify(body || { error: 'isolated-fixture' })
        })
    })
    await page.goto('/?view=chronicle', { waitUntil: 'domcontentloaded' })
    const disclaimer = page.locator('#pica-disclaimer-gate')
    if (await disclaimer.isVisible().catch(() => false)) {
        await page.locator('#pica-disclaimer-check').check()
        await page.locator('#pica-disclaimer-accept').click()
    }
    await expect(page.locator('#mode')).toContainText('已连接')
    await page.locator('nav [data-view="chronicle"]').click()
    await expect(page.locator('#chronicle-view-note')).toContainText(
        '客观收藏分布'
    )
    await expect(page.locator('#chronicle-content')).toContainText('测试作品')
    await expect(page.locator('#chronicle-hide-blocked')).not.toBeChecked()
    await expect(page.locator('#chronicle-hide-less')).not.toBeChecked()
    await page.locator('#chronicle-hide-blocked').check()
    await expect(page.locator('#chronicle-view-note')).toContainText(
        '过滤后的收藏视图'
    )
    await expect(page.locator('#chronicle-content')).not.toContainText(
        '测试作品'
    )
    await expect(page.locator('#chronicle-content')).toContainText('测试外观')
    await expect(page.locator('#chronicle-print')).toBeDisabled()
    await page.screenshot({
        path: testInfo.outputPath('atlas-filtered.png'),
        fullPage: false
    })
    await page.locator('#chronicle-hide-less').check()
    await expect(page.locator('#chronicle-view-note')).toContainText(
        '隐藏 2 个语义项目'
    )
    await expect(
        page.locator('#chronicle-content .atlas-universe-node')
    ).toHaveCount(0)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('#mode')).toContainText('已连接')
    await page.locator('nav [data-view="chronicle"]').click()
    await expect(page.locator('#chronicle-hide-blocked')).toBeChecked()
    await expect(page.locator('#chronicle-hide-less')).toBeChecked()
    await expect(page.locator('#chronicle-view-note')).toContainText(
        '原始快照：10 本'
    )
    await page.locator('#chronicle-hide-blocked').uncheck()
    await page.locator('#chronicle-hide-less').uncheck()
    await expect(page.locator('#chronicle-view-note')).toContainText(
        '客观收藏分布'
    )
    await expect(page.locator('#chronicle-content')).toContainText('测试作品')
    await expect(page.locator('#chronicle-print')).toBeEnabled()
    expect(viewQueries.length).toBeGreaterThanOrEqual(6)
    expect(
        writes.filter(
            (url) =>
                url.includes('recommendation/profile') ||
                url.startsWith('/api/v1/recommendation-v5')
        )
    ).toEqual([])
    expect(pageErrors).toEqual([])
})
