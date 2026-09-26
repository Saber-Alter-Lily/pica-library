import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

interface Options {
    rounds: number
    pollMs: number
    timeoutMs: number
    output: string
    harnessValidationOnly: boolean
}

interface StartupSample {
    label: string
    spawnToInstanceMs: number
    spawnToApiReadyMs: number
    shutdownResponseMs: number
    shutdownToExitMs: number
    exitCode: number | null
    signal: NodeJS.Signals | null
}

function optionValue(name: string) {
    const prefix = `--${name}=`
    const inline = process.argv.slice(2).find((arg) => arg.startsWith(prefix))
    if (inline) return inline.slice(prefix.length)
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : undefined
}

function positiveInteger(value: string | undefined, fallback: number, name: string) {
    if (value === undefined) return fallback
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1)
        throw new Error(`${name} must be a positive integer`)
    return parsed
}

function parseOptions(): Options {
    return {
        rounds: positiveInteger(optionValue('rounds'), 5, 'rounds'),
        pollMs: positiveInteger(optionValue('poll-ms'), 20, 'poll-ms'),
        timeoutMs: positiveInteger(optionValue('timeout-ms'), 30_000, 'timeout-ms'),
        output:
            optionValue('output') ??
            path.join(
                'test-results',
                'desktop-startup',
                'desktop-startup-benchmark.json'
            ),
        harnessValidationOnly:
            process.argv.includes('--harness-validation-only') ||
            process.env.PICA_BENCHMARK_HARNESS_ONLY === '1'
    }
}

function safeEnvironment(home: string) {
    const env = { ...process.env, PICA_LIBRARY_DESKTOP_HOME: home }
    for (const key of Object.keys(env))
        if (/^PICA_(ACCOUNT|PASSWORD|PROXY|TOKEN|COOKIE|AUTHORIZATION)$/i.test(key))
            delete env[key]
    return env
}

function shortText(value: string, limit = 16_000) {
    return value.length <= limit ? value : value.slice(value.length - limit)
}

function commitSha() {
    const result = spawnSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
    })
    const value = result.status === 0 ? result.stdout.trim() : ''
    return /^[0-9a-f]{40}$/i.test(value) ? value : null
}

async function wait(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForExit(child: ChildProcess, timeoutMs: number) {
    if (child.exitCode !== null || child.signalCode !== null)
        return { exitCode: child.exitCode, signal: child.signalCode }
    return await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
        (resolve, reject) => {
            const timeout = setTimeout(() => {
                child.kill('SIGKILL')
                reject(new Error(`Desktop process did not exit within ${timeoutMs} ms`))
            }, timeoutMs)
            child.once('exit', (exitCode, signal) => {
                clearTimeout(timeout)
                resolve({ exitCode, signal })
            })
        }
    )
}

async function status(url: string) {
    const response = await fetch(`${url}/api/v1/desktop/status`, {
        signal: AbortSignal.timeout(1_500)
    })
    if (!response.ok) return null
    const value = (await response.json()) as {
        application?: unknown
        csrfToken?: unknown
        version?: unknown
    }
    if (value.application !== 'Pica Library') return null
    return value
}

async function runSample(
    label: string,
    desktopEntry: string,
    home: string,
    options: Options
): Promise<StartupSample> {
    const instanceFile = path.join(home, 'runtime-state', 'instance.json')
    if (fs.existsSync(instanceFile))
        throw new Error(`Stale instance file exists before ${label}`)

    let stdout = ''
    let stderr = ''
    const started = performance.now()
    const child = spawn(process.execPath, [desktopEntry, '--headless'], {
        cwd: process.cwd(),
        env: safeEnvironment(home),
        stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stdout?.on('data', (chunk) => {
        stdout = shortText(stdout + String(chunk))
    })
    child.stderr?.on('data', (chunk) => {
        stderr = shortText(stderr + String(chunk))
    })

    let instanceMs: number | null = null
    let baseUrl: string | null = null
    let ready:
        | { application?: unknown; csrfToken?: unknown; version?: unknown }
        | null = null
    const deadline = performance.now() + options.timeoutMs

    while (performance.now() < deadline) {
        if (child.exitCode !== null || child.signalCode !== null)
            throw new Error(
                `Desktop exited before readiness during ${label}: code=${child.exitCode} signal=${child.signalCode}\n${stderr || stdout}`
            )

        if (!baseUrl && fs.existsSync(instanceFile)) {
            try {
                const value = JSON.parse(fs.readFileSync(instanceFile, 'utf8')) as {
                    url?: unknown
                }
                if (
                    typeof value.url === 'string' &&
                    /^http:\/\/127\.0\.0\.1:\d+$/.test(value.url)
                ) {
                    baseUrl = value.url
                    instanceMs = performance.now() - started
                }
            } catch {
                // Atomic visibility is not guaranteed while the file is first published.
            }
        }

        if (baseUrl) {
            try {
                ready = await status(baseUrl)
                if (ready) break
            } catch {
                // The instance file may appear a few milliseconds before HTTP accepts requests.
            }
        }
        await wait(options.pollMs)
    }

    if (!baseUrl || instanceMs === null || !ready)
        throw new Error(
            `Desktop did not become ready during ${label} within ${options.timeoutMs} ms\n${stderr || stdout}`
        )

    const apiReadyMs = performance.now() - started
    const csrfToken =
        typeof ready.csrfToken === 'string' ? ready.csrfToken : null
    if (!csrfToken) throw new Error('Desktop status did not expose local CSRF token')

    const shutdownStarted = performance.now()
    const shutdownResponse = await fetch(`${baseUrl}/api/v1/desktop/shutdown`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-pica-csrf': csrfToken
        },
        body: '{}',
        signal: AbortSignal.timeout(5_000)
    })
    const shutdownResponseMs = performance.now() - shutdownStarted
    if (!shutdownResponse.ok)
        throw new Error(
            `Desktop shutdown request failed during ${label}: ${shutdownResponse.status}`
        )

    const exited = await waitForExit(child, 40_000)
    const shutdownToExitMs = performance.now() - shutdownStarted
    if (exited.exitCode !== 0)
        throw new Error(
            `Desktop exited non-zero during ${label}: code=${exited.exitCode} signal=${exited.signal}\n${stderr || stdout}`
        )

    return {
        label,
        spawnToInstanceMs: Math.round(instanceMs * 100) / 100,
        spawnToApiReadyMs: Math.round(apiReadyMs * 100) / 100,
        shutdownResponseMs: Math.round(shutdownResponseMs * 100) / 100,
        shutdownToExitMs: Math.round(shutdownToExitMs * 100) / 100,
        exitCode: exited.exitCode,
        signal: exited.signal
    }
}

function summary(values: number[]) {
    const sorted = [...values].sort((left, right) => left - right)
    const middle = Math.floor(sorted.length / 2)
    const median =
        sorted.length % 2 === 0
            ? (sorted[middle - 1] + sorted[middle]) / 2
            : sorted[middle]
    return {
        count: sorted.length,
        min: Math.round(sorted[0] * 100) / 100,
        median: Math.round(median * 100) / 100,
        max: Math.round(sorted[sorted.length - 1] * 100) / 100
    }
}

async function main() {
    const options = parseOptions()
    const desktopEntry = path.resolve('dist', 'desktop.js')
    if (!fs.existsSync(desktopEntry))
        throw new Error(
            'dist/desktop.js is missing. Run pnpm build before the J3 startup benchmark.'
        )

    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-j3-startup-'))
    const samples: StartupSample[] = []

    try {
        samples.push(
            await runSample('fresh-home', desktopEntry, home, options)
        )
        for (let index = 0; index < options.rounds; index++)
            samples.push(
                await runSample(
                    `reused-home-${index + 1}`,
                    desktopEntry,
                    home,
                    options
                )
            )
    } finally {
        fs.rmSync(home, { recursive: true, force: true })
    }

    const reused = samples.filter((sample) =>
        sample.label.startsWith('reused-home-')
    )
    const report = {
        schemaVersion: 1,
        benchmark: 'p2-j3-desktop-process-startup',
        measuredAt: new Date().toISOString(),
        commit: commitSha(),
        environment: {
            platform: process.platform,
            arch: process.arch,
            node: process.version,
            cpuModel: os.cpus()[0]?.model ?? null,
            logicalCpuCount: os.cpus().length,
            totalMemoryBytes: os.totalmem()
        },
        protocol: {
            entry: 'dist/desktop.js --headless',
            home: 'isolated temp root reused after the fresh-home sample',
            rounds: options.rounds,
            pollMs: options.pollMs,
            timeoutMs: options.timeoutMs,
            providerCredentialsPresent: false,
            buildIncludedInMeasurement: false,
            harnessValidationOnly: options.harnessValidationOnly
        },
        samples,
        reusedHomeSummary: {
            spawnToInstanceMs: summary(
                reused.map((sample) => sample.spawnToInstanceMs)
            ),
            spawnToApiReadyMs: summary(
                reused.map((sample) => sample.spawnToApiReadyMs)
            ),
            shutdownResponseMs: summary(
                reused.map((sample) => sample.shutdownResponseMs)
            ),
            shutdownToExitMs: summary(
                reused.map((sample) => sample.shutdownToExitMs)
            )
        },
        warning:
            'This report is measurement evidence only. It does not define a P2-K performance budget or release threshold.'
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
