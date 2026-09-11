import { describe, expect, it } from 'vitest'
import { normalizeUpdatePath } from '../../src/update/path-safety'

describe('v0.3.8 disclaimer update boundary', () => {
    it('keeps the root disclaimer outside the updater allowlist while allowing the in-product web notice', () => {
        expect(() => normalizeUpdatePath('DISCLAIMER.md')).toThrow()
        expect(normalizeUpdatePath('web/alpha8-disclaimer.js')).toBe(
            'web/alpha8-disclaimer.js'
        )
        expect(() => normalizeUpdatePath('DISCLAIMER.exe')).toThrow()
        expect(() => normalizeUpdatePath('LEGAL-NOTICE.md')).toThrow()
        expect(() => normalizeUpdatePath('../DISCLAIMER.md')).toThrow()
    })
})
