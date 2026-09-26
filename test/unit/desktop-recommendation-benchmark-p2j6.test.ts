import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('P2 J6 Desktop recommendation generation/batch benchmarks', () => {
    it('seeds managed V3 through production coordinator APIs rather than SQL internals', () => {
        const seed = fs.readFileSync(
            'scripts/benchmark/seed-desktop-recommendation-benchmark-fixture.ts',
            'utf8'
        )
        expect(seed).toContain('new LibraryDatabase(databaseFile)')
        expect(seed).toContain("database.importCatalog(records, 'benchmark:j6')")
        expect(seed).toContain('new CycleCoordinatorV3(')
        expect(seed).toContain("coordinator.forceNew('p2-j6-fixture')")
        expect(seed).toContain('await coordinator.waitForBuild()')
        expect(seed).toContain('const first = coordinator.current()')
        expect(seed).toContain('candidateCount = 72')
        expect(seed).not.toContain('new DatabaseSync')
        expect(seed).not.toContain('INSERT INTO recommendation_')
    })

    it('measures local managed batch switching separately from generation', () => {
        const source = fs.readFileSync(
            'scripts/benchmark/desktop-recommendation-batch-harness.mjs',
            'utf8'
        )
        expect(source).toContain("require('@playwright/test')")
        expect(source).toContain("chromium.launch({ headless: true })")
        expect(source).toContain('nav [data-view="discover"]')
        expect(source).toContain('[data-tab="recommend"]')
        expect(source).toContain('#recommend-button')
        expect(source).toContain('#recommend-next-batch')
        expect(source).toContain('nextBatchClickToUsableMs')
        expect(source).toContain('cycleGenerationIncludedInMeasurement: false')
        expect(source).toContain('providerSuccessRequired: false')
        expect(source).toContain('maximumMeasuredTransitions: 5')
        expect(source).not.toContain('regenerationConfirmedToUsableMs')
    })

    it('requires explicit real Provider evidence for generation timing', () => {
        const source = fs.readFileSync(
            'scripts/benchmark/desktop-recommendation-generation-harness.mjs',
            'utf8'
        )
        const runner = fs.readFileSync(
            'scripts/run-desktop-recommendation-generation-harness.mjs',
            'utf8'
        )
        expect(source).toContain("optionValue('confirm-regeneration') !== 'YES'")
        expect(source).toContain('#recommend-restart')
        expect(source).toContain('#app-confirm-submit')
        expect(source).toContain('/api/v1/desktop/runtime/tasks')
        expect(source).toContain("task.taskKey === 'recommendation-v3'")
        expect(source).toContain("task.resourceClasses.includes('provider-network')")
        expect(source).toContain('regenerationConfirmedToUsableMs')
        expect(source).toContain('preexistingUsableCycleRequired: true')
        expect(source).toContain('providerNetworkResourceObservationRequired: true')
        expect(runner).toContain('already-configured Pica Library Desktop')
        expect(runner).toContain('--confirm-regeneration=YES')
        expect(runner).toContain('No credentials were read or exported')
        expect(runner).not.toContain('PICA_ACCOUNT')
        expect(runner).not.toContain('PICA_PASSWORD')
    })

    it('keeps the local CI harness isolated and non-promotional', () => {
        const runner = fs.readFileSync(
            'scripts/run-desktop-recommendation-batch-harness.mjs',
            'utf8'
        )
        const workflow = fs.readFileSync(
            '.github/workflows/desktop-recommendation-benchmark-harness.yml',
            'utf8'
        )
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        expect(runner).toContain("const PLAYWRIGHT_VERSION = '1.63.0'")
        expect(runner).toContain("proxyUrl: 'http://127.0.0.1:9'")
        expect(runner).toContain('seed-desktop-recommendation-benchmark-fixture.ts')
        expect(runner).toContain("credentialBackend !== 'windows-dpapi'")
        expect(runner).toContain("credentialBackend !== 'session-memory'")
        expect(workflow).toContain('--harness-validation-only')
        expect(workflow).toContain('--rounds=2')
        expect(workflow).toContain('--with-deps')
        expect(workflow).not.toContain('desktop-recommendation-generation-harness')
        expect(workflow).toContain('github.event.repository.private == false')
        expect(pkg.devDependencies?.['@playwright/test']).toBeUndefined()
    })

    it('does not expose recommendation identities or environment secrets in reports', () => {
        const batch = fs.readFileSync(
            'scripts/benchmark/desktop-recommendation-batch-harness.mjs',
            'utf8'
        )
        const generation = fs.readFileSync(
            'scripts/benchmark/desktop-recommendation-generation-harness.mjs',
            'utf8'
        )
        for (const source of [batch, generation]) {
            expect(source).not.toContain('baseUrl: options.baseUrl')
            expect(source).not.toContain('cycleId:')
            expect(source).not.toContain('comicIds:')
            expect(source).not.toContain('password:')
            expect(source).not.toContain('token:')
            expect(source).not.toContain('budgetMs')
            expect(source).not.toContain('p95 <')
        }
    })
})
