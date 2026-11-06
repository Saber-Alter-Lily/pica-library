import { runRealHostInterop } from './lib/source-host-interop-client'

// Invoked only by the guarded launcher through the existing pinned tsx CLI.
await runRealHostInterop(process.argv.slice(2))
