import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string) => fs.readFileSync(file, 'utf8')

describe('v0.4.6 recommendation-controls hotfix release', () => {
    it('keeps desktop and Android formal versions coordinated', () => {
        const pkg = JSON.parse(read('package.json'))
        const gradle = read('mobile/android-alpha2/app/build.gradle')
        expect(pkg.version).toBe('0.4.6')
        expect(gradle).toContain("PICA_ANDROID_VERSION_CODE') ?: '49'")
        expect(gradle).toContain("PICA_ANDROID_VERSION_NAME') ?: '0.4.6'")
    })

    it('ships a scoped update from v0.4.5 and a direct v0.4.0 assistant', () => {
        const workflow = read('.github/workflows/v046-release.yml')
        expect(workflow).toContain("@('0.4.5','f5b93b4a81c78df17bbee793354d4e8df002fad6dcc9c432e334bb7c14fee901')")
        expect(workflow).toContain('Pica-Library-v0.4.6-update-from-v0.4.5.zip')
        expect(workflow).toContain('Pica-Library-v0.4.6-upgrade-assistant.zip')
        expect(workflow).toContain("versionCode='49' versionName='0.4.6'")
        expect(workflow).toContain('Pica-Library-Android-v49.apk')
        expect(workflow).toContain("name: v046-windows-release")
        expect(workflow).toContain("name: v046-android-release")
    })

    it('retires the one-shot v0.4.5 automatic publisher', () => {
        const oldWorkflow = read('.github/workflows/v045-release.yml')
        expect(oldWorkflow).toContain('workflow_dispatch:')
        expect(oldWorkflow).not.toContain('branches: [main]')
    })

    it('keeps the localization regression fix and its browser gate', () => {
        const controls = read('web/recommendation-v5.js')
        const smoke = read('scripts/run-web-browser-smoke.sh')
        expect(controls).toContain('function v5Channels(count){ return v5t(`${count} 条通道`,`${count} channels`,`${count} チャンネル`) }')
        expect(controls).not.toContain('`${v5Channels(count)}`')
        expect(smoke).toContain('test/e2e/recommendation-controls.spec.mjs')
    })
})
