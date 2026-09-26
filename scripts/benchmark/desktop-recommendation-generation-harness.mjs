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
    if (!rawBaseUrl) throw new Error('--base-url is required')
    if (optionValue('confirm-regeneration') !== 'YES')
        throw new Error(
            'J6 real generation changes the current recommendation cycle; pass --confirm-regeneration=YES explicitly'
        )
    const base = new URL(rawBaseUrl)
    if (base.protocol !== 'http:')
        throw new Error('J6 generation accepts only loopback HTTP Desktop URLs')
    if (base.username || base.password)
        throw new Error('Credentials in J6 generation base URL are forbidden')
    const host = base.hostname.replace(/^\[|\]$/g, '')
    if (!['127.0.0.1', 'localhost', '::1'].includes(host))
        throw new Error('J6 generation accepts only loopback Desktop URLs')
    base.pathname = '/'
    base.search = ''
    base.hash = ''
    return {
        baseUrl: base.toString().replace(/\/$/, ''),
        rounds: positiveInteger(optionValue('rounds'), 3, 'rounds', 5),
        timeoutMs: positiveInteger(
            optionValue('timeout-ms'),
            180_000,
            'timeout-ms'
        ),
        output:
            optionValue('output') ??
            path.join(
                'test-results',
                'desktop-recommendation',
                'desktop-recommendation-generation-benchmark.json'
            )
    }
}

function playwright() {
    const toolRoot = process.env.PICA_PLAYWRIGHT_TOOL_ROOT
    if (!toolRoot)
        throw new Error(
            'PICA_PLAYWRIGHT_TOOL_ROOT is required; use the J6 generation runner so Playwright stays outside project dependencies'
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

async function fetchJson(page, pathname) {
    return await page.evaluate(async (pathValue) => {
        const response = await fetch(pathValue, { cache: 'no-store' })
        if (!response.ok)
            throw new Error(`HTTP ${response.status} for ${pathValue}`)
        return await response.json()
    }, pathname)
}

async function initialRecommendationReady(page, timeoutMs) {
    await page.locator('nav [data-view="discover"]').click()
    await page.locator('[data-tab="recommend"]').click()

    // Strict precondition: do not let the benchmark create an unmeasured first
    // cycle. The configured Desktop must already own one usable managed V3 cycle.
    const existing = await fetchJson(
        page,
        '/api/v1/recommendation-sessions/status?mode=final'
    )
    if (!existing?.activeCycleId || existing?.buildingCycleId)
        throw new Error(
            'J6 real generation requires one existing usable managed V3 cycle before any recommendation UI action'
        )

    await page.locator('#recommend-button').click()
    await page.waitForFunction(
        () =>
            document.querySelectorAll(
                '#recommend-results .result[data-comic-id]'
            ).length > 0 &&
            !document.querySelector('#recommend-button')?.disabled,
        undefined,
        { timeout: timeoutMs }
    )
    const loaded = await fetchJson(
        page,
        '/api/v1/recommendation-sessions/status?mode=final'
    )
    if (
        loaded?.activeCycleId !== existing.activeCycleId ||
        loaded?.buildingCycleId
    )
        throw new Error(
            'J6 recommendation precondition changed before the measured regeneration'
        )
    return existing
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
        const before = await initialRecommendationReady(page, options.timeoutMs)
        const previousCycleId = String(before.activeCycleId)

        await page.locator('#recommend-restart').click()
        await page.waitForFunction(
            () => {
                const dialog = document.querySelector('#app-confirm-dialog')
                return dialog instanceof HTMLDialogElement && dialog.open
            },
            undefined,
            { timeout: 5_000 }
        )

        const started = performance.now()
        await page.locator('#app-confirm-submit').click()

        let providerResourceObserved = false
        let resourceObservationCount = 0
        const deadline = Date.now() + options.timeoutMs
        while (Date.now() < deadline) {
            const diagnostics = await fetchJson(
                page,
                '/api/v1/desktop/runtime/tasks'
            )
            resourceObservationCount += 1
            const task = diagnostics?.tasks?.find(
                (item) => item.taskKey === 'recommendation-v3'
            )
            if (
                task?.resourceState === 'running' &&
                Array.isArray(task.resourceClasses) &&
                task.resourceClasses.includes('provider-network')
            )
                providerResourceObserved = true

            const status = await fetchJson(
                page,
                '/api/v1/recommendation-sessions/status?mode=final'
            )
            const cards = await page.locator(
                '#recommend-results .result[data-comic-id]'
            ).count()
            if (
                status?.activeCycleId &&
                status.activeCycleId !== previousCycleId &&
                !status.buildingCycleId &&
                cards > 0 &&
                !providerResourceObserved
            ) {
                throw new Error(
                    'J6 regeneration completed without observing a real provider-network resource lease'
                )
            }
            if (
                status?.activeCycleId &&
                status.activeCycleId !== previousCycleId &&
                !status.buildingCycleId &&
                cards > 0 &&
                providerResourceObserved
            ) {
                const usableAt = performance.now()
                if (pageErrors.length)
                    throw new Error(
                        `Web page error during J6 real regeneration: ${pageErrors.join(' | ')}`
                    )
                await context.close()
                return {
                    label: `generation-round-${index + 1}`,
                    regenerationConfirmedToUsableMs: round(usableAt - started),
                    providerResourceObserved,
                    resourceObservationCount,
                    renderedRecommendationCount: cards
                }
            }
            const message = String(
                (await page.locator('#recommend-message').textContent()) || ''
            )
            if (/失败|failed|超时|timeout/i.test(message))
                throw new Error(`J6 real regeneration failed: ${message}`)
            await new Promise((resolve) => setTimeout(resolve, 100))
        }
        throw new Error('J6 real regeneration timed out')
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
        benchmark: 'p2-j6-desktop-recommendation-real-generation',
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
            rounds: options.rounds,
            timeoutMs: options.timeoutMs,
            providerSuccessRequired: true,
            providerNetworkResourceObservationRequired: true,
            preexistingUsableCycleRequired: true,
            userConfirmedCycleMutation: true,
            browserLaunchIncludedInMeasurement: false,
            engineStartupIncludedInMeasurement: false
        },
        samples,
        summary: {
            regenerationConfirmedToUsableMs: summary(
                samples.map(
                    (sample) => sample.regenerationConfirmedToUsableMs
                )
            )
        },
        warning:
            'This benchmark intentionally creates new real recommendation cycles on an already-configured Desktop. Record network/proxy/provider conditions separately. It does not define a P2-K budget.'
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
