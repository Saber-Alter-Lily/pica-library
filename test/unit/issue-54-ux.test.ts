import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Issue #54 UX regression contract', () => {
    it('uses the JourneyApps custom CaptureActivity pattern for a portrait pairing scanner', () => {
        const manifest = read('mobile/android-alpha2/app/src/main/AndroidManifest.xml')
        const pairing = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PairingActivity.java')
        const capture = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/PortraitCaptureActivity.java')
        expect(manifest).toContain('android:name=".PortraitCaptureActivity"')
        expect(manifest).toContain('android:screenOrientation="portrait"')
        expect(pairing).toContain('setCaptureActivity(PortraitCaptureActivity.class)')
        expect(pairing).toContain('setOrientationLocked(true)')
        expect(capture).toContain('extends CaptureActivity')
    })

    it('makes explanatory info tips larger and visibly yellow', () => {
        const css = read('web/info-tip-v1.css')
        expect(css).toContain('width:22px !important')
        expect(css).toContain('min-height:22px !important')
        expect(css).toContain('#f2b84b')
        expect(css).toContain('color:#9a6400 !important')
    })

    it('shows background visual work, completion/failure feedback and guards stale settings loads', () => {
        const html = read('web/index.html')
        const app = read('web/app.js')
        const css = read('web/styles.css')
        expect(html).toContain('id="visual-background-note"')
        expect(app).toContain('VISUAL_SETTINGS_CACHE_KEY')
        expect(app).toContain('visualSettingsMutationVersion')
        expect(app).toContain('requestVersion === visualSettingsMutationVersion')
        expect(app).toContain('cacheConfirmedVisualSettings(saved)')
        expect(app).toContain("showOperationToast(failure, 'negative'")
        expect(app).toContain("tone = 'warning'")
        expect(app).toContain('setBackgroundTaskIndicator(background)')
        expect(app).toContain("throw new Error(t('visual.noSamples'))")
        expect(css).toContain('#background-task-indicator')
        expect(css).toContain('#operation-toast-stack')
        expect(css).toContain('@keyframes pica-operation-spin')
    })

    it('keeps the visual settings copy complete in Chinese, English and Japanese', () => {
        const common = read('web/i18n.js')
        const ja = read('web/i18n-ja-library.js')
        for (const key of [
            'visual.backgroundHint',
            'visual.backgroundRunning',
            'visual.settingsSaving',
            'visual.settingsSaved',
            'visual.settingsSaveFailed',
            'visual.noPending',
            'visual.noSamples',
            'visual.finishedWithFailures',
            'visual.runFailed',
            'visual.statusUnavailable'
        ]) {
            expect(common.split(key).length - 1).toBeGreaterThanOrEqual(2)
            expect(ja).toContain(`'${key}'`)
        }
    })

    it('persists confirmed visual settings across a database reopen', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-issue54-'))
        const databasePath = path.join(dir, 'library.sqlite')
        let database = new LibraryDatabase(databasePath)
        let service = new LibraryService(database, dir)
        expect(
            service.updateVisualSettings({
                enabled: true,
                samplingMode: 'standard',
                rerankMode: 'LIVE',
                strength: 'STRONG'
            })
        ).toMatchObject({
            enabled: true,
            samplingMode: 'standard',
            rerankMode: 'LIVE',
            strength: 'STRONG'
        })
        database.close()

        database = new LibraryDatabase(databasePath)
        service = new LibraryService(database, dir)
        expect(service.visualSettings()).toMatchObject({
            enabled: true,
            samplingMode: 'standard',
            rerankMode: 'LIVE',
            strength: 'STRONG'
        })
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })
})
