export interface PerformanceSettings {
    jobConcurrency: number
    globalMediaConcurrency: number
    requestIntervalMs: number
    maxRetries: number
    retryBaseMs: number
}

export const performanceProfiles = {
    conservative: {
        jobConcurrency: 1,
        globalMediaConcurrency: 3,
        requestIntervalMs: 500,
        maxRetries: 2,
        retryBaseMs: 1500
    },
    balanced: {
        jobConcurrency: 2,
        globalMediaConcurrency: 5,
        requestIntervalMs: 250,
        maxRetries: 2,
        retryBaseMs: 1000
    },
    fast: {
        jobConcurrency: 3,
        globalMediaConcurrency: 8,
        requestIntervalMs: 100,
        maxRetries: 2,
        retryBaseMs: 750
    }
} as const satisfies Record<string, PerformanceSettings>

export type PerformanceProfile = keyof typeof performanceProfiles | 'custom'

export function resolvePerformanceSettings(
    profile: PerformanceProfile = 'balanced',
    custom: Partial<PerformanceSettings> = {}
): PerformanceSettings {
    const base =
        profile === 'custom'
            ? performanceProfiles.balanced
            : performanceProfiles[profile]
    const value = profile === 'custom' ? { ...base, ...custom } : { ...base }
    for (const key of [
        'jobConcurrency',
        'globalMediaConcurrency',
        'maxRetries'
    ] as const) {
        if (!Number.isInteger(value[key]) || value[key] < (key === 'maxRetries' ? 0 : 1))
            throw new Error(`Invalid performance setting: ${key}`)
    }
    if (value.requestIntervalMs < 0 || value.retryBaseMs < 0)
        throw new Error('Performance intervals must be non-negative')
    return value
}
