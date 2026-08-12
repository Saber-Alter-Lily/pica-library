import { describe, expect, it } from 'vitest'
import { parsePositionals } from '../../src/library/arguments'

const valueFlags = new Set(['tag', 'data-dir'])

describe('CLI positional arguments', () => {
    it('does not consume a positional after a boolean flag', () => {
        expect(
            parsePositionals(
                ['download', '--json', 'comic-1'],
                'download',
                valueFlags
            )
        ).toEqual(['comic-1'])
    })

    it('skips named flag values and supports inline flags', () => {
        expect(
            parsePositionals(
                [
                    'download',
                    'comic-1',
                    '--tag',
                    'tag-a',
                    '--data-dir=library',
                    'comic-2'
                ],
                'download',
                valueFlags
            )
        ).toEqual(['comic-1', 'comic-2'])
    })
})
