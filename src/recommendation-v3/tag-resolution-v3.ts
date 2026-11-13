import { normalizeRegistryTag as normalize, type TagRegistryV3, type TagResolutionV3 } from '../tag-assets/registry-v3'
export { loadTagRegistryV3, parseCsv } from '../tag-assets/registry-v3'
export type { TagRegistryV3, TagResolutionV3, ResolvedTagRecord } from '../tag-assets/registry-v3'

type Row = Record<string, string>

export function resolveTagV3(
    rawTag: string,
    registry: TagRegistryV3
): TagResolutionV3 {
    const raw = String(rawTag ?? ''),
        normalizedTag = normalize(raw)
    const base = (
        status: TagResolutionV3['resolutionStatus'],
        type: TagResolutionV3['resolutionType'],
        canonicalKey: string,
        row?: Row,
        source = 'V3_FINAL'
    ) => ({
        rawTag: raw,
        normalizedTag,
        resolutionStatus: status,
        resolutionType: type,
        canonicalKey,
        canonicalLabel:
            row?.canonical_tag ?? row?.canonical_name ?? canonicalKey,
        facet: row?.facet ?? '',
        recommendationRole: row?.recommendation_role ?? 'UNRESOLVED',
        retrievalUtility: row?.retrieval_utility ?? 'UNRESOLVED',
        recommendationEligible:
            String(row?.recommendation_eligible ?? 'false').toLowerCase() ===
            'true',
        entityType: row?.entity_type ?? '',
        parentEntityKey: row?.parent_entity_key ?? '',
        safetyStatus: row?.safety_status ?? '',
        resolutionSource: source,
        resolutionWeight: status === 'RESOLVED' ? 1 : 0,
        weight: status === 'RESOLVED' ? 1 : 0
    })
    const alias = registry.aliases.get(normalizedTag)
    if (alias) {
        const target =
            registry.semantic.get(normalize(alias)) ??
            registry.entities.get(normalize(alias))
        const r = base('RESOLVED', 'ALIAS', alias, target, 'V3_ALIAS')
        if (target?.safety_status === 'AGE_AMBIGUOUS_REVIEW') {
            r.recommendationEligible = false
            r.retrievalUtility = 'PROFILE_ONLY'
        }
        return r
    }
    const semantic = registry.semantic.get(normalizedTag)
    if (semantic) {
        const explicitSafety =
            semantic.recommendation_role === 'SAFETY_EXCLUDE' ||
            semantic.retrieval_utility === 'SAFETY_BLOCKED' ||
            semantic.safety_status === 'BLOCK_MINOR_EXPLICIT'
        return base(
            'RESOLVED',
            explicitSafety ? 'SAFETY' : 'SEMANTIC',
            semantic.canonical_tag,
            semantic
        )
    }
    const entity = registry.entities.get(normalizedTag)
    if (entity) return base('RESOLVED', 'ENTITY', entity.entity_key, entity)
    if (registry.unresolved.has(normalizedTag))
        return base('UNRESOLVED', 'UNRESOLVED', '', undefined, 'V3_WATCHLIST')
    return base('UNRESOLVED', 'UNRESOLVED', '', undefined, 'OPEN_WORLD_UNKNOWN')
}
