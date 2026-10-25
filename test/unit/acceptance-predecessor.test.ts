import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = fs.readFileSync('.github/workflows/next-consolidated-acceptance.yml', 'utf8').replaceAll('\r\n', '\n')
const windows = workflow.split('\n  windows:\n')[1]?.split('\n  android:\n')[0] ?? ''

function pinnedPredecessor(value: string) {
    return value.includes("run-id: '40192577286'") &&
        value.includes('repository: Saber-Alter-Lily/pica-library') &&
        value.includes('name: Pica-Library-Next-Acceptance-Windows') &&
        value.includes('path: artifacts/prior-dev84') &&
        value.includes(".Hash.ToLowerInvariant() -ne '571d7fddd0aee561513ed60c2b777e3a88a9445db32ffb7cdcd9265b28d31634'") &&
        value.includes(".Trim() -ne '295942c297f9377b28df5a2d3d32a311fed8a18f'") &&
        value.includes("throw 'Frozen Dev84 payload hash mismatch'") &&
        value.includes("throw 'Frozen Dev84 source mismatch'") &&
        value.includes("throw 'Frozen Dev84 artifact unavailable; do not substitute or skip'")
}

describe('candidate-only exact predecessor upgrade recipe', () => {
    it('pins the previous run, package bytes and source without a latest/fallback lookup', () => {
        expect(pinnedPredecessor(windows)).toBe(true)
        expect(windows).not.toContain('continue-on-error:')
    })
    it('detects changed package, source or run authority', () => {
        for (const authority of ['571d7fddd0aee561513ed60c2b777e3a88a9445db32ffb7cdcd9265b28d31634', '295942c297f9377b28df5a2d3d32a311fed8a18f', '40192577286']) {
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
        expect(scenarios.every(line => line.includes('-DiagnosticsDirectory artifacts/upgrade-diagnostics/prior-dev84'))).toBe(true)
    })
})
