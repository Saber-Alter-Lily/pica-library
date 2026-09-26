import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import { spawnSync } from 'node:child_process'

function arg(name) {
    const prefix = `--${name}=`
    const inline = process.argv.slice(2).find((value) => value.startsWith(prefix))
    if (inline) return inline.slice(prefix.length)
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : undefined
}

function integer(name, fallback) {
    const value = arg(name)
    if (value === undefined) return fallback
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1)
        throw new Error(`--${name} must be a positive integer`)
    return parsed
}

function options() {
    const raw = arg('base-url')
    const fixtureFile = arg('fixture')
    if (!raw || !fixtureFile)
        throw new Error('--base-url and --fixture are required')
    const url = new URL(raw)
    const host = url.hostname.replace(/^\[|\]$/g, '')
    if (
        url.protocol !== 'http:' ||
        url.username ||
        url.password ||
        !['127.0.0.1', 'localhost', '::1'].includes(host)
    )
        throw new Error(
            'J10 accepts only credential-free loopback Desktop URLs'
        )
    const fixture = JSON.parse(
        fs.readFileSync(path.resolve(fixtureFile), 'utf8')
    )
    if (typeof fixture.comicId !== 'string' || !fixture.comicId)
        throw new Error('J10 fixture is missing comicId')
    return {
        baseUrl: url.toString().replace(/\/$/, ''),
        fixture,
        warmRepeats: integer('rounds', 5),
        timeoutMs: integer('timeout-ms', 180_000),
        output:
            arg('output') ||
            'test-results/desktop-visual-index/desktop-visual-index-benchmark.json',
        allowModelNetwork:
            process.argv.includes('--allow-model-network') ||
            process.env.PICA_VISUAL_BENCHMARK_ALLOW_MODEL_NETWORK === '1'
    }
}

function playwright() {
    const root = process.env.PICA_PLAYWRIGHT_TOOL_ROOT
    if (!root) throw new Error('PICA_PLAYWRIGHT_TOOL_ROOT is required')
    return createRequire(path.join(root, 'package.json'))('@playwright/test')
}

function gitSha() {
    const run = spawnSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
    })
    const value = run.status === 0 ? run.stdout.trim() : ''
    return /^[0-9a-f]{40}$/i.test(value) ? value : null
}

function rounded(value) {
    return Math.round(Number(value) * 100) / 100
}

function summary(values) {
    const data = values
        .map(Number)
        .filter((value) => Number.isFinite(value) && value >= 0)
        .sort((left, right) => left - right)
    if (!data.length)
        return { count: 0, min: null, median: null, p95: null, max: null }
    const middle = Math.floor(data.length / 2)
    const median =
        data.length % 2
            ? data[middle]
            : (data[middle - 1] + data[middle]) / 2
    return {
        count: data.length,
        min: rounded(data[0]),
        median: rounded(median),
        p95: rounded(
            data[Math.min(data.length - 1, Math.ceil(data.length * 0.95) - 1)]
        ),
        max: rounded(data[data.length - 1])
    }
}

async function waitShell(page, timeoutMs) {
    await page.waitForFunction(
        () => {
            const mode = document.querySelector('#mode')
            const nav = document.querySelector('nav.app-nav')
            const count = document.querySelector('#library-count')
            return (
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

async function waitLibrary(page, timeoutMs) {
    await page.waitForFunction(
        () => {
            const view = document.querySelector('#library')
            const count = document.querySelector('#library-count')
            const search = document.querySelector('#library-search')
            return (
                view instanceof HTMLElement &&
                view.classList.contains('active') &&
                count instanceof HTMLElement &&
                String(count.textContent || '').trim().length > 0 &&
                search instanceof HTMLInputElement &&
                !search.disabled
            )
        },
        undefined,
        { timeout: timeoutMs }
    )
}

async function waitSettings(page, timeoutMs) {
    await page.waitForFunction(
        () => {
            const view = document.querySelector('#settings')
            const build = document.querySelector('#visual-index-build')
            const status = document.querySelector('#visual-index-status')
            return (
                view instanceof HTMLElement &&
                view.classList.contains('active') &&
                build instanceof HTMLButtonElement &&
                status instanceof HTMLElement &&
                String(status.textContent || '').trim().length > 0
            )
        },
        undefined,
        { timeout: timeoutMs }
    )
}

async function sampleRaf(page, durationMs = 500) {
    return await page.evaluate(
        (duration) =>
            new Promise((resolve) => {
                const values = []
                const started = performance.now()
                let previous = started
                const frame = (now) => {
                    if (previous !== started) values.push(now - previous)
                    previous = now
                    if (now - started >= duration) resolve(values)
                    else requestAnimationFrame(frame)
                }
                requestAnimationFrame(frame)
            }),
        durationMs
    )
}

async function visualStatus(page) {
    return await page.evaluate(async () => {
        const response = await fetch('/api/v1/visual/status')
        if (!response.ok)
            throw new Error(`visual status failed: HTTP ${response.status}`)
        return await response.json()
    })
}

async function waitFixtureIndexed(page, comicId, indexedBefore, timeoutMs) {
    await page.waitForFunction(
        async ({ comicId: targetComicId, indexedBefore: before }) => {
            const response = await fetch('/api/v1/visual/status')
            if (!response.ok) return false
            const status = await response.json()
            return (
                Number(status.indexedCount || 0) > Number(before) &&
                Array.isArray(status.pendingComicIds) &&
                !status.pendingComicIds.includes(targetComicId)
            )
        },
        { comicId, indexedBefore },
        { timeout: timeoutMs }
    )
}

async function waitBuildIdle(page, timeoutMs) {
    await page.waitForFunction(
        () => {
            const build = document.querySelector('#visual-index-build')
            return build instanceof HTMLButtonElement && !build.disabled
        },
        undefined,
        { timeout: timeoutMs }
    )
}

async function startWarmSequence(page, comicId, repeats) {
    return await page.evaluate(
        async ({ comicId: targetComicId, repeats: count }) => {
            const desktopResponse = await fetch('/api/v1/desktop/status')
            if (!desktopResponse.ok)
                throw new Error(
                    `desktop status failed: HTTP ${desktopResponse.status}`
                )
            const desktop = await desktopResponse.json()
            if (!desktop.csrfToken)
                throw new Error('desktop status did not expose csrfToken')
            const mode =
                document.querySelector('#visual-sampling-mode')?.value ||
                'BODY_FIRST'
            const preparedResponse = await fetch('/api/v1/visual/prepare', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-pica-csrf': desktop.csrfToken
                },
                body: JSON.stringify({
                    comicId: targetComicId,
                    mode,
                    limit: 6
                })
            })
            if (!preparedResponse.ok)
                throw new Error(
                    `visual prepare failed: HTTP ${preparedResponse.status}`
                )
            const prepared = await preparedResponse.json()
            if (!Array.isArray(prepared.samples) || !prepared.samples.length)
                throw new Error('warm probe has no prepared Visual samples')

            const runtime = await import('/visual-runtime.js')
            window.__picaJ10Warm = {
                state: 'running',
                sampleCount: prepared.samples.length,
                repeats: count,
                completed: 0,
                inferenceMs: [],
                error: null
            }
            void (async () => {
                try {
                    for (let index = 0; index < count; index++) {
                        const started = performance.now()
                        await runtime.analyzeVisualSamples(prepared.samples)
                        window.__picaJ10Warm.inferenceMs.push(
                            performance.now() - started
                        )
                        window.__picaJ10Warm.completed = index + 1
                    }
                    window.__picaJ10Warm.state = 'complete'
                } catch (error) {
                    window.__picaJ10Warm.state = 'failed'
                    window.__picaJ10Warm.error = String(
                        error?.message || error || 'unknown warm inference error'
                    )
                }
            })()
            return {
                sampleCount: prepared.samples.length,
                sourceKind: prepared.sourceKind || null
            }
        },
        { comicId, repeats }
    )
}

async function warmState(page) {
    return await page.evaluate(() => window.__picaJ10Warm || null)
}

async function collectWarmForeground(page, timeoutMs) {
    const navSwitchMs = []
    const rafIntervals = []
    let loops = 0

    while (loops < 40) {
        const before = await warmState(page)
        if (!before || before.state !== 'running') break
        loops += 1

        const rafCandidate = await sampleRaf(page)
        const afterRaf = await warmState(page)
        if (afterRaf?.state === 'running') rafIntervals.push(...rafCandidate)
        else break

        let started = performance.now()
        await page.locator('nav [data-view="library"]').click()
        await waitLibrary(page, timeoutMs)
        if ((await warmState(page))?.state === 'running')
            navSwitchMs.push(performance.now() - started)
        else break

        started = performance.now()
        await page.locator('nav [data-view="settings"]').click()
        await waitSettings(page, timeoutMs)
        if ((await warmState(page))?.state === 'running')
            navSwitchMs.push(performance.now() - started)
        else break
    }

    await page.waitForFunction(
        () =>
            window.__picaJ10Warm &&
            window.__picaJ10Warm.state !== 'running',
        undefined,
        { timeout: timeoutMs }
    )
    const final = await warmState(page)
    if (!final || final.state !== 'complete')
        throw new Error(
            `J10 warm inference failed: ${final?.error || 'missing final state'}`
        )
    if (!rafIntervals.length)
        throw new Error(
            'J10 warm inference completed before any full RAF observation window'
        )
    if (!navSwitchMs.length)
        throw new Error(
            'J10 warm inference completed before any full foreground navigation sample'
        )
    return {
        navSwitchMs,
        rafIntervals,
        inferenceMs: final.inferenceMs.map(Number),
        completed: Number(final.completed || 0)
    }
}

async function run(chromium, config) {
    if (!config.allowModelNetwork)
        throw new Error(
            'J10 real-model evidence requires explicit --allow-model-network; there is no synthetic inference mode.'
        )

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
        })

        const page = await context.newPage()
        const pageErrors = []
        const libraryRequests = []
        const modelArtifactRequests = []
        page.on('pageerror', (error) =>
            pageErrors.push(String(error?.stack || error))
        )
        context.on('request', (request) => {
            const url = request.url()
            const entry = {
                method: request.method(),
                url: url.replace(/[?#].*$/, '')
            }
            if (/cdn\.jsdelivr\.net\/npm\/@huggingface\/transformers/i.test(url))
                libraryRequests.push(entry)
            if (
                /onnx-community\/dinov2-small|huggingface\.co|hf\.co|cdn-lfs|xethub|cas-bridge/i.test(
                    url
                )
            )
                modelArtifactRequests.push(entry)
        })

        await page.goto(`${config.baseUrl}/`, {
            waitUntil: 'domcontentloaded',
            timeout: config.timeoutMs
        })
        await waitShell(page, config.timeoutMs)
        await page.locator('nav [data-view="settings"]').click()
        await waitSettings(page, config.timeoutMs)

        const before = await visualStatus(page)
        if (
            !Array.isArray(before.pendingComicIds) ||
            !before.pendingComicIds.includes(config.fixture.comicId)
        )
            throw new Error('J10 fixture comic is not pending Visual indexing')
        const indexedBefore = Number(before.indexedCount || 0)

        const coldStartedAt = Date.now()
        await page.locator('#visual-index-build').click()
        await page.waitForFunction(
            () => {
                const build = document.querySelector('#visual-index-build')
                const message = document.querySelector('#visual-index-message')
                return (
                    build instanceof HTMLButtonElement &&
                    build.disabled &&
                    message instanceof HTMLElement &&
                    message.dataset.busy === 'true'
                )
            },
            undefined,
            { timeout: config.timeoutMs }
        )

        await waitFixtureIndexed(
            page,
            config.fixture.comicId,
            indexedBefore,
            config.timeoutMs
        )
        const firstEmbeddingElapsedMs = Date.now() - coldStartedAt
        await waitBuildIdle(page, config.timeoutMs)

        if (!libraryRequests.length)
            throw new Error(
                'J10 indexed the fixture without observing the production Transformers.js library request'
            )
        if (!modelArtifactRequests.length)
            throw new Error(
                'J10 indexed the fixture without observing DINOv2/model artifact network traffic'
            )

        const warmFixture = await startWarmSequence(
            page,
            config.fixture.comicId,
            config.warmRepeats
        )
        const warm = await collectWarmForeground(page, config.timeoutMs)
        if (warm.completed !== config.warmRepeats)
            throw new Error(
                `J10 warm sequence completed ${warm.completed}/${config.warmRepeats} repeats`
            )
        if (pageErrors.length)
            throw new Error(
                `J10 browser errors: ${pageErrors.join(' | ')}`
            )

        await context.close()
        return {
            browserVersion,
            cold: {
                firstEmbeddingElapsedMs,
                libraryRequestCount: libraryRequests.length,
                modelArtifactRequestCount: modelArtifactRequests.length,
                modelRequestOrigins: [
                    ...new Set(
                        modelArtifactRequests.map(
                            (item) => new URL(item.url).origin
                        )
                    )
                ].sort()
            },
            warmFixture,
            warm
        }
    } finally {
        await browser.close()
    }
}

async function main() {
    const config = options()
    const { chromium } = playwright()
    const result = await run(chromium, config)
    const report = {
        schemaVersion: 1,
        benchmark: 'p2-j10-desktop-visual-index-foreground',
        measuredAt: new Date().toISOString(),
        commit: gitSha(),
        environment: {
            platform: process.platform,
            arch: process.arch,
            node: process.version,
            cpuModel: os.cpus()[0]?.model ?? null,
            logicalCpuCount: os.cpus().length,
            totalMemoryBytes: os.totalmem(),
            browser: 'chromium',
            browserVersion: result.browserVersion
        },
        protocol: {
            productionWorker: 'web/visual-worker.js',
            library: '@huggingface/transformers@4.2.0',
            model: 'onnx-community/dinov2-small',
            inference: 'image-feature-extraction',
            coldPhase:
                'real UI build through prepare -> production Web Worker -> persisted embedding',
            warmPhase:
                'same production visual-runtime/Web Worker with already-loaded extractor; no embedding persistence',
            warmInferenceRepeats: config.warmRepeats,
            noSyntheticCpuModelLease: true,
            realModelNetworkExplicitlyAllowed: true
        },
        coldBootstrap: result.cold,
        warmInference: {
            sampleCountPerInference: result.warmFixture.sampleCount,
            sourceKind: result.warmFixture.sourceKind,
            inferenceMs: summary(result.warm.inferenceMs)
        },
        foregroundUnderWarmInference: {
            navSwitchToUsableMs: summary(result.warm.navSwitchMs),
            rafIntervalMs: summary(result.warm.rafIntervals),
            intervalsOver34Ms: result.warm.rafIntervals.filter(
                (value) => value > 34
            ).length,
            intervalsOver50Ms: result.warm.rafIntervals.filter(
                (value) => value > 50
            ).length
        },
        warning:
            'Real model/browser evidence only. Cold bootstrap depends on network/cache; warm inference depends on hardware/browser runtime. No P2-K budget is selected.'
    }

    const output = path.resolve(config.output)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
