import { expect, test } from '@playwright/test'

// Real Chromium executes the shipped module. Only network readiness is staged;
// this is not a claim about a physical Windows upgrade or a user's database.
async function shell(page) {
    await page.route('**/reconnect-fixture', (route) =>
        route.fulfill({
            contentType: 'text/html',
            body: '<!doctype html><html><body>Reconnect regression</body></html>'
        })
    )
    await page.goto('/reconnect-fixture')
}

test('reconnect waits through startup 503 and resets after transient shell failure', async ({
    page
}) => {
    let capabilities = 0
    let shells = 0
    let stableSince = 0
    const shellQueries = []
    await page.route('**/api/v1/capabilities', (route) => {
        capabilities++
        return route.fulfill({
            status: capabilities < 3 ? 503 : 200,
            contentType: 'application/json',
            body: JSON.stringify(
                capabilities < 3
                    ? { startupReady: false }
                    : { appVersion: '0.5.0-postrc.0123456789ab' }
            )
        })
    })
    await page.route('**/?pica-update-ready=*', (route) => {
        shells++
        shellQueries.push(
            new URL(route.request().url()).searchParams.get('pica-update-ready')
        )
        if (shells === 7) stableSince = Date.now()
        return route.fulfill({
            status: shells === 6 ? 503 : 200,
            contentType: 'text/html',
            body: '<!doctype html><html><body>Ready</body></html>'
        })
    })
    await shell(page)
    const ready = await page.evaluate(async () => {
        const { waitForUpdateReconnect } = await import('/update-reconnect.js')
        return waitForUpdateReconnect('0.5.0-postrc.0123456789ab', {
            timeoutMs: 8000,
            pollMs: 100
        })
    })
    expect(ready).toBe(true)
    expect(stableSince).toBeGreaterThan(0)
    expect(Date.now() - stableSince).toBeGreaterThanOrEqual(1500)
    expect(new Set(shellQueries).size).toBe(shellQueries.length)
})

for (const failure of ['wrong-version', 'non-html-shell', 'network-loss']) {
    test(`reconnect returns failure without reloading on ${failure}`, async ({
        page
    }) => {
        await page.route('**/api/v1/capabilities', (route) =>
            failure === 'network-loss'
                ? route.abort('connectionrefused')
                : route.fulfill({
                      contentType: 'application/json',
                      body: JSON.stringify({
                          appVersion:
                              failure === 'wrong-version'
                                  ? '0.4.11'
                                  : '0.5.0-postrc.0123456789ab'
                      })
                  })
        )
        await page.route('**/?pica-update-ready=*', (route) =>
            route.fulfill({
                contentType: 'text/html',
                body:
                    failure === 'non-html-shell'
                        ? 'proxy unavailable'
                        : '<!doctype html><html></html>'
            })
        )
        await shell(page)
        const ready = await page.evaluate(async () => {
            const { waitForUpdateReconnect } = await import(
                '/update-reconnect.js'
            )
            return waitForUpdateReconnect('0.5.0-postrc.0123456789ab', {
                timeoutMs: 600,
                pollMs: 50
            })
        })
        expect(ready).toBe(false)
        await expect(page).toHaveURL(/\/reconnect-fixture$/)
    })
}
