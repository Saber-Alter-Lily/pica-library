import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const script = fs.readFileSync(
    'scripts/build-windows-package.ps1',
    'utf8'
)

describe('future Windows stable packaging contract', () => {
    it('accepts stable semver without hard-coding every release number', () => {
        expect(script).toContain(
            "$version -match '^\\d+\\.\\d+\\.\\d+$'"
        )
        expect(script).toContain(
            '"Pica-Library-v$version-windows-x64"'
        )
        expect(script).not.toContain("$version -eq '0.5.0'")
    })

    it('requires an explicit checksum-pinned launcher baseline only when requested', () => {
        expect(script).toContain(
            'PICA_WINDOWS_LAUNCHER_BASE_VERSION'
        )
        expect(script).toContain(
            'PICA_WINDOWS_LAUNCHER_BASE_SHA256'
        )
        expect(script).toContain(
            "PICA_WINDOWS_LAUNCHER_BASE_SHA256 must be a 64-character SHA-256"
        )
        expect(script).toContain(
            'launcher base package checksum mismatch'
        )
        expect(script).toContain(
            "launcher_base_version=$launcherBaseReport"
        )
    })
})
