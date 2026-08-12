import { describe, expect, it } from 'vitest'
import {
    normalizeAuthorKey,
    normalizeDisplay,
    parseAuthorIdentity
} from '../../src/library/author'

describe('author normalization', () => {
    it('normalizes Unicode width and whitespace', () => {
        expect(normalizeDisplay('  Ａｌｉｃｅ\u200b  ')).toBe('Alice')
        expect(normalizeAuthorKey(' ALICE ')).toBe('alice')
    })

    it('extracts the creator from Circle (Creator)', () => {
        const identity = parseAuthorIdentity('Studio Moon (Alice)')
        expect(identity.circle).toBe('Studio Moon')
        expect(identity.creator).toBe('Alice')
        expect(identity.normalizedKey).toBe('alice')
        expect(identity.needsReview).toBe(true)
    })

    it('flags multi-creator values for review', () => {
        const identity = parseAuthorIdentity('Alice & Bob')
        expect(identity.multiCreator).toBe(true)
        expect(identity.needsReview).toBe(true)
    })
})
