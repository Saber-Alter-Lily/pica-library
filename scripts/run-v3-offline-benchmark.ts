import { evaluateAblations } from '../src/recommendation-v3/evaluator'
import type { StoredComic } from '../src/library/types'

function comic(index: number, tags: string[], isFavorite: boolean): StoredComic {
    const author = `author-${index % 6}`
    return {
        comicId: `fixture-${index}`,
        title: `Fixture ${index}`,
        author,
        canonicalAuthor: author,
        circle: `circle-${index % 4}`,
        categories: [`category-${index % 3}`],
        tags,
        description: '',
        finished: index % 3 === 0,
        totalLikes: 10 + index,
        totalViews: 100 + index,
        downloadedPictures: 0,
        knownPictures: 0,
        isFavorite,
        inLibrary: true,
        authorId: author,
        firstSeenAt: '2026-01-01T00:00:00.000Z',
        lastSeenAt: '2026-01-01T00:00:00.000Z',
        knownEpisodes: 0
    }
}

const records: StoredComic[] = []
for (let index = 0; index < 80; index += 1) {
    const family = index % 4
    const tags =
        family === 0
            ? ['romance', 'school']
            : family === 1
              ? ['fantasy', 'adventure']
              : family === 2
                ? ['mystery', 'crime']
                : ['cooking', 'food']
    records.push(comic(index, tags, index < 40))
}

const result = evaluateAblations(records, 500)
console.log(JSON.stringify({ fixture: 'deterministic-v3-80-items', ...result }))
