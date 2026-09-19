import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import {
    buildCandidateChannelPlanV5
} from '../../src/recommendation-v5/candidate-channels'
import {
    compileCandidateProviderRoutesV5,
    deriveObservedEhCanonicalBindingsV5,
    PROVIDER_QUERY_COMPILER_V5_VERSION
} from '../../src/recommendation-v5/provider-query-compiler'
import { buildPreferenceTimescalesV5 } from '../../src/recommendation-v5/preference-timescales'
import { defaultPortablePolicyStateV5 } from '../../src/recommendation-v5/portable-policy'

const NOW = new Date('2026-09-17T12:00:00.000Z')

function comic(
    comicId: string,
    input: Partial<StoredComic> = {}
): StoredComic {
    return {
        comicId,
        title: input.title ?? comicId,
        author: input.author ?? 'Author',
        canonicalAuthor:
            input.canonicalAuthor ?? input.author ?? 'Author',
        circle: input.circle ?? null,
        authorId: input.authorId ?? null,
        tags: input.tags ?? [],
        categories: input.categories ?? [],
        finished: input.finished ?? true,
        isFavorite: input.isFavorite ?? false,
        firstSeenAt:
            input.firstSeenAt ?? '2026-01-01T00:00:00.000Z',
        lastSeenAt:
            input.lastSeenAt ?? '2026-01-01T00:00:00.000Z',
        knownEpisodes: input.knownEpisodes ?? 1,
        knownPictures: input.knownPictures ?? 0,
        downloadedPictures: input.downloadedPictures ?? 0,
        pagesCount: input.pagesCount ?? 0,
        inLibrary: input.inLibrary ?? false,
        providerId: input.providerId,
        providerMetadata: input.providerMetadata
    } as StoredComic
}

describe('Recommendation V5 provider query compiler', () => {
    it('derives exact E-H bindings only when observed canonical identity is unambiguous', () => {
        const unique = deriveObservedEhCanonicalBindingsV5([
            comic('eh:1', {
                providerId: 'eh',
                providerMetadata: {
                    rawTags: [
                        'parody:series x',
                        'artist:alice',
                        'language:english'
                    ]
                }
            })
        ])
        expect(unique.canonicals['series x']).toBe(
            'parody:series x'
        )
        expect(unique.facets['series x']).toBe('FANDOM_IP')
        expect(unique.ambiguousKeys).not.toContain('series x')

        const ambiguous = deriveObservedEhCanonicalBindingsV5([
            comic('eh:1', {
                providerId: 'eh',
                providerMetadata: {
                    rawTags: ['parody:original']
                }
            }),
            comic('eh:2', {
                providerId: 'eh',
                providerMetadata: {
                    rawTags: ['language:original']
                }
            })
        ])
        expect(ambiguous.canonicals.original).toBeUndefined()
        expect(ambiguous.facets.original).toBeUndefined()
        expect(ambiguous.ambiguousKeys).toContain('original')
    })

    it('compiles Pica native tag search and exact E-H canonical search from the same fandom channel', () => {
        const catalog = [
            comic('fav', {
                title: 'Favorite',
                author: 'Alice',
                tags: ['Series X'],
                isFavorite: true
            })
        ]
        const state = defaultPortablePolicyStateV5()
        const timescales = buildPreferenceTimescalesV5(
            [],
            catalog,
            state,
            { now: NOW }
        )
        const channels = buildCandidateChannelPlanV5({
            timescales,
            policy: state,
            catalog,
            tagFacets: {
                'series x': 'FANDOM_IP'
            },
            tagProviderCanonicals: {
                'series x': 'parody:series x'
            },
            providerEligibility: {
                pica: true,
                eh: true,
                exh: true
            }
        })
        const compiled =
            compileCandidateProviderRoutesV5(channels)

        expect(compiled.mode).toBe('SHADOW')
        expect(compiled.compilerVersion).toBe(
            PROVIDER_QUERY_COMPILER_V5_VERSION
        )
        expect(compiled.executionEnabled).toBe(false)
        expect(compiled.servingImpact).toBe(false)

        const fandomRoutes = compiled.routes.filter(
            (route) =>
                route.family === 'FANDOM' &&
                route.sourceLayer === 'LIFETIME'
        )
        expect(fandomRoutes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    surface: 'pica',
                    precision: 'PROVIDER_NATIVE',
                    operation: 'SEARCH',
                    searchRequest: expect.objectContaining({
                        tags: ['Series X']
                    })
                }),
                expect.objectContaining({
                    surface: 'eh',
                    precision: 'EXACT_CANONICAL',
                    bindingSource: 'OBSERVED_CANONICAL',
                    searchRequest: expect.objectContaining({
                        tags: ['parody:series x'],
                        surface: 'eh'
                    })
                }),
                expect.objectContaining({
                    surface: 'exh',
                    precision: 'EXACT_CANONICAL',
                    bindingSource: 'OBSERVED_CANONICAL',
                    searchRequest: expect.objectContaining({
                        tags: ['parody:series x'],
                        surface: 'exh'
                    })
                })
            ])
        )
    })

    it('falls back to E-H keyword search instead of inventing a namespace', () => {
        const catalog = [
            comic('fav', {
                tags: ['Unknown Series'],
                isFavorite: true
            })
        ]
        const state = defaultPortablePolicyStateV5()
        const timescales = buildPreferenceTimescalesV5(
            [],
            catalog,
            state,
            { now: NOW }
        )
        const channels = buildCandidateChannelPlanV5({
            timescales,
            policy: state,
            catalog,
            providerEligibility: {
                pica: true,
                eh: true,
                exh: false
            }
        })
        const compiled =
            compileCandidateProviderRoutesV5(channels)
        const route = compiled.routes.find(
            (item) =>
                item.surface === 'eh' &&
                item.family === 'TAG' &&
                item.sourceLayer === 'LIFETIME'
        )
        expect(route).toMatchObject({
            precision: 'FALLBACK_KEYWORD',
            bindingSource: 'FALLBACK',
            searchRequest: {
                keyword: 'Unknown Series',
                surface: 'eh'
            }
        })
        expect(route?.searchRequest?.tags).toBeUndefined()
    })

    it('uses exact artist namespace for E-H author routes while Pica keeps native keyword search', () => {
        const catalog = [
            comic('fav', {
                author: 'Alice',
                isFavorite: true
            })
        ]
        const state = defaultPortablePolicyStateV5()
        const timescales = buildPreferenceTimescalesV5(
            [],
            catalog,
            state,
            { now: NOW }
        )
        const compiled = compileCandidateProviderRoutesV5(
            buildCandidateChannelPlanV5({
                timescales,
                policy: state,
                catalog,
                providerEligibility: {
                    pica: true,
                    eh: true,
                    exh: false
                }
            })
        )
        const authorRoutes = compiled.routes.filter(
            (route) =>
                route.family === 'AUTHOR' &&
                route.sourceLayer === 'LIFETIME'
        )
        expect(authorRoutes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    surface: 'pica',
                    searchRequest: expect.objectContaining({
                        keyword: 'Alice'
                    })
                }),
                expect.objectContaining({
                    surface: 'eh',
                    precision: 'EXACT_CANONICAL',
                    bindingSource: 'AUTHOR_NAMESPACE',
                    searchRequest: expect.objectContaining({
                        tags: ['artist:Alice']
                    })
                })
            ])
        )
    })

    it('does not synthesize unsupported E-H category retrieval and keeps rediscovery local', () => {
        const catalog = [
            comic('fav', {
                categories: ['Fantasy'],
                isFavorite: true,
                inLibrary: true
            })
        ]
        const state = defaultPortablePolicyStateV5()
        const timescales = buildPreferenceTimescalesV5(
            [],
            catalog,
            state,
            { now: NOW }
        )
        const compiled = compileCandidateProviderRoutesV5(
            buildCandidateChannelPlanV5({
                timescales,
                policy: state,
                catalog,
                providerEligibility: {
                    pica: true,
                    eh: true,
                    exh: true
                }
            })
        )

        const categoryRoutes = compiled.routes.filter(
            (route) => route.family === 'CATEGORY'
        )
        expect(categoryRoutes).toHaveLength(1)
        expect(categoryRoutes[0]).toMatchObject({
            surface: 'pica',
            searchRequest: expect.objectContaining({
                categories: ['Fantasy']
            })
        })

        const rediscovery = compiled.routes.find(
            (route) => route.family === 'REDISCOVERY'
        )
        expect(rediscovery).toMatchObject({
            surface: 'local',
            operation: 'LOCAL',
            precision: 'LOCAL',
            requestBudget: 0
        })
        expect(rediscovery?.localCandidateIds).toContain('fav')
    })

    it('rejects unsafe observed canonical strings and degrades to keyword fallback', () => {
        const catalog = [
            comic('fav', {
                tags: ['Series X'],
                isFavorite: true
            })
        ]
        const state = defaultPortablePolicyStateV5()
        const timescales = buildPreferenceTimescalesV5(
            [],
            catalog,
            state,
            { now: NOW }
        )
        const compiled = compileCandidateProviderRoutesV5(
            buildCandidateChannelPlanV5({
                timescales,
                policy: state,
                catalog,
                tagProviderCanonicals: {
                    'series x': 'parody:"series x"'
                },
                providerEligibility: {
                    pica: true,
                    eh: true,
                    exh: false
                }
            })
        )
        const eh = compiled.routes.find(
            (route) =>
                route.surface === 'eh' &&
                route.family === 'TAG'
        )
        expect(eh).toMatchObject({
            precision: 'FALLBACK_KEYWORD',
            bindingSource: 'FALLBACK'
        })
    })
})
