import { describe, expect, it } from 'vitest'
import {
    favoritesFromCsv,
    favoritesToCsv,
    parseCsv
} from '../../src/library/csv'

describe('favorites CSV', () => {
    it('handles quoted commas, quotes and newlines', () => {
        expect(parseCsv('a,b\n"x,y","say ""hi""\nnow"')).toEqual([
            ['a', 'b'],
            ['x,y', 'say "hi"\nnow']
        ])
    })

    it('maps exported favorites into records', () => {
        const [record] = favoritesFromCsv(
            'comic_id,title,author,tags,categories,finished,total_likes\n' +
                'c1,Work,Studio (Alice),tag-a | tag-b,cat-a,true,42\n'
        )
        expect(record).toMatchObject({
            comicId: 'c1',
            title: 'Work',
            author: 'Studio (Alice)',
            tags: ['tag-a', 'tag-b'],
            categories: ['cat-a'],
            finished: true,
            totalLikes: 42
        })
    })

    it('round-trips records through the portable CSV format', () => {
        const records = favoritesFromCsv(
            'comic_id,title,author,tags,categories,finished\n' +
                'c1,"A, Work",Alice,tag-a,cat-a,false\n'
        )
        expect(favoritesFromCsv(favoritesToCsv(records))).toMatchObject(records)
    })
})
