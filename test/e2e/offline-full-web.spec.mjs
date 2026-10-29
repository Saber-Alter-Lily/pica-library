import { spawn } from 'node:child_process'
import { test, expect } from '@playwright/test'

let helper
let url
let comicId
const finishHelper = async () => {
    if (!helper || helper.exitCode !== null) return
    await new Promise(resolve => {
        const t = setTimeout(() => {
            helper.kill('SIGKILL')
            resolve()
        }, 10_000)
        helper.once('exit', () => { clearTimeout(t); resolve() })
        helper.kill('SIGTERM')
    })
}
test.beforeAll(async () => {
    helper = spawn('pnpm', [
        'exec', 'tsx', 'scripts/qa-offline-browser-harness.ts'
    ], {
        cwd: process.cwd(),
        env: { ...process.env, PICA_QA_FULL_WEB: '1' },
        stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    helper.stderr.on('data', chunk => { stderr += String(chunk).slice(0, 2000) })
    const result = await new Promise((resolve, reject) => {
        let data = '', done = false
        const timer = setTimeout(() => finish(
            new Error('Original full Web core launch timed out: ' + stderr)
        ), 60_000)
        const finish = (error, value) => {
            if (done) return
            done = true
            clearTimeout(timer)
            error ? reject(error) : resolve(value)
        }
        helper.stdout.on('data', chunk => {
            data += String(chunk)
            for (;;) {
                const pos = data.indexOf('\n')
                if (pos === -1) break
                const line = data.slice(0, pos)
                data = data.slice(pos + 1)
                try {
                    const status = JSON.parse(line)
                    if (status.status === 'QA_FULL_BROWSER_HARNESS' &&
                        /^http:\/\/127\.0\.0\.1:\d+\/qa\/[a-f0-9]{64}$/.test(status.url) &&
                        /^local:[a-f0-9]{64}$/.test(status.comicId))
                        return finish(null, status)
                } catch {
                    // A package-manager notice is not a browser readiness signal.
                }
            }
        })
        helper.once('error', finish)
        helper.once('exit', code =>
            finish(new Error('Original full Web core process ended ' + code + ': ' + stderr)))
    })
    url = result.url
    comicId = result.comicId
})
test.afterAll(finishHelper)

test('real Chromium loads ORIGINAL home/library/shelves/Reader/settings in owned full-Web core mode', async ({ page }) => {
    const errors = []
    const forbidden = []
    const requests = []
    page.on('pageerror', error => errors.push(String(error)))
    page.on('request', request => {
        const address = new URL(request.url())
        requests.push(address.pathname)
        if (address.protocol !== 'http:' ||
            address.hostname !== '127.0.0.1')
            forbidden.push(request.url())
    })
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
    expect(response.ok()).toBe(true)
    expect(new URL(page.url()).pathname).toBe('/')
    await expect(page.locator('#mode')).toContainText(
        /Connected|已连接|接続済み/, { timeout: 20_000 }
    )
    await expect(page.locator('#settings-nav')).toBeVisible()
    expect(requests).toContain('/app.js')
    expect(requests).toContain('/api/v1/status')
    expect(requests).toContain('/api/v1/capabilities')
    expect(requests).not.toContain('/api/v1/recommendation-sessions/status')
    expect(requests).not.toContain('/api/v1/visual/prepare')
    await page.locator('nav button[data-view="library"]').click()
    await expect(page.locator('#library')).toBeVisible()
    await expect(page.locator('#comic-grid')).toContainText(
        'original-pages', { timeout: 20_000 }
    )
    await page.locator('#filter-text').fill('no-matching-local-comic')
    await page.locator('#apply-filter').click()
    await expect(page.locator('#comic-grid')).not.toContainText('original-pages')
    await page.locator('#filter-text').fill('original-pages')
    await page.locator('#apply-filter').click()
    await expect(page.locator('#comic-grid')).toContainText('original-pages')
    await page.locator('nav button[data-view="shelves"]').click()
    await expect(page.locator('#shelves')).toBeVisible()
    await page.locator('#shelf-create').click()
    await expect(page.locator('#app-prompt-dialog')).toBeVisible()
    await page.locator('#app-prompt-input').fill('Owned Full Web Shelf')
    await page.locator('#app-prompt-submit').click()
    await expect(page.locator('#shelf-list')).toContainText(
        'Owned Full Web Shelf', { timeout: 15_000 }
    )
    await page.locator('nav button[data-view="downloaded"]').click()
    await expect(page.locator('#downloaded')).toBeVisible()
    await expect(page.locator('#downloaded-grid-items')).toContainText(
        'original-pages', { timeout: 15_000 }
    )
    await page.locator('#downloaded [data-read-comic]').first().click()
    await expect(page.locator('#reader')).toBeVisible()
    await expect(page.locator('#reader-title')).toContainText('original-pages')
    await expect(page.locator('#reader-pages img').first()).toBeVisible()
    await page.locator('#reader-exit').click()
    await page.locator('#settings-nav').click()
    await expect(page.locator('#settings')).toBeVisible()
    await expect(page.locator('#settings-remote-storage')).toBeAttached()
    const caps = await page.evaluate(async () =>
        (await (await fetch('/api/v1/capabilities')).json()).features
    )
    expect(caps.recommendationSessions).toBe(false)
    expect(caps.providerFavoriteMutation).toBe(false)
    expect(caps.shelves).toBe(true)
    const visible = await page.evaluate(() =>
        document.querySelector('#comic-grid')?.querySelectorAll('.comic-card').length)
    expect(visible).toBeGreaterThan(0)
    expect(forbidden).toEqual([])
    expect(errors).toEqual([])
    expect(comicId).toMatch(/^local:[a-f0-9]{64}$/)
})
