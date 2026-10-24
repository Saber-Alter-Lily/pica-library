import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { shadowDatabaseState } from './recommendation-shadow-fixture'
import { defaultTagPolicyV1 } from '../../src/tags/policy'
import type { Comic } from '../../src/types'
import type { Pica } from '../../src/sdk'
import type { LegacyGeneratedRecommendations } from '../../src/recommendation/legacy-ports'

export const COMPATIBILITY_TEST_NOW = '2026-10-23T12:00:00.000Z'
export type RecallScenario =
    | 'normal'
    | 'empty'
    | 'partial-failure'
    | 'no-candidates'
    | 'local-eh-favorites'
    | 'personal-tags'
export const compatibilityDatabaseState = shadowDatabaseState

/** All metadata and providers are invented. Never opens a profile, account, body or listener. */
export function compatibilityFixture(
    scenario: RecallScenario = 'normal',
    candidateCount = 75
) {
    const root = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pica-compatibility-module-')
    )
    const database = new LibraryDatabase(path.join(root, 'library.db'))
    const trace: Array<{ name: string; args: unknown[] }> = []
    const proxy = new Proxy(database, {
        get(target, key) {
            const value = Reflect.get(target, key)
            if (typeof value !== 'function') return value
            return (...args: unknown[]) => {
                trace.push({
                    name: String(key),
                    args: JSON.parse(JSON.stringify(args))
                })
                return Reflect.apply(value, target, args)
            }
        }
    })
    const favorites =
        scenario === 'empty'
            ? []
            : Array.from({ length: 10 }, (_, i) => ({
                  comicId:
                      scenario === 'local-eh-favorites'
                          ? i % 2
                              ? `local:fixture-${i}`
                              : `eh:${1000 + i}:0123456789`
                          : `favorite-${i}`,
                  title: `Synthetic favorite ${i}`,
                  author: `Circle ${i % 3} (Creator ${i % 5})`,
                  tags: [i % 2 ? 'school' : 'adventure', 'story', '黑白'],
                  categories: ['Fixture category ' + (i % 2)],
                  finished: i % 2 === 0,
                  totalLikes: 20 + i,
                  totalViews: 40 + i,
                  updatedAt: COMPATIBILITY_TEST_NOW,
                  providerId:
                      scenario === 'local-eh-favorites'
                          ? i % 2
                              ? ('local' as const)
                              : ('eh' as const)
                          : ('pica' as const)
              }))
    database.importFavorites(favorites, 'fixture:favorites', true)
    if (scenario === 'personal-tags') {
        database.setAppState('recommendation.v5.portablePolicy.v1', {
            revision: 4,
            tagPolicy: {
                ...defaultTagPolicyV1(),
                mode: 'SELECTED',
                selected: ['pica|school'],
                privateTags: [
                    {
                        id: 'pt_' + 'a'.repeat(32),
                        name: 'Synthetic quiet lines',
                        kind: 'MANUAL',
                        comicIds: ['favorite-0'],
                        mappings: []
                    }
                ]
            }
        })
    }
    const providerCalls: Array<{
        kind: string
        source: string
        page?: number
    }> = []
    let active = 0,
        maximumActive = 0
    const rawComic = (id: string, offset = 0): Comic => ({
        _id: id,
        title: 'Synthetic candidate ' + id,
        author: 'Circle ' + (offset % 3) + ' (Creator ' + (offset % 5) + ')',
        description: 'Invented metadata only',
        chineseTeam: '',
        categories: ['Fixture category ' + (offset % 2)],
        tags: [offset % 2 ? 'school' : 'adventure', 'story'],
        finished: false,
        totalLikes: offset + 1,
        totalViews: offset + 10,
        created_at: COMPATIBILITY_TEST_NOW,
        updated_at: COMPATIBILITY_TEST_NOW
    })
    const load = async (kind: string, source: string, page = 1) => {
        providerCalls.push({ kind, source, page })
        active++
        maximumActive = Math.max(maximumActive, active)
        try {
            await Promise.resolve()
            if (
                scenario === 'partial-failure' &&
                (kind === 'tag' || page === 2)
            )
                throw Error('Synthetic provider page rejection')
            if (scenario === 'no-candidates') return []
            return Array.from({ length: 6 }, (_, n) => {
                const item = rawComic(`recalled-${(n + page * 3) % 19}`, n)
                if (kind === 'tag') item.tags.push(source)
                if (kind === 'category') item.categories.push(source)
                if (kind === 'author') item.author = source
                return item
            })
        } finally {
            active--
        }
    }
    const sdk = {
        Order: { loved: 'ld' },
        related: (source: string) => load('related', source),
        search: async (source: string, page: number) => ({
            docs: await load('author', source, page),
            pages: 3
        }),
        comicsPage: async (
            category: string,
            tag: string,
            _order: string,
            page: number
        ) => ({
            docs: await load(tag ? 'tag' : 'category', tag || category, page),
            pages: 4
        })
    } as unknown as Pica
    const service = new LibraryService(proxy, root, sdk)
    const sessionRecords = Array.from(
        { length: candidateCount },
        (_, index) => ({
            comicId: 'session-' + String(index).padStart(3, '0'),
            title: 'Synthetic session ' + index,
            author: 'Session author ' + (index % 7),
            categories: ['Fixture'],
            tags: [index % 2 ? 'school' : 'adventure'],
            finished: false,
            totalLikes: index + 1,
            totalViews: index + 10
        })
    )
    let generations = 0
    const prepareSessions = () =>
        database.importCatalog(sessionRecords, 'fixture:sessions')
    const generate = async (): Promise<LegacyGeneratedRecommendations> => {
        generations++
        return {
            recommendations: database
                .recommendationRecords(sessionRecords.map((row) => row.comicId))
                .map((row, index) => ({
                    ...row,
                    score: 100 - index,
                    reasons: ['synthetic-' + index],
                    recallSources: ['fixture'],
                    matchedSignals: ['fixture'],
                    exploration: index % 2 === 0
                })),
            profile: { synthetic: true },
            audit: { generation: generations }
        }
    }
    trace.length = 0
    return {
        root,
        database,
        proxy,
        service,
        sdk,
        trace,
        favorites,
        providerCalls,
        rawComic,
        prepareSessions,
        generate,
        maximumActive: () => maximumActive,
        generations: () => generations,
        dispose() {
            database.close()
            fs.rmSync(root, { recursive: true, force: true })
        }
    }
}
export type CompatibilityFixture = ReturnType<typeof compatibilityFixture>
