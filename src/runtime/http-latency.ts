import { performance } from 'node:perf_hooks'

export type LocalHttpRouteClass =
    | 'status'
    | 'library-query'
    | 'comic'
    | 'reader'
    | 'downloads'
    | 'downloaded'
    | 'shelves'
    | 'recommendation'
    | 'recommendation-v5'
    | 'maintenance'
    | 'remote-storage'
    | 'provider'
    | 'desktop-control'
    | 'other-api'
    | 'static'

export interface LocalHttpLatencySample {
    at: string
    method: string
    routeClass: LocalHttpRouteClass
    statusCode: number
    durationMs: number
    activeTaskTypes: string[]
}

function rounded(value: number) {
    return Math.round(value * 1000) / 1000
}

function percentile(values: number[], fraction: number) {
    if (!values.length) return null
    const sorted = [...values].sort((left, right) => left - right)
    const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(sorted.length * fraction) - 1)
    )
    return rounded(sorted[index])
}

function safeTaskType(value: string) {
    const normalized = value.trim().toLowerCase()
    return /^[a-z0-9][a-z0-9-]{0,79}$/.test(normalized)
        ? normalized
        : 'other-task'
}

export function classifyLocalHttpRoute(
    method: string | undefined,
    pathname: string
): LocalHttpRouteClass {
    void method
    if (!pathname.startsWith('/api/v1/')) return 'static'
    if (
        pathname === '/api/v1/status' ||
        pathname === '/api/v1/capabilities' ||
        pathname === '/api/v1/desktop/status'
    )
        return 'status'
    if (pathname === '/api/v1/library/query') return 'library-query'
    if (pathname.startsWith('/api/v1/comics/')) return 'comic'
    if (pathname.startsWith('/api/v1/reader/')) return 'reader'
    if (pathname === '/api/v1/downloaded') return 'downloaded'
    if (pathname.startsWith('/api/v1/downloads')) return 'downloads'
    if (pathname.startsWith('/api/v1/shelves')) return 'shelves'
    if (
        pathname.startsWith('/api/v1/recommendation-v5') ||
        pathname.startsWith('/api/v1/desktop/recommendation-v5')
    )
        return 'recommendation-v5'
    if (
        pathname.startsWith('/api/v1/recommend') ||
        pathname.startsWith('/api/v1/desktop/recommendation')
    )
        return 'recommendation'
    if (pathname.startsWith('/api/v1/maintenance')) return 'maintenance'
    if (
        pathname.startsWith('/api/v1/remote-storage') ||
        pathname.startsWith('/api/v1/webdav')
    )
        return 'remote-storage'
    if (
        pathname.startsWith('/api/v1/providers') ||
        pathname.startsWith('/api/v1/online') ||
        pathname.startsWith('/api/v1/pica') ||
        pathname.startsWith('/api/v1/eh')
    )
        return 'provider'
    if (pathname.startsWith('/api/v1/desktop/')) return 'desktop-control'
    return 'other-api'
}

export class LocalHttpLatencyRegistry {
    private readonly samples: LocalHttpLatencySample[] = []

    constructor(
        private readonly options: {
            maxSamples?: number
        } = {}
    ) {}

    start(input: {
        method?: string
        pathname: string
        activeTaskTypes?: string[]
    }) {
        const startedAt = performance.now()
        const routeClass = classifyLocalHttpRoute(input.method, input.pathname)
        const method = String(input.method ?? 'GET')
            .trim()
            .toUpperCase()
            .slice(0, 12)
        const activeTaskTypes = [
            ...new Set((input.activeTaskTypes ?? []).map(safeTaskType))
        ].sort()

        let recorded = false
        return (statusCode: number) => {
            if (recorded) return
            recorded = true
            this.record({
                at: new Date().toISOString(),
                method: method || 'GET',
                routeClass,
                statusCode:
                    Number.isInteger(statusCode) && statusCode >= 100
                        ? statusCode
                        : 0,
                durationMs: performance.now() - startedAt,
                activeTaskTypes
            })
        }
    }

    reset() {
        this.samples.length = 0
    }

    record(sample: LocalHttpLatencySample) {
        const normalized: LocalHttpLatencySample = {
            ...sample,
            method: sample.method.toUpperCase().slice(0, 12),
            statusCode:
                Number.isInteger(sample.statusCode) && sample.statusCode >= 100
                    ? sample.statusCode
                    : 0,
            durationMs: rounded(Math.max(0, sample.durationMs)),
            activeTaskTypes: [
                ...new Set(sample.activeTaskTypes.map(safeTaskType))
            ].sort()
        }
        this.samples.push(normalized)
        const maxSamples = Math.max(20, this.options.maxSamples ?? 500)
        if (this.samples.length > maxSamples)
            this.samples.splice(0, this.samples.length - maxSamples)
    }

    private summary(rows: LocalHttpLatencySample[]) {
        const durations = rows.map((row) => row.durationMs)
        return {
            count: rows.length,
            p50Ms: percentile(durations, 0.5),
            p95Ms: percentile(durations, 0.95),
            maxMs: durations.length ? rounded(Math.max(...durations)) : null,
            errorCount: rows.filter((row) => row.statusCode >= 400).length
        }
    }

    snapshot() {
        const byRoute = Object.fromEntries(
            [...new Set(this.samples.map((sample) => sample.routeClass))]
                .sort()
                .map((routeClass) => [
                    routeClass,
                    this.summary(
                        this.samples.filter(
                            (sample) => sample.routeClass === routeClass
                        )
                    )
                ])
        )
        const idle = this.samples.filter(
            (sample) => sample.activeTaskTypes.length === 0
        )
        const underLoad = this.samples.filter(
            (sample) => sample.activeTaskTypes.length > 0
        )
        const taskTypes = [
            ...new Set(this.samples.flatMap((sample) => sample.activeTaskTypes))
        ].sort()
        const byTask = Object.fromEntries(
            taskTypes.map((taskType) => [
                taskType,
                this.summary(
                    this.samples.filter((sample) =>
                        sample.activeTaskTypes.includes(taskType)
                    )
                )
            ])
        )
        return {
            mode: 'OBSERVE_ONLY' as const,
            persisted: false,
            uploaded: false,
            maxSamples: Math.max(20, this.options.maxSamples ?? 500),
            sampleCount: this.samples.length,
            overall: this.summary(this.samples),
            idle: this.summary(idle),
            underLoad: this.summary(underLoad),
            byRoute,
            byTask,
            recent: this.samples.slice(-100).map((sample) => ({
                ...sample,
                activeTaskTypes: [...sample.activeTaskTypes]
            }))
        }
    }
}
