import type { DesktopConfig } from './types'
import { saveConfig } from './config'
import type { SourceRuntime } from '../sources/source-policy'

/** Synchronous CAS + atomic disk save before changing live access. No credentials involved. */
export function saveSourceChoices(
    file: string,
    current: DesktopConfig,
    runtime: SourceRuntime,
    enabled: unknown,
    expectedRevision: unknown,
    persist: typeof saveConfig = saveConfig
) {
    const policy = runtime.prepare(enabled, expectedRevision)
    const config = { ...current, externalSources: policy }
    persist(file, config)
    const disabled = runtime.apply(policy)
    return { config, disabled }
}
