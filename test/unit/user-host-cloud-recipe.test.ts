import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow=fs.readFileSync('.github/workflows/user-host-acceptance.yml','utf8').replaceAll('\r\n','\n')
describe('authorized user-Host unpublished cloud recipe, source-only',()=>{
    it('confines every job to the exact public non-PR branch with read-only permission',()=>{
        expect(workflow).toContain('branches: [codex/android-user-host-recovery-20261026]')
        expect(workflow.match(/github.event.repository.private == false/g)).toHaveLength(5)
        expect(workflow.match(/github.ref == 'refs\/heads\/codex\/android-user-host-recovery-20261026'/g)).toHaveLength(5)
        expect(workflow.match(/github.event_name != 'pull_request'/g)).toHaveLength(5)
        expect(workflow).toContain('permissions:\n  contents: read')
        expect(workflow).not.toMatch(/(?:contents|actions|pull-requests): write|pull_request_target|continue-on-error/)
    })
    it('runs full tests and existing actual browser/source/Windows gates without local runtime substitutes',()=>{
        expect(workflow).toContain('gradle -p source-jvm test bundle dependencyNotices')
        expect(workflow).toContain('bash scripts/run-web-browser-smoke.sh')
        expect(workflow.match(/pnpm exec vitest run --maxWorkers=4 --minWorkers=1/g)).toHaveLength(2)
        for(const script of ['test-windows-source-media.mjs','test-windows-local-ingestion.mjs','test-windows-sqlite-paths.mjs','test-windows-incremental-update.mjs'])expect(workflow).toContain(script)
        expect(workflow).toContain('-SourceRuntimes core');expect(workflow).toContain('-SourceRuntimes jm')
    })
    it('keeps signed Dev88 separate and verifies one version authority, namespace and fixed certificate',()=>{
        expect(workflow).toContain("PICA_ANDROID_CANDIDATE_VERSION_CODE: '88'")
        expect(workflow).toContain('export PICA_ANDROID_VERSION_CODE="$PICA_ANDROID_CANDIDATE_VERSION_CODE"')
        expect(workflow).toContain('versionCode=\'$PICA_ANDROID_CANDIDATE_VERSION_CODE\'')
        expect(workflow).toContain('com.picalibrary.android.dev')
        expect(workflow).toContain('test "$cert" = "$EXPECTED_CERT"')
        expect(workflow.indexOf('gradle :app:testDebugUnitTest :app:lintDebug :app:assembleRelease')).toBeLessThan(workflow.indexOf('secrets.ANDROID_PREVIEW_KEYSTORE_B64'))
        expect(workflow).not.toMatch(/gh release|upload-release|releases\/assets|ota\/|latest\.json/)
    })
    it('retains exact released hash and six real current-helper cases, not an invented old predecessor PASS',()=>{
        expect(workflow).toContain('14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf')
        expect(workflow).toContain('scenario: [roundtrip, guardrails, request-abort, hash-mismatch, health-rollback, launch-rollback]')
        expect(workflow).toContain('node scripts/test-windows-runtime-choice.mjs')
        expect(workflow).toContain('cross-version gate and legacy transition T3 are NOT_RUN, not PASS')
        expect(workflow).not.toContain('40222828902')
        expect(workflow).not.toContain('-FrozenDev86Zip')
    })
    it('keeps diagnostic fixtures separate from installables and retains failures',()=>{
        expect(workflow).toContain('User-Host-SYNTHETIC-NOT-FOR-INSTALLATION')
        expect(workflow).toContain('candidate/user-host-windows/')
        expect(workflow).toContain('mobile/android-alpha2/candidate-host/')
        expect(workflow).toContain('fail-fast: false')
        expect(workflow.match(/if: always\(\)/g)).toHaveLength(5)
    })
})
