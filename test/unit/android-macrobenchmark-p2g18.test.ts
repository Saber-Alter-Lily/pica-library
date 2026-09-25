import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('P2-G18 Android Macrobenchmark harness', () => {
    it('adds a release-like benchmark variant without changing release identity', () => {
        const settings = read('mobile/android-alpha2/settings.gradle')
        const rootGradle = read('mobile/android-alpha2/build.gradle')
        const app = read('mobile/android-alpha2/app/build.gradle')
        const manifest = read(
            'mobile/android-alpha2/app/src/benchmark/AndroidManifest.xml'
        )

        expect(settings).toContain("include ':macrobenchmark'")
        expect(rootGradle).toContain("id 'com.android.test' version '8.7.3' apply false")
        expect(app).toContain('benchmark {')
        expect(app).toContain('initWith release')
        expect(app).toContain('signingConfig signingConfigs.debug')
        expect(app).toContain("matchingFallbacks = ['release']")
        expect(manifest).toContain('<profileable android:shell="true" />')
        expect(manifest).toContain('BenchmarkSetupActivity')

        const releaseManifest = read(
            'mobile/android-alpha2/app/src/main/AndroidManifest.xml'
        )
        expect(releaseManifest).not.toContain('BenchmarkSetupActivity')
        expect(releaseManifest).not.toContain('<profileable')
    })

    it('uses current official Macrobenchmark and UiAutomator stable libraries', () => {
        const gradle = read('mobile/android-alpha2/macrobenchmark/build.gradle')
        expect(gradle).toContain("id 'com.android.test'")
        expect(gradle).toContain("targetProjectPath = ':app'")
        expect(gradle).toContain(
            "implementation 'androidx.benchmark:benchmark-macro-junit4:1.5.0'"
        )
        expect(gradle).toContain(
            "implementation 'androidx.test.uiautomator:uiautomator:2.4.0'"
        )
        expect(gradle).toContain("variantBuilder.buildType == 'benchmark'")
    })

    it('measures cold startup to usable library and top-level frame timing', () => {
        const benchmark = read(
            'mobile/android-alpha2/macrobenchmark/src/main/java/com/picalibrary/android/macrobenchmark/PicaLibraryMacrobenchmark.java'
        )
        const home = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/HomeActivity.java'
        )
        const setup = read(
            'mobile/android-alpha2/app/src/benchmark/java/com/picalibrary/android/BenchmarkSetupActivity.java'
        )

        expect(benchmark).toContain('new StartupTimingMetric()')
        expect(benchmark).toContain('StartupMode.COLD')
        expect(benchmark).toContain('new FrameTimingMetric()')
        expect(benchmark).toContain('StartupMode.WARM')
        expect(benchmark).toContain('new CompilationMode.Partial()')
        expect(benchmark).toContain('clickAndSettle(device, "推荐")')
        expect(benchmark).toContain('clickAndSettle(device, "在线")')
        expect(benchmark).toContain('clickAndSettle(device, "设置")')
        expect(benchmark).toContain('clickAndSettle(device, "书库")')
        expect(home).toContain('reportUsableLibraryOnce()')
        expect(home).toContain('reportFullyDrawn')
        expect(setup).toContain('LocaleStore.ZH_CN')
        expect(setup).toContain('accepted_version')
        expect(setup).toContain('OnboardingStore.neverAuto(this)')
    })

    it('keeps CI as build validation and reserves promotion data for physical devices', () => {
        const workflow = read('.github/workflows/android-macrobenchmark-build.yml')
        const runner = read('scripts/run-android-macrobenchmark.sh')
        expect(workflow).toContain(
            'gradle :app:assembleBenchmark :macrobenchmark:assembleBenchmark'
        )
        expect(workflow).not.toContain('connectedBenchmarkAndroidTest')
        expect(runner).toContain(':macrobenchmark:connectedBenchmarkAndroidTest')
        expect(runner).toContain('Physical-device results are required for promotion budgets')
        expect(runner).toContain('*benchmarkData.json')
        expect(runner).not.toContain('p95 <')
        expect(runner).not.toContain('budgetMs')
    })
})
