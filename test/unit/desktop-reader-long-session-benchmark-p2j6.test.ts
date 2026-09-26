import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('P2 J6 Desktop Reader long-session benchmark', () => {
    it('reuses the isolated J5 Desktop/Playwright environment', () => {
        const shared = fs.readFileSync(
            'scripts/run-desktop-browser-detail-reader-harness.mjs',
            'utf8'
        )
        const runner = fs.readFileSync(
            'scripts/run-desktop-reader-long-session-harness.mjs',
            'utf8'
        )
        expect(shared).toContain("optionValue('benchmark-script')")
        expect(shared).toContain('benchmarkScript,')
        expect(runner).toContain(
            '--benchmark-script=scripts/benchmark/desktop-reader-long-session-harness.mjs'
        )
        expect(runner).toContain('scripts/run-desktop-browser-detail-reader-harness.mjs')
        expect(runner).toContain('--rounds=')
        expect(runner).not.toContain('synthetic-browser-benchmark')
    })

    it('measures real Reader retention through Chromium CDP and chapter navigation', () => {
        const source = fs.readFileSync(
            'scripts/benchmark/desktop-reader-long-session-harness.mjs',
            'utf8'
        )
        expect(source).toContain("require('@playwright/test')")
        expect(source).toContain("chromium.launch({ headless: true })")
        expect(source).toContain('context.newCDPSession(page)')
        expect(source).toContain("cdp.send('HeapProfiler.collectGarbage')")
        expect(source).toContain("cdp.send('Runtime.getHeapUsage')")
        expect(source).toContain("cdp.send('Memory.getDOMCounters')")
        expect(source).toContain("cdp.send('Performance.getMetrics')")
        expect(source).toContain('#reader-next-chapter')
        expect(source).toContain('#reader-prev-chapter')
        expect(source).toContain('#reader-pages img[data-reader-page]')
        expect(source).toContain('image.naturalWidth > 0')
        expect(source).toContain('requestAnimationFrame(frame)')
        expect(source).toContain('chapterSwitchToUsableMs')
        expect(source).toContain('jsHeapUsedDeltaBytes')
        expect(source).toContain('nodeDelta')
        expect(source).toContain('listenerDelta')
        expect(source).toContain('intervalsOver34Ms')
    })

    it('states the measurement scope instead of overstating RSS or compositor jank', () => {
        const source = fs.readFileSync(
            'scripts/benchmark/desktop-reader-long-session-harness.mjs',
            'utf8'
        )
        expect(source).toContain(
            'Chromium Runtime/DOM counters only; not full browser-process RSS'
        )
        expect(source).toContain(
            'requestAnimationFrame interval observation during controlled Reader scrolling; not compositor frame telemetry'
        )
        expect(source).toContain('forcedGcBeforeMemorySamples: true')
        expect(source).not.toContain('residentSetSize')
        expect(source).not.toContain('performance.memory')
        expect(source).not.toContain('budgetMs')
        expect(source).not.toContain('p95 <')
    })

    it('keeps CI short and hosted results non-promotional', () => {
        const workflow = fs.readFileSync(
            '.github/workflows/desktop-reader-long-session-harness.yml',
            'utf8'
        )
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        expect(workflow).toContain('--cycles=6')
        expect(workflow).toContain('--harness-validation-only')
        expect(workflow).toContain('--with-deps')
        expect(workflow).toContain('github.event.repository.private == false')
        expect(pkg.devDependencies?.['@playwright/test']).toBeUndefined()
    })

    it('continues using the fully local J5 fixture with no direct SQL', () => {
        const seed = fs.readFileSync(
            'scripts/benchmark/seed-desktop-browser-detail-reader-fixture.ts',
            'utf8'
        )
        expect(seed).toContain('database.markPictureDownloaded')
        expect(seed).toContain('pageCountPerEpisode: 3')
        expect(seed).not.toContain('new DatabaseSync')
        expect(seed).not.toContain('INSERT INTO')
    })
})
