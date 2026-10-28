import { createHmac, randomBytes } from 'node:crypto'
import { EhProvider } from '../providers/eh-provider'
import {
    externalEpisodeIdentity,
    validateExternalEpisodes,
    validateExternalMedia,
    validateExternalPages,
    MAX_EXTERNAL_MEDIA_BYTES,
    type ExternalReaderTransport
} from './reader-contract'
import { fromEhPublicWorkerId } from './eh-public-identity'

type PublicEhPages = Pick<EhProvider, 'episodes' | 'pages' | 'fetchPage'>
const MAX_CACHED_CHAPTERS = 4
const MAX_PAGE_LOCATOR_LENGTH = 512 // 4 * 10k pages => bounded per-worker locator memory

/**
 * Real, public/anonymous E-H reader operations behind the source worker IPC.
 *
 * This module deliberately imports the existing E-H Provider instead of
 * copying its HTML parser, gallery metadata logic or image handling. It is
 * an OPTIONAL source-worker entry and must never be included in core bundles.
 * Account login, cookies, favorites, source search and downloading are absent.
 */
export function createEhPublicReaderTransport(
    provider: PublicEhPages = new EhProvider()
): ExternalReaderTransport {
    const secret = randomBytes(32)
    const tokens = new Map<string, { owner: string; locator: string }>()
    const chapterTokens = new Map<string, string[]>()

    function cachePages(owner: string, episodeId: string, locators: string[]) {
        const chapter = owner + '\n' + episodeId
        // Validate the entire replacement first. A malformed remote page
        // list must not revoke an otherwise healthy cached chapter.
        const keys = locators.map((locator, index) => {
            if (typeof locator !== 'string' || !locator.startsWith('eh-page:') ||
                locator.length > MAX_PAGE_LOCATOR_LENGTH)
                throw new Error('Invalid E-H page locator from provider')
            return createHmac('sha256', secret)
                .update(owner + '\n' + episodeId + '\n' + index + '\n' + locator)
                .digest('base64url').slice(0, 32)
        })
        if (new Set(keys).size !== keys.length)
            throw new Error('Colliding E-H page keys')
        const oldKeys = chapterTokens.get(chapter) ?? []
        for (const key of oldKeys) tokens.delete(key)
        chapterTokens.delete(chapter)
        for (let i = 0; i < keys.length; i++)
            tokens.set(keys[i], { owner, locator: locators[i] })
        chapterTokens.set(chapter, keys)
        while (chapterTokens.size > MAX_CACHED_CHAPTERS) {
            const oldest = chapterTokens.keys().next().value!
            for (const key of chapterTokens.get(oldest) ?? []) tokens.delete(key)
            chapterTokens.delete(oldest)
        }
        return validateExternalPages(keys.map(key => ({ key })))
    }

    return {
        async episodes(comicId) {
            const legacy = fromEhPublicWorkerId(comicId)
            const rows = await provider.episodes(legacy)
            return validateExternalEpisodes(rows.map(row => ({
                id: row.id,
                title: row.title,
                order: row.order
            })))
        },
        async pages(comicId, episodeId) {
            const legacy = fromEhPublicWorkerId(comicId)
            externalEpisodeIdentity(episodeId)
            // Do not accept a client-supplied chapter object or remote locator.
            const episodes = await provider.episodes(legacy)
            const episode = episodes.find(row => row.id === episodeId)
            if (!episode) throw new Error('E-H chapter does not belong to gallery')
            const pages = await provider.pages(legacy, episode)
            if (!Array.isArray(pages) || pages.length > 10000)
                throw new Error('E-H chapter is too large')
            return cachePages(comicId, episodeId, pages.map(page => page.url))
        },
        async media(comicId, pageKey) {
            fromEhPublicWorkerId(comicId)
            const entry = tokens.get(pageKey)
            if (!entry || entry.owner !== comicId)
                throw new Error('E-H media token does not belong to gallery')
            const result = await provider.fetchPage(entry.locator, MAX_EXTERNAL_MEDIA_BYTES)
            return validateExternalMedia({
                bytes: result.data,
                contentType: result.contentType
            })
        }
    }
}
