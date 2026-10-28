import { bindExternalReader } from './desktop-reader-adapter'
import { normalizeExternalReaderManifest } from './reader-contract'
import type { SignedReaderIdentityBridge } from '../desktop/signed-source-reader'
import {
    EH_PUBLIC_WORKER_ID,
    ownsLegacyEhId,
    toEhPublicWorkerId
} from './eh-public-identity'

/**
 * Explicit Desktop composition adapter for the old eh:<gid>:<token> namespace.
 *
 * The worker sees only a validated source-scoped alias; the existing Reader,
 * Library and progress store continue to use the original legacy E-H ID.
 * This must not be loaded into the default, source-free Reader.
 */
export const ehPublicIdentityBridge: SignedReaderIdentityBridge = {
    ownsComicId: ownsLegacyEhId,
    bind(rawManifest, transport, access) {
        const manifest = normalizeExternalReaderManifest(rawManifest)
        if (manifest.id !== EH_PUBLIC_WORKER_ID)
            throw new Error('Unexpected E-H public worker identity')
        const bound = bindExternalReader(manifest, transport, access)
        const alias = toEhPublicWorkerId
        const ownedPage = bound.source.assertPageOwnedByComic
        const fetchOwnedPage = bound.source.fetchPageForComic
        if (!ownedPage || !fetchOwnedPage)
            throw new Error('External E-H worker lacks work-owned media ports')

        return {
            source: {
                cacheScope(comicId) { return bound.source.cacheScope(alias(comicId)) },
                getEpisodes(comicId) { return bound.source.getEpisodes(alias(comicId)) },
                getEpisodePages(comicId, episode) {
                    return bound.source.getEpisodePages(alias(comicId), episode)
                },
                fetchPage(locator) { return bound.source.fetchPage(locator) },
                assertPageOwnedByComic(comicId, locator) {
                    ownedPage(alias(comicId), locator)
                },
                fetchPageForComic(comicId, locator) {
                    return fetchOwnedPage(alias(comicId), locator)
                }
            },
            contract: {
                ...bound.contract,
                comicId(comicId) {
                    alias(comicId)
                    return comicId
                },
                pageUrl(comicId, episodeId, index) {
                    return bound.contract.pageUrl(alias(comicId), episodeId, index)
                },
                // This is deliberately not online-reader-progress-v1.
                progressKey: 'signed-source-progress-v1:' + EH_PUBLIC_WORKER_ID
            }
        }
    }
}
