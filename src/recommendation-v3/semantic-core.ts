import type { StoredComic } from '../library/types'

export const TAG_ONTOLOGY_VERSION = 2
export const TAG_ALIAS_VERSION = 1

export type SemanticFacet =
    | 'CONTENT_BEHAVIOR'
    | 'CHARACTER_BODY_ATTRIBUTE'
    | 'CHARACTER_IDENTITY_ROLE'
    | 'RELATIONSHIP_TROPE'
    | 'FETISH_TROPE'
    | 'STORY_THEME'
    | 'GENRE_SETTING'
    | 'FANDOM_IP'
    | 'VISUAL_STYLE'
    | 'FORMAT'
    | 'LANGUAGE_TRANSLATION'
    | 'EVENT_SOURCE'
    | 'META_ADMIN'
    | 'UNKNOWN'

export type RecommendationRole =
    | 'CORE'
    | 'SECONDARY'
    | 'MODIFIER'
    | 'FILTER_ONLY'
    | 'IGNORE'
    | 'UNRESOLVED'

export interface SemanticTagFeature {
    raw: string
    normalized: string
    canonical: string
    facet: SemanticFacet
    recommendationRole: RecommendationRole
    eligibleForCluster: boolean
    eligibleForRecall: boolean
    eligibleForCombination: boolean
    eligibleForRanking: boolean
    modifierOnly: boolean
    informativeness?: number
}

/** Deterministic, idempotent mechanical normalization only. */
export function normalizeTag(value: unknown) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/[\u200b-\u200d\ufeff]/g, '')
        .replace(/[\u3000\s]+/g, ' ')
        .trim()
        .replace(/^(?:\[|【|（|\()+|(?:\]|】|）|\))+$/g, '')
        .trim()
        .replace(/[“”‘’]/g, (mark) =>
            mark === '“' || mark === '”' ? '"' : "'"
        )
        .toLocaleLowerCase('und')
}

const SAFE_ALIASES: Record<string, string> = {
    '3d': '3d',
    '3Ｄ': '3d',
    全彩: '全彩',
    彩色: '全彩',
    黑白: '黑白',
    'black and white': '黑白'
}

/** Only high-confidence mechanical/curated aliases belong here. */
export function resolveTagAlias(value: string) {
    const normalized = normalizeTag(value)
    return SAFE_ALIASES[normalized] ?? normalized
}

export function classifyTagFacet(value: string): SemanticFacet {
    const tag = normalizeTag(value)
    if (!tag) return 'UNKNOWN'
    if (/^(c\d{2,4}|ff\d+|sc\d+|comitia|コミケ|例大祭|cm\d+)$/i.test(tag))
        return 'EVENT_SOURCE'
    if (
        /(汉化|漢化|翻译|翻譯|chinese|japanese|korean|中文|日文|日語|韓文|韩文|無修正|无修正)/i.test(
            tag
        )
    )
        return 'LANGUAGE_TRANSLATION'
    if (
        /(原创|原創|同人誌|同人志|doujin|自购|自購|扫描|掃描|汉化组|漢化組)/i.test(
            tag
        )
    )
        return 'META_ADMIN'
    if (/(全彩|黑白|彩色|3d|线稿|線稿|写真|寫真)/i.test(tag))
        return 'VISUAL_STYLE'
    if (
        /(单行本|單行本|合集|画集|畫集|短篇|长篇|短篇合集|連載|连载)/i.test(tag)
    )
        return 'FORMAT'
    if (
        /(fate|原神|崩坏|崩壞|lovelive|偶像大师|偶像大師|pokemon|宝可梦|寶可夢|艦これ|舰队|艦隊|东方|東方)/i.test(
            tag
        )
    )
        return 'FANDOM_IP'
    if (
        /(人妻|熟女|萝莉|蘿莉|少女|少年|姐姐|姊姊|妹妹|ntr|寝取|寝取られ|百合|bl|耽美)/i.test(
            tag
        )
    )
        return 'RELATIONSHIP_TROPE'
    if (
        /(巨乳|贫乳|貧乳|爆乳|长腿|長腿|黑皮|白皮|短发|短髮|长发|長髮|金发|金髮|眼镜|眼鏡|兽耳|獸耳)/i.test(
            tag
        )
    )
        return 'CHARACTER_BODY_ATTRIBUTE'
    if (
        /(学生|教師|老师|教師|女仆|女僕|护士|護士|人妻|公主|王女|军人|軍人|jk|jc|ol)/i.test(
            tag
        )
    )
        return 'CHARACTER_IDENTITY_ROLE'
    if (
        /(触手|觸手|药|藥|催眠|洗脑|洗腦|调教|調教|母乳|乳交|口交|中出|潮吹|騎乗)/i.test(
            tag
        )
    )
        return 'FETISH_TROPE'
    if (
        /(口爆|顏射|颜射|肛交|指交|強暴|强暴|榨精|手交|拘束|露出|破處|破处|肉便器|二穴|後入|后入|足交|吞精|射精|3p)/i.test(
            tag
        )
    )
        return 'CONTENT_BEHAVIOR'
    if (
        /(校服|制服|馬尾|马尾|雙馬尾|双马尾|長筒襪|长筒袜|連褲絲襪|连裤丝袜|情趣內衣|情趣内衣|泳裝|泳装|浴衣|兔女娘|兔女郎|懷孕|怀孕|正太|大叔|黑長直|黑长直|比基尼|精靈|精灵)/i.test(
            tag
        )
    )
        return 'CHARACTER_BODY_ATTRIBUTE'
    if (/(學生|学生|老師|老师|御姐|女性主導|女性主导)/i.test(tag))
        return 'CHARACTER_IDENTITY_ROLE'
    if (/(外遇|青梅竹馬|青梅竹马)/i.test(tag)) return 'RELATIONSHIP_TROPE'
    if (/(浴室|野外)/i.test(tag)) return 'GENRE_SETTING'
    if (
        /(插入|射精|做愛|做爱|性交|手淫|自慰|舔舐|舔舐|拥抱|擁抱|吻|接吻)/i.test(
            tag
        )
    )
        return 'CONTENT_BEHAVIOR'
    if (
        /(校园|校園|奇幻|幻想|冒险|冒險|战斗|戰鬥|日常|恋爱|戀愛|纯爱|純愛|科幻|悬疑|懸疑|历史|歷史|兽人|獸人|黑深残|黑深殘)/i.test(
            tag
        )
    )
        return 'GENRE_SETTING'
    if (
        /(bad end|happy end|结局|結局|剧情|劇情|故事|复仇|復仇|旅行|冒险|冒險)/i.test(
            tag
        )
    )
        return 'STORY_THEME'
    return 'UNKNOWN'
}

export function roleForFacet(facet: SemanticFacet): RecommendationRole {
    if (
        facet === 'EVENT_SOURCE' ||
        facet === 'LANGUAGE_TRANSLATION' ||
        facet === 'META_ADMIN'
    )
        return 'IGNORE'
    if (facet === 'VISUAL_STYLE' || facet === 'FORMAT') return 'MODIFIER'
    if (facet === 'UNKNOWN') return 'UNRESOLVED'
    if (
        facet === 'FANDOM_IP' ||
        facet === 'CONTENT_BEHAVIOR' ||
        facet === 'RELATIONSHIP_TROPE' ||
        facet === 'FETISH_TROPE' ||
        facet === 'CHARACTER_BODY_ATTRIBUTE' ||
        facet === 'CHARACTER_IDENTITY_ROLE' ||
        facet === 'STORY_THEME'
    )
        return 'CORE'
    return 'SECONDARY'
}

export function semanticTagFeature(
    raw: unknown,
    informativeness?: number
): SemanticTagFeature {
    const original = String(raw ?? '')
    const normalized = normalizeTag(original)
    const canonical = resolveTagAlias(normalized)
    const facet = classifyTagFacet(canonical)
    const recommendationRole = roleForFacet(facet)
    const excluded =
        recommendationRole === 'IGNORE' || recommendationRole === 'FILTER_ONLY'
    const modifierOnly = recommendationRole === 'MODIFIER'
    return {
        raw: original,
        normalized,
        canonical,
        facet,
        recommendationRole,
        eligibleForCluster: !excluded,
        eligibleForRecall: !excluded && !modifierOnly,
        eligibleForCombination: !excluded,
        // Unknown tags may remain weak descriptive evidence, but never become
        // high-weight core ranking signals until reviewed.
        eligibleForRanking: !excluded && recommendationRole !== 'UNRESOLVED',
        modifierOnly,
        informativeness
    }
}

export function semanticTagFeatures(
    comic: Pick<StoredComic, 'tags'>,
    stats?: Map<string, { informativeness?: number }>
) {
    const seen = new Set<string>()
    return comic.tags
        .map((raw) =>
            semanticTagFeature(
                raw,
                stats?.get(resolveTagAlias(String(raw)))?.informativeness
            )
        )
        .filter((feature) => {
            if (!feature.canonical || seen.has(feature.canonical)) return false
            seen.add(feature.canonical)
            return true
        })
}

export function recommendationTags(
    comic: Pick<StoredComic, 'tags'>,
    stats?: Map<string, { informativeness?: number }>
) {
    return semanticTagFeatures(comic, stats).filter(
        (feature) => feature.eligibleForRecall
    )
}

export function semanticTagStats(
    favorites: Pick<StoredComic, 'tags'>[],
    catalog: Pick<StoredComic, 'tags'>[] = favorites
) {
    const count = (rows: Pick<StoredComic, 'tags'>[]) => {
        const map = new Map<string, number>()
        for (const row of rows)
            for (const feature of semanticTagFeatures(row))
                map.set(
                    feature.canonical,
                    (map.get(feature.canonical) ?? 0) + 1
                )
        return map
    }
    const favoriteCounts = count(favorites),
        catalogCounts = count(catalog)
    const total = Math.max(1, catalog.length)
    return new Map(
        [...favoriteCounts].map(([canonical, favoriteCount]) => {
            const catalogCount = catalogCounts.get(canonical) ?? 0
            return [
                canonical,
                {
                    favoriteCount,
                    catalogCount,
                    informativeness:
                        Math.log((total + 1) / (catalogCount + 1)) + 1
                }
            ]
        })
    )
}
