import type { StoredComic } from '../library/types'
import { normalizeTag } from './semantic-core'

export interface CreatorEntity {
    canonicalName: string
    aliases: string[]
    confidence: 'HIGH' | 'MEDIUM' | 'LOW'
    sources: string[]
}

export interface CreatorEntityResolver {
    resolve(
        comic: Pick<StoredComic, 'author' | 'canonicalAuthor'>
    ): CreatorEntity | null
}

/** Local-only resolver. It never infers identity across unrelated names. */
export const localCreatorEntityResolver: CreatorEntityResolver = {
    resolve(comic) {
        const raw = normalizeTag(comic.author)
        const canonical = normalizeTag(comic.canonicalAuthor ?? comic.author)
        if (!canonical) return null
        return {
            canonicalName: canonical,
            aliases: raw && raw !== canonical ? [raw] : [],
            confidence: comic.canonicalAuthor ? 'HIGH' : 'LOW',
            sources: comic.canonicalAuthor
                ? ['local canonicalAuthor']
                : ['local raw author']
        }
    }
}
