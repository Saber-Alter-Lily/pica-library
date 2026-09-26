import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PLAYWRIGHT_VERSION = '1.63.0'

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

function command(name) {
    return process.platform === 'win32' ? `${name}.cmd` : name
}

function run(commandName, args, options = {}) {
    const result = spawnSync(commandName, args, {
        cwd: options.cwd ?? process.cwd(),
        env: options.env ?? process.env,
        stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        encoding: options.capture ? 'utf8' : undefined,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024
    })
    if (result.status !== 0)
        throw new Error(
            `${commandName} ${args.join(' ')} failed with ${result.status}\n${result.stderr ?? ''}`
        )
    return result
}

function safeEnvironment(extra = {}) {
    const env = { ...process.env, ...extra }
    for (const key of Object.keys(env))
        if (/^PICA_(ACCOUNT|PASSWORD|PROXY|TOKEN|COOKIE|AUTHORIZATION)$/i.test(key))
            delete env[key]
    return env
}

function readInstance(home) {
    const file = path.join(home, 'runtime-state', 'instance.json')
    try {
        const value = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (
            typeof value.url === 'string' &&
            /^http:\/\/127\.0\.0\.1:\d+$/.test(value.url) &&
            typeof value.startedAt === 'string'
        )
            return value
    } catch {
        // Startup/restart can briefly leave no readable publication.
    }
    return null
}

async function wait(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms))
}

async function desktopStatus(url) {
    const response = await fetch(`${url}/api/v1/desktop/status`, {
        signal: AbortSignal.timeout(1_500)
    })
    if (!response.ok) return null
    const value = await response.json()
    return value?.application === 'Pica Library' ? value : null
}

async function waitForDesktop(home, options = {}) {
    const deadline = Date.now() + (options.timeoutMs ?? 30_000)
    while (Date.now() < deadline) {
        const instance = readInstance(home)
        if (
            instance &&
            (!options.afterStartedAt ||
                instance.startedAt !== options.afterStartedAt)
        ) {
            try {
                const status = await desktopStatus(instance.url)
                if (
                    status &&
                    (options.configured === undefined ||
                        Boolean(status.configured) === options.configured)
                )
                    return { instance, status }
            } catch {
                // Keep polling through the bounded startup/restart window.
            }
        }
        await wait(50)
    }
    throw new Error('Desktop engine did not reach the required J6 state')
}

async function waitForExit(child, timeoutMs = 40_000) {
    if (child.exitCode !== null || child.signalCode !== null)
        return { exitCode: child.exitCode, signal: child.signalCode }
    return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            child.kill('SIGKILL')
            reject(new Error('Desktop engine did not exit after J6 shutdown'))
        }, timeoutMs)
        child.once('exit', (exitCode, signal) => {
            clearTimeout(timeout)
            resolve({ exitCode, signal })
        })
    })
}

async function postSettings(url, status, libraryDirectory) {
    const response = await fetch(`${url}/api/v1/desktop/settings`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-pica-csrf': status.csrfToken,
            Origin: url
        },
        body: JSON.stringify({
            account: 'synthetic-recommendation-benchmark',
            password: 'synthetic-recommendation-benchmark',
            libraryDirectory,
            profile: 'balanced',
            proxyUrl: 'http://127.0.0.1:9'
        }),
        signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok)
        throw new Error(
            `Synthetic J6 Desktop setup failed: HTTP ${response.status}`
        )
    return await response.json()
}

async function shutdownDesktop(home, child) {
    try {
        const current = await waitForDesktop(home, { timeoutMs: 5_000 })
        await fetch(`${current.instance.url}/api/v1/desktop/shutdown`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-pica-csrf': current.status.csrfToken,
                Origin: current.instance.url
            },
            body: '{}',
            signal: AbortSignal.timeout(5_000)
        })
    } catch {
        // Process-level fallback below remains authoritative for runner cleanup.
    }
    try {
        const exited = await waitForExit(child, 40_000)
        if (exited.exitCode !== 0)
            throw new Error(
                `Desktop J6 process exited non-zero: ${exited.exitCode} / ${exited.signal}`
            )
    } catch (error) {
        if (child.exitCode === null && child.signalCode === null)
            child.kill('SIGKILL')
        throw error
    }
}

async function main() {
    const rounds = positiveInteger(optionValue('rounds'), 5, 'rounds', 5)
    const timeoutMs = positiveInteger(
        optionValue('timeout-ms'),
        15_000,
        'timeout-ms'
    )
    const output =
        optionValue('output') ??
        path.join(
            'test-results',
            'desktop-recommendation',
            'desktop-recommendation-batch-benchmark.json'
        )
    const harnessValidationOnly =
        process.argv.includes('--harness-validation-only') ||
        process.env.PICA_BENCHMARK_HARNESS_ONLY === '1'
    const withDeps = process.argv.includes('--with-deps')

    run(command('pnpm'), ['build'])

    const toolRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-j6-playwright-')
    )
    const desktopHome = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-j6-desktop-')
    )
    const libraryDirectory = path.join(desktopHome, 'benchmark-library')
    const fixtureFile = path.join(desktopHome, 'j6-recommendation-fixture.json')
    fs.mkdirSync(libraryDirectory, { recursive: true })

    run(
        command('pnpm'),
        [
            'exec',
            'tsx',
            'scripts/benchmark/seed-desktop-recommendation-benchmark-fixture.ts',
            `--library-dir=${libraryDirectory}`,
            `--output=${fixtureFile}`
        ],
        { env: safeEnvironment() }
    )

    fs.writeFileSync(
        path.join(toolRoot, 'package.json'),
        JSON.stringify({ private: true }) + '\n',
        'utf8'
    )
    const browsersPath = path.join(toolRoot, 'browsers')
    const toolEnv = {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: browsersPath
    }
    run(
        command('pnpm'),
        [
            '--dir',
            toolRoot,
            'add',
            '--save-dev',
            `@playwright/test@${PLAYWRIGHT_VERSION}`
        ],
        { env: toolEnv }
    )
    run(
        command('pnpm'),
        [
            '--dir',
            toolRoot,
            'exec',
            'playwright',
            'install',
            ...(withDeps ? ['--with-deps'] : []),
            'chromium'
        ],
        { env: toolEnv }
    )

    let stdout = ''
    let stderr = ''
    const desktopEntry = path.resolve('dist', 'desktop.js')
    const child = spawn(process.execPath, [desktopEntry, '--headless'], {
        cwd: process.cwd(),
        env: safeEnvironment({
            PICA_LIBRARY_DESKTOP_HOME: desktopHome
        }),
        stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stdout?.on('data', (chunk) => {
        stdout = (stdout + String(chunk)).slice(-16_000)
    })
    child.stderr?.on('data', (chunk) => {
        stderr = (stderr + String(chunk)).slice(-16_000)
    })

    try {
        const initial = await waitForDesktop(desktopHome, {
            configured: false
        })
        const credentialBackend = String(
            initial.status?.credentialBackend?.kind ?? ''
        )
        if (
            credentialBackend !== 'windows-dpapi' &&
            credentialBackend !== 'session-memory'
        )
            throw new Error(
                `J6 refuses system-level credential backend "${credentialBackend || 'unknown'}"; run on Windows DPAPI with isolated Desktop home or a session-memory backend`
            )

        const setupResult = await postSettings(
            initial.instance.url,
            initial.status,
            libraryDirectory
        )
        const configured = setupResult.restarting
            ? await waitForDesktop(desktopHome, {
                  configured: true,
                  afterStartedAt: initial.instance.startedAt
              })
            : await waitForDesktop(desktopHome, {
                  configured: true
              })

        run(
            process.execPath,
            [
                'scripts/benchmark/desktop-recommendation-batch-harness.mjs',
                `--base-url=${configured.instance.url}`,
                `--fixture=${fixtureFile}`,
                `--rounds=${rounds}`,
                `--timeout-ms=${timeoutMs}`,
                `--output=${output}`,
                ...(harnessValidationOnly ? ['--harness-validation-only'] : [])
            ],
            {
                env: safeEnvironment({
                    PICA_PLAYWRIGHT_TOOL_ROOT: toolRoot,
                    PLAYWRIGHT_BROWSERS_PATH: browsersPath
                })
            }
        )
    } catch (error) {
        if (stderr || stdout)
            process.stderr.write(
                `\n--- Desktop J6 log tail ---\n${stderr || stdout}\n`
            )
        throw error
    } finally {
        try {
            await shutdownDesktop(desktopHome, child)
        } finally {
            fs.rmSync(desktopHome, { recursive: true, force: true })
            fs.rmSync(toolRoot, { recursive: true, force: true })
        }
    }
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
