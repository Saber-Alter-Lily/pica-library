import { performance } from 'node:perf_hooks'

export type AnalysisTimingKind =
    | 'visual-representation-qc'
    | 'visual-author-atlas'
    | 'visual-style-families'

export interface AnalysisTimingSample {
    kind: AnalysisTimingKind
    startedAt: string
    durationMs: number
    outcome: 'complete' | 'failed'
    catalogCount: number
    embeddingCount: number
    parameters: Record<string, number | string | boolean | null>
    error?: string
}

function quantile(values: number[], fraction: number) {
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    const position = Math.max(
        0,
        Math.min(sorted.length - 1, (sorted.length - 1) * fraction)
    )
    const lower = Math.floor(position)
    const upper = Math.ceil(position)
    if (lower === upper) return sorted[lower]
    const weight = position - lower
    return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

function round(value: number | null, digits = 3) {
    if (value === null || !Number.isFinite(value)) return null
    const scale = 10 ** digits
    return Math.round(value * scale) / scale
}

export class AnalysisTimingRegistry {
    private readonly samples: AnalysisTimingSample[] = []

    constructor(private readonly sampleLimit = 60) {}

    measure<T>(
        kind: AnalysisTimingKind,
        input: {
            catalogCount: number
            embeddingCount: number
            parameters?: AnalysisTimingSample['parameters']
        },
        work: () => T
    ) {
        const startedAt = new Date().toISOString()
        const started = performance.now()
        try {
            const result = work()
            this.record({
                kind,
                startedAt,
                durationMs: performance.now() - started,
                outcome: 'complete',
                catalogCount: input.catalogCount,
                embeddingCount: input.embeddingCount,
                parameters: input.parameters ?? {}
            })
            return result
        } catch (error) {
            this.record({
                kind,
                startedAt,
                durationMs: performance.now() - started,
                outcome: 'failed',
                catalogCount: input.catalogCount,
                embeddingCount: input.embeddingCount,
                parameters: input.parameters ?? {},
                error: error instanceof Error ? error.message : String(error)
            })
            throw error
        }
    }

    measureDynamic<T>(
        kind: AnalysisTimingKind,
        work: () => {
            result: T
            catalogCount: number
            embeddingCount: number
            parameters?: AnalysisTimingSample['parameters']
        }
    ) {
        const startedAt = new Date().toISOString()
        const started = performance.now()
        try {
            const measured = work()
            this.record({
                kind,
                startedAt,
                durationMs: performance.now() - started,
                outcome: 'complete',
                catalogCount: measured.catalogCount,
                embeddingCount: measured.embeddingCount,
                parameters: measured.parameters ?? {}
            })
            return measured.result
        } catch (error) {
            this.record({
                kind,
                startedAt,
                durationMs: performance.now() - started,
                outcome: 'failed',
                catalogCount: 0,
                embeddingCount: 0,
                parameters: {},
                error: error instanceof Error ? error.message : String(error)
            })
            throw error
        }
    }

    private record(input: AnalysisTimingSample) {
        this.samples.push({
            ...input,
            durationMs: round(input.durationMs) ?? 0
        })
        if (this.samples.length > this.sampleLimit)
            this.samples.splice(0, this.samples.length - this.sampleLimit)
    }

    snapshot() {
        const kinds: AnalysisTimingKind[] = [
            'visual-representation-qc',
            'visual-author-atlas',
            'visual-style-families'
        ]
        return {
            mode: 'OBSERVE_ONLY' as const,
            foregroundThresholdMs: null,
            disposition: 'MEASURE_BEFORE_THRESHOLD' as const,
            sampleLimit: this.sampleLimit,
            sampleCount: this.samples.length,
            byKind: Object.fromEntries(
                kinds.map((kind) => {
                    const rows = this.samples.filter(
                        (sample) =>
                            sample.kind === kind &&
                            sample.outcome === 'complete'
                    )
                    const durations = rows.map((row) => row.durationMs)
                    return [
                        kind,
                        {
                            count: rows.length,
                            medianMs: round(quantile(durations, 0.5)),
                            p95Ms: round(quantile(durations, 0.95)),
                            maxMs: round(
                                durations.length
                                    ? Math.max(...durations)
                                    : null
                            ),
                            last:
                                [...this.samples]
                                    .reverse()
                                    .find((sample) => sample.kind === kind) ??
                                null
                        }
                    ]
                })
            ),
            recent: this.samples.slice(-20)
        }
    }
}
