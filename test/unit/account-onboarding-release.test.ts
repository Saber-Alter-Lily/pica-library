import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('account onboarding distribution candidate', () => {
    it('uses distinct monotonically increasing desktop and Android versions', () => {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        const gradle = fs.readFileSync(
            'mobile/android-alpha2/app/build.gradle',
            'utf8'
        )
        expect(pkg.version).toBe('0.4.9')
        expect(gradle).toContain(
            "System.getenv('PICA_ANDROID_VERSION_CODE') ?: '52'"
        )
        expect(gradle).toContain('versionCode buildVersionCode')
        expect(gradle).toContain(
            "System.getenv('PICA_ANDROID_VERSION_NAME') ?: '0.4.9'"
        )
        expect(gradle).toContain('versionName buildVersionName')
    })

    it('requires the checksum-verified official v0.4.8 base without replacing the launcher', () => {
        const script = fs.readFileSync(
            'scripts/build-windows-package.ps1',
            'utf8'
        )
        expect(script).toContain("$version -eq '0.4.9'")
        expect(script).toContain(
            'artifacts\\release-base\\Pica-Library-v0.4.8-windows-x64.zip'
        )
        expect(script).toContain(
            '6fd3eb5a1346cd2211efe5b47588b38d4099d6e768f836461969eaf22d64e26d'
        )
        expect(script).toContain(
            'Launcher source changed since accepted stable package'
        )
    })
})
