import { createHash } from 'node:crypto'
import type { AuthorIdentity } from './types'
import { normalizeDisplay, normalizeAuthorKey } from './author-normalization'
export { normalizeDisplay, normalizeAuthorKey } from './author-normalization'

const genericCreatorKeys = new Set([
    'よろず',
    'various',
    'multiple',
    'unknown',
    '不詳',
    '不明',
    'なし',
    'アンソロジー',
    'n/a'
])

export function authorIdForKey(key: string): string {
    return `author_${createHash('sha1').update(key).digest('hex').slice(0, 16)}`
}

export function parseAuthorIdentity(value: unknown): AuthorIdentity {
    const raw = String(value ?? '')
    const display = normalizeDisplay(raw)
    if (!display) {
        return {
            raw,
            display: '(missing)',
            circle: null,
            creator: '(missing)',
            normalizedKey: '(missing)',
            multiCreator: false,
            genericLabel: true,
            parsed: false,
            confidence: 0,
            evidence: 'missing author value',
            needsReview: true
        }
    }

    const match = display.match(/^(.+?)\s*\(([^()]+)\)\s*$/u)
    const circle = match ? normalizeDisplay(match[1]) : null
    const creator = match ? normalizeDisplay(match[2]) : display
    const normalizedKey = normalizeAuthorKey(creator)
    const multiCreator = /[、,，;&＆/／＋+]|\s(?:and|x|×)\s/iu.test(creator)
    const genericLabel = genericCreatorKeys.has(normalizedKey)

    if (multiCreator) {
        return {
            raw,
            display,
            circle,
            creator,
            normalizedKey,
            multiCreator,
            genericLabel,
            parsed: Boolean(match),
            confidence: 0.35,
            evidence: 'multiple creator names; manual split required',
            needsReview: true
        }
    }
    if (genericLabel) {
        return {
            raw,
            display,
            circle,
            creator,
            normalizedKey,
            multiCreator,
            genericLabel,
            parsed: Boolean(match),
            confidence: 0.3,
            evidence: 'generic creator label; keep circle-specific',
            needsReview: true
        }
    }
    if (match) {
        return {
            raw,
            display,
            circle,
            creator,
            normalizedKey,
            multiCreator,
            genericLabel,
            parsed: true,
            confidence: 0.8,
            evidence: 'parsed as Circle (Creator); confirmation recommended',
            needsReview: true
        }
    }

    return {
        raw,
        display,
        circle,
        creator,
        normalizedKey,
        multiCreator,
        genericLabel,
        parsed: false,
        confidence: 1,
        evidence: 'single normalized author value',
        needsReview: false
    }
}
