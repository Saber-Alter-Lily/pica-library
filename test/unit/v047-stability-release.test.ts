import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string) => fs.readFileSync(file, 'utf8')

describe('v0.4.7 historical stability release contract', () => {
    it('keeps the published v0.4.7 workflow retired from automatic main pushes', () => {
        const workflow = read('.github/workflows/v047-release.yml')
        expect(workflow).toContain('name: v0.4.7 Formal Release')
        expect(workflow).toContain('workflow_dispatch:')
        expect(workflow).not.toContain('branches: [main]')
        expect(workflow).toContain("versionCode='50' versionName='0.4.7'")
        expect(workflow).toContain('Pica-Library-Android-v50.apk')
    })

    it('pins v0.4.6 as the immediate formal upgrade baseline', () => {
        const workflow = read('.github/workflows/v047-release.yml')
        expect(workflow).toContain(
            "@('0.4.6','914d691b441e8dbc95a9ef0bb7a7ebc46940bfc44907e0595a8953a293bda50c')"
        )
        expect(workflow).toContain(
            'releases/download/v0.4.6/Pica-Library-Android-Preview.cert-sha256'
        )
        expect(workflow).toContain(
            'Pica-Library-v0.4.7-update-from-v0.4.6.zip'
        )
    })

    it('publishes the complete formal asset set', () => {
        const workflow = read('.github/workflows/v047-release.yml')
        expect(workflow).toContain('Pica-Library-v0.4.7-windows-x64.zip')
        expect(workflow).toContain('Pica-Library-v0.4.7-upgrade-assistant.zip')
        expect(workflow).toContain("versionCode='50' versionName='0.4.7'")
        expect(workflow).toContain('Pica-Library-Android-v50.apk')
        expect(workflow).toContain('name: v047-windows-release')
        expect(workflow).toContain('name: v047-android-release')
        expect(workflow).toContain(
            "scopedUpdateSources=@('0.4.1','0.4.2','0.4.3','0.4.4','0.4.5','0.4.6')"
        )
    })

    it('retires older automatic release publishers', () => {
        for (const file of [
            '.github/workflows/v045-release.yml',
            '.github/workflows/v046-release.yml',
            '.github/workflows/v047-release.yml'
        ]) {
            const workflow = read(file)
            expect(workflow).toContain('workflow_dispatch:')
            expect(workflow).not.toContain('branches: [main]')
        }
    })

    it('keeps long-task stability as an explicit release gate', () => {
        const audit = read('docs/LONG_TASK_STABILITY_V047.md')
        const contract = read('test/unit/long-task-stability-v047.test.ts')
        const pauseStore = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/MobileTaskPauseStore.java')
        expect(audit).toContain('A task that can take more than a few seconds must not behave like a black box.')
        expect(audit).toContain('network interruption recovery tests PASS')
        expect(contract).toContain('v0.4.7 long-task stability contract')
        expect(contract).toContain('PICA_API_TIMEOUT_MS = 15000')
        expect(pauseStore).toContain('background-task-pauses-v1')
    })
})
