import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync('web/recommendation-v5.js', 'utf8')

describe('Recommendation V5 UI stability', () => {
    it('does not let the library MutationObserver rewrite taste controls forever', () => {
        expect(source).toContain('dataset.v5TasteState === renderState')
        expect(source).toContain('libraryTasteDecorationQueued')
        expect(source).toContain('queueMicrotask(() => {')
    })

    it('does not rewrite an unchanged recommendation feedback badge', () => {
        expect(source).toContain(
            'if(badge.textContent!==message) badge.textContent=message'
        )
        expect(source).toContain(
            "badge.classList.toggle('positive',tone==='positive')"
        )
        expect(source).toContain(
            "badge.classList.toggle('negative',tone==='negative')"
        )
    })
})
