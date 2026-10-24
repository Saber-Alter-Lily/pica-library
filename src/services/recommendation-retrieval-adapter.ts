import type { Pica } from '../sdk'
import type { Comic } from '../types'
import type { FavoriteRecord, StoredComic } from '../library/types'
import type { ProviderService } from './provider-service'
import type { RecommendationBuildProviderV3 } from '../recommendation/build-ports'

export interface PicaEhRetrievalBindingsV3 {
    pica: Pick<Pica, 'Order' | 'comicsPage' | 'search' | 'related'> | null
    external: Pick<ProviderService, 'probeExHentai' | 'search'>
    importPica(comics: Comic[]): StoredComic[]
    storedRecords(records: FavoriteRecord[]): StoredComic[]
    ehEnabled(): boolean
    checkpoint(): Promise<void>
}

/** Existing Pica/E-H budgets and semantics, isolated behind the generic retriever port. */
export function picaEhBuildProviderV3(
    input: PicaEhRetrievalBindingsV3
): RecommendationBuildProviderV3 {
    const { pica } = input
    const externalCache = new Map<string, StoredComic[]>()
    const budget: Record<'eh' | 'exh', number> = { eh: 4, exh: 2 }
    const requests: Record<'eh' | 'exh', number> = { eh: 0, exh: 0 }
    let exhAvailable = false
    const merge = (primary: StoredComic[], secondary: StoredComic[]) => [
        ...new Map(
            [...primary, ...secondary].map((comic) => [comic.comicId, comic])
        ).values()
    ]
    const search = async (
        query: string,
        kind: 'keyword' | 'author',
        source: 'eh' | 'exh'
    ) => {
        if (!input.ehEnabled()) return []
        if (source === 'exh' && !exhAvailable) return []
        const clean = query.trim()
        if (!clean) return []
        const key = `${source}:${kind}:${clean.toLocaleLowerCase('und')}`
        const cached = externalCache.get(key)
        if (cached) return cached
        if (requests[source] >= budget[source]) return []
        requests[source] += 1
        const providerQuery =
            kind === 'author' ? `artist:"${clean.replaceAll('"', '')}"` : clean
        try {
            await input.checkpoint()
            const records = await input.external.search(
                { keyword: providerQuery, limit: 40 },
                [source],
                'recommendations'
            )
            const stored = input.storedRecords(records)
            externalCache.set(key, stored)
            return stored
        } catch {
            externalCache.set(key, [])
            return []
        }
    }
    return {
        prepare: async () => {
            exhAvailable =
                (await input.external
                    .probeExHentai()
                    .catch(() => 'UNAVAILABLE')) === 'AVAILABLE'
        },
        telemetry: () => ({
            ehRequests: requests.eh,
            exhRequests: requests.exh,
            exhAvailable
        }),
        provider: {
            keyword: async (query, page, route) => {
                await input.checkpoint()
                const picaResults =
                    !pica ||
                    (route?.allowedProviders &&
                        !route.allowedProviders.includes('pica'))
                        ? []
                        : input.importPica(
                              (
                                  await pica.comicsPage(
                                      '',
                                      query,
                                      pica.Order.loved,
                                      page
                                  )
                              ).docs
                          )
                const ehAllowed =
                    !route?.allowedProviders ||
                    route.allowedProviders.includes('eh')
                const ehResults =
                    page === 1 && ehAllowed
                        ? await search(query, 'keyword', 'eh')
                        : []
                const exhResults =
                    page === 1 && ehAllowed
                        ? await search(query, 'keyword', 'exh')
                        : []
                return merge(merge(picaResults, ehResults), exhResults)
            },
            author: async (query, page) => {
                await input.checkpoint()
                const picaResults = !pica
                    ? []
                    : input.importPica(
                          (await pica.search(query, page, pica.Order.loved))
                              .docs
                      )
                const ehResults =
                    page === 1 ? await search(query, 'author', 'eh') : []
                const exhResults =
                    page === 1 ? await search(query, 'author', 'exh') : []
                return merge(merge(picaResults, ehResults), exhResults)
            },
            related: async (comicId) => {
                await input.checkpoint()
                return !pica || comicId.includes(':')
                    ? []
                    : input.importPica(await pica.related(comicId))
            }
        }
    }
}
