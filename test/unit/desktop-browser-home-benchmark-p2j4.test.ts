import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('P2 J4 Desktop browser Home/Library benchmark', () => {
    it('measures a real Chromium journey against an already-ready Desktop engine', () => {
        const source = fs.readFileSync(
            'scripts/benchmark/desktop-browser-home-harness.mjs',
            'utf8'
        )
        expect(source).toContain("require('@playwright/test')")
        expect(source).toContain("chromium.launch({ headless: true })")
        expect(source).toContain("page.goto(`${options.baseUrl}/`")
        expect(source).toContain("document.querySelector('#home')")
        expect(source).toContain("document.querySelector('#library-count')")
        expect(source).toContain("page.locator('nav [data-view=\"library\"]')")
        expect(source).toContain("document.querySelector('#library')")
        expect(source).toContain('navigationToShellUsableMs')
        expect(source).toContain('libraryClickToUsableMs')
        expect(source).toContain('navigationToLibraryUsableMs')
        expect(source).toContain('browserLaunchToLibraryUsableMs')
        expect(source).toContain('browserProcessPerRound: true')
        expect(source).toContain('engineStartupIncludedInMeasurement: false')
        expect(source).toContain('playwrightInstallIncludedInMeasurement: false')
    })

    it('prepares synthetic local state outside the measured browser window', () => {
        const runner = fs.readFileSync(
            'scripts/run-desktop-browser-home-harness.mjs',
            'utf8'
        )
        expect(runner).toContain("const PLAYWRIGHT_VERSION = '1.63.0'")
        expect(runner).toContain("'@playwright/test@${PLAYWRIGHT_VERSION}'")
        expect(runner).toContain("PICA_LIBRARY_DESKTOP_HOME: desktopHome")
        expect(runner).toContain("credentialBackend !== 'windows-dpapi'")
        expect(runner).toContain("credentialBackend !== 'session-memory'")
        expect(runner).toContain('J4 refuses system-level credential backend')
        expect(runner).toContain("account: 'synthetic-browser-benchmark'")
        expect(runner).toContain("password: 'synthetic-browser-benchmark'")
        expect(runner).toContain("proxyUrl: 'http://127.0.0.1:9'")
        expect(runner).toContain('/api/v1/desktop/settings')
        expect(runner).toContain("configured: true")
        expect(runner).toContain('PICA_PLAYWRIGHT_TOOL_ROOT: toolRoot')
        expect(runner).toContain('PLAYWRIGHT_BROWSERS_PATH: browsersPath')
        expect(runner).toContain('/api/v1/desktop/shutdown')
    })

    it('keeps Playwright outside committed project dependencies and keeps CI numbers non-promotional', () => {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        const workflow = fs.readFileSync(
            '.github/workflows/desktop-browser-home-harness.yml',
            'utf8'
        )
        const source = fs.readFileSync(
            'scripts/benchmark/desktop-browser-home-harness.mjs',
            'utf8'
        )
        expect(pkg.devDependencies?.['@playwright/test']).toBeUndefined()
        expect(workflow).toContain('--harness-validation-only')
        expect(workflow).toContain('--rounds=2')
        expect(workflow).toContain('--with-deps')
        expect(workflow).toContain('github.event.repository.private == false')
        expect(source).toContain('harnessValidationOnly')
        expect(source).toContain(
            'This report is browser-journey measurement evidence only. It does not define a P2-K performance budget or release threshold.'
        )
        expect(source).not.toContain('budgetMs')
        expect(source).not.toContain('p95 <')
    })

    it('does not emit loopback URL, synthetic credentials or temporary paths in the report', () => {
        const source = fs.readFileSync(
            'scripts/benchmark/desktop-browser-home-harness.mjs',
            'utf8'
        )
        expect(source).not.toContain('baseUrl: options.baseUrl')
        expect(source).not.toContain('toolRoot:')
        expect(source).not.toContain('desktopHome:')
        expect(source).not.toContain('csrfToken:')
        expect(source).not.toContain('account:')
        expect(source).not.toContain('password:')
    })
})
