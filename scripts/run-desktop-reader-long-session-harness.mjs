import { spawnSync } from 'node:child_process'
import path from 'node:path'

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

const cycles = positiveInteger(optionValue('cycles'), 40, 'cycles')
const timeoutMs = positiveInteger(optionValue('timeout-ms'), 15_000, 'timeout-ms')
const output =
    optionValue('output') ??
    path.join(
        'test-results',
        'desktop-reader-long-session',
        'desktop-reader-long-session-benchmark.json'
    )

const args = [
    'scripts/run-desktop-browser-detail-reader-harness.mjs',
    '--benchmark-script=scripts/benchmark/desktop-reader-long-session-harness.mjs',
    `--rounds=${cycles}`,
    `--timeout-ms=${timeoutMs}`,
    `--output=${output}`,
    ...(process.argv.includes('--harness-validation-only')
        ? ['--harness-validation-only']
        : []),
    ...(process.argv.includes('--with-deps') ? ['--with-deps'] : [])
]

const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    windowsHide: true
})

if (result.error) throw result.error
if (result.status !== 0)
    throw new Error(
        `Shared isolated Desktop/Playwright runner failed with ${result.status}`
    )
