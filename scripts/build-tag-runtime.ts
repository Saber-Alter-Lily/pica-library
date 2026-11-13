import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadTagRegistryV3, parseCsv, tagRegistrySemanticSha256 } from '../src/tag-assets/registry-v3'
import { LEGACY_TAG_AUTHORITY_SHA256, LEGACY_TAG_SEMANTIC_SHA256 } from '../src/tag-assets/authority'
import { TAG_RUNTIME_FILES, TAG_RUNTIME_MANIFEST, TAG_RUNTIME_SOURCE, TAG_RUNTIME_TABLES, tagAssetSha256, type TagRuntimeManifestV1 } from '../src/tag-assets/runtime-format'

const legacySource = 'src/data/registry-v3-final'
const legacyFiles = {
    'semantic-v2.csv': 'PICA_TAG_LIBRARY_V2_REVIEWED.csv',
    'semantic-v3.csv': 'PICA_TAG_REGISTRY_V3_RUNTIME.csv',
    'entities-v3.csv': 'PICA_ENTITY_REGISTRY_V3_FINAL.csv',
    'unresolved-v3.csv': 'PICA_TAG_UNRESOLVED_V3_FINAL_WATCHLIST.csv'
} as const

/** Reproducible source-data projection; never opens a library/profile or model. */
export function buildTagRuntimeAssets(output = TAG_RUNTIME_SOURCE, check = false) {
    const registry = loadTagRegistryV3(legacySource)
    const semanticSha256 = tagRegistrySemanticSha256(registry)
    if (registry.manifestSha256 !== LEGACY_TAG_AUTHORITY_SHA256 || semanticSha256 !== LEGACY_TAG_SEMANTIC_SHA256)
        throw new Error('Legacy tag authority changed; review semantic compatibility before regenerating')
    const files = new Map<string, Buffer>()
    const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"'
    for (const [name, columns] of Object.entries(TAG_RUNTIME_TABLES)) {
        const rows = parseCsv(fs.readFileSync(path.join(legacySource, legacyFiles[name as keyof typeof legacyFiles]), 'utf8'))
        if (!rows.length || rows.some(row => columns.some(column => !Object.hasOwn(row, column))))
            throw new Error('Missing consumed semantic column in source projection')
        files.set(name, Buffer.from([columns.map(quote).join(','), ...rows.map(row => columns.map(column => quote(row[column])).join(','))].join('\n') + '\n'))
    }
    const v2 = JSON.parse(fs.readFileSync(path.join(legacySource, 'PICA_TAG_ALIAS_MAP_V2.json'), 'utf8'))
    const aliases = (Array.isArray(v2) ? v2 : v2.aliases) as Record<string, unknown>[]
    files.set('aliases-v2.json', Buffer.from(JSON.stringify(aliases.map(row => ({ raw_tag: String(row.raw_tag ?? ''), proposed_canonical_tag: String(row.proposed_canonical_tag ?? '') }))) + '\n'))
    const v3 = JSON.parse(fs.readFileSync(path.join(legacySource, 'PICA_TAG_ALIAS_MAP_V3_FINAL.json'), 'utf8'))
    files.set('aliases-v3.json', Buffer.from(JSON.stringify(v3) + '\n'))
    const manifest: TagRuntimeManifestV1 = {
        formatVersion: 1, kind: 'legacy-tag-rules-compatibility',
        semanticAuthoritySha256: registry.manifestSha256, semanticContentSha256: semanticSha256,
        files: Object.fromEntries([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, bytes]) => [name, { bytes: bytes.length, sha256: tagAssetSha256(bytes) }]))
    }
    files.set(TAG_RUNTIME_MANIFEST, Buffer.from(JSON.stringify(manifest, null, 2) + '\n'))
    const expected = [...TAG_RUNTIME_FILES, TAG_RUNTIME_MANIFEST].sort()
    if (fs.existsSync(output) && fs.readdirSync(output).some(name => !expected.includes(name)))
        throw new Error('Refuse to overwrite unrelated files in runtime asset output')
    if (!check) fs.mkdirSync(output, { recursive: true })
    for (const [name, bytes] of files) {
        const target = path.join(output, name)
        if (check) {
            if (!fs.existsSync(target) || !fs.readFileSync(target).equals(bytes))
                throw new Error('Tag runtime generation differs: ' + name)
        } else fs.writeFileSync(target, bytes)
    }
    const loaded = loadTagRegistryV3(output)
    if (loaded.manifestSha256 !== registry.manifestSha256 || tagRegistrySemanticSha256(loaded) !== semanticSha256)
        throw new Error('Generated tag runtime failed actual-loader parity')
    return { files: files.size, bytes: [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0), semanticSha256, semanticAuthoritySha256: registry.manifestSha256, manifestSha256: loaded.runtimeManifestSha256, mode: check ? 'CHECK' : 'GENERATE', productionAccessed: false }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const args = process.argv.slice(2)
    if (args.length > 1 || args.some(arg => !['--check', '--fingerprint'].includes(arg))) throw new Error('Usage: tsx scripts/build-tag-runtime.ts [--check|--fingerprint]')
    if (args[0] === '--fingerprint') {
        const registry = loadTagRegistryV3(legacySource)
        console.log(JSON.stringify({ semanticAuthoritySha256: registry.manifestSha256, semanticSha256: tagRegistrySemanticSha256(registry) }))
    } else console.log(JSON.stringify(buildTagRuntimeAssets(TAG_RUNTIME_SOURCE, args[0] === '--check')))
}
