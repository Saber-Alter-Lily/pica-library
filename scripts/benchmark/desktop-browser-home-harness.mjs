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
    if (!rawBaseUrl) throw new Error('--base-url is required')
    const base = new URL(rawBaseUrl)
    if (base.protocol !== 'http:')
        throw new Error('J4 accepts only loopback HTTP Desktop URLs')
    if (base.username || base.password)
        throw new Error('Credentials in J4 base URL are forbidden')
    const host = base.hostname.replace(/^\[|\]$/g, '')
    if (!['127.0.0.1', 'localhost', '::1'].includes(host))
        throw new Error('J4 accepts only loopback Desktop URLs')
    base.pathname = '/'
    base.search = ''
    base.hash = ''

    return {
        baseUrl: base.toString().replace(/\/$/, ''),
        rounds: positiveInteger(optionValue('rounds'), 5, 'rounds'),
        timeoutMs: positiveInteger(optionValue('timeout-ms'), 15_000, 'timeout-ms'),
        output:
            optionValue('output') ??
            path.join(
                'test-results',
                'desktop-browser-home',
                'desktop-browser-home-benchmark.json'
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
            'PICA_PLAYWRIGHT_TOOL_ROOT is required; use the J4 runner so Playwright stays outside project dependencies'
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
            if (!(home instanceof HTMLElement)) return false
            if (!(mode instanceof HTMLElement)) return false
            if (!(nav instanceof HTMLElement)) return false
            if (!(count instanceof HTMLElement)) return false
            const modeText = String(mode.textContent || '').trim()
            const countText = String(count.textContent || '').trim()
            return (
                home.classList.contains('active') &&
                !nav.hidden &&
                modeText.length > 0 &&
                !modeText.includes('正在检测模式') &&
                countText.length > 0
            )
        },
        undefined,
        { timeout: timeoutMs }
    )
}

async function libraryReady(page, timeoutMs) {
    await page.waitForFunction(
        () => {
            const library = document.querySelector('#library')
            const count = document.querySelector('#library-count')
            const filter = document.querySelector('#filter-text')
            return (
                library instanceof HTMLElement &&
                library.classList.contains('active') &&
                count instanceof HTMLElement &&
                String(count.textContent || '').trim().length > 0 &&
                filter instanceof HTMLInputElement &&
                !filter.disabled
            )
        },
        undefined,
        { timeout: timeoutMs }
    )
}

async function runRound(chromium, options, index) {
    const launchStarted = performance.now()
    const browser = await chromium.launch({ headless: true })
    const browserLaunchMs = performance.now() - launchStarted
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

        const navigationStarted = performance.now()
        await page.goto(`${options.baseUrl}/`, {
            waitUntil: 'domcontentloaded',
            timeout: options.timeoutMs
        })
        await shellReady(page, options.timeoutMs)
        const shellReadyAt = performance.now()

        if (pageErrors.length)
            throw new Error(
                `Web page error before shell readiness: ${pageErrors.join(' | ')}`
            )

        const libraryClickStarted = performance.now()
        await page.locator('nav [data-view="library"]').click()
        await libraryReady(page, options.timeoutMs)
        const libraryReadyAt = performance.now()

        if (pageErrors.length)
            throw new Error(
                `Web page error before Library readiness: ${pageErrors.join(' | ')}`
            )

        const sample = {
            label: `browser-round-${index + 1}`,
            browserLaunchMs: round(browserLaunchMs),
            navigationToShellUsableMs: round(shellReadyAt - navigationStarted),
            shellToLibraryUsableMs: round(libraryReadyAt - shellReadyAt),
            libraryClickToUsableMs: round(libraryReadyAt - libraryClickStarted),
            navigationToLibraryUsableMs: round(
                libraryReadyAt - navigationStarted
            ),
            browserLaunchToShellUsableMs: round(
                browserLaunchMs + shellReadyAt - navigationStarted
            ),
            browserLaunchToLibraryUsableMs: round(
                browserLaunchMs + libraryReadyAt - navigationStarted
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
        benchmark: 'p2-j4-desktop-browser-home',
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
            enginePrerequisite: 'already-ready loopback Desktop engine',
            language: 'zh-CN',
            viewport: { width: 1440, height: 1000 },
            rounds: options.rounds,
            timeoutMs: options.timeoutMs,
            browserProcessPerRound: true,
            disclaimerPreparedOutsideMeasuredUi: true,
            onboardingPreparedOutsideMeasuredUi: true,
            providerSuccessRequired: false,
            playwrightInstallIncludedInMeasurement: false,
            engineStartupIncludedInMeasurement: false,
            harnessValidationOnly: options.harnessValidationOnly
        },
        samples,
        summary: {
            browserLaunchMs: summary(samples.map((sample) => sample.browserLaunchMs)),
            navigationToShellUsableMs: summary(
                samples.map((sample) => sample.navigationToShellUsableMs)
            ),
            shellToLibraryUsableMs: summary(
                samples.map((sample) => sample.shellToLibraryUsableMs)
            ),
            libraryClickToUsableMs: summary(
                samples.map((sample) => sample.libraryClickToUsableMs)
            ),
            navigationToLibraryUsableMs: summary(
                samples.map((sample) => sample.navigationToLibraryUsableMs)
            ),
            browserLaunchToShellUsableMs: summary(
                samples.map((sample) => sample.browserLaunchToShellUsableMs)
            ),
            browserLaunchToLibraryUsableMs: summary(
                samples.map((sample) => sample.browserLaunchToLibraryUsableMs)
            )
        },
        warning:
            'This report is browser-journey measurement evidence only. It does not define a P2-K performance budget or release threshold.'
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
