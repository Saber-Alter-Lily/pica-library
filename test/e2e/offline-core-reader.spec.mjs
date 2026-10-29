import { spawn } from 'node:child_process'
import { test, expect } from '@playwright/test'

let helper
let url

test.beforeAll(async () => {
    const binary = 'pnpm'
    helper = spawn(binary,
        ['exec', 'tsx', 'scripts/qa-offline-browser-harness.ts'], {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe']
        })
    let stderr = ''
    helper.stderr.on('data', chunk => {
        stderr += String(chunk).slice(0, 1500)
    })
    url = await new Promise((resolve, reject) => {
        let pending = '', completed = false
        const timeout = setTimeout(() =>
            finish(new Error('Offline Reader browser harness timed out: ' + stderr)),
        45_000)
        function finish(error, result) {
            if (completed) return
            completed = true
            clearTimeout(timeout)
            if (error) reject(error)
            else resolve(result)
        }
        helper.stdout.on('data', chunk => {
            pending += String(chunk)
            for (;;) {
                const at = pending.indexOf('\n')
                if (at < 0) return
                const line = pending.slice(0, at)
                pending = pending.slice(at + 1)
                try {
                    const value = JSON.parse(line)
                    if (value.status === 'QA_BROWSER_HARNESS' &&
                        /^http:\/\/127\.0\.0\.1:\d+\/qa\/[a-f0-9]{64}$/.test(value.url))
                        return finish(null, value.url)
                } catch {
                    // A tool's stdout notice is not a browser-ready signal.
                }
            }
        })
        helper.once('error', finish)
        helper.once('exit', code =>
            finish(new Error('QA browser harness exited ' + code + ': ' + stderr)))
    })
})

test.afterAll(async () => {
    if (!helper || helper.exitCode !== null) return
    await new Promise(resolve => {
        const timeout = setTimeout(() => {
            helper.kill('SIGKILL')
            resolve()
        }, 8_000)
        helper.once('exit', () => {
            clearTimeout(timeout)
            resolve()
        })
        helper.kill('SIGTERM')
    })
})

test('real Chromium opens the existing Reader controls, renders owned pages and restores progress', async ({ page }) => {
    const pageErrors = []
    const forbidden = []
    page.on('pageerror', error => pageErrors.push(String(error)))
    page.on('request', request => {
        const address = new URL(request.url())
        if (address.protocol !== 'http:' || address.hostname !== '127.0.0.1')
            forbidden.push(request.url())
    })
    await page.goto(url, { waitUntil: 'networkidle' })
    await expect(page.locator('#qa-book option')).toHaveCount(1)
    await expect(page.locator('#qa-open')).toBeEnabled()
    await expect(page.locator('#reader')).toBeHidden()
    await page.locator('#qa-open').click()
    await expect(page.locator('#reader')).toBeVisible()
    await expect(page.locator('#reader-title')).toContainText('original-pages')
    await expect(page.locator('#reader-pages img')).toHaveCount(2)
    await expect(page.locator('#reader-export-cbz')).toBeHidden()
    const first = page.locator('#reader-pages img').first()
    await expect.poll(() => first.evaluate(
        image => image.complete && image.naturalWidth > 0
    )).toBe(true)
    await page.locator('#reader-mode').selectOption('single')
    await expect(page.locator('#reader-pages img')).toHaveCount(1)
    await page.locator('#reader-pages img').click()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('#reader-pages img[data-reader-page="1"]'))
        .toBeVisible()
    await expect.poll(async () => {
        const entries = await page.evaluate(async () =>
            (await (await fetch('/api/v1/reader/progress')).json()))
        return entries[0]?.pageIndex
    }, { timeout: 10_000 }).toBe(1)
    expect(forbidden).toEqual([])
    expect(pageErrors).toEqual([])

    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.locator('#reader-mode')).toHaveValue('single')
    await page.locator('#qa-open').click()
    await expect(page.locator('#reader-pages img[data-reader-page="1"]'))
        .toBeVisible()
    await page.locator('#reader-exit').click()
    await expect(page.locator('#qa-library')).toBeVisible()
    await expect(page.locator('#reader')).toBeHidden()
    expect(pageErrors).toEqual([])
})
