import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('account onboarding distribution candidate', () => {
    it('uses distinct monotonically increasing desktop and Android versions', () => {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        const gradle = fs.readFileSync(
            'mobile/android-alpha2/app/build.gradle',
            'utf8'
        )
        expect(pkg.version).toBe('0.3.14')
        expect(gradle).toContain('versionCode 41')
        expect(gradle).toContain(
            "versionName '0.1.0-alpha8.14-multi-remote-storage'"
        )
    })

    it('requires the checksum-verified official base without replacing the launcher', () => {
        const script = fs.readFileSync(
            'scripts/build-windows-package.ps1',
            'utf8'
        )
        expect(script).toContain("$version -eq '0.3.14'")
        expect(script).toContain(
            'artifacts\\release-base\\Pica-Library-v0.3.13-windows-x64.zip'
        )
        expect(script).toContain(
            '4575cc0c073d68baac4a6e34979d25c062b83086053f86a87bd0d4d847cf1c77'
        )
        expect(script).toContain(
            'Launcher source changed since accepted stable package'
        )
    })
})
