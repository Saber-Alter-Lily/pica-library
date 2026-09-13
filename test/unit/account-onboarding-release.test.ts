import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('account onboarding distribution candidate', () => {
    it('uses distinct monotonically increasing desktop and Android versions', () => {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        const gradle = fs.readFileSync(
            'mobile/android-alpha2/app/build.gradle',
            'utf8'
        )
        expect(pkg.version).toBe('0.3.13')
        expect(gradle).toContain('versionCode 40')
        expect(gradle).toContain(
            "versionName '0.1.0-alpha8.13-registration-diagnostics'"
        )
    })

    it('requires the checksum-verified official base without replacing the launcher', () => {
        const script = fs.readFileSync(
            'scripts/build-windows-package.ps1',
            'utf8'
        )
        expect(script).toContain("$version -eq '0.3.13'")
        expect(script).toContain(
            'artifacts\\release-base\\Pica-Library-v0.3.12-windows-x64.zip'
        )
        expect(script).toContain(
            'a18cb46d40a077ba6f6ee46b9c8ee6df78812e2e384bbeff63dbc4a563497810'
        )
        expect(script).toContain(
            'Launcher source changed since accepted stable package'
        )
    })
})
