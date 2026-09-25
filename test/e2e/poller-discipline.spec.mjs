import { expect, test } from '@playwright/test'

async function installVisibilityOverride(page, initialState = 'hidden') {
    await page.addInitScript((state) => {
        let visibility = state
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => visibility
        })
        window.__picaSetVisibility = (next) => {
            visibility = next
            document.dispatchEvent(new Event('visibilitychange'))
        }
    }, initialState)
}

async function assertCadence({
    page,
    shellPath,
    shellBody,
    statusPath,
    activeTask,
    label,
    foregroundDelayMs
}) {
    const requestTimes = []

    await installVisibilityOverride(page, 'hidden')

    await page.route('**/api/v1/**', async (route) => {
        const url = new URL(route.request().url())
        if (url.pathname === statusPath) {
            requestTimes.push(Date.now())
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(activeTask)
            })
            return
        }
        await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'p2-f13-browser-evidence' })
        })
    })

    await page.route(`**${shellPath}`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: shellBody
        })
    })

    await page.goto(shellPath, { waitUntil: 'domcontentloaded' })
    expect(await page.evaluate(() => document.visibilityState)).toBe('hidden')

    // Module bootstrap/reattach performs an initial status read and then
    // starts its watcher. The first watcher read is intentionally immediate.
    await expect
        .poll(() => requestTimes.length, { timeout: 2500 })
        .toBeGreaterThanOrEqual(2)

    // The next watcher request must reflect the hidden-page 3 s cadence.
    await expect
        .poll(() => requestTimes.length, { timeout: 6000 })
        .toBeGreaterThanOrEqual(3)

    const hiddenGapMs = requestTimes[2] - requestTimes[1]
    expect(hiddenGapMs).toBeGreaterThanOrEqual(2400)
    expect(hiddenGapMs).toBeLessThanOrEqual(5200)

    // Once the page becomes visible, the temporary visibility listener
    // should wake the pending hidden delay rather than waiting another 3 s.
    const visibleAt = Date.now()
    await page.evaluate(() => window.__picaSetVisibility('visible'))
    await expect
        .poll(() => requestTimes.length, { timeout: 1600 })
        .toBeGreaterThanOrEqual(4)

    const visibleWakeMs = requestTimes[3] - visibleAt
    expect(visibleWakeMs).toBeGreaterThanOrEqual(0)
    expect(visibleWakeMs).toBeLessThanOrEqual(900)

    // The following interval should return to the existing foreground
    // cadence. These wide structural bounds are not a performance budget.
    await expect
        .poll(() => requestTimes.length, { timeout: 2200 })
        .toBeGreaterThanOrEqual(5)

    const foregroundGapMs = requestTimes[4] - requestTimes[3]
    expect(foregroundGapMs).toBeGreaterThanOrEqual(
        Math.max(150, foregroundDelayMs - 350)
    )
    expect(foregroundGapMs).toBeLessThanOrEqual(foregroundDelayMs + 1000)

    console.log(
        '[P2-F13]',
        JSON.stringify({
            label,
            hiddenGapMs,
            visibleWakeMs,
            foregroundGapMs,
            requestCount: requestTimes.length
        })
    )
}

test('Work Identity polling slows while hidden and wakes immediately when visible', async ({
    page
}) => {
    await assertCadence({
        page,
        shellPath: '/p2-f13-work-identity',
        shellBody: `<!doctype html>
<html><body>
<div id="settings-recommendation-v5"></div>
<script type="module" src="/work-identity-review.js"></script>
</body></html>`,
        statusPath:
            '/api/v1/recommendation-v5/work-identity/evidence/refresh/status',
        activeTask: {
            active: true,
            state: 'running',
            phase: 'scanning',
            done: 1,
            total: 10,
            candidateCount: 1,
            pairChecks: 2,
            canPause: true,
            canResume: false,
            canCancel: true
        },
        label: 'work-identity',
        foregroundDelayMs: 500
    })
})

test('V5 shadow polling slows while hidden and wakes immediately when visible', async ({
    page
}) => {
    await assertCadence({
        page,
        shellPath: '/p2-f13-v5-shadow',
        shellBody: `<!doctype html>
<html><body>
<div id="settings-recommendation-v5"></div>
<script type="module" src="/recommendation-v5-evaluation.js"></script>
</body></html>`,
        statusPath:
            '/api/v1/desktop/recommendation-v5/shadow-retrieval/status',
        activeTask: {
            active: true,
            state: 'running',
            phase: 'retrieve',
            done: 1,
            total: 10,
            retrievalDone: 1,
            retrievalTotal: 10,
            candidateCount: 1,
            canPause: true,
            canResume: false,
            canCancel: true
        },
        label: 'v5-shadow',
        foregroundDelayMs: 600
    })
})
