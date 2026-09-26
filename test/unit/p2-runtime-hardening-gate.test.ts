import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('P2-L runtime hardening promotion gate', () => {
    it('combines the automated runtime-hardening evidence without inventing performance budgets', () => {
        const workflow = read('.github/workflows/p2-runtime-hardening-gate.yml')

        expect(workflow).toContain('workflow_dispatch:')
        expect(workflow).toContain(
            'group: p2-runtime-hardening-${{ github.event.pull_request.number || github.ref }}'
        )
        expect(workflow).toContain('cancel-in-progress: true')
        expect(workflow).toContain(
            'P2_TESTED_SHA: ${{ github.sha }}'
        )
        expect(workflow).toContain(
            'P2_CANDIDATE_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}'
        )
        expect(workflow).toContain(
            'PICA_LIBRARY_BUILD_PROVENANCE: ${{ env.P2_TESTED_SHA }}'
        )
        expect(workflow).not.toContain(
            '- name: Build and smoke current Windows package\n        shell: pwsh\n        env:\n          PICA_LIBRARY_BUILD_PROVENANCE: ${{ env.P2_TESTED_SHA }}'
        )
        expect(workflow).not.toContain(
            'windows-package-smoke:\n    runs-on: windows-latest\n    timeout-minutes: 45\n    env:\n      PICA_LIBRARY_BUILD_PROVENANCE'
        )
        expect(workflow).toContain(
            'P2_GATE_SHA: ${{ env.P2_TESTED_SHA }}'
        )
        expect(workflow).toContain(
            'P2_GATE_CANDIDATE_HEAD_SHA: ${{ env.P2_CANDIDATE_HEAD_SHA }}'
        )
        expect(workflow).toContain('pnpm type:check')
        expect(workflow).toContain('pnpm web:check')
        expect(workflow).toContain('pnpm test')
        expect(workflow).toContain('bash scripts/run-web-browser-smoke.sh')

        for (const contract of [
            'test/unit/long-task-stability-v047.test.ts',
            'test/unit/recommendation-network-recovery.test.ts',
            'test/unit/download-large-queue.test.ts',
            'test/unit/download-runtime-stability.test.ts',
            'test/unit/runtime-resource-coordinator.test.ts',
            'test/unit/runtime-resource-observation-p2c2.test.ts',
            'test/unit/runtime-resource-observation-p2c2b.test.ts',
            'test/unit/runtime-task-diagnostics-p2i1.test.ts',
            'test/unit/runtime-task-diagnostics-p2i2.test.ts',
            'test/unit/http-latency-runtime-p2j1.test.ts',
            'test/unit/http-latency-scenario-p2j2.test.ts',
            'test/unit/desktop-headless-runtime-p5c.test.ts',
            'test/unit/desktop-remediation.test.ts'
        ])
            expect(workflow).toContain(contract)

        expect(workflow).toContain('Prepare previous accepted Windows package')
        expect(workflow).toContain(
            "$releases = Invoke-RestMethod -Headers $headers -Uri 'https://api.github.com/repos/Saber-Alter-Lily/pica-library/releases?per_page=100'"
        )
        expect(workflow).not.toContain(
            "$releases = @(Invoke-RestMethod"
        )
        expect(workflow).toContain("'artifacts\\release-base'")
        expect(workflow).toContain('Previous accepted Windows asset missing')
        expect(workflow).toContain('pnpm build:windows')
        expect(workflow).toContain('scripts/test-windows-artifact.ps1')
        expect(workflow).toContain(':app:testDebugUnitTest')
        expect(workflow).toContain(':app:lintDebug')
        expect(workflow).toContain(':app:assembleRelease')
        expect(workflow).toContain(':macrobenchmark:assembleBenchmark')
        expect(workflow).toContain(
            'bash scripts/run-android-worker-force-stop-recovery.sh'
        )
        expect(workflow).toContain(
            'bash scripts/run-android-memory-background.sh'
        )
        expect(workflow).toContain(
            'node scripts/write-p2-runtime-hardening-gate-report.mjs'
        )

        expect(workflow).not.toContain('p95 <')
        expect(workflow).not.toContain('performanceBudget')
        expect(workflow).not.toContain('G20')
    })

    it('protects workflow diagnostic artifact uploads on private repositories', () => {
        const workflow = read('.github/workflows/p2-runtime-hardening-gate.yml')
        const uploadCount =
            workflow.match(/uses: actions\/upload-artifact@v4/g)?.length ?? 0
        const privateGuardCount =
            workflow.match(
                /github\.event\.repository\.private == false/g
            )?.length ?? 0
        expect(uploadCount).toBeGreaterThanOrEqual(4)
        expect(privateGuardCount).toBeGreaterThanOrEqual(uploadCount)
    })

    it('writes automated PASS while keeping real-world promotion blockers explicit', () => {
        const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-p2l-gate-'))
        try {
            const output = path.join(temp, 'gate.json')
            const result = spawnSync(
                process.execPath,
                ['scripts/write-p2-runtime-hardening-gate-report.mjs'],
                {
                    cwd: root,
                    encoding: 'utf8',
                    env: {
                        ...process.env,
                        P2_GATE_OUTPUT: output,
                        P2_GATE_SHA: 'a'.repeat(40),
                        P2_GATE_CANDIDATE_HEAD_SHA: 'c'.repeat(40),
                        P2_GATE_DESKTOP: 'success',
                        P2_GATE_WINDOWS: 'success',
                        P2_GATE_ANDROID: 'success',
                        P2_GATE_FORCE_STOP: 'success',
                        P2_GATE_MEMORY_BACKGROUND: 'success'
                    }
                }
            )
            expect(result.status).toBe(0)
            const report = JSON.parse(fs.readFileSync(output, 'utf8'))
            expect(report).toMatchObject({
                schemaVersion: 1,
                sourceSha: 'a'.repeat(40),
                candidateHeadSha: 'c'.repeat(40),
                automatedStatus: 'PASS',
                promotionStatus:
                    'AUTOMATED_PASS_EXTERNAL_EVIDENCE_REQUIRED'
            })
            expect(report.externalBlockers.map((item: { id: string }) => item.id))
                .toEqual(
                    expect.arrayContaining([
                        'P2-K-REAL-BENCHMARK-MATRIX',
                        'WINDOWS-MANUAL-TASK-CONTROL',
                        'ANDROID-PHYSICAL-TASK-CONTROL',
                        'ANDROID-G18-G19-PHYSICAL-PERFORMANCE',
                        'LOW-END-WINDOWS-BROWSER-TRACE'
                    ])
                )
            expect(JSON.stringify(report)).toContain(
                'does not by itself satisfy the P2 exit criterion'
            )
        } finally {
            fs.rmSync(temp, { recursive: true, force: true })
        }
    })

    it('fails the machine-readable gate if any automated component fails', () => {
        const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-p2l-fail-'))
        try {
            const output = path.join(temp, 'gate.json')
            const result = spawnSync(
                process.execPath,
                ['scripts/write-p2-runtime-hardening-gate-report.mjs'],
                {
                    cwd: root,
                    encoding: 'utf8',
                    env: {
                        ...process.env,
                        P2_GATE_OUTPUT: output,
                        P2_GATE_SHA: 'b'.repeat(40),
                        P2_GATE_DESKTOP: 'success',
                        P2_GATE_WINDOWS: 'failure',
                        P2_GATE_ANDROID: 'success',
                        P2_GATE_FORCE_STOP: 'success',
                        P2_GATE_MEMORY_BACKGROUND: 'success'
                    }
                }
            )
            expect(result.status).not.toBe(0)
            const report = JSON.parse(fs.readFileSync(output, 'utf8'))
            expect(report).toMatchObject({
                automatedStatus: 'FAIL',
                promotionStatus: 'AUTOMATED_FAIL'
            })
        } finally {
            fs.rmSync(temp, { recursive: true, force: true })
        }
    })
})
