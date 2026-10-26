import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Reader correction cloud recipe, source inspection only', () => {
    it('admits only the exact new branch while preserving repository/non-PR signing restrictions', () => {
        const text = fs.readFileSync(
            '.github/workflows/next-consolidated-acceptance.yml',
            'utf8'
        )
        expect(
            text.match(
                /refs\/heads\/codex\/dev85-local-reader-runtime-fixes-20261025/g
            )
        ).toHaveLength(2)
        expect(text.match(/github.event_name != 'pull_request'/g)).toHaveLength(
            4
        )
        expect(
            text.match(/github.event.repository.private == false/g)
        ).toHaveLength(4)
        expect(
            text.match(/github.repository == 'Saber-Alter-Lily\/pica-library'/g)
        ).toHaveLength(4)
        expect(
            text.match(
                /refs\/heads\/codex\/reader-core-upgrade-dev87-20261025/g
            )
        ).toHaveLength(4)
        const windowsUnit=text.split('\n  windows-unit:\n')[1]?.split('\n  windows:\n')[0]??''
        expect(windowsUnit).toContain('pnpm exec vitest run --maxWorkers=4 --minWorkers=1')
        expect(windowsUnit).toContain('name: Pica-Library-Next-Acceptance-Windows-Unit-Evidence')
        expect(windowsUnit).toContain('if: always()')
        expect(windowsUnit).not.toContain('continue-on-error')
        expect(windowsUnit).not.toContain('secrets.')
        const legacy =
            text
                .split('\n  legacy-first-hop:\n')[1]
                ?.split('\n  android:\n')[0] ?? ''
        expect(legacy).toContain('fail-fast: false')
        expect(legacy).toContain(
            'scenario: [success, hash-mismatch, health-rollback, launch-rollback]'
        )
        expect(legacy).not.toContain('secrets.')
        expect(legacy).not.toContain('continue-on-error')
        expect(text).not.toMatch(/(?:contents|actions): write/)
        expect(
            text.indexOf(
                'Tests, lint and shrinker compatibility before secrets'
            )
        ).toBeLessThan(text.indexOf('secrets.ANDROID_PREVIEW_KEYSTORE_B64'))
    })
    it('requires actual compiled Windows display persistence and explicit LAN disable/restart/token continuity', () => {
        const text = fs.readFileSync(
            'scripts/test-windows-local-ingestion.mjs',
            'utf8'
        )
        for (const marker of [
            'Fresh interactive package opened LAN sharing without opt-in',
            'Local-only setup implicitly enabled LAN sharing',
            "readerSettingsAction: 'save'",
            'Restart lost display settings or restarted disabled LAN sharing',
            'Explicit disable/restart erased pairing records',
            'Preserved paired token failed after explicit enable',
            "error.code === 'ECONNREFUSED'"
        ])
            expect(text.replace(/\s/g, '')).toContain(marker.replace(/\s/g, ''))
        expect(text).toContain('source_sha: sourceSha')
        expect(text).toContain('production_accessed: false')
    })
    it('checks real browser image centering and persisted progress without a test-side scroll repair', () => {
        const text = fs.readFileSync('test/e2e/local-import.spec.mjs', 'utf8')
        for (const marker of [
            'cold continuous resume centers the saved page',
            "await expect.poll(centeredPage).toBe('2')",
            'await expect.poll(centerError).toBeLessThan(24)',
            "'cache-control': 'no-store'",
            'cold-continuous-saved-page.png',
            '.pageIndex).toBe(2)'
        ])
            expect(text.replace(/\s/g, '')).toContain(marker.replace(/\s/g, ''))
        expect(text).not.toMatch(
            /\.scrollIntoView\(|\.scrollTo\(|waitForTimeout\(|test\.skip/
        )
        expect(text).toContain(
            "testInfo.outputPath('cold-continuous-saved-page.png')"
        )
        expect(text).toContain(
            'await page.screenshot({ path: screenshotPath })'
        )
        expect(text.indexOf('real browser imports folder/CBZ')).toBeLessThan(
            text.indexOf('cold continuous resume centers')
        )
    })
    it('retains success/failure browser artifacts without turning previous runtime evidence into a new PASS', () => {
        const text = fs.readFileSync(
            '.github/workflows/next-consolidated-acceptance.yml',
            'utf8'
        )
        expect(text).toContain(
            'artifacts/linux-unit.json\n            test-results/'
        )
        expect(text).toContain('if: always()')
        expect(
            fs.readFileSync('scripts/run-web-browser-smoke.sh', 'utf8')
        ).toContain('test/e2e/local-import.spec.mjs')
    })
})
