import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultLibraryTemplate, renderLibraryPath, safePathSegment } from '../../src/library/path-template'

describe('library path templates', () => {
    const values = { author: 'Alice', title: 'A: Work', comic_id: '1234567890', chapter_order: 2, chapter: 'Start' }

    it('renders the default author-first layout', () => {
        expect(renderLibraryPath('library', defaultLibraryTemplate, values)).toBe(
            path.resolve('library', 'Alice', 'A_ Work [12345678]', '2 - Start')
        )
    })

    it('sanitizes reserved Windows names and rejects unknown fields', () => {
        expect(safePathSegment('CON')).toBe('_CON')
        expect(() => renderLibraryPath('library', '{unknown}', values)).toThrow('Unknown path placeholder')
    })
})
