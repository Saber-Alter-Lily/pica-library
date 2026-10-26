import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = fs
    .readFileSync('.github/workflows/next-consolidated-acceptance.yml', 'utf8')
    .replaceAll('\r\n', '\n')
const windows =
    workflow.split('\n  windows:\n')[1]?.split('\n  legacy-first-hop:\n')[0] ??
    ''
const compositionRecipe = fs.readFileSync(
    'scripts/test-windows-runtime-compositions.ps1',
    'utf8'
)

function pinnedPredecessor(value: string) {
    return (
        value.includes("run-id: '40222828902'") &&
        value.includes('repository: Saber-Alter-Lily/pica-library') &&
        value.includes('name: Pica-Library-Next-Acceptance-Windows') &&
        value.includes('path: artifacts/prior-dev86') &&
        value.includes(
            ".Hash.ToLowerInvariant() -ne 'c716bc3d0ab001e34e5173a3caf8ee6412a9e8aa355eee2f84eccf3fdf604b9b'"
        ) &&
        value.includes(
            ".Trim() -ne '4a18ba769fb3c8df1e6bd100293d38db3013b5dc'"
        ) &&
        value.includes("throw 'Frozen Dev86 payload hash mismatch'") &&
        value.includes("throw 'Frozen Dev86 source mismatch'") &&
        value.includes(
            "throw 'Frozen Dev86 artifact unavailable; do not substitute or skip'"
        )
    )
}

describe('candidate-only exact predecessor upgrade recipe', () => {
    it('pins the previous run, package bytes and source without a latest/fallback lookup', () => {
        expect(pinnedPredecessor(windows)).toBe(true)
        expect(windows).not.toContain('continue-on-error:')
    })
    it('detects changed package, source or run authority', () => {
        for (const authority of [
            'c716bc3d0ab001e34e5173a3caf8ee6412a9e8aa355eee2f84eccf3fdf604b9b',
            '4a18ba769fb3c8df1e6bd100293d38db3013b5dc',
            '40222828902'
        ]) {
            expect(
                pinnedPredecessor(windows.replaceAll(authority, 'UNPINNED'))
            ).toBe(false)
        }
    })
    it('scopes read-only artifact permission to the existing non-PR Windows job', () => {
        expect(windows).toContain(
            '    permissions:\n      contents: read\n      actions: read'
        )
        expect(workflow.match(/actions: read/g)).toHaveLength(1)
        expect(workflow).not.toMatch(/(?:contents|actions): write/)
        expect(windows).toContain("github.event_name != 'pull_request'")
        expect(windows).toContain(
            "github.repository == 'Saber-Alter-Lily/pica-library'"
        )
    })
    it('requires normal, health and launch rollback against the exact prior package', () => {
        expect(windows).toContain(
            'test-windows-runtime-compositions.ps1 -CoreZip $zip -WithJmZip $withJm -ReleasedBaselineZip $base -FrozenDev86Zip $prior'
        )
        expect(compositionRecipe).toContain(
            "@{ Baseline=$FrozenDev86Zip; Candidate=$WithJmZip; Label='frozen-dev86-jm' }"
        )
        expect(compositionRecipe).toContain(
            "foreach ($scenario in @('success', 'health-failure', 'launch-failure'))"
        )
        expect(compositionRecipe).toContain(
            "if ($scenario -eq 'health-failure') { $parameters.ForceHealthFailure=$true }"
        )
        expect(compositionRecipe).toContain(
            "if ($scenario -eq 'launch-failure') { $parameters.ForceLaunchFailure=$true }"
        )
        expect(compositionRecipe).toContain(
            'test-windows-universal-full-upgrade.ps1" @parameters'
        )
        expect(compositionRecipe).toContain(
            'DiagnosticsDirectory="artifacts/runtime-composition-evidence/$($entry.Label)/$scenario"'
        )
        expect(windows).toContain('-SourceRuntimes core')
        expect(windows).toContain('-SourceRuntimes jm')
    })
})
