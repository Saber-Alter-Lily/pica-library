import { Buffer } from 'node:buffer'
import type { Episode, Picture } from '../types'
import type {
    OnlineReaderContract,
    OnlineReaderSource
} from '../services/online-reader-service'
import {
    assertExternalPageOwner,
    externalComicIdentity,
    externalEpisodeIdentity,
    externalPageLocator,
    externalRuntimeRevision,
    normalizeExternalReaderManifest,
    validateExternalEpisodes,
    validateExternalMedia,
    validateExternalPages,
    type ExternalReaderAccess,
    type ExternalReaderTransport
} from './reader-contract'

/**
 * Node/Desktop adapter to the existing OnlineReaderService ports.
 *
 * Driver code is supplied by a trusted composition root; the manifest cannot
 * install or execute code. No SDK, provider account, HTTP client or database
 * is imported. This is a controlled adapter seam, NOT a standalone plugin host.
 */
export function bindExternalReader(
    rawManifest: unknown,
    transport: ExternalReaderTransport,
    access: ExternalReaderAccess
): {
    source: OnlineReaderSource
    contract: OnlineReaderContract
} {
    const manifest = normalizeExternalReaderManifest(rawManifest)
    const id = manifest.id

    function currentScope(comicId: string) {
        externalComicIdentity(id, comicId)
        access.assertEnabled()
        return 'external-reader:' + id + ':' +
            externalRuntimeRevision(access.revision())
    }

    function assertScope(comicId: string, expected: string) {
        if (currentScope(comicId) !== expected)
            throw new Error('Reader source session changed')
    }

    const source: OnlineReaderSource = {
        cacheScope: currentScope,

        async getEpisodes(comicId) {
            const scope = currentScope(comicId)
            const rows = validateExternalEpisodes(await transport.episodes(comicId))
            assertScope(comicId, scope)
            return rows.map((row): Episode => ({
                id: row.id,
                _id: row.id,
                title: row.title,
                order: row.order,
                updated_at: ''
            }))
        },

        async getEpisodePages(comicId, episode) {
            const scope = currentScope(comicId)
            externalEpisodeIdentity(episode.id)
            const rows = validateExternalPages(
                await transport.pages(comicId, episode.id)
            )
            assertScope(comicId, scope)
            return rows.map((row): Picture => ({
                id: row.key,
                name: row.key,
                path: '',
                fileServer: '',
                url: externalPageLocator(id, comicId, row.key),
                epTitle: episode.title,
                media: { originalName: '', path: '', fileServer: '' }
            }))
        },

        // Unowned URL-only media reads are forbidden for external adapters.
        async fetchPage() {
            throw new Error('External pages require source and work ownership')
        },

        assertPageOwnedByComic(comicId, locator) {
            currentScope(comicId)
            assertExternalPageOwner(id, comicId, locator)
        },

        async fetchPageForComic(comicId, locator) {
            const scope = currentScope(comicId)
            const key = assertExternalPageOwner(id, comicId, locator)
            const result = validateExternalMedia(
                await transport.media(comicId, key)
            )
            assertScope(comicId, scope)
            return {
                data: Buffer.from(result.bytes),
                contentType: result.contentType
            }
        }
    }

    const contract: OnlineReaderContract = {
        comicId(value) { return externalComicIdentity(id, value) },
        episodeId: externalEpisodeIdentity,
        pageUrl(comicId, episodeId, index) {
            externalComicIdentity(id, comicId)
            externalEpisodeIdentity(episodeId)
            if (!Number.isSafeInteger(index) || index < 0 || index > 9999)
                throw new Error('Invalid external page index')
            return '/api/v1/online-reader/comics/' +
                encodeURIComponent(comicId) + '/chapters/' +
                encodeURIComponent(episodeId) + '/pages/' + index
        },
        progressKey: 'online-reader-progress-v1',
        assertAccess() { access.assertEnabled() }
    }

    return { source, contract }
}
