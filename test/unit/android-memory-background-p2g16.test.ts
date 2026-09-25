import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('P2-G16 Android memory and background restrictions', () => {
    it('releases only reconstructible bitmap memory on trim callbacks', () => {
        const app = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaLibraryApp.java'
        )
        const covers = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/CoverRepository.java'
        )
        const images = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/ImageRepository.java'
        )
        const test = read(
            'mobile/android-alpha2/app/src/test/java/com/picalibrary/android/AndroidMemoryPressureTest.java'
        )

        expect(covers).toContain('static int memoryBytes()')
        expect(covers).toContain('static void trimMemory()')
        expect(covers).toContain('MEMORY.evictAll()')
        expect(images).toContain('static int memoryBytes()')
        expect(images).toContain('static void trimMemory()')
        expect(images).toContain('CACHE.evictAll()')

        expect(app).toContain('@Override public void onTrimMemory(int level)')
        expect(app).toContain(
            'level>=ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN'
        )
        expect(app).toContain('CoverRepository.trimMemory()')
        expect(app).toContain('ImageRepository.trimMemory()')
        expect(app).not.toContain('CoverRepository.clear(this)')
        expect(app).not.toContain('ImageRepository.clearDisk(this)')

        expect(test).toContain('uiHiddenEvictsReconstructibleBitmapCaches')
        expect(test).toContain('backgroundEvictsReconstructibleBitmapCaches')
        expect(test).toContain('modernNonTrimHintDoesNotPurgeCaches')
    })

    it('uses a WorkManager release with Android 15 background fixes', () => {
        const gradle = read('mobile/android-alpha2/app/build.gradle')
        expect(gradle).toContain(
            "implementation 'androidx.work:work-runtime:2.12.0'"
        )
        expect(gradle).toContain(
            "testImplementation 'androidx.work:work-testing:2.12.0'"
        )
        expect(gradle).not.toContain('androidx.work:work-runtime:2.9.1')
        expect(gradle).not.toContain('androidx.work:work-testing:2.9.1')
    })

    it('keeps durable network work on WorkManager constraints instead of raw services', () => {
        const names = [
            'FavoriteImportJobs.java',
            'PicaBootstrapJobs.java',
            'NativeRecommendationJobs.java',
            'PicaDownloadJobs.java',
            'EhDownloadJobs.java',
            'UpdateCheckJobs.java',
            'SupporterSyncJobs.java',
        ]
        for (const name of names) {
            const source = read(
                'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/' + name
            )
            expect(source).toContain('WorkManager')
            expect(source).toContain('Constraints')
            expect(source).toContain('NetworkType.')
            expect(source).not.toContain('startForegroundService(')
            expect(source).not.toContain('startService(')
        }

        const manifest = read(
            'mobile/android-alpha2/app/src/main/AndroidManifest.xml'
        )
        expect(manifest).toContain('androidx.work.impl.foreground.SystemForegroundService')
        expect(manifest).toContain('android:foregroundServiceType="dataSync"')
    })

    it('proves real-process trim eviction and Doze defer/resume on an emulator', () => {
        const debugManifest = read(
            'mobile/android-alpha2/app/src/debug/AndroidManifest.xml'
        )
        const memoryProbe = read(
            'mobile/android-alpha2/app/src/debug/java/com/picalibrary/android/MemoryPressureProbeActivity.java'
        )
        const backgroundSeed = read(
            'mobile/android-alpha2/app/src/debug/java/com/picalibrary/android/BackgroundRestrictionSeedActivity.java'
        )
        const backgroundWorker = read(
            'mobile/android-alpha2/app/src/debug/java/com/picalibrary/android/BackgroundRestrictionProbeWorker.java'
        )
        const script = read('scripts/run-android-memory-background.sh')
        const workflow = read('.github/workflows/android-memory-background.yml')

        expect(debugManifest).toContain('android:name=".MemoryPressureProbeActivity"')
        expect(debugManifest).toContain(
            'android:name=".BackgroundRestrictionSeedActivity"'
        )
        expect(memoryProbe).toContain('CoverRepository.memoryBytes()')
        expect(memoryProbe).toContain('ImageRepository.memoryBytes()')
        expect(backgroundSeed).toContain('.setInitialDelay(15, TimeUnit.SECONDS)')
        expect(backgroundSeed).toContain(
            '.setRequiredNetworkType(NetworkType.CONNECTED)'
        )
        expect(backgroundWorker).toContain('RUN_COUNT_FILE')

        expect(script).toContain(
            'adb shell am send-trim-memory "$TARGET_PACKAGE" HIDDEN'
        )
        expect(script).toContain('before_pid')
        expect(script).toContain('before_pid" != "$after_pid')
        expect(script).toContain('adb shell cmd deviceidle force-idle')
        expect(script).toContain('sleep 22')
        expect(script).toContain('executed while device was forced into Doze')
        expect(script).toContain('adb shell cmd deviceidle unforce')
        expect(script).toContain('WorkManager probe did not resume after leaving Doze')

        expect(workflow).toContain('ReactiveCircus/android-emulator-runner@v2')
        expect(workflow).toContain('github.event.repository.private')
        expect(workflow).toContain('bash scripts/run-android-memory-background.sh')

        const releaseManifest = read(
            'mobile/android-alpha2/app/src/main/AndroidManifest.xml'
        )
        expect(releaseManifest).not.toContain('MemoryPressureProbeActivity')
        expect(releaseManifest).not.toContain('BackgroundRestrictionSeedActivity')
        expect(releaseManifest).not.toContain('BackgroundRestrictionProbeWorker')
    })
})
