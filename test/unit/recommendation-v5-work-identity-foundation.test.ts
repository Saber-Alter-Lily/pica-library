import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import {
    buildWorkIdentityAuditV5,
    buildWorkIdentityMaterializationPlanV5,
    buildWorkIdentityMaterializationPreviewV5,
    WORK_IDENTITY_MATERIALIZATION_PLAN_VERSION,
    WORK_IDENTITY_RESOLVER_VERSION
} from '../../src/recommendation-v5/work-identity-foundation'
import { defaultPortablePolicyStateV5 } from '../../src/recommendation-v5/portable-policy'
import { RecommendationPolicyStoreV5 } from '../../src/recommendation-v5/policy-store'

function comic(
    input: Partial<StoredComic> & Pick<StoredComic, 'comicId' | 'title'>
): StoredComic {
    return {
        comicId: input.comicId,
        title: input.title,
        author: input.author ?? '',
        canonicalAuthor: input.canonicalAuthor ?? input.author ?? '',
        circle: input.circle ?? null,
        authorId: input.authorId ?? null,
        alternateTitles: input.alternateTitles ?? [],
        tags: input.tags ?? [],
        categories: input.categories ?? [],
        finished: input.finished ?? true,
        isFavorite: input.isFavorite ?? false,
        firstSeenAt: input.firstSeenAt ?? new Date(0).toISOString(),
        lastSeenAt: input.lastSeenAt ?? new Date(0).toISOString(),
        knownEpisodes: input.knownEpisodes ?? 1,
        knownPictures: input.knownPictures ?? input.pagesCount ?? 0,
        downloadedPictures: input.downloadedPictures ?? 0,
        pagesCount: input.pagesCount ?? 0,
        inLibrary: input.inLibrary ?? false,
        providerId: input.providerId
    } as StoredComic
}

describe('Canonical Work Identity foundation', () => {
    it('adds the identity schema without rewriting existing comic identity', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-work-id-'))
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        const status = database.workIdentityStorageStatus()

        expect(status.appliedSchemaVersion).toBe(
            status.expectedSchemaVersion
        )
        expect(status.expectedSchemaVersion).toBeGreaterThanOrEqual(12)
        for (const present of Object.values(status.tables))
            expect(present).toBe(true)
        expect(status.counts.bindings).toBe(0)
        expect(status.counts.evidence).toBe(0)
        expect(status.counts.decisions).toBe(0)
        expect(status.counts.materializationRuns).toBe(0)

        // Existing comic IDs stay canonical upload IDs; migration 12 does not
        // require or pre-create a work binding.
        database.importCatalog(
            [
                {
                    comicId: 'pica:original',
                    title: 'Original',
                    author: 'Artist',
                    tags: [],
                    categories: [],
                    finished: true
                }
            ],
            'test'
        )
        expect(database.getComic('pica:original')?.comicId).toBe(
            'pica:original'
        )
        expect(database.workIdentityStorageStatus().counts.bindings).toBe(0)
        expect(database.listWorkIdentityBindings()).toEqual([])

        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('surfaces conservative same-work candidates without binding them', () => {
        const state = defaultPortablePolicyStateV5()
        const result = buildWorkIdentityAuditV5(
            [
                comic({
                    comicId: 'pica:1',
                    providerId: 'pica',
                    title: 'Work Title',
                    author: 'Artist',
                    pagesCount: 24
                }),
                comic({
                    comicId: 'eh:2',
                    providerId: 'eh',
                    title: '[Chinese] Work Title',
                    author: 'Artist',
                    pagesCount: 25
                }),
                comic({
                    comicId: 'eh:3',
                    providerId: 'eh',
                    title: 'Work Title',
                    author: 'Different Artist',
                    pagesCount: 24
                })
            ],
            state
        )
        expect(result.mode).toBe('READ_ONLY')
        expect(result.resolverVersion).toBe(WORK_IDENTITY_RESOLVER_VERSION)
        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0]).toMatchObject({
            leftComicId: 'pica:1',
            rightComicId: 'eh:2',
            crossProvider: true,
            relation: 'PROBABLE_SAME_WORK'
        })
    })

    it('matches the cross-language Pica/E-H example through alternate title and creator aliases', () => {
        const pica = comic({
            comicId: 'pica:stolen-wife',
            providerId: 'pica',
            title: '盗まれた人妻。',
            author: '平つくね',
            pagesCount: 0
        })
        const eh = comic({
            comicId: 'eh:stolen-wife',
            providerId: 'eh',
            title:
                '[ROUTE1 (Taira Tsukune)] Nusumareta Hitozuma. - Stolen Wife [Digital]',
            author: 'taira tsukune',
            alternateTitles: [
                '[ROUTE1 (平つくね)] 盗まれた人妻。[DL版]'
            ],
            pagesCount: 0
        })
        const result = buildWorkIdentityAuditV5(
            [pica, eh],
            defaultPortablePolicyStateV5()
        )
        expect(result.resolverVersion).toContain('work-identity-v3')
        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0]).toMatchObject({
            leftComicId: 'pica:stolen-wife',
            rightComicId: 'eh:stolen-wife',
            relation: 'PROBABLE_SAME_WORK',
            crossProvider: true,
            evidence: {
                titleAliasMatch: true,
                authorMatch: true
            }
        })
    })

    it('persists evidence idempotently without creating work bindings', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-work-evidence-')
        )
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        database.importCatalog(
            [
                {
                    comicId: 'pica:1',
                    title: 'Work Title',
                    author: 'Artist',
                    tags: [],
                    categories: [],
                    finished: true,
                    pagesCount: 24
                },
                {
                    comicId: 'eh:2',
                    title: '[Chinese] Work Title',
                    author: 'Artist',
                    tags: [],
                    categories: [],
                    finished: true,
                    pagesCount: 25
                }
            ],
            'test'
        )
        const audit = buildWorkIdentityAuditV5(
            database.listComics({ limit: 100 }),
            defaultPortablePolicyStateV5()
        )
        expect(audit.candidates).toHaveLength(1)
        const payload = audit.candidates.map((candidate) => ({
            leftComicId: candidate.leftComicId,
            rightComicId: candidate.rightComicId,
            relation: candidate.relation,
            confidence: candidate.confidence,
            resolverVersion: candidate.resolverVersion,
            evidence: candidate.evidence
        }))
        database.saveWorkIdentityEvidence(payload)
        database.saveWorkIdentityEvidence(payload)

        const status = database.workIdentityStorageStatus()
        expect(status.counts.evidence).toBe(1)
        expect(status.counts.bindings).toBe(0)
        expect(status.counts.works).toBe(0)
        expect(database.listWorkIdentityEvidence()).toHaveLength(1)
        expect(database.listWorkIdentityEvidence()[0]).toMatchObject({
            relation: 'PROBABLE_SAME_WORK',
            resolverVersion: WORK_IDENTITY_RESOLVER_VERSION
        })

        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })


    it('stores reversible human decisions without creating work bindings', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-work-decisions-')
        )
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        database.importCatalog(
            [
                {
                    comicId: 'pica:1',
                    title: 'Same Work',
                    author: 'Artist',
                    tags: [],
                    categories: [],
                    finished: true,
                    pagesCount: 20
                },
                {
                    comicId: 'eh:2',
                    title: 'Same Work',
                    author: 'Artist',
                    tags: [],
                    categories: [],
                    finished: true,
                    pagesCount: 21
                }
            ],
            'test'
        )

        const saved = database.saveWorkIdentityDecision({
            leftComicId: 'pica:1',
            rightComicId: 'eh:2',
            decision: 'KEEP_SEPARATE',
            source: 'USER'
        })
        expect(saved.decision).toBe('KEEP_SEPARATE')
        expect(database.listWorkIdentityDecisions()).toHaveLength(1)
        expect(database.workIdentityStorageStatus().counts.bindings).toBe(0)
        expect(database.workIdentityStorageStatus().counts.works).toBe(0)

        const policy = new RecommendationPolicyStoreV5(database)
        policy.setExplicitDistinctPair('pica:1', 'eh:2', true)
        expect(
            buildWorkIdentityAuditV5(
                database.listComics({ limit: 100 }),
                policy.state()
            ).candidates
        ).toHaveLength(0)

        database.saveWorkIdentityDecision({
            leftComicId: 'pica:1',
            rightComicId: 'eh:2',
            decision: 'SAME_WORK',
            source: 'USER'
        })
        policy.setExplicitDistinctPair('pica:1', 'eh:2', false)
        expect(
            buildWorkIdentityAuditV5(
                database.listComics({ limit: 100 }),
                policy.state()
            ).candidates
        ).toHaveLength(1)
        expect(database.workIdentityStorageStatus().counts.bindings).toBe(0)

        database.clearWorkIdentityDecision('pica:1', 'eh:2')
        expect(database.listWorkIdentityDecisions()).toHaveLength(0)
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('resolves detail work variants read-only and respects keep-separate', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-work-variants-')
        )
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        try {
            database.importCatalog(
                [
                    {
                        comicId: 'pica:1',
                        title: 'Work Title',
                        author: 'Artist',
                        tags: [],
                        categories: [],
                        finished: true,
                        pagesCount: 24
                    },
                    {
                        comicId: 'eh:2',
                        providerId: 'eh',
                        title: '[Chinese] Work Title',
                        author: 'Artist',
                        tags: [],
                        categories: [],
                        finished: true,
                        pagesCount: 25
                    },
                    {
                        comicId: 'pica:3',
                        title: 'Different Release Name',
                        author: 'Artist',
                        tags: [],
                        categories: [],
                        finished: true,
                        pagesCount: 31
                    }
                ],
                'test'
            )
            const service = new LibraryService(database, dir)
            const probable = service.workVariantsForComic('pica:1')
            expect(probable.count).toBe(1)
            expect(probable.items[0]).toMatchObject({
                comicId: 'eh:2',
                relation: 'PROBABLE_SAME_WORK'
            })

            database.saveWorkIdentityDecision({
                leftComicId: 'pica:1',
                rightComicId: 'pica:3',
                decision: 'EDITION_VARIANT',
                source: 'USER'
            })
            const adjudicated = service.workVariantsForComic('pica:1')
            expect(adjudicated.items).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        comicId: 'pica:3',
                        relation: 'ADJUDICATED_EDITION_VARIANT'
                    })
                ])
            )

            database.saveWorkIdentityDecision({
                leftComicId: 'pica:1',
                rightComicId: 'eh:2',
                decision: 'KEEP_SEPARATE',
                source: 'USER'
            })
            const separated = service.workVariantsForComic('pica:1')
            expect(
                separated.items.some((item) => item.comicId === 'eh:2')
            ).toBe(false)
        } finally {
            database.close()
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })

    it('links the cross-language example bidirectionally in comic details without materializing a Work', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-work-v2-cross-language-')
        )
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        try {
            database.importCatalog(
                [
                    {
                        comicId: 'pica:stolen-wife',
                        providerId: 'pica',
                        title: '盗まれた人妻。',
                        author: '平つくね',
                        tags: [],
                        categories: [],
                        finished: true,
                        pagesCount: 0
                    },
                    {
                        comicId: 'eh:stolen-wife',
                        providerId: 'eh',
                        title:
                            '[ROUTE1 (Taira Tsukune)] Nusumareta Hitozuma. - Stolen Wife [Digital]',
                        alternateTitles: [
                            '[ROUTE1 (平つくね)] 盗まれた人妻。[DL版]'
                        ],
                        author: 'taira tsukune',
                        tags: [],
                        categories: [],
                        finished: true,
                        pagesCount: 0
                    }
                ],
                'test'
            )
            const service = new LibraryService(database, dir)
            const fromPica = service.workVariantsForComic(
                'pica:stolen-wife'
            )
            const fromEh = service.workVariantsForComic('eh:stolen-wife')
            expect(fromPica.items).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        comicId: 'eh:stolen-wife',
                        relation: 'PROBABLE_SAME_WORK'
                    })
                ])
            )
            expect(fromEh.items).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        comicId: 'pica:stolen-wife',
                        relation: 'PROBABLE_SAME_WORK'
                    })
                ])
            )
            expect(database.workIdentityStorageStatus().counts.bindings).toBe(
                0
            )
        } finally {
            database.close()
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })

    it('uses cover identity only as auxiliary detail evidence', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-work-v2-cover-')
        )
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        try {
            database.importCatalog(
                [
                    {
                        comicId: 'pica:cover-a',
                        providerId: 'pica',
                        title: 'Localized Title A',
                        author: 'Same Artist',
                        tags: [],
                        categories: [],
                        finished: true,
                        pagesCount: 30
                    },
                    {
                        comicId: 'eh:cover-b',
                        providerId: 'eh',
                        title: 'Completely Different Translation',
                        author: 'Same Artist',
                        tags: [],
                        categories: [],
                        finished: true,
                        pagesCount: 30
                    }
                ],
                'test'
            )
            for (const [comicId, vector] of [
                ['pica:cover-a', [1, 0, 0]],
                ['eh:cover-b', [0.9999, 0.01, 0]]
            ] as const)
                database.saveVisualEmbedding({
                    comicId,
                    modelId: 'cover-identity-test',
                    modelVersion: '1',
                    samplingPolicyVersion: 'cover-only-test',
                    embeddingKind: 'cover',
                    vector: [...vector],
                    dimension: 3,
                    sourceKind: 'LOCAL_PAGES',
                    sampleCount: 1,
                    confidence: 1,
                    generatedAt: new Date(0).toISOString(),
                    metadata: {}
                })

            const service = new LibraryService(database, dir)
            const value = service.workVariantsForComic('pica:cover-a')
            const linked = value.items.find(
                (item) => item.comicId === 'eh:cover-b'
            )
            expect(linked).toMatchObject({
                relation: 'PROBABLE_SAME_WORK'
            })
            expect(
                Number(
                    (
                        linked?.identityEvidence as Record<string, unknown>
                    )?.coverIdentitySimilarity
                )
            ).toBeGreaterThanOrEqual(0.995)
            expect(database.workIdentityStorageStatus().counts.bindings).toBe(
                0
            )
        } finally {
            database.close()
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })

    it('respects an explicit keep-separate override from the existing policy', () => {
        const state = {
            ...defaultPortablePolicyStateV5(),
            explicitDistinctPairs: ['eh:2\u0000pica:1']
        }
        const result = buildWorkIdentityAuditV5(
            [
                comic({
                    comicId: 'pica:1',
                    title: 'Same',
                    author: 'Artist',
                    pagesCount: 20
                }),
                comic({
                    comicId: 'eh:2',
                    title: 'Same',
                    author: 'Artist',
                    pagesCount: 20
                })
            ],
            state
        )
        expect(result.candidates).toHaveLength(0)
    })

    it('builds a no-write transitive work materialization preview and blocks conflicts', () => {
        const catalog = [
            comic({
                comicId: 'pica:a',
                title: 'Example Work',
                author: 'Creator',
                pagesCount: 100
            }),
            comic({
                comicId: 'eh:b',
                title: 'Example Work',
                author: 'Creator',
                pagesCount: 101
            }),
            comic({
                comicId: 'pica:c',
                title: 'Example Work Special Edition',
                author: 'Creator',
                pagesCount: 110
            })
        ]
        const clean = buildWorkIdentityMaterializationPreviewV5(catalog, [
            {
                leftComicId: 'pica:a',
                rightComicId: 'eh:b',
                decision: 'SAME_WORK'
            },
            {
                leftComicId: 'eh:b',
                rightComicId: 'pica:c',
                decision: 'EDITION_VARIANT'
            }
        ])
        expect(clean.mode).toBe('PREVIEW_ONLY')
        expect(clean.automaticBinding).toBe(false)
        expect(clean.workGroupCount).toBe(1)
        expect(clean.readyGroupCount).toBe(1)
        expect(clean.proposedUploadBindingCount).toBe(3)
        expect(clean.groups[0]).toMatchObject({
            editionVariantPairCount: 1,
            editionStatus: 'VARIANT_RELATION_RECORDED',
            readyForBinding: true
        })

        const conflicted = buildWorkIdentityMaterializationPreviewV5(catalog, [
            {
                leftComicId: 'pica:a',
                rightComicId: 'eh:b',
                decision: 'SAME_WORK'
            },
            {
                leftComicId: 'eh:b',
                rightComicId: 'pica:c',
                decision: 'EDITION_VARIANT'
            },
            {
                leftComicId: 'pica:a',
                rightComicId: 'pica:c',
                decision: 'KEEP_SEPARATE'
            }
        ])
        expect(conflicted.conflictCount).toBe(1)
        expect(conflicted.readyGroupCount).toBe(0)
        expect(conflicted.proposedUploadBindingCount).toBe(0)
        expect(conflicted.groups[0].readyForBinding).toBe(false)
        expect(conflicted.groups[0].conflicts[0].type).toBe(
            'KEEP_SEPARATE_INSIDE_WORK_COMPONENT'
        )
    })


    it('builds a deterministic dry-run binding plan without writing identity tables', () => {
        const catalog = [
            comic({
                comicId: 'pica:a',
                title: 'Example Work',
                author: 'Creator',
                pagesCount: 100
            }),
            comic({
                comicId: 'eh:b',
                title: 'Example Work',
                author: 'Creator',
                pagesCount: 101
            }),
            comic({
                comicId: 'pica:c',
                title: 'Example Work CN',
                author: 'Creator',
                pagesCount: 103
            })
        ]
        const decisions = [
            {
                leftComicId: 'pica:a',
                rightComicId: 'eh:b',
                decision: 'SAME_WORK'
            },
            {
                leftComicId: 'eh:b',
                rightComicId: 'pica:c',
                decision: 'EDITION_VARIANT'
            }
        ]
        const plan = buildWorkIdentityMaterializationPlanV5(
            catalog,
            decisions
        )
        const reversed = buildWorkIdentityMaterializationPlanV5(
            [...catalog].reverse(),
            [...decisions].reverse()
        )

        expect(plan.mode).toBe('DRY_RUN')
        expect(plan.planVersion).toBe(
            WORK_IDENTITY_MATERIALIZATION_PLAN_VERSION
        )
        expect(plan.writeEnabled).toBe(false)
        expect(plan.automaticBinding).toBe(false)
        expect(plan.summary).toMatchObject({
            workGroupCount: 1,
            workReadyCount: 1,
            fullBindingReadyCount: 1,
            blockedGroupCount: 0,
            createWorkCount: 1,
            proposedUploadBindingCount: 3
        })
        expect(plan.groups[0].editionPlans).toHaveLength(2)
        expect(
            plan.groups[0].editionPlans.every(
                (edition) => edition.plannedEditionId
            )
        ).toBe(true)
        expect(plan.groups[0].uploadBindings).toHaveLength(3)
        expect(
            plan.groups[0].uploadBindings.every(
                (binding) => binding.rollback === null
            )
        ).toBe(true)
        expect(reversed.groups[0].plannedWorkId).toBe(
            plan.groups[0].plannedWorkId
        )
        expect(
            reversed.groups[0].editionPlans.map(
                (edition) => edition.plannedEditionId
            )
        ).toEqual(
            plan.groups[0].editionPlans.map(
                (edition) => edition.plannedEditionId
            )
        )
    })

    it('blocks contradictory identity state and preserves rollback information', () => {
        const catalog = [
            comic({
                comicId: 'pica:a',
                title: 'Example Work',
                author: 'Creator'
            }),
            comic({
                comicId: 'eh:b',
                title: 'Example Work',
                author: 'Creator'
            }),
            comic({
                comicId: 'pica:c',
                title: 'Example Work Alt',
                author: 'Creator'
            })
        ]
        const contradiction =
            buildWorkIdentityMaterializationPlanV5(catalog, [
                {
                    leftComicId: 'pica:a',
                    rightComicId: 'eh:b',
                    decision: 'SAME_WORK'
                },
                {
                    leftComicId: 'eh:b',
                    rightComicId: 'pica:c',
                    decision: 'SAME_WORK'
                },
                {
                    leftComicId: 'pica:a',
                    rightComicId: 'pica:c',
                    decision: 'EDITION_VARIANT'
                }
            ])
        expect(contradiction.summary.blockedGroupCount).toBe(1)
        expect(
            contradiction.groups[0].blockers.map((item) => item.type)
        ).toContain('EDITION_CONSTRAINT_CONFLICT')

        const existingSplit =
            buildWorkIdentityMaterializationPlanV5(
                catalog.slice(0, 2),
                [
                    {
                        leftComicId: 'pica:a',
                        rightComicId: 'eh:b',
                        decision: 'SAME_WORK'
                    }
                ],
                [
                    {
                        comicId: 'pica:a',
                        workId: 'work-1',
                        editionId: 'edition-1',
                        bindingStatus: 'MANUAL_CONFIRMED',
                        confidence: 1,
                        resolverVersion: 'manual'
                    },
                    {
                        comicId: 'eh:b',
                        workId: 'work-2',
                        editionId: 'edition-2',
                        bindingStatus: 'MANUAL_CONFIRMED',
                        confidence: 1,
                        resolverVersion: 'manual'
                    }
                ]
            )
        expect(existingSplit.summary.blockedGroupCount).toBe(1)
        expect(
            existingSplit.groups[0].blockers.map((item) => item.type)
        ).toContain('EXISTING_WORK_SPLIT')
        expect(
            existingSplit.groups[0].uploadBindings.every(
                (binding) =>
                    binding.action === 'BLOCKED' &&
                    binding.rollback !== null
            )
        ).toBe(true)
    })

    it('keeps ambiguous edition partition at Work-ready but not full-binding-ready', () => {
        const catalog = [
            comic({ comicId: 'pica:a', title: 'W', author: 'A' }),
            comic({ comicId: 'eh:b', title: 'W v2', author: 'A' }),
            comic({ comicId: 'pica:c', title: 'W v3', author: 'A' })
        ]
        const plan = buildWorkIdentityMaterializationPlanV5(catalog, [
            {
                leftComicId: 'pica:a',
                rightComicId: 'eh:b',
                decision: 'EDITION_VARIANT'
            },
            {
                leftComicId: 'eh:b',
                rightComicId: 'pica:c',
                decision: 'EDITION_VARIANT'
            }
        ])
        expect(plan.summary.workReadyCount).toBe(1)
        expect(plan.summary.fullBindingReadyCount).toBe(0)
        expect(plan.groups[0].readyForWorkBinding).toBe(true)
        expect(plan.groups[0].readyForFullBinding).toBe(false)
        expect(
            plan.groups[0].warnings.map((item) => item.type)
        ).toContain('EDITION_PARTITION_UNDERDETERMINED')
    })


    it('stores prepare-only materialization audit runs idempotently without binding uploads', () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-work-materialize-audit-')
        )
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        const digest = 'a'.repeat(64)
        const first = database.prepareWorkIdentityMaterializationRun({
            requestKey: 'p2a-test-request-001',
            planVersion: WORK_IDENTITY_MATERIALIZATION_PLAN_VERSION,
            planDigest: digest,
            plan: {
                mode: 'DRY_RUN',
                planVersion: WORK_IDENTITY_MATERIALIZATION_PLAN_VERSION,
                planDigest: digest
            }
        })
        const replay = database.prepareWorkIdentityMaterializationRun({
            requestKey: 'p2a-test-request-001',
            planVersion: WORK_IDENTITY_MATERIALIZATION_PLAN_VERSION,
            planDigest: digest,
            plan: {
                mode: 'DRY_RUN',
                planVersion: WORK_IDENTITY_MATERIALIZATION_PLAN_VERSION,
                planDigest: digest
            }
        })
        expect(first.status).toBe('PREPARED')
        expect(first.idempotentReplay).toBe(false)
        expect(replay.id).toBe(first.id)
        expect(replay.idempotentReplay).toBe(true)
        expect(database.listWorkIdentityMaterializationRuns()).toHaveLength(1)
        expect(
            database.workIdentityStorageStatus().counts.materializationRuns
        ).toBe(1)
        expect(database.workIdentityStorageStatus().counts.bindings).toBe(0)
        expect(() =>
            database.prepareWorkIdentityMaterializationRun({
                requestKey: 'p2a-test-request-001',
                planVersion: WORK_IDENTITY_MATERIALIZATION_PLAN_VERSION,
                planDigest: 'b'.repeat(64),
                plan: { mode: 'DRY_RUN' }
            })
        ).toThrow(/different plan/)

        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

})
