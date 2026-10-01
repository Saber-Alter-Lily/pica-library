import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = fs.readFileSync(
    '.github/workflows/v050-release-candidate.yml',
    'utf8'
)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const gradle = fs.readFileSync(
    'mobile/android-alpha2/app/build.gradle',
    'utf8'
)

describe('v0.5.0 formal release candidate workflow', () => {
    it('builds the real v0.4.11 one-click bridge from the permanent v0.5.0 stamp without publishing', () => {
        expect(pkg.version).toBe('0.5.0')
        expect(gradle).toContain("PICA_ANDROID_VERSION_CODE') ?: '55'")
        expect(gradle).toContain("PICA_ANDROID_VERSION_NAME') ?: '0.5.0'")
        expect(workflow).toContain('Verify permanent Desktop release stamp')
        expect(workflow).not.toContain('Temporarily stamp Desktop candidate version')
        expect(workflow).toContain(
            'Pica-Library-v$env:TARGET_VERSION-update-from-v$env:BASE_VERSION.zip'
        )
        expect(workflow).toContain(
            'test-windows-v0411-incremental-upgrade.ps1'
        )
        expect(workflow).toContain(
            'PICA_WINDOWS_LAUNCHER_BASE_VERSION'
        )
        expect(workflow).toContain(
            'Pica-Library-v0.5.0-upgrade-assistant-from-v0.4.11.zip'
        )
        expect(workflow).toContain(
            'PICA_ANDROID_VERSION_CODE: \'55\''
        )
        expect(workflow).toContain(
            'PICA_ANDROID_VERSION_NAME: \'0.5.0\''
        )
        expect(workflow).toContain(
            'ReactiveCircus/android-emulator-runner@v2'
        )
        expect(workflow).toContain(
            'bash scripts/test-android-v54-v55-inplace.sh'
        )
        expect(workflow).not.toContain(
            'script: |\n            set -euo pipefail'
        )
        const androidUpgradeScript = fs.readFileSync(
            'scripts/test-android-v54-v55-inplace.sh',
            'utf8'
        )
        expect(androidUpgradeScript).toContain('set -euo pipefail')
        expect(androidUpgradeScript).toContain('adb install -r "$new"')
        expect(androidUpgradeScript).toContain(
            'ANDROID_V54_TO_V55_INPLACE_UPDATE=PASS'
        )
        expect(workflow).toContain('candidate/android-update.json')
        expect(workflow).not.toContain('gh release create')
        expect(workflow).not.toContain('git push --force')
        expect(workflow).not.toContain('gh release upload android-preview')
    })
})
