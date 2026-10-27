import { assertRealHostCi } from './lib/source-host-interop-fixture.mjs'

assertRealHostCi()
// No TS/app/native modules or input files before the mandatory CI guard.
const { spawn } = await import('node:child_process')
const { once } = await import('node:events')
const { fileURLToPath } = await import('node:url')
// The locked tsx4.7.0 exports ./cli, not the newer ./esm/api entry.
const cli = fileURLToPath(import.meta.resolve('tsx/cli'))
const entry = fileURLToPath(new URL('./source-host-interop-entry.ts', import.meta.url))
const child = spawn(process.execPath, [cli, entry, ...process.argv.slice(2)], { env: process.env, cwd: process.cwd(), stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true })
const [code] = await once(child, 'exit')
process.exitCode = code === 0 ? 0 : 1
