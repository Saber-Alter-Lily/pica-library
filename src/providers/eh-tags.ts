import type { CanonicalTag } from './types'

function tagFacet(namespace: string | null): CanonicalTag['facet'] {
    if (namespace === 'artist' || namespace === 'cosplayer') return 'CREATOR'
    if (namespace === 'group') return 'CIRCLE'
    if (namespace === 'parody') return 'FANDOM_IP'
    if (namespace === 'character') return 'CHARACTER'
    if (namespace === 'language') return 'LANGUAGE'
    if (namespace === 'location') return 'LOCATION'
    if (
        namespace === 'female' ||
        namespace === 'male' ||
        namespace === 'mixed' ||
        namespace === 'other' ||
        namespace === 'reclass'
    )
        return 'CONTENT_TRAIT'
    return 'OTHER'
}

export function parseEhTag(raw: string): CanonicalTag {
    const index = raw.indexOf(':')
    const namespace = index > 0 ? raw.slice(0, index).toLowerCase() : null
    const value = (index > 0 ? raw.slice(index + 1) : raw).trim()
    return { raw, namespace, value, facet: tagFacet(namespace) }
}
