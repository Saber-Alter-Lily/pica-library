import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('P2-G19 loaded Android Macrobenchmark', () => {
    it('keeps loaded performance measurement opt-in and real-workload-only', () => {
        const benchmark = read(
            'mobile/android-alpha2/macrobenchmark/src/main/java/com/picalibrary/android/macrobenchmark/PicaLoadedMacrobenchmark.java'
        )
        expect(benchmark).toContain('picaG19Loaded')
        expect(benchmark).toContain('Assume.assumeTrue')
        expect(benchmark).toContain('new FrameTimingMetric()')
        expect(benchmark).toContain('new CompilationMode.Partial()')
        expect(benchmark).toContain('null,')
        expect(benchmark).toContain('重新生成手机推荐')
        expect(benchmark).toContain('provider-network')
        expect(benchmark).toContain('cpu-analysis')
        expect(benchmark).toContain('assertRecommendationRunning')
        expect(benchmark).not.toContain('BackgroundRestrictionProbeWorker')
        expect(benchmark).not.toContain('WorkerRecoveryProbeWorker')
    })

    it('uses a benchmark-only resource snapshot bridge', () => {
        const manifest = read(
            'mobile/android-alpha2/app/src/benchmark/AndroidManifest.xml'
        )
        const receiver = read(
            'mobile/android-alpha2/app/src/benchmark/java/com/picalibrary/android/BenchmarkResourceSnapshotReceiver.java'
        )
        const release = read(
            'mobile/android-alpha2/app/src/main/AndroidManifest.xml'
        )
        expect(manifest).toContain('BenchmarkResourceSnapshotReceiver')
        expect(receiver).toContain('AndroidTaskResources.snapshot')
        expect(receiver).toContain('runningTotal=')
        expect(receiver).toContain('waitingTotal=')
        expect(release).not.toContain('BenchmarkResourceSnapshotReceiver')
    })

    it('keeps real provider setup manual and exports no credentials', () => {
        const runner = read('scripts/run-android-loaded-macrobenchmark.sh')
        expect(runner).toContain('prepare|run')
        expect(runner).toContain(':app:installBenchmark')
        expect(runner).toContain('Configure a real Pica source OR sync a real portable candidate base')
        expect(runner).toContain('No credentials are read or exported by this script')
        expect(runner).toContain('picaG19Loaded=true')
        expect(runner).toContain('recommendationOverlapTopLevelFrameTiming')
        expect(runner).toContain('*benchmarkData.json')
        expect(runner).not.toContain('p95 <')
        expect(runner).not.toContain('budgetMs')
    })
})
