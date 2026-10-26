import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = fs.readFileSync('.github/workflows/runtime-choice-transaction.yml', 'utf8')
describe('separately authorized runtime-choice cloud recipe, source inspection only', () => {
    it('admits only the exact isolated push and no release/signing/write channel', () => {
        expect(workflow).toContain('branches: [codex/reader-runtime-transaction-gate-20261026]')
        expect(workflow.match(/github.repository == 'Saber-Alter-Lily\/pica-library'/g)).toHaveLength(4)
        expect(workflow.match(/github.ref == 'refs\/heads\/codex\/reader-runtime-transaction-gate-20261026'/g)).toHaveLength(4)
        expect(workflow.match(/github.event.repository.private == false/g)).toHaveLength(4)
        expect(workflow).not.toMatch(/pull_request_target|workflow_dispatch|secrets\.|contents: write|actions: write|gh release|ANDROID_PREVIEW|versionCode/)
        expect(workflow).toContain('cancel-in-progress: false')
    })
    it('keeps all six real scenarios independent and full Windows units mandatory', () => {
        expect(workflow).toContain('fail-fast: false')
        expect(workflow).toContain('scenario: [roundtrip, guardrails, request-abort, hash-mismatch, health-rollback, launch-rollback]')
        expect(workflow).not.toContain('continue-on-error')
        expect(workflow).toContain('outputFile=artifacts/runtime-choice-windows-unit.json')
        expect(workflow).toContain('node scripts/test-windows-runtime-choice.mjs artifacts/runtime-choice-fixtures $env:GITHUB_SHA $env:RUNTIME_CHOICE_SCENARIO')
        expect(workflow).toContain('name: Runtime-Choice-Evidence-${{ matrix.scenario }}')
    })
    it('builds an actual marked pair and installs pinned tools outside project dependencies', () => {
        expect(workflow).toContain('./scripts/build-windows-runtime-choice-fixtures.ps1 -ExpectedSourceSha $env:GITHUB_SHA')
        expect(workflow).toContain("$toolRoot = Join-Path $env:RUNNER_TEMP")
        expect(workflow).toContain("pnpm --dir $toolRoot add --save-dev '@playwright/test@1.63.0'")
        expect(workflow).toContain('name: Runtime-Choice-SYNTHETIC-NOT-FOR-INSTALLATION')
        expect(workflow).toContain('if-no-files-found: error')
        expect(workflow).not.toContain('PICA_ANDROID_CANDIDATE_VERSION_CODE')
    })
})
