import { spawnSync } from 'node:child_process'
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

function command(name) {
    return process.platform === 'win32' ? `${name}.cmd` : name
}

function run(commandName, args, options = {}) {
    const result = spawnSync(commandName, args, {
        cwd: options.cwd ?? process.cwd(),
        env: options.env ?? process.env,
        stdio: 'inherit',
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024
    })
    if (result.status !== 0)
        throw new Error(
            `${commandName} ${args.join(' ')} failed with ${result.status}`
        )
}

function safeEnvironment(extra = {}) {
    const env = { ...process.env, ...extra }
    for (const key of Object.keys(env))
        if (/^PICA_(ACCOUNT|PASSWORD|PROXY|TOKEN|COOKIE|AUTHORIZATION)$/i.test(key))
            delete env[key]
    return env
}

async function verifyDesktop(baseUrl) {
    const base = new URL(baseUrl)
    if (base.protocol !== 'http:')
        throw new Error('J6 generation requires a loopback HTTP Desktop URL')
    const host = base.hostname.replace(/^\[|\]$/g, '')
    if (!['127.0.0.1', 'localhost', '::1'].includes(host))
        throw new Error('J6 generation refuses non-loopback Desktop URLs')
    const response = await fetch(
        `${base.toString().replace(/\/$/, '')}/api/v1/desktop/status`,
        { signal: AbortSignal.timeout(2_000) }
    )
    if (!response.ok) throw new Error('Desktop status is unavailable')
    const status = await response.json()
    if (status?.application !== 'Pica Library' || !status?.configured)
        throw new Error(
            'J6 generation requires an already-configured Pica Library Desktop'
        )
}

async function main() {
    const baseUrl = optionValue('base-url')
    if (!baseUrl) throw new Error('--base-url is required')
    if (optionValue('confirm-regeneration') !== 'YES')
        throw new Error(
            'This benchmark mutates the current recommendation cycle; pass --confirm-regeneration=YES'
        )
    await verifyDesktop(baseUrl)

    const rounds = optionValue('rounds') ?? '3'
    const timeoutMs = optionValue('timeout-ms') ?? '180000'
    const output =
        optionValue('output') ??
        path.join(
            'test-results',
            'desktop-recommendation',
            'desktop-recommendation-generation-benchmark.json'
        )

    const toolRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-j6-real-provider-playwright-')
    )
    try {
        fs.writeFileSync(
            path.join(toolRoot, 'package.json'),
            JSON.stringify({ private: true }) + '\n',
            'utf8'
        )
        const browsersPath = path.join(toolRoot, 'browsers')
        const toolEnv = {
            ...safeEnvironment(),
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
                'chromium'
            ],
            { env: toolEnv }
        )
        run(
            process.execPath,
            [
                'scripts/benchmark/desktop-recommendation-generation-harness.mjs',
                `--base-url=${baseUrl}`,
                `--rounds=${rounds}`,
                `--timeout-ms=${timeoutMs}`,
                `--output=${output}`,
                '--confirm-regeneration=YES'
            ],
            {
                env: safeEnvironment({
                    PICA_PLAYWRIGHT_TOOL_ROOT: toolRoot,
                    PLAYWRIGHT_BROWSERS_PATH: browsersPath
                })
            }
        )
    } finally {
        fs.rmSync(toolRoot, { recursive: true, force: true })
    }

    process.stdout.write(
        'J6 real generation benchmark completed. No credentials were read or exported by the runner.\n'
    )
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
