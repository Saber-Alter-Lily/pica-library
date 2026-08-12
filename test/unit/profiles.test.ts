import { describe, expect, it } from 'vitest'
import {
    performanceProfiles,
    resolvePerformanceSettings
} from '../../src/core/downloads/profiles'

describe('performance profiles', () => {
    it('uses balanced by default and ignores overrides for named presets', () => {
        expect(resolvePerformanceSettings()).toEqual(
            performanceProfiles.balanced
        )
        expect(
            resolvePerformanceSettings('fast', { globalMediaConcurrency: 1 })
        ).toEqual(performanceProfiles.fast)
    })

    it('applies and validates custom settings', () => {
        expect(
            resolvePerformanceSettings('custom', {
                jobConcurrency: 3,
                globalMediaConcurrency: 7,
                requestIntervalMs: 50,
                maxRetries: 4
            })
        ).toMatchObject({
            jobConcurrency: 3,
            globalMediaConcurrency: 7,
            requestIntervalMs: 50,
            maxRetries: 4
        })
        expect(() =>
            resolvePerformanceSettings('custom', {
                globalMediaConcurrency: 0
            })
        ).toThrow('globalMediaConcurrency')
    })
})
