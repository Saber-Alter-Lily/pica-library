import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('P2-G17 Android resource observation', () => {
    it('keeps classification observe-only and auditable', () => {
        const resources = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/AndroidTaskResources.java'
        )
        expect(resources).toContain('Observe-only Android resource classification')
        expect(resources).toContain('PROVIDER_NETWORK="provider-network"')
        expect(resources).toContain('MEDIA_NETWORK="media-network"')
        expect(resources).toContain('BRIDGE_NETWORK="bridge-network"')
        expect(resources).toContain('CPU_ANALYSIS="cpu-analysis"')
        expect(resources).toContain('FILESYSTEM_HEAVY="filesystem-heavy"')
        expect(resources).toContain('static Snapshot snapshot(Context context)')
        expect(resources).toContain('runningWorkIds.size()')
        expect(resources).toContain('waitingWorkIds.size()')
        expect(resources).not.toContain('cancelWork')
        expect(resources).not.toContain('enqueueUniqueWork')
    })

    it('tags the four heavy Android task families without changing their schedulers', () => {
        const favorite = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/FavoriteImportJobs.java'
        )
        const bootstrap = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaBootstrapJobs.java'
        )
        const recommendation = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/NativeRecommendationJobs.java'
        )
        const pica = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PicaDownloadJobs.java'
        )
        const eh = read(
            'mobile/android-alpha2/app/src/main/java/com/picalibrary/android/EhDownloadJobs.java'
        )

        expect(favorite).toContain('AndroidTaskResources.BRIDGE_NETWORK')
        expect(favorite).toContain('AndroidTaskResources.FILESYSTEM_HEAVY')
        expect(bootstrap).toContain('AndroidTaskResources.PROVIDER_NETWORK')
        expect(bootstrap).toContain('AndroidTaskResources.FILESYSTEM_HEAVY')
        expect(recommendation).toContain('AndroidTaskResources.PROVIDER_NETWORK')
        expect(recommendation).toContain('AndroidTaskResources.CPU_ANALYSIS')
        for (const source of [pica, eh]) {
            expect(source).toContain('AndroidTaskResources.MEDIA_NETWORK')
            expect(source).toContain('AndroidTaskResources.FILESYSTEM_HEAVY')
            expect(source).toContain('WorkManager.getInstance')
        }
    })

    it('keeps real-device collection debug-only', () => {
        const debugManifest = read(
            'mobile/android-alpha2/app/src/debug/AndroidManifest.xml'
        )
        const releaseManifest = read(
            'mobile/android-alpha2/app/src/main/AndroidManifest.xml'
        )
        const collector = read(
            'mobile/android-alpha2/app/src/debug/java/com/picalibrary/android/AndroidResourceObservationActivity.java'
        )
        const unit = read(
            'mobile/android-alpha2/app/src/test/java/com/picalibrary/android/AndroidTaskResourcesTest.java'
        )

        expect(debugManifest).toContain('AndroidResourceObservationActivity')
        expect(releaseManifest).not.toContain('AndroidResourceObservationActivity')
        expect(collector).toContain('p2-g17-resource-snapshot.json')
        expect(collector).toContain('AndroidTaskResources.snapshot')
        expect(unit).toContain('multiResourceWorkIsObservedWithoutDoubleCounting')
        expect(unit).toContain('waitingTotal()')
    })
})
