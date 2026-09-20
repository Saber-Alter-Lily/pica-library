import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const script = fs.readFileSync(
    path.join(
        root,
        'packaging/windows/upgrade-assistant-v041/Upgrade-Pica-Library-v0.4.1.ps1'
    ),
    'utf8'
)
const launcher = fs.readFileSync(
    path.join(
        root,
        'packaging/windows/upgrade-assistant-v041/升级旧版到v0.4.1.cmd'
    ),
    'utf8'
)

describe('v0.4.0 to v0.4.1 Windows upgrade assistant', () => {
    it('pins the accepted source and official target package', () => {
        expect(script).toContain("$RequiredSourceVersion = '0.4.0'")
        expect(script).toContain("$TargetVersion = '0.4.1'")
        expect(script).toContain(
            "$ExpectedZipSha256 = '88d87a8f0e5a8413656751ff344052eccbfa796e663e4acc8c7fe4a0e0866b3d'"
        )
        expect(script).toContain(
            "$ExpectedTargetSourceSha = '974d4e9b22379aeed379b71711008332acc213a4'"
        )
        expect(script).toContain('Get-FileHash -Algorithm SHA256')
    })

    it('protects local data and refuses unsafe in-program library layouts', () => {
        expect(script).toContain("$DataRoot = [IO.Path]::GetFullPath")
        expect(script).toContain('Assert-UserDataOutsideInstall')
        expect(script).toContain('Test-SameOrUnder $LibraryRoot $Root')
        expect(script).toContain('Test-SameOrUnder $DataRoot $Root')
        expect(script).toContain('config\\credentials.dat')
        expect(script).not.toMatch(/Remove-Item[^\n]+\$DataRoot/)
    })

    it('takes database/config snapshots before replacement', () => {
        expect(script).toContain('Save-SafetySnapshot $LibraryDirectory')
        expect(script).toContain("'library.db', 'library.db-wal', 'library.db-shm'")
        expect(script).toContain('Pica Library Upgrade Backups')
        expect(script).toContain('snapshot.json')
        const snapshotIndex = script.indexOf('Save-SafetySnapshot $LibraryDirectory')
        const replaceIndex = script.indexOf(
            'Replace-ApplicationTree $ResolvedOldRoot $target'
        )
        expect(snapshotIndex).toBeGreaterThan(0)
        expect(replaceIndex).toBeGreaterThan(snapshotIndex)
    })

    it('backs up the complete program tree and performs post-upgrade health checks', () => {
        expect(script).toContain('.backup-before-v$TargetVersion-$Stamp')
        expect(script).toContain('Rename-Item -LiteralPath $Root')
        expect(script).toContain("'/api/v1/status'")
        expect(script).toContain("'/api/v1/capabilities'")
        expect(script).toContain('$ExpectedDatabaseSchema = 13')
    })

    it('rolls back both application and database state on failure', () => {
        expect(script).toContain('function Rollback-Upgrade')
        expect(script).toContain('Restore-SafetySnapshot $LibraryDirectory')
        expect(script).toContain('Get-InstallRuntimeProcesses $ResolvedOldRoot')
        expect(script).toContain('Stop-Process -Id')
        expect(script).toContain(
            "Rename-Item -LiteralPath $BackupRoot -NewName"
        )
    })

    it('uses a simple double-click launcher without bundling credentials', () => {
        expect(launcher).toContain('powershell.exe')
        expect(launcher).toContain('-ExecutionPolicy Bypass')
        expect(launcher).toContain('Upgrade-Pica-Library-v0.4.1.ps1')
        expect(launcher).not.toMatch(/PICA_(ACCOUNT|PASSWORD)|token|cookie/i)
    })
})
