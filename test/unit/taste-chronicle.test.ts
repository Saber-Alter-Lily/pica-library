import { describe, expect, it } from 'vitest'
import type { StoredComic } from '../../src/library/types'
import type { TagRegistryV3 } from '../../src/recommendation-v3/tag-resolution-v3'
import {
    buildHistoricalTasteSnapshot,
    TASTE_CHRONICLE_SNAPSHOT_VERSION
} from '../../src/recommendation-v3/taste-chronicle'

function comic(
    id: string,
    tags: string[],
    author = 'author-a',
    circle = 'circle-a'
): StoredComic {
    return {
        comicId: id,
        title: id,
        author,
        canonicalAuthor: author,
        circle,
        categories: [],
        tags,
        description: '',
        finished: false,
        totalLikes: Number(id.replace(/\D/g, '')) || 1,
        totalViews: 10,
        downloadedPictures: 0,
        knownPictures: 0,
        isFavorite: true,
        inLibrary: true,
        authorId: author,
        firstSeenAt: '2026-01-01T00:00:00Z',
        lastSeenAt: '2026-01-01T00:00:00Z',
        knownEpisodes: 0
    }
}

function row(
    raw: string,
    canonical: string,
    facet: string,
    role = 'CORE',
    utility = 'CONJUNCTION_ANCHOR'
) {
    return [
        raw,
        {
            normalized_tag: raw,
            canonical_tag: canonical,
            facet,
            recommendation_role: role,
            retrieval_utility: utility,
            recommendation_eligible: role === 'IGNORE' ? 'false' : 'true',
            safety_status: 'OK',
            authority_source: 'TEST'
        }
    ] as const
}

function registry(): TagRegistryV3 {
    return {
        semantic: new Map([
            row(
                'fgo',
                'Fate / Grand Order',
                'FANDOM_IP',
                'CORE',
                'HIGH_PRECISION_ANCHOR'
            ),
            row('wife', '人妻', 'RELATIONSHIP'),
            row('ntr', 'NTR', 'STORY_TROPE'),
            row('short', '短髮', 'APPEARANCE_TRAIT'),
            row('uniform', '校服', 'APPEARANCE_OUTFIT', 'CORE', 'PROFILE_ONLY'),
            row('broad', '巨乳', 'BODY_ATTRIBUTE', 'CORE', 'BROAD_RECALL'),
            row('c101', 'C101', 'PUBLICATION_EVENT', 'IGNORE', 'EXCLUDE'),
            row(
                'comic-bavel',
                'COMIC BAVEL',
                'PUBLICATION_SOURCE',
                'IGNORE',
                'EXCLUDE'
            )
        ]) as TagRegistryV3['semantic'],
        entities: new Map(),
        aliases: new Map(),
        unresolved: new Set(),
        manifestSha256: 'test-registry'
    }
}

describe('Collection Atlas V2', () => {
    it('uses Registry V3 semantic evidence and does not use favorite order as recency', () => {
        const records = [
            ...Array.from({ length: 10 }, (_, index) =>
                comic(`pair-${index}`, ['wife', 'ntr', 'broad', 'c101'])
            ),
            ...Array.from({ length: 10 }, (_, index) =>
                comic(`other-${index}`, ['short', 'uniform', 'comic-bavel'])
            )
        ]
        const forward = buildHistoricalTasteSnapshot(
            records,
            records.map((item) => item.comicId),
            '2026-01-01T00:00:00Z',
            { registry: registry() }
        )
        const reverse = buildHistoricalTasteSnapshot(
            records,
            records.map((item) => item.comicId).reverse(),
            '2026-01-01T00:00:00Z',
            { registry: registry() }
        )
        expect(forward.snapshotVersion).toBe(TASTE_CHRONICLE_SNAPSHOT_VERSION)
        expect(forward.snapshotVersion).toBe(2)
        expect(forward.hasFavoriteTimestamp).toBe(false)
        expect(forward.historicalOrderUsedForPreference).toBe(false)
        expect(forward.facetBands).toEqual(reverse.facetBands)
        expect(forward.themes).toEqual(reverse.themes)
        expect(forward.combinations).toEqual(reverse.combinations)
        expect(forward.reportNarratives.privacy).toContain(
            '不会被当作真实近期偏好'
        )
    })

    it('keeps publication/event/source labels out of semantic themes', () => {
        const records = Array.from({ length: 12 }, (_, index) =>
            comic(`fgo-${index}`, ['fgo', 'wife', 'c101', 'comic-bavel'])
        )
        const snapshot = buildHistoricalTasteSnapshot(records, [], undefined, {
            registry: registry()
        })
        const themeText = snapshot.themes
            .map((theme) => theme.displayName)
            .join(' ')
        expect(themeText).toContain('Fate / Grand Order')
        expect(themeText).not.toMatch(/C101|COMIC BAVEL/i)
        expect(snapshot.facetBands.map((band) => band.facet)).not.toContain(
            'PUBLICATION_EVENT'
        )
        expect(snapshot.facetBands.map((band) => band.facet)).not.toContain(
            'PUBLICATION_SOURCE'
        )
    })

    it('builds cross-facet conjunctions using support and lift', () => {
        const records = [
            ...Array.from({ length: 10 }, (_, index) =>
                comic(`pair-${index}`, ['wife', 'ntr'])
            ),
            ...Array.from({ length: 10 }, (_, index) =>
                comic(`other-${index}`, ['short'])
            )
        ]
        const snapshot = buildHistoricalTasteSnapshot(records, [], undefined, {
            registry: registry()
        })
        const pair = snapshot.combinations.find(
            (item) => item.tags.includes('人妻') && item.tags.includes('NTR')
        )
        expect(pair?.supportCount).toBe(10)
        expect(pair?.lift).toBeCloseTo(2)
        expect(
            snapshot.themes.some(
                (theme) =>
                    theme.type === 'SEMANTIC_COMBINATION' &&
                    theme.displayName.includes('人妻') &&
                    theme.displayName.includes('NTR')
            )
        ).toBe(true)
    })

    it('keeps broad and profile-only evidence in the preference map without forcing standalone themes', () => {
        const records = Array.from({ length: 12 }, (_, index) =>
            comic(`item-${index}`, ['broad', 'uniform', 'short'])
        )
        const snapshot = buildHistoricalTasteSnapshot(records, [], undefined, {
            registry: registry()
        })
        const labels = snapshot.facetBands.flatMap((band) =>
            band.interests.map((item) => item.label)
        )
        expect(labels).toContain('巨乳')
        expect(labels).toContain('校服')
        expect(snapshot.themes.map((theme) => theme.displayName)).not.toContain(
            '巨乳'
        )
    })

    it('uses static collection characteristics rather than trend labels', () => {
        const records = Array.from({ length: 30 }, (_, index) =>
            comic(
                `style-${index}`,
                index < 15 ? ['wife', 'ntr'] : ['short'],
                `author-${index % 20}`
            )
        )
        const snapshot = buildHistoricalTasteSnapshot(records, [], undefined, {
            registry: registry()
        })
        expect(snapshot.collectionStyle.map((item) => item.key)).toEqual([
            'multi-interest',
            'long-tail',
            'author-dispersion',
            'fandom-concentration',
            'semantic-cooccurrence'
        ])
        expect(JSON.stringify(snapshot)).not.toMatch(
            /recentWeightedSupport|trendSlope|STRONGLY_RISING/
        )
    })
})
