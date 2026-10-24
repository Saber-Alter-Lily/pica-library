export interface J7NetworkSnapshot {
    events: Array<{
        route: string
        method: string
        action: string
        event: string
        status: number | null
    }>
    dropped: number
}
export interface J7FailureOptions extends Record<string, unknown> {
    page?: unknown
    before?: unknown
    network?: unknown
    phase?: unknown
    round?: unknown
    sourceSha?: unknown
    timeoutMs?: unknown
    error?: unknown
    pageErrorCount?: unknown
    harnessValidationOnly?: unknown
}
export interface J7FailureReport {
    schemaVersion: 1
    kind: string
    sourceSha: string | null
    round: number
    phase: string
    timeoutMs: number | null
    harnessValidationOnly: boolean
    errorKind: string
    pageErrorCount: number
    pageStateStatus: 'OBSERVED' | 'UNAVAILABLE'
    pageFlags: Record<string, boolean | null> | null
    cardCount: number | null
    network: J7NetworkSnapshot
    excludes: string[]
}
export function observeRecommendationBatchNetworkV1(page: {
    on(event: string, listener: Function): unknown
    removeListener(event: string, listener: Function): unknown
}): { snapshot(): J7NetworkSnapshot; dispose(): void }
export function collectRecommendationBatchFailureV1(
    options: J7FailureOptions
): Promise<J7FailureReport>
export function writeRecommendationBatchFailureV1(
    options: J7FailureOptions & { output: string }
): Promise<string>
