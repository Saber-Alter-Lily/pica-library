import fs from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

// Reuse the lockfile's existing ESLint parser dependency, without adding/upgrading packages.
const yaml = createRequire(createRequire(import.meta.url).resolve('eslint'))('js-yaml')
const text = fs.readFileSync('.github/workflows/user-host-acceptance.yml', 'utf8')
const workflow = yaml.load(text)
const branch = "github.ref == 'refs/heads/codex/concentrated-acceptance-20261027'"
const steps = (job: string) => workflow.jobs[job].steps as Record<string, any>[]
const script = (job: string) => steps(job).map(step => step.run ?? '').join('\n')

describe('one unpublished concentrated acceptance build', () => {
    it('requires an explicit manual scope and cannot sign on a push or PR', () => {
        expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch'])
        const scope = workflow.on.workflow_dispatch.inputs.package_set
        expect(scope).toMatchObject({ required: true, type: 'choice', default: 'windows-only' })
        expect(scope.options).toEqual(['windows-only', 'windows-and-signed-dev89'])
        for (const job of Object.values(workflow.jobs) as any[]) {
            expect(job.if).toContain(branch)
            expect(job.if).toContain("github.event_name == 'workflow_dispatch'")
            expect(job.if).toContain("github.repository == 'Saber-Alter-Lily/pica-library'")
        }
        expect(workflow.jobs.android.if).toContain("inputs.package_set == 'windows-and-signed-dev89'")
        expect(workflow.permissions).toEqual({ contents: 'read' })
    })
    it('keeps fixed secrets in the one Android signing step after native gates', () => {
        expect(JSON.stringify(workflow.env)).not.toContain('secrets.')
        const secretSteps = Object.entries(workflow.jobs).flatMap(([job, value]: [string, any]) =>
            value.steps.filter((step: any) => JSON.stringify(step).includes('secrets.')).map((step: any) => ({ job, step })))
        expect(secretSteps).toHaveLength(1)
        expect(secretSteps[0].job).toBe('android')
        expect(Object.keys(secretSteps[0].step.env)).toEqual(['ANDROID_PREVIEW_KEYSTORE_B64', 'ANDROID_PREVIEW_KEYSTORE_PASSWORD'])
        const native = steps('android').findIndex(step => step.name === 'Full native tests, lint and release shrinker before secrets')
        expect(native).toBeGreaterThan(-1)
        expect(steps('android').indexOf(secretSteps[0].step)).toBeGreaterThan(native)
        expect(workflow.jobs.android.needs).toBe('source')
        expect(script('android')).toContain('trap \'rm -f -- "$ANDROID_PREVIEW_KEYSTORE_PATH"; rmdir -- "$signing_dir"\' EXIT')
    })
    it('uses one higher Dev build number and checks package, label and fixed certificate', () => {
        expect(Number(workflow.env.PICA_ANDROID_CANDIDATE_VERSION_CODE)).toBe(89)
        expect(script('android')).toContain('export PICA_ANDROID_VERSION_CODE="$PICA_ANDROID_CANDIDATE_VERSION_CODE"')
        expect(script('android')).toContain('versionCode=\'$PICA_ANDROID_CANDIDATE_VERSION_CODE\'')
        expect(script('android')).toContain("package: name='com.picalibrary.android.dev'")
        expect(script('android')).toContain("application-label:'Pica Library Dev'")
        expect(script('android')).toContain('test "$cert" = "$EXPECTED_CERT"')
        expect(workflow.jobs.android.env.EXPECTED_CERT).toBe('64fb87dc7d8bd6bc7b2cec92cc8c83fad3afe8cfb07591a2e53d53cbd3ab2f9d')
    })
    it('retains complete source and both platform test gates including the local-deferred HTTP suite', () => {
        expect(script('source')).toContain('pnpm type:check')
        expect(script('source')).toContain('pnpm web:check')
        expect(script('source')).toContain('pnpm exec vitest run --maxWorkers=4')
        expect(script('source')).toContain('gradle -p source-jvm test bundle dependencyNotices')
        expect(script('source')).toContain('bash scripts/run-web-browser-smoke.sh')
        expect(script('windows-unit')).toContain('pnpm exec vitest run --maxWorkers=4')
        expect(script('android')).toContain('gradle :app:testDebugUnitTest :app:lintDebug :app:assembleRelease')
        expect(text).not.toMatch(/continue-on-error|--passWithNoTests|--exclude|gh release|git push|contents: write/)
    })
    it('builds both actual Windows compositions and keeps core separate from optional JM', () => {
        expect(script('windows')).toContain('-SourceRuntimes core')
        expect(script('windows')).toContain('-SourceRuntimes jm')
        expect(script('windows')).toContain('scripts/check-windows-runtime-package.ts $zip core $env:GITHUB_SHA')
        expect(script('windows')).toContain('scripts/check-windows-runtime-package.ts $withJm jm $env:GITHUB_SHA')
        expect(script('windows')).toContain('-LocalOnlySetup -ExpectedSourceRuntimes core')
        expect(script('windows')).toContain('-LocalOnlySetup -ExpectedSourceRuntimes jm')
        expect(script('windows')).toContain("-DesktopHomeName 'Pica Library Post Stable RC'")
    })
    it('retains actual application diagnostics and all six existing component-change cases', () => {
        expect(workflow.jobs['runtime-choice'].strategy.matrix.scenario).toEqual([
            'roundtrip', 'guardrails', 'request-abort', 'hash-mismatch', 'health-rollback', 'launch-rollback'
        ])
        expect(workflow.jobs['runtime-choice'].needs).toBe('windows')
        for (const file of ['source-media', 'local-ingestion', 'sqlite-paths', 'recommendation-module', 'recommendation-audit', 'incremental-update'])
            expect(script('windows')).toContain('test-windows-' + file + '.mjs')
        expect(script('windows')).toContain('./scripts/test-upgrade-diagnostics.ps1')
    })
    it('ships current instructions and retains evidence without uploading keys or synthetic installers as the application', () => {
        for (const job of ['windows', 'android']) {
            expect(script(job)).toContain('CONCENTRATED_ACCEPTANCE_DEV89.zh-CN.md')
            expect(script(job)).toContain('NEXT_CONCENTRATED_ACCEPTANCE_CHECKLIST.zh-CN.md')
        }
        for (const job of Object.keys(workflow.jobs)) for (const step of steps(job)) {
            if (String(step.uses ?? '').startsWith('actions/upload-artifact@')) {
                expect(step.with['retention-days']).toBe(7)
                expect(step.with.path).not.toMatch(/signing|preview\.jks|\.keystore|\.codex|LOCALAPPDATA/)
            }
        }
        expect(text).toContain('Concentrated-SYNTHETIC-NOT-FOR-INSTALLATION')
        expect(script('windows')).toContain('Frozen Dev86 predecessor gate remains HOLD')
    })
})
