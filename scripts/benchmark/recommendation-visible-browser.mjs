// Isolated real-browser check: no listening socket, provider calls, existing
// browser profile or production app. All origin requests are fulfilled here.
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const mod = process.env.PICA_PLAYWRIGHT_MODULE
const { chromium } = await import(mod ? pathToFileURL(mod).href : 'playwright')
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PICA_BROWSER_EXECUTABLE || undefined,
    args: ['--disable-background-networking', '--disable-component-update']
})
const root = fileURLToPath(new URL('../../web/', import.meta.url)),
    origin = 'http://pica-freshness.test'
try {
    const context = await browser.newContext({
        serviceWorkers: 'block',
        viewport: { width: 1150, height: 900 }
    })
    const page = await context.newPage()
    const errors = [],
        receipts = [],
        calls = []
    let batch = 0
    page.on('pageerror', (e) => errors.push(e.message))
    const payload = () => ({
        cycleId: 'test-cycle',
        contextId: 'test-context-' + batch,
        batchId: 'test-batch-' + batch,
        batchIndex: batch,
        maxVisibleBatches: 6,
        evidence: { freshness: { short: false } },
        recommendations: Array.from({ length: 12 }, (_, i) => ({
            comic: {
                comicId: 'fixture-' + batch + '-' + i,
                title: 'Synthetic ' + i,
                author: 'Fixture artist',
                tags: [],
                categories: []
            },
            reasons: [],
            score: 1
        }))
    })
    const json = (r, v, status = 200) =>
        r.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(v)
        })
    await context.route('**/*', async (route) => {
        const u = new URL(route.request().url())
        if (u.origin !== origin) return route.abort()
        const p = u.pathname
        if (p.startsWith('/api/')) {
            const body =
                route.request().method() === 'POST'
                    ? route.request().postDataJSON()
                    : {}
            if (p === '/api/v1/recommendations') {
                if (body.action === 'next') {
                    calls.push('next')
                    batch++
                }
                return json(route, payload())
            }
            if (p === '/api/v1/recommendation-events') {
                if (body.eventType === 'recommend_batch_presented') {
                    receipts.push(body)
                    calls.push('presented:' + body.recommendationBatchId)
                }
                return json(route, { ok: true })
            }
            if (p === '/api/v1/status') return json(route, { summary: {} })
            if (p === '/api/v1/recommendation-sessions/status')
                return json(route, { activeCycleId: 'test-cycle' })
            if (p === '/api/v1/library/query')
                return json(route, {
                    query: body,
                    items: [],
                    total: 0,
                    facets: {
                        authors: [],
                        tags: [],
                        categories: [],
                        sources: []
                    }
                })
            if (
                [
                    '/api/v1/comics',
                    '/api/v1/authors',
                    '/api/v1/recommendation-feedback'
                ].includes(p)
            )
                return json(route, [])
            return json(route, { error: 'offline fixture' }, 503)
        }
        const name = path.resolve(root, '.' + (p === '/' ? '/index.html' : p))
        if (!name.startsWith(path.resolve(root) + path.sep))
            return route.abort()
        try {
            const type =
                {
                    '.html': 'text/html',
                    '.js': 'text/javascript',
                    '.css': 'text/css',
                    '.svg': 'image/svg+xml',
                    '.png': 'image/png'
                }[path.extname(name)] || 'application/octet-stream'
            return route.fulfill({
                contentType: type,
                body: await readFile(name)
            })
        } catch {
            return route.fulfill({ status: 404, body: '' })
        }
    })
    await page.addInitScript(() => {
        localStorage.setItem(
            'pica-onboarding-state-v1',
            JSON.stringify({
                completedVersion: 2,
                dismissedVersion: 0,
                autoShow: true
            })
        )
    })
    await page.goto(origin)
    const cards = page.locator('#recommend-results .result')
    await cards.first().waitFor({ state: 'attached', timeout: 10000 })
    assert.equal(receipts.length, 0, 'background initial render must not count')
    const gate = page.locator('#pica-disclaimer-gate')
    if (await gate.isVisible()) {
        await page.locator('#pica-disclaimer-check').check()
        await page.locator('#pica-disclaimer-accept').click()
    }
    const waitForReceipts = async (n) => {
        const end = Date.now() + 5000
        while (receipts.length < n && Date.now() < end) await delay(25)
        assert.equal(
            receipts.length,
            n,
            'expected distinct browser presentation'
        )
    }
    await page.evaluate(() => {
        const curtain = document.createElement('button')
        curtain.id = 'fixture-curtain'
        curtain.style.cssText =
            'position:fixed;inset:0;width:100%;height:100%;z-index:2147483647'
        curtain.onclick = () => curtain.remove()
        document.body.append(curtain)
        document.querySelector('nav [data-view="discover"]').click()
    })
    await cards.first().scrollIntoViewIfNeeded()
    await page.evaluate(
        () =>
            new Promise((done) =>
                requestAnimationFrame(() => requestAnimationFrame(done))
            )
    )
    assert.equal(
        receipts.length,
        0,
        'an occluded foreground panel is not a presentation'
    )
    await page.locator('#fixture-curtain').click()
    await waitForReceipts(1)
    await page.waitForFunction(
        () =>
            document
                .querySelector('#recommend-results .result')
                .getBoundingClientRect().height > 0
    )
    assert.equal(receipts.length, 1, 'first actual view')
    assert.equal(receipts[0].source, 'final-v3-visible')
    assert.equal(new Set(receipts[0].metadata.itemIds).size, 12)
    await page.locator('nav [data-view="home"]').click()
    await page.locator('nav [data-view="discover"]').click()
    await cards.first().scrollIntoViewIfNeeded()
    await page.locator('#recommend-next-batch').click()
    await page
        .locator('[data-comic-id="fixture-1-0"].result')
        .scrollIntoViewIfNeeded()
    await page.waitForFunction(
        () =>
            document.querySelector('#recommend-results .result').dataset
                .comicId === 'fixture-1-0'
    )
    await waitForReceipts(2)
    assert.deepEqual(calls, [
        'presented:test-batch-0',
        'next',
        'presented:test-batch-1'
    ])
    assert.deepEqual(errors, [])
    console.log(
        'PASS: hidden home render = 0; discover/revisit = 1; next = 2 distinct confirmed batches; zero page errors.'
    )
} finally {
    await browser.close()
}
