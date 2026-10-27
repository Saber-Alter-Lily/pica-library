import { assertRealHostCi } from './lib/source-host-interop-fixture.mjs'

assertRealHostCi()
// No TS/app/native modules or input files before the mandatory CI guard.
const { tsImport } = await import('tsx/esm/api')
const { runRealHostInterop } = await tsImport('./lib/source-host-interop-client.ts', import.meta.url)
await runRealHostInterop(process.argv.slice(2))
