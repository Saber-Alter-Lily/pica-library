import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export type TagResolutionV3 = {
    rawTag: string
    normalizedTag: string
    resolutionStatus: 'RESOLVED' | 'UNRESOLVED'
    resolutionType: 'SEMANTIC' | 'ENTITY' | 'ALIAS' | 'SAFETY' | 'UNRESOLVED'
    canonicalKey: string
    canonicalLabel: string
    facet: string
    recommendationRole: string
    retrievalUtility: string
    recommendationEligible: boolean
    entityType: string
    parentEntityKey: string
    safetyStatus: string
    resolutionSource: string
    /** Recognition indicator only; not profile affinity, retrieval weight, or rank score. */
    resolutionWeight: number
    /** @deprecated compatibility alias for resolutionWeight. */
    weight: number
}

type Row = Record<string, string>

export type ResolvedTagRecord = {
    sourceKey: string
    canonicalKey: string
    canonicalLabel: string
    facet: string
    recommendationRole: string
    retrievalUtility: string
    recommendationEligible: string
    entityType: string
    parentEntityKey: string
    safetyStatus: string
    authoritySource: string
}

export function parseCsv(text: string): Row[] {
    const rows: string[][] = []
    let row: string[] = [],
        cell = '',
        quoted = false
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (ch === '"') {
            if (quoted && text[i + 1] === '"') {
                cell += '"'
                i++
            } else quoted = !quoted
        } else if (ch === ',' && !quoted) {
            row.push(cell)
            cell = ''
        } else if ((ch === '\n' || ch === '\r') && !quoted) {
            if (ch === '\r' && text[i + 1] === '\n') i++
            row.push(cell)
            cell = ''
            if (row.some(Boolean)) rows.push(row)
            row = []
        } else cell += ch
    }
    if (cell || row.length) {
        row.push(cell)
        rows.push(row)
    }
    const headers = rows.shift() ?? []
    return rows.map((values) =>
        Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
    )
}

const normalize = (value: unknown) =>
    String(value ?? '')
        .normalize('NFKC')
        .replace(/[\u200b-\u200d\ufeff]/g, '')
        .replace(/[\u3000\s]+/g, ' ')
        .trim()
        .toLocaleLowerCase('und')

function adaptV2SemanticRow(r: Row): Row {
    return {
        sourceKey: r.raw_tag,
        normalized_tag: r.normalized_tag,
        canonical_tag: r.proposed_canonical_tag,
        facet: r.proposed_facet_v2,
        recommendation_role: r.proposed_recommendation_role,
        retrieval_utility: r.proposed_retrieval_utility,
        recommendation_eligible: r.recommendation_eligible,
        safety_status: r.safety_status,
        authority_source: 'V2'
    }
}

function adaptV3SemanticRow(r: Row): Row {
    return {
        sourceKey: r.normalized_tag,
        normalized_tag: r.normalized_tag,
        canonical_tag: r.canonical_tag,
        facet: r.facet,
        recommendation_role: r.recommendation_role,
        retrieval_utility: r.retrieval_utility,
        recommendation_eligible: r.recommendation_eligible,
        safety_status: r.safety_status,
        authority_source: 'V3_FINAL'
    }
}

function adaptV3EntityRow(r: Row): Row {
    const facet =
        r.entity_type === 'FANDOM_IP'
            ? 'FANDOM_IP'
            : r.entity_type === 'FANDOM_CHARACTER'
              ? 'FANDOM_CHARACTER'
              : r.facet ?? ''
    return {
        sourceKey: r.normalized_source_tag,
        normalized_tag: r.normalized_source_tag,
        entity_key: r.entity_key,
        canonical_name: r.canonical_name,
        entity_type: r.entity_type,
        parent_entity_key: r.parent_entity_key,
        facet,
        recommendation_role: r.recommendation_role,
        retrieval_utility: r.retrieval_utility,
        recommendation_eligible: r.recommendation_eligible,
        safety_status: r.safety_status,
        authority_source: 'V3_ENTITY_FINAL'
    }
}

export type TagRegistryV3 = {
    semantic: Map<string, Row>
    entities: Map<string, Row>
    aliases: Map<string, string>
    unresolved: Set<string>
    manifestSha256: string
}

export function loadTagRegistryV3(baseDir: string): TagRegistryV3 {
    const manifestPath = path.join(
        baseDir,
        'PICA_REGISTRY_V3_FINAL_MANIFEST.json'
    )
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        source_v2_registry_sha256?: string
        production_registry_sha256?: Record<string, string>
        runtime_semantic_file?: string
    }
    const hash = (file: string) =>
        crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(baseDir, file)))
            .digest('hex')
    const expected = manifest.production_registry_sha256
    if (!expected)
        throw new Error(
            'Registry authority manifest missing production_registry_sha256'
        )
    const actual: Record<string, string> = {
        semantic: hash(
            manifest.runtime_semantic_file ?? 'PICA_TAG_REGISTRY_V3_RUNTIME.csv'
        ),
        entity: hash('PICA_ENTITY_REGISTRY_V3_FINAL.csv'),
        alias: hash('PICA_TAG_ALIAS_MAP_V3_FINAL.json'),
        watchlist: hash('PICA_TAG_UNRESOLVED_V3_FINAL_WATCHLIST.csv')
    }
    for (const key of Object.keys(actual))
        if (actual[key] !== expected[key])
            throw new Error(`Registry authority integrity failure: ${key}`)
    const v2Path = path.join(baseDir, 'PICA_TAG_LIBRARY_V2_REVIEWED.csv')
    const v2SemanticRows = fs.existsSync(v2Path)
        ? parseCsv(fs.readFileSync(v2Path, 'utf8')).map(adaptV2SemanticRow)
        : []
    const runtimeSemanticPath = path.join(
        baseDir,
        manifest.runtime_semantic_file ?? 'PICA_TAG_REGISTRY_V3_RUNTIME.csv'
    )
    const v3SemanticRows = parseCsv(
        fs.readFileSync(runtimeSemanticPath, 'utf8')
    ).map(adaptV3SemanticRow)
    const semanticRows = [...v3SemanticRows]
    semanticRows.unshift(...v2SemanticRows)
    const entityRows = parseCsv(
        fs.readFileSync(
            path.join(baseDir, 'PICA_ENTITY_REGISTRY_V3_FINAL.csv'),
            'utf8'
        )
    ).map(adaptV3EntityRow)
    const v2AliasPath = path.join(baseDir, 'PICA_TAG_ALIAS_MAP_V2.json')
    const parsedV2Aliases: unknown = fs.existsSync(v2AliasPath)
        ? JSON.parse(fs.readFileSync(v2AliasPath, 'utf8'))
        : []
    const v2AliasRecords = Array.isArray(parsedV2Aliases)
        ? parsedV2Aliases
        : Array.isArray(
                (parsedV2Aliases as { aliases?: unknown[] } | null)?.aliases
            )
          ? (parsedV2Aliases as { aliases: unknown[] }).aliases
          : []
    const aliases = {
        ...Object.fromEntries(
            v2AliasRecords.flatMap((record) => {
                if (!record || typeof record !== 'object') return []
                const value = record as Record<string, unknown>
                const rawTag = String(value.raw_tag ?? '').trim()
                const canonicalTag = String(
                    value.proposed_canonical_tag ?? ''
                ).trim()
                return rawTag && canonicalTag ? [[rawTag, canonicalTag]] : []
            })
        ),
        ...JSON.parse(
            fs.readFileSync(
                path.join(baseDir, 'PICA_TAG_ALIAS_MAP_V3_FINAL.json'),
                'utf8'
            )
        )
    } as Record<string, string>
    const unresolvedRows = parseCsv(
        fs.readFileSync(
            path.join(baseDir, 'PICA_TAG_UNRESOLVED_V3_FINAL_WATCHLIST.csv'),
            'utf8'
        )
    )
    const semantic = new Map<string, Row>()
    for (const row of semanticRows) {
        // V2 authority rows identify a tag by both raw and normalized forms.
        // Indexing both preserves V2 exact behavior when provider spelling differs
        // from the (occasionally mechanically truncated) normalized column.
        if (row.raw_tag) semantic.set(normalize(row.raw_tag), row)
        if (row.normalized_tag) semantic.set(normalize(row.normalized_tag), row)
        // Some legacy V2 CSV rows contain mechanically truncated normalized
        // cells; the reviewed canonical label remains the authoritative key.
        if (row.canonical_tag) semantic.set(normalize(row.canonical_tag), row)
    }
    const entities = new Map<string, Row>()
    for (const row of entityRows) {
        if (row.normalized_tag) entities.set(normalize(row.normalized_tag), row)
        if (row.canonical_name) entities.set(normalize(row.canonical_name), row)
    }
    return {
        semantic,
        entities,
        aliases: new Map(
            Object.entries(aliases).map(([k, v]) => [normalize(k), v])
        ),
        unresolved: new Set(
            unresolvedRows.map((r) => normalize(r.normalized_tag))
        ),
        manifestSha256: crypto
            .createHash('sha256')
            .update(fs.readFileSync(manifestPath))
            .digest('hex')
    }
}

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
