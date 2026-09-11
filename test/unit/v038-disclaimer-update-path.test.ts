import { describe, expect, it } from 'vitest'
import { normalizeUpdatePath } from '../../src/update/path-safety'

describe('v0.3.8 disclaimer incremental update path', () => {
    it('allows only the explicit root disclaimer file', () => {
        expect(normalizeUpdatePath('DISCLAIMER.md')).toBe('DISCLAIMER.md')
        expect(() => normalizeUpdatePath('DISCLAIMER.exe')).toThrow()
        expect(() => normalizeUpdatePath('LEGAL-NOTICE.md')).toThrow()
        expect(() => normalizeUpdatePath('../DISCLAIMER.md')).toThrow()
    })
})
