import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { deflateSync, crc32 } from 'node:zlib'
import AdmZip from 'adm-zip'

function image(red, width = 1, height = 1) {
    const chunk = (type, body) => {
        const name = Buffer.from(type),
            out = Buffer.alloc(body.length + 12)
        out.writeUInt32BE(body.length)
        name.copy(out, 4)
        body.copy(out, 8)
        out.writeUInt32BE(crc32(Buffer.concat([name, body])), out.length - 4)
        return out
    }
    const header = Buffer.alloc(13)
    header.writeUInt32BE(width)
    header.writeUInt32BE(height, 4)
    header[8] = 8
    header[9] = 2
    const pixels = Buffer.alloc(height * (1 + width * 3))
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const at = y * (1 + width * 3) + 1 + x * 3
            pixels[at] = red
            pixels[at + 2] = 255 - red
        }
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(pixels)),
        chunk('IEND', Buffer.alloc(0))
    ])
}
let root, child, url, exited
test.beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-local-browser-'))
    fs.mkdirSync(path.join(root, 'original'))
    fs.writeFileSync(path.join(root, 'original', '1.png'), image(255))
    fs.writeFileSync(path.join(root, 'original', '2.png'), image(255))
    const zip = new AdmZip()
    zip.addFile('chapter/1.png', image(0))
    zip.writeZip(path.join(root, 'comic.cbz'))
    child = spawn(
        process.execPath,
        [
            'node_modules/tsx/dist/cli.mjs',
            'test/fixtures/local-import-server.ts',
            root
        ],
        {
            cwd: process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true
        }
    )
    exited = new Promise((resolve) => child.once('exit', resolve))
    const lines = createInterface({ input: child.stdout })
    let errors = ''
    child.stderr.on('data', (part) => {
        errors += part.toString()
    })
    url = await new Promise((resolve, reject) => {
        const timer = setTimeout(
            () =>
                reject(new Error('Local fixture startup timed out: ' + errors)),
            20000
        )
        lines.on('line', (line) => {
            try {
                const value = JSON.parse(line)
                if (value.url) {
                    clearTimeout(timer)
                    resolve(value.url)
                }
            } catch {}
        })
        child.once('exit', () => {
            clearTimeout(timer)
            reject(new Error('Local fixture exited: ' + errors))
        })
    })
})

test.afterAll(async () => {
    if (child?.exitCode === null) {
        child.stdin.write('close\n')
        await Promise.race([
            exited,
            new Promise((_, reject) =>
                setTimeout(
                    () =>
                        reject(
                            new Error(
                                'Owned fixture did not exit; retained ' + root
                            )
                        ),
                    10000
                )
            )
        ])
    }
    if (
        root &&
        path.dirname(fs.realpathSync(root)) === fs.realpathSync(os.tmpdir()) &&
        path.basename(root).startsWith('pica-local-browser-')
    )
        fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 })
})

test('real browser imports folder/CBZ, confirms before copying, reads and refreshes the same cover URL', async ({
    page
}) => {
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.addInitScript(() =>
        localStorage.setItem(
            'pica-onboarding-state-v1',
            JSON.stringify({
                completedVersion: 2,
                dismissedVersion: 0,
                autoShow: true
            })
        )
    )
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    if (await page.locator('#pica-disclaimer-gate').isVisible()) {
        await page.locator('#pica-disclaimer-check').check()
        await page.locator('#pica-disclaimer-accept').click()
    }
    await page.locator('nav [data-view="library"]').click()
    await expect(page.locator('#local-comic-import')).toBeVisible()
    await page.locator('[data-local-kind="folder"]').click()
    await expect(page.locator('#local-import-preview')).toBeVisible()
    expect(fs.existsSync(path.join(root, 'data', 'local-library'))).toBe(false)
    await page.locator('#local-import-preview .primary').click()
    await expect(page.locator('[data-local-status]')).toContainText(/2/)
    const localRecord = await page.request
        .get(url + '/api/v1/comics?limit=100')
        .then((r) => r.json())
    const id = encodeURIComponent(localRecord[0].comicId)
    const cover = url + '/api/v1/covers/' + id
    const first = await page.evaluate(async (target) => {
        const response = await fetch(target)
        return {
            bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
            cache: response.headers.get('cache-control')
        }
    }, cover)
    expect(first.cache).toBe('private, no-store')
    await page.locator('[data-local-status] button').click()
    await expect(page.locator('#reader')).toHaveClass(/active/)
    await expect(page.locator('[data-reader-page]').first()).toBeVisible()
    await expect
        .poll(() =>
            page
                .locator('[data-reader-page]')
                .first()
                .evaluate((img) => img.naturalWidth)
        )
        .toBe(1)
    await page.keyboard.press('Escape')
    fs.writeFileSync(path.join(root, 'original', '1.png'), image(0))
    await page.locator('nav [data-view="library"]').click()
    await page.locator('[data-local-kind="folder"]').click()
    await page.locator('#local-import-preview .primary').click()
    await expect(page.locator('#local-import-preview')).not.toBeVisible()
    const second = await page.evaluate(
        async (target) =>
            Array.from(
                new Uint8Array(await fetch(target).then((r) => r.arrayBuffer()))
            ),
        cover
    )
    expect(second).not.toEqual(first.bytes) // Default browser cache, identical URL, actual HTTP backend.
    await page.locator('[data-local-kind="cbz"]').click()
    await page.locator('#local-import-preview .primary').click()
    await expect(page.locator('[data-local-status]')).toContainText(/1/)
    await page.reload()
    if (await page.locator('#pica-disclaimer-gate').isVisible()) {
        await page.locator('#pica-disclaimer-check').check()
        await page.locator('#pica-disclaimer-accept').click()
    }
    await page.locator('nav [data-view="library"]').click()
    await expect(page.locator('#comic-grid h3')).toHaveCount(2)
    expect(pageErrors).toEqual([])
})

test('cold continuous resume centers the saved page after an earlier image loads late without regressing progress', async ({
    page
}, testInfo) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    for (let index = 1; index <= 5; index++)
        fs.writeFileSync(
            path.join(root, 'original', index + '.png'),
            image(index * 30, 720, index === 1 ? 720 : 1080)
        )
    await page.addInitScript(() => {
        localStorage.setItem('pica-library-language', 'en')
        localStorage.setItem(
            'pica-onboarding-state-v1',
            JSON.stringify({ completedVersion: 2, autoShow: false })
        )
        localStorage.setItem(
            'pica-reader-settings-v1',
            JSON.stringify({
                schemaVersion: 1,
                mode: 'vertical',
                direction: 'ltr',
                fit: 'width'
            })
        )
    })
    await page.setViewportSize({ width: 1200, height: 900 })
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    if (await page.locator('#pica-disclaimer-gate').isVisible()) {
        await page.locator('#pica-disclaimer-check').check()
        await page.locator('#pica-disclaimer-accept').click()
    }
    await page.locator('nav [data-view="library"]').click()
    await page.locator('[data-local-kind="folder"]').click()
    await page.locator('#local-import-preview .primary').click()
    await expect(page.locator('#local-import-preview')).not.toBeVisible()
    const records = await page.request
        .get(url + '/api/v1/comics?limit=100')
        .then((r) => r.json())
    const book = records.find((row) => row.title === 'original')
    expect(book).toBeTruthy()
    const comic = encodeURIComponent(book.comicId)
    const chapters = await page.request
        .get(url + '/api/v1/reader/comics/' + comic + '/chapters')
        .then((r) => r.json())
    const chapter = await page.request
        .get(
            url +
                '/api/v1/reader/comics/' +
                comic +
                '/chapters/' +
                encodeURIComponent(chapters[0].id)
        )
        .then((r) => r.json())
    expect(chapter.pages).toHaveLength(5)
    const progress = await page.request.post(url + '/api/v1/reader/progress', {
        headers: {
            Origin: url,
            'x-pica-csrf': 'synthetic-local-import-browser'
        },
        data: { comicId: book.comicId, episodeId: chapters[0].id, pageIndex: 2 }
    })
    expect(progress.ok()).toBe(true)
    let release,
        held = false
    const barrier = new Promise((resolve) => {
        release = resolve
    })
    await page.route('**/api/v1/reader/pictures/**', async (route) => {
        try {
            const response = await route.fetch()
            if (route.request().url() === url + chapter.pages[0].url) {
                held = true
                await barrier
            }
            await route.fulfill({
                response,
                headers: { ...response.headers(), 'cache-control': 'no-store' }
            })
        } catch (error) {
            if (!page.isClosed()) throw error
        }
    })
    const centeredPage = () =>
        page.evaluate(() => {
            const box = document
                .querySelector('#reader-pages')
                .getBoundingClientRect()
            return (
                document
                    .elementFromPoint(box.left + box.width / 2, innerHeight / 2)
                    ?.closest('[data-reader-page]')?.dataset.readerPage ?? null
            )
        })
    const centerError = () =>
        page.locator('[data-reader-page="2"]').evaluate((img) => {
            const rect = img.getBoundingClientRect()
            return Math.abs(rect.top + rect.height / 2 - innerHeight / 2)
        })
    try {
        await page.locator('[data-local-status] button').click()
        await expect(page.locator('#reader')).toHaveClass(/active/)
        // Force only the preceding synthetic page into the controlled late-load
        // path; do not scroll/repair the app's saved-page positioning in the test.
        await page.locator('[data-reader-page="0"]').evaluate((img) => {
            img.loading = 'eager'
        })
        await expect.poll(() => held).toBe(true)
        await expect
            .poll(() =>
                page
                    .locator('[data-reader-page="2"]')
                    .evaluate((img) => img.complete && img.naturalWidth === 720)
            )
            .toBe(true)
        await expect.poll(centeredPage).toBe('2')
        await expect.poll(centerError).toBeLessThan(24)
        release()
        await expect
            .poll(() =>
                page
                    .locator('[data-reader-page="0"]')
                    .evaluate((img) => img.complete && img.naturalWidth === 720)
            )
            .toBe(true)
        await expect.poll(centeredPage).toBe('2')
        await expect.poll(centerError).toBeLessThan(24)
        const screenshotPath = testInfo.outputPath('cold-continuous-saved-page.png')
        await page.screenshot({ path: screenshotPath })
        await testInfo.attach('cold-continuous-saved-page.png', {
            path: screenshotPath,
            contentType: 'image/png'
        })
        await page.locator('#reader-exit').click()
        const saved = await page.request
            .get(url + '/api/v1/reader/progress')
            .then((r) => r.json())
        expect(
            saved.find(
                (row) =>
                    row.comicId === book.comicId &&
                    row.episodeId === chapters[0].id
            ).pageIndex
        ).toBe(2)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(page.locator('#mode')).toHaveText('Connected')
        await page.locator('nav [data-view="library"]').click()
        const card = page
            .locator('#comic-grid > article, #comic-grid > div')
            .filter({
                has: page.getByRole('heading', {
                    name: 'original',
                    exact: true
                })
            })
        await card.getByRole('button', { name: 'Read', exact: true }).click()
        await expect(page.locator('#reader')).toHaveClass(/active/)
        await expect.poll(centeredPage).toBe('2')
        await expect.poll(centerError).toBeLessThan(24)
        expect(errors).toEqual([])
    } finally {
        release()
    }
})
