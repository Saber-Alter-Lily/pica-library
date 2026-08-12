export const performanceProfiles = {
    conservative: { globalConcurrency: 1, pictureConcurrency: 3, requestIntervalMs: 500 },
    balanced: { globalConcurrency: 2, pictureConcurrency: 5, requestIntervalMs: 250 },
    fast: { globalConcurrency: 3, pictureConcurrency: 8, requestIntervalMs: 100 }
} as const

export type PerformanceProfile = keyof typeof performanceProfiles
