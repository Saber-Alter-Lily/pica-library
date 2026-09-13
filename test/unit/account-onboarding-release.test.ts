import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('account onboarding distribution candidate', () => {
    it('uses distinct monotonically increasing desktop and Android versions', () => {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        const gradle = fs.readFileSync(
            'mobile/android-alpha2/app/build.gradle',
            'utf8'
        )
        expect(pkg.version).toBe('0.3.12')
        expect(gradle).toContain('versionCode 39')
        expect(gradle).toContain(
            "versionName '0.1.0-alpha8.12-account-onboarding'"
        )
    })

    it('requires the checksum-verified official base without replacing the launcher', () => {
        const script = fs.readFileSync(
            'scripts/build-windows-package.ps1',
            'utf8'
        )
        expect(script).toContain("$version -eq '0.3.12'")
        expect(script).toContain(
            'artifacts\\release-base\\Pica-Library-v0.3.11-windows-x64.zip'
        )
        expect(script).toContain(
            '0356f2c81259c1d8c43022be7be03232c376eb469242b8e41480f6c5f2e4e660'
        )
        expect(script).toContain(
            'Launcher source changed since accepted stable package'
        )
    })
})
