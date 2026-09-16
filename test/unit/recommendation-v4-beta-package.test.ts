import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Recommendation V4 unpublished beta packaging', () => {
    it('isolates Windows beta state from the stable desktop profile', () => {
        const launcher = fs.readFileSync(
            'packaging/windows/BetaLauncher.cs',
            'utf8'
        )
        expect(launcher).toContain('PICA_LIBRARY_DESKTOP_HOME')
        expect(launcher).toContain('Pica Library V4 Beta')
        expect(launcher).toContain('PICA_LIBRARY_TEST_BUILD')
        expect(launcher).not.toContain('Pica Library\\"')
    })

    it('keeps beta artifacts unpublished and short-lived', () => {
        const workflow = fs.readFileSync(
            '.github/workflows/recommendation-v4-test-build.yml',
            'utf8'
        )
        expect(workflow).toContain('permissions:\n  contents: read')
        expect(workflow).toContain('retention-days: 1')
        expect(workflow).not.toMatch(/contents:\s*write|gh release|git tag/)
        expect(workflow).toContain('Pica Library V4 Beta')
        expect(workflow).toContain('BetaLauncher.cs')
    })
})
