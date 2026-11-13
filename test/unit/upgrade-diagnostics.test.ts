import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => {
    for (const root of roots.splice(0))
        fs.rmSync(root, { recursive: true, force: true })
})

describe('bounded upgrade acceptance diagnostics', () => {
    it('retains failure diagnostics on CI without copying account/database snapshots', () => {
        const workflow = fs.readFileSync(
            '.github/workflows/next-consolidated-acceptance.yml',
            'utf8'
        )
        const composition = fs.readFileSync(
            'scripts/test-windows-runtime-compositions.ps1',
            'utf8'
        )
        expect(workflow).toContain('test-windows-runtime-compositions.ps1')
        expect(composition).toContain(
            'DiagnosticsDirectory="artifacts/runtime-composition-evidence/'
        )
        expect(composition).toContain('ForceLaunchFailure=$true')
        expect(workflow).toContain(
            'name: Pica-Library-Next-Acceptance-Upgrade-Diagnostics-${{ github.run_attempt }}'
        )
        expect(workflow).not.toContain('overwrite: true')
        const step = workflow.slice(
            workflow.indexOf(
                '- name: Retain bounded synthetic upgrade diagnostics'
            )
        )
        expect(step).toContain('if: always()')
        expect(step).toContain('artifacts/upgrade-diagnostics/')
        expect(step).toContain('artifacts/runtime-composition-evidence/')
        expect(step).not.toContain('path: ${{ runner.temp }}')
        const script = fs.readFileSync(
            'scripts/test-windows-universal-full-upgrade.ps1',
            'utf8'
        )
        expect(script).toContain('-RedirectStandardError')
        expect(script).toContain('-RedirectStandardOutput')
        expect(script).toContain('Write-PicaUpgradeDiagnostics')
        expect(script).toContain(
            'Refusing to stop a process outside the exact upgrade acceptance root'
        )
    })

    it.runIf(process.platform === 'win32')(
        'executes the actual PowerShell diagnostics module with synthetic size/secret/path counterexamples',
        () => {
            const root = fs.mkdtempSync(
                path.join(os.tmpdir(), 'pica-upgrade-diagnostic-test-')
            )
            roots.push(root)
            const file = path.join(root, 'evidence.json')
            const run = spawnSync(
                'pwsh.exe',
                [
                    '-NoProfile',
                    '-NonInteractive',
                    '-File',
                    path.resolve('scripts/test-upgrade-diagnostics.ps1'),
                    '-EvidenceFile',
                    file
                ],
                {
                    encoding: 'utf8',
                    timeout: 30000,
                    maxBuffer: 1024 * 1024,
                    windowsHide: true
                }
            )
            expect(run.status, run.stdout + '\n' + run.stderr).toBe(0)
            expect(
                JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
            ).toMatchObject({
                pass: true,
                boundedTail: true,
                helperErrorPreserved: true,
                progressAllowlist: true,
                sensitiveCanaryExcluded: true,
                invalidInputsRejected: 3,
                productionAccessed: false
            })
        }
    )
})
