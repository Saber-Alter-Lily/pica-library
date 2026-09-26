import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import { spawnSync } from 'node:child_process'

function optionValue(name) {
    const prefix = `--${name}=`
    const inline = process.argv.slice(2).find((arg) => arg.startsWith(prefix))
    if (inline) return inline.slice(prefix.length)
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : undefined
}

function positiveInteger(value, fallback, name) {
    if (value === undefined) return fallback
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1)
        throw new Error(`${name} must be a positive integer`)
    return parsed
}

function parseOptions() {
    const rawBaseUrl = optionValue('base-url')
    const fixtureFile = optionValue('fixture')
    if (!rawBaseUrl) throw new Error('--base-url is required')
    if (!fixtureFile) throw new Error('--fixture is required')
    const base = new URL(rawBaseUrl)
    if (base.protocol !== 'http:')
        throw new Error('J5 accepts only loopback HTTP Desktop URLs')
    if (base.username || base.password)
        throw new Error('Credentials in J5 base URL are forbidden')
    const host = base.hostname.replace(/^\[|\]$/g, '')
    if (!['127.0.0.1', 'localhost', '::1'].includes(host))
        throw new Error('J5 accepts only loopback Desktop URLs')
    base.pathname = '/'
    base.search = ''
    base.hash = ''

    const fixture = JSON.parse(fs.readFileSync(path.resolve(fixtureFile), 'utf8'))
    for (const key of [
        'comicId',
        'comicTitle',
        'shelfId',
        'shelfName',
        'firstEpisodeTitle',
        'secondEpisodeTitle'
    ])
        if (typeof fixture[key] !== 'string' || !fixture[key])
            throw new Error(`J5 fixture is missing ${key}`)

    return {
        baseUrl: base.toString().replace(/\/$/, ''),
        fixture,
        rounds: positiveInteger(optionValue('rounds'), 5, 'rounds'),
        timeoutMs: positiveInteger(optionValue('timeout-ms'), 15_000, 'timeout-ms'),
        output:
            optionValue('output') ??
            path.join(
                'test-results',
                'desktop-browser-detail-reader',
                'desktop-browser-detail-reader-benchmark.json'
            ),
        harnessValidationOnly:
            process.argv.includes('--harness-validation-only') ||
            process.env.PICA_BENCHMARK_HARNESS_ONLY === '1'
    }
}

function playwright() {
    const toolRoot = process.env.PICA_PLAYWRIGHT_TOOL_ROOT
    if (!toolRoot)
        throw new Error(
            'PICA_PLAYWRIGHT_TOOL_ROOT is required; use the J5 runner so Playwright stays outside project dependencies'
        )
    const packageFile = path.join(toolRoot, 'package.json')
    if (!fs.existsSync(packageFile))
        throw new Error('Playwright tool root does not contain package.json')
    const require = createRequire(packageFile)
    return require('@playwright/test')
}

function commitSha() {
    const result = spawnSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
    })
    const value = result.status === 0 ? result.stdout.trim() : ''
    return /^[0-9a-f]{40}$/i.test(value) ? value : null
}

function round(value) {
    return Math.round(value * 100) / 100
}

function summary(values) {
    const sorted = [...values].sort((left, right) => left - right)
    const middle = Math.floor(sorted.length / 2)
    const median =
        sorted.length % 2 === 0
            ? (sorted[middle - 1] + sorted[middle]) / 2
            : sorted[middle]
    return {
        count: sorted.length,
        min: round(sorted[0]),
        median: round(median),
        max: round(sorted[sorted.length - 1])
    }
}

async function shellReady(page, timeoutMs) {
    await page.waitForFunction(
        () => {
            const home = document.querySelector('#home')
            const mode = document.querySelector('#mode')
            const nav = document.querySelector('nav.app-nav')
            const count = document.querySelector('#library-count')
            return (
                home instanceof HTMLElement &&
                home.classList.contains('active') &&
                mode instanceof HTMLElement &&
                !String(mode.textContent || '').includes('正在检测模式') &&
                nav instanceof HTMLElement &&
                !nav.hidden &&
                count instanceof HTMLElement &&
                String(count.textContent || '').trim().length > 0
            )
        },
        undefined,
        { timeout: timeoutMs }
    )
}

async function libraryReady(page, timeoutMs, comicId) {
    await page.waitForFunction(
        (id) => {
            const library = document.querySelector('#library')
            const filter = document.querySelector('#filter-text')
            const detail = document.querySelector(
                `[data-library-detail="${CSS.escape(id)}"]`
            )
            return (
                library instanceof HTMLElement &&
                library.classList.contains('active') &&
                filter instanceof HTMLInputElement &&
                !filter.disabled &&
                detail instanceof HTMLElement
            )
        },
        comicId,
        { timeout: timeoutMs }
    )
}

async function detailReady(page, timeoutMs, fixture) {
    await page.waitForFunction(
        ({ comicId, title }) => {
            const dialog = document.querySelector('#recommend-detail-dialog')
            const heading = document.querySelector('#recommend-detail-content h2')
            return (
                dialog instanceof HTMLDialogElement &&
                dialog.open &&
                dialog.dataset.comicId === comicId &&
                heading instanceof HTMLElement &&
                String(heading.textContent || '').trim() === title
            )
        },
        { comicId: fixture.comicId, title: fixture.comicTitle },
        { timeout: timeoutMs }
    )
}

async function shelfListReady(page, timeoutMs, fixture) {
    await page.waitForFunction(
        ({ shelfId, shelfName }) => {
            const section = document.querySelector('#shelves')
            const button = document.querySelector(
                `[data-shelf-open="${CSS.escape(shelfId)}"]`
            )
            return (
                section instanceof HTMLElement &&
                section.classList.contains('active') &&
                button instanceof HTMLButtonElement &&
                String(button.textContent || '').includes(shelfName)
            )
        },
        { shelfId: fixture.shelfId, shelfName: fixture.shelfName },
        { timeout: timeoutMs }
    )
}

async function shelfDetailReady(page, timeoutMs, fixture) {
    await page.waitForFunction(
        ({ shelfName, comicId }) => {
            const detail = document.querySelector('#shelf-detail')
            const heading = detail?.querySelector('h3')
            const read = detail?.querySelector(
                `[data-shelf-read="${CSS.escape(comicId)}"]`
            )
            return (
                detail instanceof HTMLElement &&
                heading instanceof HTMLElement &&
                String(heading.textContent || '').trim() === shelfName &&
                read instanceof HTMLButtonElement &&
                !read.disabled
            )
        },
        { shelfName: fixture.shelfName, comicId: fixture.comicId },
        { timeout: timeoutMs }
    )
}

async function readerReady(page, timeoutMs, fixture, episodeTitle) {
    await page.waitForFunction(
        ({ comicTitle, episodeTitle, expectedPages }) => {
            const reader = document.querySelector('#reader')
            const title = document.querySelector('#reader-title')
            const chapter = document.querySelector('#reader-chapter-title')
            const pages = [
                ...document.querySelectorAll('#reader-pages img[data-reader-page]')
            ]
            return (
                reader instanceof HTMLElement &&
                reader.classList.contains('active') &&
                title instanceof HTMLElement &&
                String(title.textContent || '').trim() === comicTitle &&
                chapter instanceof HTMLElement &&
                String(chapter.textContent || '').includes(episodeTitle) &&
                pages.length === expectedPages &&
                pages.every(
                    (image) =>
                        image instanceof HTMLImageElement &&
                        image.complete &&
                        image.naturalWidth > 0
                )
            )
        },
        {
            comicTitle: fixture.comicTitle,
            episodeTitle,
            expectedPages: Number(fixture.pageCountPerEpisode)
        },
        { timeout: timeoutMs }
    )
}

async function runRound(chromium, options, index) {
    const browser = await chromium.launch({ headless: true })
    try {
        const context = await browser.newContext({
            locale: 'zh-CN',
            viewport: { width: 1440, height: 1000 }
        })
        await context.addInitScript(() => {
            localStorage.setItem('pica-library-language', 'zh-CN')
            localStorage.setItem(
                'pica-library-disclaimer-v1',
                JSON.stringify({
                    version: '1',
                    acceptedAt: '2026-01-01T00:00:00.000Z'
                })
            )
            localStorage.setItem(
                'pica-onboarding-state-v1',
                JSON.stringify({
                    completedVersion: 1,
                    dismissedVersion: 0,
                    autoShow: true
                })
            )
            sessionStorage.removeItem('pica-onboarding-session-dismissed-v1')
        })
        const page = await context.newPage()
        const pageErrors = []
        page.on('pageerror', (error) => {
            pageErrors.push(String(error?.stack || error))
        })

        await page.goto(`${options.baseUrl}/`, {
            waitUntil: 'domcontentloaded',
            timeout: options.timeoutMs
        })
        await shellReady(page, options.timeoutMs)
        await page.locator('nav [data-view="library"]').click()
        await libraryReady(page, options.timeoutMs, options.fixture.comicId)

        const detailStarted = performance.now()
        await page
            .locator(`[data-library-detail="${options.fixture.comicId}"]`)
            .first()
            .click()
        await detailReady(page, options.timeoutMs, options.fixture)
        const detailReadyAt = performance.now()

        await page.locator('#recommend-detail-close').click()
        await page.waitForFunction(
            () => {
                const dialog = document.querySelector('#recommend-detail-dialog')
                return dialog instanceof HTMLDialogElement && !dialog.open
            },
            undefined,
            { timeout: options.timeoutMs }
        )

        const shelvesStarted = performance.now()
        await page.locator('nav [data-view="shelves"]').click()
        await shelfListReady(page, options.timeoutMs, options.fixture)
        const shelfListReadyAt = performance.now()

        const shelfOpenStarted = performance.now()
        await page
            .locator(`[data-shelf-open="${options.fixture.shelfId}"]`)
            .click()
        await shelfDetailReady(page, options.timeoutMs, options.fixture)
        const shelfDetailReadyAt = performance.now()

        const readerStarted = performance.now()
        await page
            .locator(`[data-shelf-read="${options.fixture.comicId}"]`)
            .click()
        await readerReady(
            page,
            options.timeoutMs,
            options.fixture,
            options.fixture.firstEpisodeTitle
        )
        const readerReadyAt = performance.now()

        const nextChapterStarted = performance.now()
        await page.locator('#reader-next-chapter').click()
        await readerReady(
            page,
            options.timeoutMs,
            options.fixture,
            options.fixture.secondEpisodeTitle
        )
        const nextChapterReadyAt = performance.now()

        if (pageErrors.length)
            throw new Error(
                `Web page error during J5 foreground journey: ${pageErrors.join(' | ')}`
            )

        const sample = {
            label: `foreground-round-${index + 1}`,
            libraryDetailClickToUsableMs: round(detailReadyAt - detailStarted),
            shelvesClickToListUsableMs: round(shelfListReadyAt - shelvesStarted),
            shelfOpenClickToUsableMs: round(
                shelfDetailReadyAt - shelfOpenStarted
            ),
            shelfReadClickToReaderUsableMs: round(readerReadyAt - readerStarted),
            readerNextChapterClickToUsableMs: round(
                nextChapterReadyAt - nextChapterStarted
            )
        }

        await context.close()
        return sample
    } finally {
        await browser.close()
    }
}

async function main() {
    const options = parseOptions()
    const { chromium } = playwright()
    const samples = []
    for (let index = 0; index < options.rounds; index++)
        samples.push(await runRound(chromium, options, index))

    const report = {
        schemaVersion: 1,
        benchmark: 'p2-j5-desktop-browser-detail-shelf-reader',
        measuredAt: new Date().toISOString(),
        commit: commitSha(),
        environment: {
            platform: process.platform,
            arch: process.arch,
            node: process.version,
            cpuModel: os.cpus()[0]?.model ?? null,
            logicalCpuCount: os.cpus().length,
            totalMemoryBytes: os.totalmem(),
            browser: 'chromium',
            browserVersion: await chromium
                .launch({ headless: true })
                .then(async (browser) => {
                    try {
                        return browser.version()
                    } finally {
                        await browser.close()
                    }
                })
        },
        protocol: {
            enginePrerequisite:
                'already-ready configured loopback Desktop engine with isolated local J5 fixture',
            language: 'zh-CN',
            viewport: { width: 1440, height: 1000 },
            rounds: options.rounds,
            timeoutMs: options.timeoutMs,
            browserProcessPerRound: true,
            providerSuccessRequired: false,
            fixturePreparedOutsideMeasurement: true,
            imageDecodeIncludedInReaderReadiness: true,
            browserLaunchIncludedInMeasurement: false,
            engineStartupIncludedInMeasurement: false,
            harnessValidationOnly: options.harnessValidationOnly
        },
        fixtureShape: {
            localComicCount: 3,
            shelfItemCount: 2,
            readerChapterCount: 2,
            pageCountPerEpisode: Number(options.fixture.pageCountPerEpisode)
        },
        samples,
        summary: {
            libraryDetailClickToUsableMs: summary(
                samples.map((sample) => sample.libraryDetailClickToUsableMs)
            ),
            shelvesClickToListUsableMs: summary(
                samples.map((sample) => sample.shelvesClickToListUsableMs)
            ),
            shelfOpenClickToUsableMs: summary(
                samples.map((sample) => sample.shelfOpenClickToUsableMs)
            ),
            shelfReadClickToReaderUsableMs: summary(
                samples.map((sample) => sample.shelfReadClickToReaderUsableMs)
            ),
            readerNextChapterClickToUsableMs: summary(
                samples.map((sample) => sample.readerNextChapterClickToUsableMs)
            )
        },
        warning:
            'This report is foreground browser-journey measurement evidence only. It does not define a P2-K performance budget or release threshold.'
    }

    const output = path.resolve(options.output)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
