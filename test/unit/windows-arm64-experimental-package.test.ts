import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { desktopPlatformCapabilities } from '../../src/desktop/platform'
import { appCapabilities } from '../../src/app-capabilities'

const read = (file: string) => fs.readFileSync(file, 'utf8')

describe('experimental Windows ARM64 package', () => {
    it('keeps ARM64 explicitly outside the Windows x64 production channel', () => {
        expect(desktopPlatformCapabilities('win32', 'arm64')).toMatchObject({
            id: 'windows',
            arch: 'arm64',
            runtimeFoundation: true,
            distributionReady: false,
            secureCredentialPersistence: true,
            nativeFolderPicker: true,
            nativeSavePicker: true,
            selfUpdate: false
        })
        const caps = appCapabilities(false, 'win32', 'arm64', {
            runtime: { mode: 'headless' },
            platform: {
                id: 'windows',
                arch: 'arm64',
                runtimeFoundation: true,
                selfUpdate: false
            },
            credentialBackend: {
                kind: 'windows-dpapi',
                securePersistence: true
            },
            nativePicker: {
                backend: 'windows-winforms',
                folderPicker: true,
                savePicker: true
            },
            managedEhBrowser: null
        })
        expect(caps.features.updatePackages).toBe(false)
        expect(caps.capabilityStates.selfUpdate.available).toBe(false)
    })

    it('builds only from the official ARM64 runtime on a native ARM64 runner', () => {
        const build = read('scripts/build-windows-arm64-experimental.ps1')
        const workflow = read('.github/workflows/windows-arm64-experimental.yml')

        expect(workflow).toContain('runs-on: windows-11-arm')
        expect(workflow).toContain('OSArchitecture')
        expect(workflow).toContain('Architecture]::Arm64')
        expect(build).toContain('node-v$nodeVersion-win-arm64.zip')
        expect(build).toContain('SHASUMS256.txt')
        expect(build).toContain('Official Node.js Windows ARM64 runtime checksum mismatch')
        expect(build).toContain("runtimeIdentity -ne 'win32/arm64'")
        expect(build).toContain('/platform:anycpu')
        expect(build).toContain('formalRelease = $false')
        expect(build).toContain('distributionReady = $false')
        expect(build).toContain('selfUpdate = $false')
    })

    it('tests preview-to-preview application replacement and rollback', () => {
        const replacement = read('scripts/test-windows-arm64-preview-replacement.ps1')
        const workflow = read('.github/workflows/windows-arm64-experimental.yml')

        expect(workflow).toContain(
            'Build first accepted Windows ARM64 preview baseline'
        )
        expect(workflow).toContain(
            'Pica-Library-windows-arm64-preview-baseline.zip'
        )
        expect(workflow).toContain(
            './scripts/test-windows-arm64-preview-replacement.ps1 -BaselineArchive $baseline.FullName -CandidateArchive $candidate.FullName'
        )
        expect(workflow).toContain(
            "'scripts/test-windows-arm64-preview-replacement.ps1'"
        )
        expect(replacement).toContain('ARM64 Replacement Baseline')
        expect(replacement).toContain('ARM64 Candidate Marker')
        expect(replacement).toContain('Restore-Data')
        expect(replacement).toContain(
            'Schema-changing ARM64 candidate did not create the required pre-migration database backup'
        )
        expect(replacement).toContain(
            'Windows ARM64 preview replacement/rollback acceptance: PASS'
        )
    })

    it('runs an end-to-end packaged ARM64 Desktop and DPAPI acceptance', () => {
        const acceptance = read('scripts/test-windows-arm64-experimental.ps1')
        const workflow = read('.github/workflows/windows-arm64-experimental.yml')

        expect(acceptance).toContain("identity -ne 'win32/arm64'")
        expect(acceptance).toContain("credentialBackend.kind -ne 'windows-dpapi'")
        expect(acceptance).toContain('DPAPI credential file contains plaintext secret')
        expect(acceptance).toContain('/api/v1/library/query')
        expect(acceptance).toContain('/api/v1/comics/windows-arm64-1')
        expect(acceptance).toContain('/api/v1/shelves/$shelfId/items')
        expect(acceptance).toContain('/api/v1/reader/pictures/windows-arm64-pic-1')
        expect(acceptance).toContain('/api/v1/reader/progress')
        expect(acceptance).toContain('/api/v1/downloads/$jobId/pause')
        expect(acceptance).toContain('/api/v1/downloads/$jobId/resume')
        expect(acceptance).toContain('DPAPI credentials did not reload after process restart')
        expect(acceptance).toContain('Windows ARM64 experimental package acceptance: PASS')
        expect(workflow).toContain(
            './scripts/test-windows-arm64-experimental.ps1 -Archive $archive.FullName'
        )
        expect(workflow).not.toContain('gh release')
        expect(workflow).not.toContain('contents: write')
    })
})
