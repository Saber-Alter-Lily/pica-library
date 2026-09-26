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

function positiveInteger(value, fallback, name, maximum = Number.MAX_SAFE_INTEGER) {
    if (value === undefined) return fallback
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum)
        throw new Error(`${name} must be an integer from 1 to ${maximum}`)
    return parsed
}

function parseOptions() {
    const rawBaseUrl = optionValue('base-url')
    const fixtureFile = optionValue('fixture')
    if (!rawBaseUrl) throw new Error('--base-url is required')
    if (!fixtureFile) throw new Error('--fixture is required')
    const base = new URL(rawBaseUrl)
    if (base.protocol !== 'http:')
        throw new Error('J7 accepts only loopback HTTP Desktop URLs')
    if (base.username || base.password)
        throw new Error('Credentials in J7 base URL are forbidden')
    const host = base.hostname.replace(/^\[|\]$/g, '')
    if (!['127.0.0.1', 'localhost', '::1'].includes(host))
        throw new Error('J7 accepts only loopback Desktop URLs')
    base.pathname = '/'
    base.search = ''
    base.hash = ''

    const fixture = JSON.parse(fs.readFileSync(path.resolve(fixtureFile), 'utf8'))
    if (Number(fixture.expectedBatchSize) !== 12)
        throw new Error('J7 fixture must use the production 12-item batch size')
    if (!Array.isArray(fixture.initialBatchComicIds) || fixture.initialBatchComicIds.length !== 12)
        throw new Error('J7 fixture is missing the initial managed batch')

    return {
        baseUrl: base.toString().replace(/\/$/, ''),
        fixture,
        rounds: positiveInteger(optionValue('rounds'), 5, 'rounds', 5),
        timeoutMs: positiveInteger(optionValue('timeout-ms'), 15_000, 'timeout-ms'),
        output:
            optionValue('output') ??
            path.join(
                'test-results',
                'desktop-recommendation',
                'desktop-recommendation-batch-benchmark.json'
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
            'PICA_PLAYWRIGHT_TOOL_ROOT is required; use the J7 runner so Playwright stays outside project dependencies'
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
            return (
                home instanceof HTMLElement &&
                home.classList.contains('active') &&
                mode instanceof HTMLElement &&
                !String(mode.textContent || '').includes('正在检测模式') &&
                nav instanceof HTMLElement &&
                !nav.hidden
            )
        },
        undefined,
        { timeout: timeoutMs }
    )
}

async function managedBatchSnapshot(page, timeoutMs, expectedBatchSize) {
    await page.waitForFunction(
        (size) => {
            const discover = document.querySelector('#discover')
            const recommend = document.querySelector('#recommend')
            const label = document.querySelector('#recommend-batch')
            const cards = [
                ...document.querySelectorAll('#recommend-results .result[data-comic-id]')
            ]
            return (
                discover instanceof HTMLElement &&
                discover.classList.contains('active') &&
                recommend instanceof HTMLElement &&
                recommend.classList.contains('active') &&
                label instanceof HTMLElement &&
                String(label.textContent || '').trim().length > 0 &&
                cards.length === size
            )
        },
        expectedBatchSize,
        { timeout: timeoutMs }
    )
    return await page.evaluate(() => ({
        label: String(document.querySelector('#recommend-batch')?.textContent || '').trim(),
        ids: [
            ...document.querySelectorAll('#recommend-results .result[data-comic-id]')
        ].map((card) => card.getAttribute('data-comic-id') || '')
    }))
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
        })
        const page = await context.newPage()
        const pageErrors = []
        page.on('pageerror', (error) =>
            pageErrors.push(String(error?.stack || error))
        )

        await page.goto(`${options.baseUrl}/`, {
            waitUntil: 'domcontentloaded',
            timeout: options.timeoutMs
        })
        await shellReady(page, options.timeoutMs)
        await page.locator('nav [data-view="discover"]').click()
        await page.locator('[data-tab="recommend"]').click()
        await page.locator('#recommend-button').click()

        const before = await managedBatchSnapshot(
            page,
            options.timeoutMs,
            options.fixture.expectedBatchSize
        )

        const started = performance.now()
        await page.locator('#recommend-next-batch').click()
        await page.waitForFunction(
            ({ previousIds, previousLabel, expectedSize }) => {
                const label = String(
                    document.querySelector('#recommend-batch')?.textContent || ''
                ).trim()
                const ids = [
                    ...document.querySelectorAll(
                        '#recommend-results .result[data-comic-id]'
                    )
                ].map((card) => card.getAttribute('data-comic-id') || '')
                return (
                    ids.length === expectedSize &&
                    label.length > 0 &&
                    label !== previousLabel &&
                    ids.join('\n') !== previousIds.join('\n')
                )
            },
            {
                previousIds: before.ids,
                previousLabel: before.label,
                expectedSize: options.fixture.expectedBatchSize
            },
            { timeout: options.timeoutMs }
        )
        const usableAt = performance.now()
        const after = await managedBatchSnapshot(
            page,
            options.timeoutMs,
            options.fixture.expectedBatchSize
        )

        if (new Set(after.ids).size !== options.fixture.expectedBatchSize)
            throw new Error('J7 next batch contains duplicate card identities')
        if (after.ids.some((id) => before.ids.includes(id)))
            throw new Error('J7 next batch unexpectedly reused current-batch cards')
        if (pageErrors.length)
            throw new Error(
                `Web page error during J7 batch switch: ${pageErrors.join(' | ')}`
            )

        await context.close()
        return {
            label: `batch-switch-round-${index + 1}`,
            batchOrdinalBefore: index + 1,
            batchOrdinalAfter: index + 2,
            batchSize: after.ids.length,
            nextBatchClickToUsableMs: round(usableAt - started)
        }
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

    const browserVersion = await chromium
        .launch({ headless: true })
        .then(async (browser) => {
            try {
                return browser.version()
            } finally {
                await browser.close()
            }
        })

    const report = {
        schemaVersion: 1,
        benchmark: 'p2-j7-desktop-recommendation-batch-switch',
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
            browserVersion
        },
        protocol: {
            enginePrerequisite:
                'already-ready configured loopback Desktop engine with isolated deterministic V3 cycle',
            language: 'zh-CN',
            viewport: { width: 1440, height: 1000 },
            rounds: options.rounds,
            timeoutMs: options.timeoutMs,
            browserProcessPerRound: true,
            providerSuccessRequired: false,
            cycleGenerationIncludedInMeasurement: false,
            browserLaunchIncludedInMeasurement: false,
            engineStartupIncludedInMeasurement: false,
            harnessValidationOnly: options.harnessValidationOnly
        },
        fixtureShape: {
            candidateCount: Number(options.fixture.candidateCount),
            batchSize: Number(options.fixture.expectedBatchSize),
            maximumMeasuredTransitions: 5
        },
        samples,
        summary: {
            nextBatchClickToUsableMs: summary(
                samples.map((sample) => sample.nextBatchClickToUsableMs)
            )
        },
        warning:
            'This report measures local managed-V3 batch switching only. It does not measure recommendation generation and does not define a P2-K performance budget.'
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
