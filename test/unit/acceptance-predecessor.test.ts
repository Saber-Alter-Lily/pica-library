import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = fs.readFileSync('.github/workflows/next-consolidated-acceptance.yml', 'utf8').replaceAll('\r\n', '\n')
const windows = workflow.split('\n  windows:\n')[1]?.split('\n  android:\n')[0] ?? ''

function pinnedPredecessor(value: string) {
    return value.includes("run-id: '40204828683'") &&
        value.includes('repository: Saber-Alter-Lily/pica-library') &&
        value.includes('name: Pica-Library-Next-Acceptance-Windows') &&
        value.includes('path: artifacts/prior-dev85') &&
        value.includes(".Hash.ToLowerInvariant() -ne 'd35ca45c7909197236eb27206370504f202b32b62b1f79aca452d0742fb31bb2'") &&
        value.includes(".Trim() -ne '16449a00a0eb2d9d0d792e5efe5312c86dbf4220'") &&
        value.includes("throw 'Frozen Dev85 payload hash mismatch'") &&
        value.includes("throw 'Frozen Dev85 source mismatch'") &&
        value.includes("throw 'Frozen Dev85 artifact unavailable; do not substitute or skip'")
}

describe('candidate-only exact predecessor upgrade recipe', () => {
    it('pins the previous run, package bytes and source without a latest/fallback lookup', () => {
        expect(pinnedPredecessor(windows)).toBe(true)
        expect(windows).not.toContain('continue-on-error:')
    })
    it('detects changed package, source or run authority', () => {
        for (const authority of ['d35ca45c7909197236eb27206370504f202b32b62b1f79aca452d0742fb31bb2', '16449a00a0eb2d9d0d792e5efe5312c86dbf4220', '40204828683']) {
            expect(pinnedPredecessor(windows.replaceAll(authority, 'UNPINNED'))).toBe(false)
        }
    })
    it('scopes read-only artifact permission to the existing non-PR Windows job', () => {
        expect(windows).toContain('    permissions:\n      contents: read\n      actions: read')
        expect(workflow.match(/actions: read/g)).toHaveLength(1)
        expect(workflow).not.toMatch(/(?:contents|actions): write/)
        expect(windows).toContain("github.event_name != 'pull_request'")
        expect(windows).toContain("github.repository == 'Saber-Alter-Lily/pica-library'")
    })
    it('requires normal, health and launch rollback against the exact prior package', () => {
        const scenarios = windows.split('\n').filter(line => line.includes('test-windows-universal-full-upgrade.ps1 -BaselineZip $prior '))
        expect(scenarios).toHaveLength(3)
        expect(scenarios.filter(line => !line.includes('-Force'))).toHaveLength(1)
        expect(scenarios.filter(line => line.includes('-ForceHealthFailure'))).toHaveLength(1)
        expect(scenarios.filter(line => line.includes('-ForceLaunchFailure'))).toHaveLength(1)
        expect(scenarios.every(line => line.includes('-DiagnosticsDirectory artifacts/upgrade-diagnostics/prior-dev85'))).toBe(true)
    })
})
