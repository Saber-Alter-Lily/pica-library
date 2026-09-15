import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('account onboarding distribution candidate', () => {
    it('uses distinct monotonically increasing desktop and Android versions', () => {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        const gradle = fs.readFileSync(
            'mobile/android-alpha2/app/build.gradle',
            'utf8'
        )
        expect(pkg.version).toBe('0.4.0')
        expect(gradle).toContain('versionCode 42')
        expect(gradle).toContain(
            "versionName '0.1.0-alpha8.15-multi-provider'"
        )
    })

    it('requires the checksum-verified official v0.3.14 base without replacing the launcher', () => {
        const script = fs.readFileSync(
            'scripts/build-windows-package.ps1',
            'utf8'
        )
        expect(script).toContain("$version -eq '0.4.0'")
        expect(script).toContain(
            'artifacts\\release-base\\Pica-Library-v0.3.14-windows-x64.zip'
        )
        expect(script).toContain(
            '211bc7d7d4f384af0389288439e38a645a7e8a458e56d947d005cd179848cb56'
        )
        expect(script).toContain(
            'Launcher source changed since accepted stable package'
        )
    })
})
