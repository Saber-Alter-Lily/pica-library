import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import {
    buildCandidateChannelPlanV5
} from '../../src/recommendation-v5/candidate-channels'
import {
    compileCandidateProviderRoutesV5
} from '../../src/recommendation-v5/provider-query-compiler'
import {
    executeShadowRetrievalV5,
    SHADOW_RETRIEVAL_V5_VERSION
} from '../../src/recommendation-v5/shadow-retrieval'
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
        author: input.author ?? 'Alice',
        canonicalAuthor:
            input.canonicalAuthor ?? input.author ?? 'Alice',
        circle: input.circle ?? null,
        authorId: input.authorId ?? null,
        tags: input.tags ?? ['tag-a'],
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
        providerId: input.providerId
    } as StoredComic
}

function compiledPlan() {
    const catalog = [
        comic('favorite-old', {
            isFavorite: true,
            inLibrary: true,
            tags: ['Series X']
        })
    ]
    const state = defaultPortablePolicyStateV5()
    const timescales = buildPreferenceTimescalesV5(
        [],
        catalog,
        state,
        { now: NOW }
    )
    return {
        catalog,
        plan: compileCandidateProviderRoutesV5(
            buildCandidateChannelPlanV5({
                timescales,
                policy: state,
                catalog,
                tagProviderCanonicals: {
                    'series x': 'parody:series x'
                },
                tagFacets: {
                    'series x': 'FANDOM_IP'
                },
                providerEligibility: {
                    pica: true,
                    eh: true,
                    exh: false
                }
            })
        )
    }
}

describe('Recommendation V5 shadow retrieval executor', () => {
    it('isolates provider failure and preserves successful plus local candidates', async () => {
        const { catalog, plan } = compiledPlan()
        const result = await executeShadowRetrievalV5(
            plan,
            {
                search: async (surface) => {
                    if (surface === 'eh')
                        throw new Error('network timeout')
                    return [
                        {
                            comicId: 'pica-result',
                            title: 'Pica Result',
                            author: 'Alice',
                            categories: [],
                            tags: ['Series X'],
                            finished: true
                        }
                    ]
                },
                relatedPica: async () => [
                    {
                        comicId: 'related-result',
                        title: 'Related',
                        author: 'Alice',
                        categories: [],
                        tags: [],
                        finished: true
                    }
                ]
            },
            catalog
        )

        expect(result.retrievalVersion).toBe(
            SHADOW_RETRIEVAL_V5_VERSION
        )
        expect(result.mode).toBe('SHADOW')
        expect(result.servingImpact).toBe(false)
        expect(result.persistCandidates).toBe(false)
        expect(result.providerFailureIsolation).toBe(true)
        expect(
            result.candidates.map((item) => item.comic.comicId)
        ).toEqual(
            expect.arrayContaining([
                'favorite-old',
                'pica-result',
                'related-result'
            ])
        )
        expect(result.telemetry.providers.eh.failedRoutes).toBeGreaterThan(0)
        expect(result.telemetry.providers.pica.successfulRoutes).toBeGreaterThan(0)
        expect(result.telemetry.providers.local.successfulRoutes).toBe(1)
    })

    it('deduplicates cross-provider candidates while retaining corroborating route evidence', async () => {
        const { catalog, plan } = compiledPlan()
        const result = await executeShadowRetrievalV5(
            plan,
            {
                search: async () => [
                    {
                        comicId: 'shared',
                        title: 'Shared',
                        author: 'Alice',
                        categories: [],
                        tags: ['Series X'],
                        finished: true
                    }
                ],
                relatedPica: async () => []
            },
            catalog
        )
        const shared = result.candidates.find(
            (item) => item.comic.comicId === 'shared'
        )
        expect(
            result.candidates.filter(
                (item) => item.comic.comicId === 'shared'
            )
        ).toHaveLength(1)
        expect(shared?.evidence.surfaces).toEqual(
            expect.arrayContaining(['pica', 'eh'])
        )
        expect(
            shared?.evidence.routeIds.length ?? 0
        ).toBeGreaterThan(1)
        expect(result.telemetry.duplicateCount).toBeGreaterThan(0)
    })

    it('uses bounded Pica pages when a route receives multiple request budget', async () => {
        const { catalog, plan } = compiledPlan()
        const picaRoute = plan.routes.find(
            (route) =>
                route.surface === 'pica' &&
                route.operation === 'SEARCH'
        )
        expect(picaRoute).toBeTruthy()
        picaRoute!.requestBudget = 2
        const pages: number[] = []
        await executeShadowRetrievalV5(
            plan,
            {
                search: async (surface, request) => {
                    if (surface === 'pica')
                        pages.push(Number(request.page))
                    return []
                },
                relatedPica: async () => []
            },
            catalog
        )
        expect(pages.slice(0, 2)).toEqual([1, 2])
    })

    it('merges route telemetry deterministically without exposing provider exceptions', async () => {
        const { catalog, plan } = compiledPlan()
        let clock = 100
        const result = await executeShadowRetrievalV5(
            plan,
            {
                search: async (surface) => {
                    if (surface === 'eh')
                        throw new Error(
                            '403 secret provider detail should not escape'
                        )
                    return []
                },
                relatedPica: async () => []
            },
            catalog,
            {
                now: () => {
                    clock += 5
                    return clock
                }
            }
        )
        expect(
            result.telemetry.routes
                .filter((row) => row.surface === 'eh')
                .flatMap((row) => row.errorClasses)
        ).toContain('AUTH_OR_ACCESS')
        expect(JSON.stringify(result)).not.toContain(
            'secret provider detail'
        )
    })
    it('reports cooperative progress and checks control between retrieval work units', async () => {
        const { catalog, plan } = compiledPlan()
        const progress: Array<{
            done: number
            total: number
            candidateCount: number
        }> = []
        let checkpoints = 0

        const result = await executeShadowRetrievalV5(
            plan,
            {
                search: async () => [],
                relatedPica: async () => []
            },
            catalog,
            {
                checkpoint: () => {
                    checkpoints += 1
                },
                onProgress: (value) => progress.push(value)
            }
        )

        expect(result.mode).toBe('SHADOW')
        expect(checkpoints).toBeGreaterThan(progress.length)
        expect(progress.length).toBeGreaterThan(0)
        expect(progress.at(-1)?.done).toBe(progress.at(-1)?.total)
    })

    it('stops at the next safe checkpoint after cancellation is requested', async () => {
        const { catalog, plan } = compiledPlan()
        let cancelled = false

        await expect(
            executeShadowRetrievalV5(
                plan,
                {
                    search: async () => [],
                    relatedPica: async () => []
                },
                catalog,
                {
                    onProgress: () => {
                        cancelled = true
                    },
                    checkpoint: () => {
                        if (cancelled)
                            throw new Error('shadow task cancelled')
                    }
                }
            )
        ).rejects.toThrow('shadow task cancelled')
    })

})
