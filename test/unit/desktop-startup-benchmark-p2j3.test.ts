import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('P2 J3 Desktop startup benchmark harness', () => {
    it('measures the real built Desktop process without provider credentials', () => {
        const source = fs.readFileSync(
            'scripts/benchmark/desktop-startup-harness.ts',
            'utf8'
        )
        expect(source).toContain("path.resolve('dist', 'desktop.js')")
        expect(source).toContain("[desktopEntry, '--headless']")
        expect(source).toContain('PICA_LIBRARY_DESKTOP_HOME: home')
        expect(source).toContain(
            "/^PICA_(ACCOUNT|PASSWORD|PROXY|TOKEN|COOKIE|AUTHORIZATION)$/i"
        )
        expect(source).toContain("await runSample('fresh-home', desktopEntry, home, options)")
        expect(source).toContain('`reused-home-${index + 1}`')
        expect(source).toContain('/api/v1/desktop/status')
        expect(source).toContain('/api/v1/desktop/shutdown')
        expect(source).toContain("'x-pica-csrf': csrfToken")
        expect(source).toContain('spawnToInstanceMs')
        expect(source).toContain('spawnToApiReadyMs')
        expect(source).toContain('shutdownToExitMs')
        expect(source).toContain('reusedHomeSummary')
        expect(source).toContain('median')
        expect(source).toContain('min')
        expect(source).toContain('max')
    })

    it('keeps build and harness validation outside promotion-budget semantics', () => {
        const source = fs.readFileSync(
            'scripts/benchmark/desktop-startup-harness.ts',
            'utf8'
        )
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        const workflow = fs.readFileSync(
            '.github/workflows/desktop-startup-harness.yml',
            'utf8'
        )

        expect(pkg.scripts['benchmark:desktop-startup']).toBe(
            'pnpm build && tsx scripts/benchmark/desktop-startup-harness.ts'
        )
        expect(source).toContain('buildIncludedInMeasurement: false')
        expect(source).toContain('harnessValidationOnly')
        expect(source).toContain(
            'This report is measurement evidence only. It does not define a P2-K performance budget or release threshold.'
        )
        expect(source).not.toContain('budgetMs')
        expect(source).not.toContain('p95 <')
        expect(workflow).toContain('--harness-validation-only')
        expect(workflow).toContain('--rounds=2')
        expect(workflow).toContain(
            'github.event.repository.private == false'
        )
    })

    it('keeps output low-cardinality and omits the temporary data-root path', () => {
        const source = fs.readFileSync(
            'scripts/benchmark/desktop-startup-harness.ts',
            'utf8'
        )
        expect(source).toContain(
            "home: 'isolated temp root reused after the fresh-home sample'"
        )
        expect(source).not.toContain('homePath:')
        expect(source).not.toContain('desktopHome:')
        expect(source).not.toContain('csrfToken,')
        expect(source).not.toContain('stdout,')
        expect(source).not.toContain('stderr,')
    })
})
