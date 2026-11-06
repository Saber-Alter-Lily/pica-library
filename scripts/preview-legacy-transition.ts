import path from 'node:path'
import { runLegacyTransitionPreviewCli, type LegacyTransitionAuthority } from '../src/update/legacy-transition-preflight'

// A later verified packaging step must bind exact expected facts. No --manifest,
// arbitrary JSON authority, environment bypass or apply operation is accepted.
declare const __PICA_LEGACY_TRANSITION_AUTHORITY__: LegacyTransitionAuthority | undefined
const authority = typeof __PICA_LEGACY_TRANSITION_AUTHORITY__ === 'undefined'
    ? null : __PICA_LEGACY_TRANSITION_AUTHORITY__
const result = runLegacyTransitionPreviewCli(process.argv.slice(2), {
    authority,
    toolRoot: path.resolve(import.meta.dirname, '..'),
    localAppData: process.env.LOCALAPPDATA ?? '',
    platform: process.platform
})
process.stdout.write(result.output)
process.exitCode = result.exitCode
