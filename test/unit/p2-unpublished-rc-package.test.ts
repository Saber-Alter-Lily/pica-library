import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { releasedUpdateBaseline } from '../../src/update/released-baselines'
import { classifyUpdateCompatibility } from '../../src/update/compatibility'
import { latestMigrationVersion } from '../../src/storage/sqlite/migrations'

const read = (file: string) => fs.readFileSync(file, 'utf8')

describe('P2 unpublished RC package contract', () => {
    it('does not bump or publish the stable product version', () => {
        const pkg = JSON.parse(read('package.json'))
        const workflow = read(
            '.github/workflows/p2-unpublished-rc-packages.yml'
        )

        expect(pkg.version).toBe('0.4.11')
        expect(workflow).toContain('0.4.11-p2rc.')
        expect(workflow).toContain('permissions:\n  contents: read')
        expect(workflow).toContain('workflow_dispatch:')
        expect(workflow).toContain(
            'push:\n    branches: [release/p2-unpublished-rc-packages-v2, fix/android-rc-ux-performance-batch]\n  pull_request:'
        )
        expect(workflow).not.toMatch(/contents:\s*write/)
        expect(workflow).not.toContain('gh release')
        expect(workflow).not.toContain('git tag')
        expect(workflow).not.toContain('android-preview')
    })

    it('keeps the stable Windows builder unchanged and isolates RC repackaging', () => {
        const launcher = read('packaging/windows/RcLauncher.cs')
        const stableBuild = read('scripts/build-windows-package.ps1')
        const rcBuild = read('scripts/build-windows-rc-package.ps1')
        const workflow = read(
            '.github/workflows/p2-unpublished-rc-packages.yml'
        )
        const smoke = read('scripts/test-windows-artifact.ps1')

        expect(launcher).toContain('PICA_LIBRARY_DESKTOP_HOME')
        expect(launcher).toContain(
            'Environment.GetEnvironmentVariable("LOCALAPPDATA")'
        )
        expect(launcher).toContain('Pica Library P2 RC')
        expect(launcher).toContain('PICA_LIBRARY_TEST_BUILD')
        expect(launcher).toContain('p2-unpublished-rc')

        expect(stableBuild).not.toContain('PICA_LIBRARY_UNPUBLISHED_RC')
        expect(stableBuild).not.toContain('RcLauncher.cs')
        expect(stableBuild).toContain(
            "'Pica-Library-v0.4.11-windows-x64'"
        )

        expect(rcBuild).toContain("$stableVersion -ne '0.4.11'")
        expect(rcBuild).toContain(
            "$RcVersion -notmatch '^0\\.4\\.11-p2rc\\.[0-9a-f]{7,12}$'"
        )
        expect(rcBuild).toContain(
            'artifacts\\release-base\\Pica-Library-v0.4.10-windows-x64.zip'
        )
        expect(rcBuild).toContain('scripts\\build-windows-package.ps1')
        expect(rcBuild).toContain('$candidatePackage.version = $RcVersion')
        expect(rcBuild).toContain('$originalPackageText')
        expect(rcBuild).toContain('packaging\\windows\\RcLauncher.cs')
        expect(rcBuild).toContain('%LOCALAPPDATA%\\Pica Library P2 RC')
        expect(rcBuild).toContain('local-test-windows-x64')

        expect(workflow).toContain('build-windows-rc-package.ps1')
        expect(workflow).toContain(
            '6d53832632545634ced23d24c67aa16e0e8c25ffa10e185f0a14a92962575aab'
        )
        expect(workflow).toContain(
            '0bc9ef7e10fcef8d559739ab0186d6ddb7923d09c5be49a6782ddba096158e39'
        )
        expect(workflow).toContain('Pica-Library-v0.4.11-windows-x64.zip')
        expect(workflow).toContain('v0.4.11 one-click bridge would replace app/updater.js')
        expect(workflow).toContain('databaseSchemaVersion -ne 14')
        expect(workflow).toContain("sourceVersionRange -ne '=0.4.11'")
        expect(workflow).toContain("bridgePaths -contains 'app/updater.js'")
        expect(workflow).toContain("bridgePaths -notcontains 'app/full-upgrader.js'")
        expect(workflow).toContain('test-windows-v0411-incremental-upgrade.ps1')
        expect(workflow).toContain('formal-layout-candidate')

        expect(smoke).toContain("[string]$ExpectedVersion = ''")
        expect(smoke).toContain(
            "[string]$DesktopHomeName = 'Pica Library'"
        )
        expect(smoke).toContain(
            '$desktopHome = Join-Path $local $DesktopHomeName'
        )
        const fullUpgrade = read(
            'scripts/test-windows-universal-full-upgrade.ps1'
        )
        expect(workflow).toContain(
            'test-windows-universal-full-upgrade.ps1'
        )
        expect(workflow).toContain('-BaselineZip')
        expect(workflow).toContain('-CandidateZip')
        expect(fullUpgrade).toContain('universal_full_upgrade')
        expect(fullUpgrade).toContain(
            'external_database_preserved'
        )
        expect(smoke).toContain("'app\\full-upgrader.js'")
    })

    it('builds Android as a signed side-by-side QA identity only', () => {
        const workflow = read(
            '.github/workflows/p2-unpublished-rc-packages.yml'
        )

        expect(workflow).toContain(':app:assembleDebug')
        expect(workflow).not.toContain(':app:assembleRelease')
        expect(workflow).toContain(
            "package: name='com.picalibrary.android.dev'"
        )
        expect(workflow).toContain(
            "application-label:'Pica Library Dev'"
        )
        expect(workflow).toContain('ANDROID_PREVIEW_KEYSTORE_B64')
        expect(workflow).toContain(
            '64fb87dc7d8bd6bc7b2cec92cc8c83fad3afe8cfb07591a2e53d53cbd3ab2f9d'
        )
        expect(workflow).toContain('formal OTA disabled')
        expect(workflow).toContain('retention-days: 1')
    })

    it('preserves the stable updater security boundary instead of inventing a stable-to-RC bypass', () => {
        const manager = read('src/update/manager.ts')
        const workflow = read(
            '.github/workflows/p2-unpublished-rc-packages.yml'
        )

        expect(manager).toContain(
            'Stable builds reject local-test update packages'
        )
        expect(workflow).not.toContain('build:local-update')
        expect(workflow).not.toContain('update-from-v0.4.11')
        const incrementalAcceptance = read(
            'scripts/test-windows-v0411-incremental-upgrade.ps1'
        )
        expect(incrementalAcceptance).toContain(
            "runtime-state\\upgrade-assistant"
        )
        expect(incrementalAcceptance).toContain(
            "persistent_upgrade_assistant = 'PASS'"
        )
        expect(workflow).toContain('formal-layout-candidate')
        expect(workflow).toContain('TEST_BUILD.txt')
        expect(workflow).toContain('test-windows-v0411-incremental-upgrade.ps1')
        expect(workflow).toContain('-CandidateZip $formalZip')
        const incrementalAcceptance = read(
            'scripts/test-windows-v0411-incremental-upgrade.ps1'
        )
        expect(incrementalAcceptance).toContain("baseline_version = '0.4.11'")
        expect(incrementalAcceptance).toContain('candidate_schema = 14')
        expect(incrementalAcceptance).toContain('legacy_updater_preserved = $true')
        expect(incrementalAcceptance).toContain('universal_full_upgrader_installed = $true')
    })

    it('keeps the next stable one schema step from public v0.4.11', () => {
        expect(releasedUpdateBaseline('0.4.11')).toMatchObject({
            appApiVersion: 2,
            advertisedDatabaseSchemaVersion: 13,
            actualMigrationVersion: 13
        })
        expect(latestMigrationVersion).toBe(14)
        expect(
            classifyUpdateCompatibility({
                currentAppApiVersion: 2,
                currentDatabaseSchemaVersion: 13,
                targetAppApiVersion: 2,
                targetDatabaseSchemaVersion: latestMigrationVersion
            })
        ).toEqual({
            kind: 'INCREMENTAL',
            reason: 'COMPATIBLE'
        })
    })
})
