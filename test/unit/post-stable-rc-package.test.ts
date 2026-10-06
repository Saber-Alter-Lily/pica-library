import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const read = (file: string) => fs.readFileSync(file, 'utf8')
const temporaryDirectories: string[] = []
const sourceSha = '0123456789abcdef0123456789abcdef01234567'

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true })
    }
})

function summarize(overrides: NodeJS.ProcessEnv = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-rc-summary-'))
    temporaryDirectories.push(directory)
    const output = path.join(directory, 'RC_STATUS.json')
    const result = spawnSync(
        process.execPath,
        ['scripts/write-rc-artifact-summary.mjs', output],
        {
            encoding: 'utf8',
            env: {
                ...process.env,
                GITHUB_STEP_SUMMARY: path.join(directory, 'summary.md'),
                RC_EVENT: 'push',
                RC_SOURCE_SHA: sourceSha,
                RC_CONTRACT_RESULT: 'success',
                RC_WINDOWS_RESULT: 'success',
                RC_ANDROID_RESULT: 'success',
                ...overrides
            }
        }
    )
    return {
        exitCode: result.status,
        stderr: result.stderr,
        report: fs.existsSync(output) ? JSON.parse(read(output)) : null
    }
}

describe('post-stable RC evidence reporting', () => {
    it('does not call a green PR contract an installable candidate', () => {
        const result = summarize({
            RC_EVENT: 'pull_request',
            RC_WINDOWS_RESULT: 'skipped',
            RC_ANDROID_RESULT: 'skipped'
        })
        expect(result.exitCode).toBe(0)
        expect(result.report).toMatchObject({
            sourceSha,
            status: 'CONTRACT_ONLY_NO_INSTALLABLE_ARTIFACTS',
            installableArtifactsReady: false,
            manualQa: 'PENDING',
            p2PhysicalEvidence: 'PENDING'
        })
    })

    it.each(['push', 'workflow_dispatch'])(
        'requires both uploaded package jobs on %s',
        (event) => {
            const result = summarize({ RC_EVENT: event })
            expect(result.exitCode).toBe(0)
            expect(result.report).toMatchObject({
                status: 'INSTALLABLE_ARTIFACTS_READY_MANUAL_QA_PENDING',
                installableArtifactsReady: true,
                manualQa: 'PENDING',
                p2PhysicalEvidence: 'PENDING',
                stableReleaseModified: false,
                otaModified: false
            })
        }
    )

    it.each(['RC_CONTRACT_RESULT', 'RC_WINDOWS_RESULT', 'RC_ANDROID_RESULT'])(
        'fails closed for incomplete %s',
        (job) => {
            for (const state of ['skipped', 'failure', 'cancelled']) {
                const result = summarize({ [job]: state })
                expect(result.exitCode).toBe(1)
                expect(result.report).toMatchObject({
                    status: 'FAILED_OR_INCOMPLETE',
                    installableArtifactsReady: false
                })
            }
        }
    )

    it('rejects unexpected package execution on a PR', () => {
        const result = summarize({ RC_EVENT: 'pull_request' })
        expect(result.exitCode).toBe(1)
        expect(result.report.status).toBe('FAILED_OR_INCOMPLETE')
    })

    it.each([
        { RC_SOURCE_SHA: 'main' },
        { RC_EVENT: 'pull_request_target' },
        { RC_WINDOWS_RESULT: '' }
    ])('rejects incomplete or untrusted provenance %j', (overrides) => {
        const result = summarize(overrides)
        expect(result.exitCode).toBe(1)
        expect(result.report).toBeNull()
    })
})

describe('post-stable RC isolation contract', () => {
    const workflow = read('.github/workflows/post-stable-rc-packages.yml')
    const builder = read('scripts/build-windows-rc-package.ps1')

    it('publishes only short-lived CI artifacts, never a stable release or OTA', () => {
        expect(workflow).toContain('permissions:\n  contents: read')
        expect(workflow).not.toMatch(
            /contents:\s*write|gh release|git tag|android-preview|assembleRelease/
        )
        expect(workflow).toContain('if-no-files-found: error')
        expect(workflow).toContain('retention-days: 1')
        expect(workflow).toContain('needs: [contract, windows-rc, android-rc]')
        expect(workflow).toContain('node scripts/write-rc-artifact-summary.mjs')
        expect(
            workflow.match(/if: github.event_name != 'pull_request'/g)
        ).toHaveLength(2)
        expect(
            workflow.match(
                /github.repository == 'Saber-Alter-Lily\/pica-library'/g
            )
        ).toHaveLength(2)
    })

    it('binds packaging to current metadata and checksum-pinned public v0.5.0', () => {
        expect(JSON.parse(read('package.json')).version).toBe('0.5.0')
        expect(workflow).toContain("STABLE_VERSION: '0.5.0'")
        expect(workflow).toContain(
            '14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf'
        )
        expect(workflow).toContain('ref: ${{ github.sha }}')
        expect(builder).toContain('$sourceSha -ne $gitSourceSha')
        expect(builder).toContain(
            '$RcVersion.EndsWith($sourceSha.Substring(0,12))'
        )
        expect(builder).toContain(
            '$env:PICA_WINDOWS_LAUNCHER_BASE_VERSION -ne $stableVersion'
        )
        expect(builder).toContain(
            'finally {\n    [IO.File]::WriteAllText(\n        $packageFile,\n        $originalPackageText,'
        )
    })

    it('keeps new RC data distinct from stable and historical P2 profiles', () => {
        expect(builder).toContain(
            "$desktopHomeName = 'Pica Library Post Stable RC'"
        )
        expect(builder).toContain("$desktopHomeName = 'Pica Library P2 RC'")
        expect(builder).toContain('/define:POST_STABLE_RC')
        const launcher = read('packaging/windows/RcLauncher.cs')
        expect(launcher).toContain('#if POST_STABLE_RC')
        expect(launcher).toContain(
            'Path.Combine(localAppData, "Pica Library Post Stable RC")'
        )
        expect(launcher).toContain(
            'info.EnvironmentVariables["PICA_LIBRARY_DESKTOP_HOME"] = rcHome'
        )
        const upgrade = read('scripts/test-windows-universal-full-upgrade.ps1')
        expect(upgrade).toContain(
            "$DesktopHomeName -notin @('Pica Library P2 RC', 'Pica Library Post Stable RC')"
        )
        expect(upgrade).toContain("$local = Join-Path $work 'localappdata'")
        expect(workflow).toContain(
            "-DesktopHomeName 'Pica Library Post Stable RC' -PortCollision -SetupPersistence"
        )
        expect(workflow).toContain(
            '-CandidateSourceSha $env:GITHUB_SHA -DesktopHomeName'
        )
        expect(read('src/update/manager.ts')).toContain(
            'Stable builds reject local-test update packages'
        )
    })

    it('verifies the existing Android Dev identity and fixed certificate', () => {
        expect(workflow).toContain(
            "package: name='com.picalibrary.android.dev'"
        )
        expect(workflow).toContain("versionCode='55'")
        expect(workflow).toContain("versionName='$rc_version-dev-pr35'")
        expect(workflow).toContain(
            '64fb87dc7d8bd6bc7b2cec92cc8c83fad3afe8cfb07591a2e53d53cbd3ab2f9d'
        )
        expect(workflow).toContain(
            'Test and lint before loading signing material'
        )
        expect(workflow).toContain('stop on signature mismatch')
        expect(workflow).not.toContain('adb uninstall')
    })

    it('runs the real-browser reconnect regression in the established smoke job', () => {
        expect(read('scripts/run-web-browser-smoke.sh')).toContain(
            'test/e2e/update-reconnect.spec.mjs'
        )
        const test = read('test/e2e/update-reconnect.spec.mjs')
        expect(test).toContain("await import('/update-reconnect.js')")
        expect(test).toContain('startup 503')
        expect(test).toContain('non-html-shell')
        expect(test).toContain('wrong-version')
        expect(test).toContain('network-loss')
    })
})
