import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import type { StoredComic } from '../../src/library/types'
import {
    loadTagRegistryV3,
    type TagRegistryV3
} from '../../src/recommendation-v3/tag-resolution-v3'
import { buildHistoricalTasteSnapshot } from '../../src/recommendation-v3/taste-chronicle'
import { projectTasteChronicleView } from '../../src/recommendation-v3/taste-chronicle-view'
import {
    createPreferencePresentationIndex,
    preferenceSearchText,
    searchPreferenceSignalsV5
} from '../../src/recommendation-v5/preference-discovery'
import {
    defaultPortablePolicyStateV5,
    normalizeControlV5,
    portableInferredSignalsV5,
    RECOMMENDATION_V5_POLICY_STATE_KEY
} from '../../src/recommendation-v5/portable-policy'

function comic(id: string, tags: string[], author = 'Writer'): StoredComic {
    return {
        comicId: id,
        title: id,
        author,
        canonicalAuthor: author,
        circle: 'Circle',
        authorId: author,
        tags,
        categories: ['General'],
        finished: true,
        isFavorite: true,
        inLibrary: true,
        downloadedPictures: 0,
        knownPictures: 0,
        knownEpisodes: 0,
        firstSeenAt: '2026-01-01T00:00:00Z',
        lastSeenAt: '2026-01-01T00:00:00Z'
    }
}
const registry = (): TagRegistryV3 => ({
    semantic: new Map(
        [
            ['雙馬尾', 'APPEARANCE_TRAIT'],
            ['眼鏡', 'APPEARANCE_TRAIT'],
            ['黑長直', 'APPEARANCE_TRAIT'],
            ['傲嬌', 'STORY_TROPE'],
            ['fiction', 'FANDOM_IP'],
            ['發', 'STORY_TROPE'],
            ['髮', 'APPEARANCE_TRAIT'],
            ['unsafe', 'UNKNOWN']
        ].map(([tag, facet]) => [
            tag,
            {
                normalized_tag: tag,
                canonical_tag: tag,
                facet,
                recommendation_eligible: 'true',
                recommendation_role:
                    tag === 'unsafe' ? 'SAFETY_EXCLUDE' : 'CORE',
                retrieval_utility: 'CONJUNCTION_ANCHOR',
                safety_status: 'OK'
            }
        ])
    ),
    entities: new Map(),
    aliases: new Map([
        ['twin tails', '雙馬尾'],
        ['bad-alias', 'unsafe']
    ]),
    unresolved: new Set(),
    manifestSha256: 'fixture'
})
const control = (
    key: string,
    direction: 'LESS' | 'BLOCK',
    targetType: 'TAG' | 'AUTHOR' | 'CATEGORY' | 'FANDOM' = 'TAG'
) =>
    normalizeControlV5({
        targetType,
        key,
        direction,
        scope: 'PERSISTENT',
        updatedAt: '2026-01-01T00:00:00Z'
    })

describe('preference discovery: presentation equivalence, stable policy identities', () => {
    it.each([
        ['双马尾', '雙馬尾'],
        ['眼镜', '眼鏡'],
        ['黑长直', '黑長直'],
        ['傲娇', '傲嬌']
    ])('finds %s without replacing the stored %s key', (query, key) => {
        const state = defaultPortablePolicyStateV5()
        const records = [comic('one', [key])]
        const before = JSON.stringify({ records, state })
        const result = searchPreferenceSignalsV5(
            records,
            state,
            query,
            createPreferencePresentationIndex(registry())
        )
        expect(result.items.map((item) => item.key)).toContain(key)
        expect(JSON.stringify({ records, state })).toBe(before)
        expect(preferenceSearchText(` ${key} `)).toBe(query)
    })

    it('searches registry aliases but does not collapse two editable raw keys', () => {
        const result = searchPreferenceSignalsV5(
            [comic('a', ['雙馬尾', 'twin tails'])],
            defaultPortablePolicyStateV5(),
            '双马尾',
            createPreferencePresentationIndex(registry())
        )
        expect(result.items.map((item) => item.key).sort()).toEqual(
            ['twin tails', '雙馬尾'].sort()
        )
        expect(result.items.every((item) => item.supportCount === 1)).toBe(true)
        expect(result.items.every((item) => item.label === '雙馬尾')).toBe(true)
    })

    it('uses actual packaged registry variants without changing registry assets', () => {
        const index = createPreferencePresentationIndex(
            loadTagRegistryV3(path.resolve('src/data/tag-runtime-v1'))
        )
        const result = searchPreferenceSignalsV5(
            [comic('a', ['雙馬尾', '眼鏡', '黑長直', '傲嬌'])],
            defaultPortablePolicyStateV5(),
            '双马尾',
            index
        )
        expect(result.items).toHaveLength(1)
        expect(result.items[0]).toMatchObject({
            key: '雙馬尾',
            facet: 'APPEARANCE_TRAIT'
        })
        expect(index.displayIdentity('少女与战车')).toBe(
            index.displayIdentity('fandom_ip::少女與戰車')
        )
        expect(index.displayIdentity('parody:少女與戰車')).not.toBe(
            index.displayIdentity('少女與戰車')
        )
    })

    it('finds a low-frequency item beyond the default top 500', () => {
        const common = Array.from({ length: 600 }, (_, i) => `common-${i}`)
        const records = [
            comic('a', common),
            comic('b', common),
            comic('c', ['rare-tail'])
        ]
        expect(
            portableInferredSignalsV5(records, 500).some(
                (row) => row.key === 'rare-tail'
            )
        ).toBe(false)
        const result = searchPreferenceSignalsV5(
            records,
            defaultPortablePolicyStateV5(),
            'rare-tail',
            createPreferencePresentationIndex()
        )
        expect(result.items).toMatchObject([
            { key: 'rare-tail', supportCount: 1 }
        ])
    })

    it('caps after matching and reports truncation; finite limits are enforced', () => {
        const records = [
            comic(
                'a',
                Array.from({ length: 650 }, (_, i) => `common-${i}`)
            )
        ]
        const state = defaultPortablePolicyStateV5(),
            index = createPreferencePresentationIndex()
        const result = searchPreferenceSignalsV5(
            records,
            state,
            'common-',
            index,
            1000
        )
        expect(result).toMatchObject({
            total: 650,
            limit: 200,
            truncated: true
        })
        expect(result.items).toHaveLength(200)
        expect(
            searchPreferenceSignalsV5(records, state, 'common-', index, NaN)
                .limit
        ).toBe(100)
    })

    it('retains existing custom controls while excluding taste-excluded favorites', () => {
        const state = {
            ...defaultPortablePolicyStateV5(),
            controls: [control('custom-rare', 'LESS')],
            tasteExcludedComicIds: ['a']
        }
        const index = createPreferencePresentationIndex()
        expect(
            searchPreferenceSignalsV5(
                [comic('a', ['ignored'])],
                state,
                'ignored',
                index
            ).total
        ).toBe(0)
        expect(
            searchPreferenceSignalsV5([], state, 'custom', index).items[0]
        ).toMatchObject({
            key: 'custom-rare',
            systemUnknown: true,
            supportCount: 0,
            baselineLevel: 5
        })
    })

    it('does not strip provider namespaces or guess ambiguous folded identities', () => {
        const index = createPreferencePresentationIndex(registry())
        expect(index.resolve('发')).toBeUndefined()
        expect(index.displayIdentity('male:雙馬尾')).not.toBe(
            index.displayIdentity('雙馬尾')
        )
        expect(index.displayIdentity('female:雙馬尾')).not.toBe(
            index.displayIdentity('male:雙馬尾')
        )
        expect(index.displayIdentity('twin tails')).toBe(
            index.displayIdentity('双马尾')
        )
    })

    it('excludes registry safety roles including aliases, and reports fallback explicitly', () => {
        const result = searchPreferenceSignalsV5(
            [comic('a', ['unsafe', 'bad-alias'])],
            defaultPortablePolicyStateV5(),
            '',
            createPreferencePresentationIndex(registry())
        )
        expect(
            result.items.some((item) =>
                ['unsafe', 'bad-alias'].includes(item.key)
            )
        ).toBe(false)
        expect(
            searchPreferenceSignalsV5(
                [],
                defaultPortablePolicyStateV5(),
                '',
                createPreferencePresentationIndex()
            ).registryAvailable
        ).toBe(false)
    })
})

describe('atlas projection without underlying mutations', () => {
    function fixture() {
        const records = Array.from({ length: 12 }, (_, i) =>
            comic(`comic-${i}`, ['雙馬尾', '眼鏡', 'fiction'])
        )
        const source = buildHistoricalTasteSnapshot(
            records,
            [],
            '2026-01-01T00:00:00Z',
            { registry: registry() }
        )
        return { source, index: createPreferencePresentationIndex(registry()) }
    }
    it('defaults to the identical objective snapshot even with BLOCK and LESS controls', () => {
        const { source, index } = fixture()
        const result = projectTasteChronicleView(
            source,
            [control('双马尾', 'BLOCK'), control('fiction', 'LESS')],
            {},
            index
        )
        expect(result.snapshot).toBe(source)
        expect(result.view).toMatchObject({
            mode: 'OBJECTIVE_COLLECTION',
            hiddenInterests: 0
        })
    })
    it('separates BLOCK and LESS, removes affected edges/combinations, preserves denominators and identities', () => {
        const { source, index } = fixture()
        const before = JSON.stringify(source)
        const controls = [
            control('twin tails', 'BLOCK'),
            control('fiction', 'LESS', 'FANDOM'),
            control('Writer', 'BLOCK', 'AUTHOR')
        ]
        const blocked = projectTasteChronicleView(
            source,
            controls,
            { hideBlocked: true },
            index
        )
        const items = blocked.snapshot.facetBands.flatMap(
            (band) => band.interests
        )
        expect(items.some((item) => item.canonicalKey === '雙馬尾')).toBe(false)
        expect(items.some((item) => item.canonicalKey === 'fiction')).toBe(true)
        expect(blocked.snapshot.authorPreferences).toHaveLength(0)
        expect(
            blocked.snapshot.themes.every((theme) =>
                theme.anchors.every(
                    (anchor) => anchor.canonicalKey !== '雙馬尾'
                )
            )
        ).toBe(true)
        const ids = new Set(
            blocked.snapshot.themes.map((theme) => theme.themeId)
        )
        expect(
            blocked.snapshot.themeEdges.every(
                (edge) =>
                    ids.has(edge.sourceThemeId) && ids.has(edge.targetThemeId)
            )
        ).toBe(true)
        expect(
            blocked.snapshot.combinations.every(
                (item) => !item.canonicalKeys.includes('雙馬尾')
            )
        ).toBe(true)
        const both = projectTasteChronicleView(
            source,
            controls,
            { hideBlocked: true, hideLess: true },
            index
        )
        expect(both.snapshot.fandomPreferences).toHaveLength(0)
        expect(both.snapshot.globalStats).toBe(source.globalStats)
        expect(both.snapshot.snapshotId).toBe(source.snapshotId)
        expect(both.snapshot.favoriteCount).toBe(source.favoriteCount)
        expect(both.snapshot.facetBands[0].comicCount).toBe(
            source.facetBands.find(
                (item) => item.facet === both.snapshot.facetBands[0].facet
            )?.comicCount
        )
        expect(
            both.snapshot.facetBands
                .flatMap((band) => band.interests)
                .find((item) => item.canonicalKey === '眼鏡')
                ?.facetConditionalShare
        ).toBe(1)
        expect(JSON.stringify(source)).toBe(before)
    })
    it('handles all-hidden and non-applicable controls without inventing a replacement profile', () => {
        const { source, index } = fixture()
        const controls = ['雙馬尾', '眼鏡', 'fiction'].map((key) =>
            control(key, 'BLOCK')
        )
        controls.push(control('General', 'BLOCK', 'CATEGORY'))
        const result = projectTasteChronicleView(
            source,
            controls,
            { hideBlocked: true },
            index
        )
        expect(result.snapshot.facetBands).toHaveLength(0)
        expect(result.snapshot.themes).toHaveLength(0)
        expect(result.snapshot.themeEdges).toHaveLength(0)
        expect(result.view.unsupportedControlCount).toBe(1)
        expect(result.snapshot.favoriteCount).toBe(12)
    })
    it('ignores session controls and user-editable labels for matching', () => {
        const { source, index } = fixture()
        const controls = [
            { ...control('unknown', 'BLOCK'), label: '雙馬尾' },
            { ...control('fiction', 'BLOCK'), scope: 'SESSION' as const }
        ]
        const result = projectTasteChronicleView(
            source,
            controls,
            { hideBlocked: true },
            index
        )
        expect(result.view.hiddenInterests).toBe(0)
        expect(result.view.hiddenThemes).toBe(0)
    })
    it('returns legacy snapshots unchanged with an explicit unsupported marker', () => {
        const { source, index } = fixture()
        const legacy = { ...source, snapshotVersion: 1 }
        const result = projectTasteChronicleView(
            legacy,
            [control('fiction', 'BLOCK')],
            { hideBlocked: true },
            index
        )
        expect(result.snapshot).toBe(legacy)
        expect(result.view.supported).toBe(false)
    })
})

describe('read-only discovery service', () => {
    const cleanup: Array<() => void> = []
    afterEach(() => {
        for (const close of cleanup.splice(0)) close()
    })
    it('uses listAllComics and never initializes policy or writes the cached atlas', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-issue199-200-'))
        const db = new LibraryDatabase(path.join(dir, 'library.db'))
        cleanup.push(() => {
            db.close()
            fs.rmSync(dir, { recursive: true, force: true })
        })
        const source = buildHistoricalTasteSnapshot(
            [comic('a', ['雙馬尾'])],
            [],
            '2026-01-01T00:00:00Z',
            { registry: registry() }
        )
        const file = path.join(dir, 'taste-chronicle.json')
        fs.writeFileSync(file, JSON.stringify(source))
        const original = fs.readFileSync(file)
        const dbOriginal = fs.readFileSync(path.join(dir, 'library.db'))
        const stateWriter = vi.spyOn(db, 'setAppState')
        const all = vi
            .spyOn(db, 'listAllComics')
            .mockReturnValue([comic('a', ['雙馬尾'])])
        const service = new LibraryService(db, dir)
        expect(
            service.recommendationV5SearchPreferences('双马尾').items
        ).toHaveLength(1)
        expect(all).toHaveBeenCalledOnce()
        expect(
            service.tasteChronicleView({ hideBlocked: true }).view?.denominator
        ).toBe('ORIGINAL_SNAPSHOT')
        expect(stateWriter).not.toHaveBeenCalled()
        expect(
            db.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)
        ).toBeUndefined()
        expect(fs.readFileSync(file)).toEqual(original)
        expect(fs.readFileSync(path.join(dir, 'library.db'))).toEqual(
            dbOriginal
        )
        const stored = {
            ...defaultPortablePolicyStateV5(),
            revision: 42,
            controls: [control('双马尾', 'BLOCK')]
        }
        db.setAppState(RECOMMENDATION_V5_POLICY_STATE_KEY, stored)
        stateWriter.mockClear()
        const currentDb = fs.readFileSync(path.join(dir, 'library.db'))
        expect(
            service.tasteChronicleView({ hideBlocked: true }).snapshot
                ?.facetBands
        ).toHaveLength(0)
        expect(
            service.tasteChronicleView({}).snapshot?.facetBands
        ).toHaveLength(1)
        expect(db.getAppState(RECOMMENDATION_V5_POLICY_STATE_KEY)).toEqual(
            stored
        )
        expect(stateWriter).not.toHaveBeenCalled()
        expect(fs.readFileSync(path.join(dir, 'library.db'))).toEqual(currentDb)
        expect(fs.readFileSync(file)).toEqual(original)
        expect(() =>
            service.recommendationV5SearchPreferences('x'.repeat(161))
        ).toThrow(/160/)
    })
})
