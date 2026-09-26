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
        throw new Error('J6 accepts only loopback HTTP Desktop URLs')
    if (base.username || base.password)
        throw new Error('Credentials in J6 base URL are forbidden')
    const host = base.hostname.replace(/^\[|\]$/g, '')
    if (!['127.0.0.1', 'localhost', '::1'].includes(host))
        throw new Error('J6 accepts only loopback Desktop URLs')
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
            throw new Error(`J6 fixture is missing ${key}`)

    const cycles = positiveInteger(optionValue('rounds'), 40, 'rounds')
    return {
        baseUrl: base.toString().replace(/\/$/, ''),
        fixture,
        cycles,
        timeoutMs: positiveInteger(optionValue('timeout-ms'), 15_000, 'timeout-ms'),
        sampleEvery: Math.max(1, Math.floor(cycles / 8)),
        output:
            optionValue('output') ??
            path.join(
                'test-results',
                'desktop-reader-long-session',
                'desktop-reader-long-session-benchmark.json'
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
            'PICA_PLAYWRIGHT_TOOL_ROOT is required; use the shared J5/J6 runner so Playwright stays outside project dependencies'
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

function percentile(values, fraction) {
    const sorted = [...values].sort((left, right) => left - right)
    if (!sorted.length) return null
    const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(sorted.length * fraction) - 1)
    )
    return round(sorted[index])
}

function summary(values) {
    if (!values.length)
        return { count: 0, min: null, median: null, p95: null, max: null }
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
        p95: percentile(sorted, 0.95),
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

async function collectMemorySample(cdp, cycle, chapter) {
    await cdp.send('HeapProfiler.collectGarbage')
    const [heap, dom, metrics] = await Promise.all([
        cdp.send('Runtime.getHeapUsage'),
        cdp.send('Memory.getDOMCounters'),
        cdp.send('Performance.getMetrics')
    ])
    const performanceMetrics = Object.fromEntries(
        (metrics.metrics ?? []).map((metric) => [metric.name, metric.value])
    )
    return {
        cycle,
        chapter,
        jsHeapUsedBytes: Math.round(Number(heap.usedSize ?? 0)),
        jsHeapTotalBytes: Math.round(Number(heap.totalSize ?? 0)),
        embedderHeapUsedBytes: Math.round(Number(heap.embedderHeapUsedSize ?? 0)),
        backingStorageBytes: Math.round(Number(heap.backingStorageSize ?? 0)),
        documents: Number(dom.documents ?? 0),
        nodes: Number(dom.nodes ?? 0),
        jsEventListeners: Number(dom.jsEventListeners ?? 0),
        layoutCount: Number(performanceMetrics.LayoutCount ?? 0),
        recalcStyleCount: Number(performanceMetrics.RecalcStyleCount ?? 0)
    }
}

async function measureScrollRaf(page, durationMs = 850) {
    const intervals = await page.evaluate(async (duration) => {
        const root = document.scrollingElement || document.documentElement
        const maxScroll = Math.max(0, root.scrollHeight - window.innerHeight)
        window.scrollTo(0, 0)
        return await new Promise((resolve) => {
            const values = []
            const started = performance.now()
            let previous = started
            const frame = (now) => {
                values.push(now - previous)
                previous = now
                const elapsed = now - started
                const wave = (Math.sin((elapsed / duration) * Math.PI * 2) + 1) / 2
                window.scrollTo(0, maxScroll * wave)
                if (elapsed >= duration) {
                    window.scrollTo(0, 0)
                    resolve(values.slice(1))
                    return
                }
                requestAnimationFrame(frame)
            }
            requestAnimationFrame(frame)
        })
    }, durationMs)

    const numeric = intervals
        .map(Number)
        .filter((value) => Number.isFinite(value) && value >= 0)
    return {
        intervalMs: summary(numeric),
        intervalsOver34Ms: numeric.filter((value) => value > 34).length,
        sampleCount: numeric.length
    }
}

async function openReader(page, options) {
    await page.goto(`${options.baseUrl}/`, {
        waitUntil: 'domcontentloaded',
        timeout: options.timeoutMs
    })
    await shellReady(page, options.timeoutMs)
    await page.locator('nav [data-view="shelves"]').click()
    await shelfListReady(page, options.timeoutMs, options.fixture)
    await page
        .locator(`[data-shelf-open="${options.fixture.shelfId}"]`)
        .click()
    await shelfDetailReady(page, options.timeoutMs, options.fixture)
    await page
        .locator(`[data-shelf-read="${options.fixture.comicId}"]`)
        .click()
    await readerReady(
        page,
        options.timeoutMs,
        options.fixture,
        options.fixture.firstEpisodeTitle
    )
}

async function runSession(chromium, options) {
    const browser = await chromium.launch({ headless: true })
    const browserVersion = browser.version()
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

        await openReader(page, options)
        const cdp = await context.newCDPSession(page)
        await Promise.all([
            cdp.send('Runtime.enable'),
            cdp.send('Performance.enable'),
            cdp.send('HeapProfiler.enable')
        ])

        const memorySamples = [
            await collectMemorySample(cdp, 0, 'first')
        ]
        const chapterSwitchMs = []
        const scrollSamples = []
        let current = 'first'

        for (let cycle = 1; cycle <= options.cycles; cycle++) {
            const next = current === 'first' ? 'second' : 'first'
            const button =
                next === 'second' ? '#reader-next-chapter' : '#reader-prev-chapter'
            const title =
                next === 'second'
                    ? options.fixture.secondEpisodeTitle
                    : options.fixture.firstEpisodeTitle

            const started = performance.now()
            await page.locator(button).click()
            await readerReady(page, options.timeoutMs, options.fixture, title)
            chapterSwitchMs.push(round(performance.now() - started))
            current = next

            scrollSamples.push({
                cycle,
                chapter: current,
                ...(await measureScrollRaf(page))
            })

            if (
                cycle % options.sampleEvery === 0 ||
                cycle === options.cycles
            )
                memorySamples.push(
                    await collectMemorySample(cdp, cycle, current)
                )
        }

        if (pageErrors.length)
            throw new Error(
                `Web page error during J6 Reader long session: ${pageErrors.join(' | ')}`
            )

        const first = memorySamples[0]
        const last = memorySamples[memorySamples.length - 1]
        const maxHeap = Math.max(
            ...memorySamples.map((sample) => sample.jsHeapUsedBytes)
        )
        const maxNodes = Math.max(
            ...memorySamples.map((sample) => sample.nodes)
        )
        const rafIntervals = scrollSamples.flatMap((sample) => {
            const value = sample.intervalMs
            return [
                value.min,
                value.median,
                value.p95,
                value.max
            ].filter((item) => typeof item === 'number')
        })

        const result = {
            browserVersion,
            memorySamples,
            chapterSwitchMs,
            scrollSamples,
            retention: {
                jsHeapUsedDeltaBytes:
                    last.jsHeapUsedBytes - first.jsHeapUsedBytes,
                embedderHeapUsedDeltaBytes:
                    last.embedderHeapUsedBytes - first.embedderHeapUsedBytes,
                backingStorageDeltaBytes:
                    last.backingStorageBytes - first.backingStorageBytes,
                documentDelta: last.documents - first.documents,
                nodeDelta: last.nodes - first.nodes,
                listenerDelta:
                    last.jsEventListeners - first.jsEventListeners,
                peakJsHeapUsedBytes: maxHeap,
                peakNodes: maxNodes
            },
            summary: {
                chapterSwitchToUsableMs: summary(chapterSwitchMs),
                observedScrollRafIntervalsMs: summary(rafIntervals),
                totalIntervalsOver34Ms: scrollSamples.reduce(
                    (sum, sample) => sum + sample.intervalsOver34Ms,
                    0
                )
            }
        }

        await cdp.detach()
        await context.close()
        return result
    } finally {
        await browser.close()
    }
}

async function main() {
    const options = parseOptions()
    const { chromium } = playwright()
    const session = await runSession(chromium, options)

    const report = {
        schemaVersion: 1,
        benchmark: 'p2-j6-desktop-reader-long-session',
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
            browserVersion: session.browserVersion
        },
        protocol: {
            enginePrerequisite:
                'already-ready configured loopback Desktop engine with isolated local J5 fixture',
            language: 'zh-CN',
            viewport: { width: 1440, height: 1000 },
            chapterSwitchCycles: options.cycles,
            memorySampleEveryCycles: options.sampleEvery,
            timeoutMs: options.timeoutMs,
            providerSuccessRequired: false,
            fixturePreparedOutsideMeasurement: true,
            browserProcessPerSession: true,
            forcedGcBeforeMemorySamples: true,
            memoryScope:
                'Chromium Runtime/DOM counters only; not full browser-process RSS',
            scrollCadenceScope:
                'requestAnimationFrame interval observation during controlled Reader scrolling; not compositor frame telemetry',
            harnessValidationOnly: options.harnessValidationOnly
        },
        fixtureShape: {
            localComicCount: 3,
            shelfItemCount: 2,
            readerChapterCount: 2,
            pageCountPerEpisode: Number(options.fixture.pageCountPerEpisode)
        },
        samples: {
            memory: session.memorySamples,
            chapterSwitchMs: session.chapterSwitchMs,
            scroll: session.scrollSamples
        },
        retention: session.retention,
        summary: session.summary,
        warning:
            'This report detects Reader-session heap/DOM retention and interaction degradation signals. It is not full-process RSS, does not define a P2-K budget, and hosted-runner timing is harness validation only.'
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
