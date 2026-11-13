import { readMinimalTagAssets, TAG_RUNTIME_MANIFEST, TAG_RUNTIME_TABLES } from './runtime-format'
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

export const normalizeRegistryTag = (value: unknown) =>
    String(value ?? '')
        .normalize('NFKC')
        .replace(/[\u200b-\u200d\ufeff]/g, '')
        .replace(/[\u3000\s]+/g, ' ')
        .trim()
        .toLocaleLowerCase('und')

const normalize = normalizeRegistryTag

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
    /** Compatibility semantic authority, not the new distribution manifest hash. */
    manifestSha256: string
    runtimeManifestSha256?: string
}

/** Canonical semantic state: independent of asset layout, line endings and evidence columns. */
export function tagRegistrySemanticSha256(registry: TagRegistryV3) {
    const ordered = <T>(value: Map<string, T>) => [...value.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    return crypto.createHash('sha256').update(JSON.stringify({
        semantic: ordered(registry.semantic), entities: ordered(registry.entities),
        aliases: ordered(registry.aliases), unresolved: [...registry.unresolved].sort()
    })).digest('hex')
}

export function loadTagRegistryV3(baseDir: string): TagRegistryV3 {
    // Legacy research authority remains explicitly loadable for replay/compiler
    // parity. Normal application paths select only the minimal runtime directory.
    if (!fs.existsSync(path.join(baseDir, TAG_RUNTIME_MANIFEST))) {
        if (path.basename(path.resolve(baseDir)) === 'tag-runtime-v1')
            throw new Error('Minimal tag runtime manifest is missing')
        return loadLegacyTagRegistryV3(baseDir)
    }
    const assets = readMinimalTagAssets(baseDir)
    const table = (name: keyof typeof TAG_RUNTIME_TABLES) => {
        const rows = parseCsv(assets.files[name])
        if (!rows.length || rows.some(row => JSON.stringify(Object.keys(row)) !== JSON.stringify(TAG_RUNTIME_TABLES[name])))
            throw new Error('Invalid minimal tag table schema: ' + name)
        return rows
    }
    const v2: unknown = JSON.parse(assets.files['aliases-v2.json'])
    const v3: unknown = JSON.parse(assets.files['aliases-v3.json'])
    if (!Array.isArray(v2) || v2.length > 10000 || v2.some(row => !row || typeof row !== 'object' || Array.isArray(row) || JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(['proposed_canonical_tag', 'raw_tag']) || typeof row.raw_tag !== 'string' || typeof row.proposed_canonical_tag !== 'string') || !v3 || typeof v3 !== 'object' || Array.isArray(v3) || Object.values(v3).some(value => typeof value !== 'string'))
        throw new Error('Invalid minimal tag aliases')
    const aliases = {
        ...Object.fromEntries(v2.flatMap(row => {
            const raw = row.raw_tag.trim(), target = row.proposed_canonical_tag.trim()
            return raw && target ? [[raw, target]] : []
        })), ...v3 as Record<string, string>
    }
    const registry = assembleRegistry(
        [...table('semantic-v2.csv').map(adaptV2SemanticRow), ...table('semantic-v3.csv').map(adaptV3SemanticRow)],
        table('entities-v3.csv').map(adaptV3EntityRow), aliases,
        table('unresolved-v3.csv'), assets.manifest.semanticAuthoritySha256
    )
    if (tagRegistrySemanticSha256(registry) !== assets.manifest.semanticContentSha256)
        throw new Error('Tag runtime semantic compatibility failure')
    return { ...registry, runtimeManifestSha256: assets.manifestSha256 }
}

function loadLegacyTagRegistryV3(baseDir: string): TagRegistryV3 {
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
    return assembleRegistry(semanticRows, entityRows, aliases, unresolvedRows,
        crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex'))
}

function assembleRegistry(semanticRows: Row[], entityRows: Row[], aliases: Record<string, string>, unresolvedRows: Row[], manifestSha256: string): TagRegistryV3 {
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
        manifestSha256
    }
}
