import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { loadTagRegistryV3, resolveTagV3, parseCsv } from '../../src/recommendation-v3/tag-resolution-v3'
import { tagRegistrySemanticSha256 } from '../../src/tag-assets/registry-v3'
import { loadTagRegistryV3 as frozenLoad, resolveTagV3 as frozenResolve } from '../fixtures/tag-registry-legacy'
import { LEGACY_TAG_AUTHORITY_SHA256, LEGACY_TAG_SEMANTIC_SHA256 } from '../../src/tag-assets/authority'
import { TAG_RUNTIME_SOURCE, TAG_RUNTIME_PACKAGED, TAG_RUNTIME_FILES, TAG_RUNTIME_MANIFEST, TAG_RUNTIME_TABLES, parseTagRuntimeManifest, tagAssetSha256 } from '../../src/tag-assets/runtime-format'
import { buildTagRuntimeAssets } from '../../scripts/build-tag-runtime'
import { stageTagRuntime } from '../../scripts/stage-tag-runtime'
import { buildFinalLifetimeProfileV3 } from '../../src/recommendation-v3/final-profile'
import type { StoredComic } from '../../src/library/types'

const directories: string[] = []
const create = () => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-tag-assets-')); directories.push(directory); return directory }
const createStage = () => {
    const directory = create(); fs.mkdirSync(path.join(directory, 'app'))
    fs.writeFileSync(path.join(directory, 'app/desktop.js'), '/* synthetic engine marker */')
    fs.writeFileSync(path.join(directory, 'app/module-contracts.json'), '{}')
    return directory
}
afterEach(() => { for (const directory of directories.splice(0)) { const resolved = path.resolve(directory); if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('pica-tag-assets-')) throw Error('Unsafe fixture cleanup'); fs.rmSync(resolved, { recursive: true, force: true }) } })
const readManifest = () => JSON.parse(fs.readFileSync(path.join(TAG_RUNTIME_SOURCE, TAG_RUNTIME_MANIFEST), 'utf8'))
const fixture = () => { const directory = path.join(create(), 'tag-runtime-v1'); fs.cpSync(TAG_RUNTIME_SOURCE, directory, { recursive: true }); return directory }
const writeIntegrity = (directory: string, name: string, bytes: Buffer) => {
    fs.writeFileSync(path.join(directory, name), bytes)
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, TAG_RUNTIME_MANIFEST), 'utf8'))
    manifest.files[name] = { bytes: bytes.length, sha256: tagAssetSha256(bytes) }
    fs.writeFileSync(path.join(directory, TAG_RUNTIME_MANIFEST), JSON.stringify(manifest))
}

describe('minimal semantic runtime versus frozen review authority', () => {
    const old = frozenLoad('src/data/registry-v3-final')
    const current = loadTagRegistryV3(TAG_RUNTIME_SOURCE)

    it('freezes the complete old implementation rather than using the new loader as its oracle', () => {
        const bytes = fs.readFileSync('test/fixtures/tag-registry-legacy.ts', 'utf8').replace(/\r\n/g, '\n')
        expect(createHash('sha256').update(bytes).digest('hex')).toBe('0c4f64f08d14edd498f0b62368dd8b1d675b89ae631779f3bea06c8d812da46c')
        const source = fs.readFileSync('src/recommendation-v3/tag-resolution-v3.ts', 'utf8').replace(/\r\n/g, '\n')
        expect(source.slice(source.indexOf('export function resolveTagV3('))).toBe(bytes.slice(bytes.indexOf('export function resolveTagV3(')))
    })

    it('preserves every complete map, set, safety value and semantic authority fingerprint', () => {
        expect(current.semantic).toStrictEqual(old.semantic)
        expect(current.entities).toStrictEqual(old.entities)
        expect(current.aliases).toStrictEqual(old.aliases)
        expect(current.unresolved).toStrictEqual(old.unresolved)
        expect(current.manifestSha256).toBe(old.manifestSha256)
        expect(current.manifestSha256).toBe(LEGACY_TAG_AUTHORITY_SHA256)
        expect(tagRegistrySemanticSha256(old)).toBe(LEGACY_TAG_SEMANTIC_SHA256)
        expect(tagRegistrySemanticSha256(current)).toBe(LEGACY_TAG_SEMANTIC_SHA256)
        expect(current.runtimeManifestSha256).toBe(tagAssetSha256(fs.readFileSync(path.join(TAG_RUNTIME_SOURCE, TAG_RUNTIME_MANIFEST))))
        expect(current.runtimeManifestSha256).not.toBe(current.manifestSha256)
    })

    it('matches all legacy raw/canonical/alias inputs plus unknown/case/spacing/zero-width variants', () => {
        const samples = new Set(['', '__synthetic_unknown_tag_for_projection__', 'a,b', 'a"b', '零\u200b宽字符', '  Mixed CASE  '])
        for (const name of ['PICA_TAG_LIBRARY_V2_REVIEWED.csv', 'PICA_TAG_REGISTRY_V3_RUNTIME.csv', 'PICA_ENTITY_REGISTRY_V3_FINAL.csv', 'PICA_TAG_UNRESOLVED_V3_FINAL_WATCHLIST.csv'])
            for (const row of parseCsv(fs.readFileSync(path.join('src/data/registry-v3-final', name), 'utf8')))
                for (const key of ['raw_tag', '\ufeffraw_tag', 'normalized_tag', 'proposed_canonical_tag', 'canonical_tag', 'normalized_source_tag', 'canonical_name']) if (row[key]) samples.add(row[key])
        for (const [raw, target] of old.aliases) { samples.add(raw); samples.add(target) }
        const variants = new Set([...samples].flatMap(value => [value, value.toLocaleUpperCase('und'), ' ' + value + ' ', '\u200b' + value + '\ufeff']))
        expect(variants.size).toBeGreaterThanOrEqual(3900)
        for (const value of variants) expect(resolveTagV3(value, current)).toStrictEqual(frozenResolve(value, old))
        console.info(JSON.stringify({ tag_runtime_resolver_equivalence_cases: variants.size }))
    })

    it('retains complete profile output and registryVersion without initializing any user state', () => {
        const records: StoredComic[] = [{ comicId: 'local:synthetic', title: 'Synthetic local title', author: 'Synthetic creator', canonicalAuthor: 'Synthetic creator', circle: null, authorId: null, tags: [...old.semantic.keys()].slice(0, 12), categories: ['Synthetic category'], finished: true, isFavorite: true, inLibrary: true, firstSeenAt: '2026-01-01T00:00:00Z', lastSeenAt: '2026-01-01T00:00:00Z', knownEpisodes: 0, knownPictures: 0, downloadedPictures: 0 }]
        const before = JSON.stringify(records), generatedAt = '2026-01-01T00:00:00Z'
        const actual = buildFinalLifetimeProfileV3(records, { registry: current, generatedAt })
        expect(actual).toStrictEqual(buildFinalLifetimeProfileV3(records, { registry: old, generatedAt }))
        expect(actual.registryVersion).toBe(old.manifestSha256)
        expect(JSON.stringify(records)).toBe(before)
    })

    it('contains only consumed columns and alias fields, never review examples or statistics', () => {
        expect(fs.readdirSync(TAG_RUNTIME_SOURCE).sort()).toEqual([...TAG_RUNTIME_FILES, TAG_RUNTIME_MANIFEST].sort())
        for (const [name, fields] of Object.entries(TAG_RUNTIME_TABLES)) {
            const rows = parseCsv(fs.readFileSync(path.join(TAG_RUNTIME_SOURCE, name), 'utf8'))
            expect(rows.length).toBeGreaterThan(0)
            for (const row of rows) expect(Object.keys(row)).toEqual(fields)
        }
        expect(Object.keys(readManifest()).sort()).toEqual(['files', 'formatVersion', 'kind', 'semanticAuthoritySha256', 'semanticContentSha256'])
        const aliases = JSON.parse(fs.readFileSync(path.join(TAG_RUNTIME_SOURCE, 'aliases-v2.json'), 'utf8'))
        for (const row of aliases) expect(Object.keys(row).sort()).toEqual(['proposed_canonical_tag', 'raw_tag'])
    })

    it('reproducibly checks generated bytes and refuses unrelated output instead of deleting it', () => {
        expect(fs.readFileSync('.gitattributes', 'utf8')).toContain('src/data/tag-runtime-v1/* -text')
        expect(buildTagRuntimeAssets(TAG_RUNTIME_SOURCE, true)).toMatchObject({ files: 7, mode: 'CHECK', productionAccessed: false })
        const directory = create(), canary = path.join(directory, 'library.db')
        fs.writeFileSync(canary, 'synthetic-private-canary')
        expect(() => buildTagRuntimeAssets(directory)).toThrow(/unrelated/)
        expect(fs.readFileSync(canary, 'utf8')).toBe('synthetic-private-canary')
    })

    it('stages the exact same seven assets once under app, independent of the source checkout', () => {
        const stage = createStage(), result = stageTagRuntime(stage)
        expect(result).toMatchObject({ files: 7, reviewedEvidenceStaged: false, semanticAuthoritySha256: LEGACY_TAG_AUTHORITY_SHA256 })
        const loaded = loadTagRegistryV3(path.join(stage, TAG_RUNTIME_PACKAGED))
        expect(loaded.semantic).toStrictEqual(old.semantic)
        expect(fs.existsSync(path.join(stage, 'src'))).toBe(false)
        expect(() => stageTagRuntime(stage)).toThrow(/overwrite/)
    })

    it('rejects merging a legacy application tree without deleting its contents', () => {
        const stage = createStage(), legacy = path.join(stage, 'src/data/registry-v3-final')
        fs.mkdirSync(legacy, { recursive: true }); fs.writeFileSync(path.join(legacy, 'canary.txt'), 'retain-original')
        expect(() => stageTagRuntime(stage)).toThrow(/Legacy review evidence/)
        expect(fs.readFileSync(path.join(legacy, 'canary.txt'), 'utf8')).toBe('retain-original')
        expect(fs.existsSync(path.join(stage, TAG_RUNTIME_PACKAGED))).toBe(false)
    })

    it('rejects an outer distribution directory before creating a shadow app tree', () => {
        const outer = create()
        expect(() => stageTagRuntime(outer)).toThrow(/application engine root/)
        expect(fs.existsSync(path.join(outer, 'app'))).toBe(false)
    })

    it('fails closed on extra review evidence even if every listed hash is valid', () => {
        const directory = fixture(); fs.writeFileSync(path.join(directory, 'reviewed-examples.csv'), 'synthetic-title')
        expect(() => loadTagRegistryV3(directory)).toThrow(/Unexpected file/)
    })

    it('does not fall back to legacy assets if a minimal manifest is missing', () => {
        const directory = fixture(); fs.unlinkSync(path.join(directory, TAG_RUNTIME_MANIFEST))
        fs.copyFileSync('src/data/registry-v3-final/PICA_REGISTRY_V3_FINAL_MANIFEST.json', path.join(directory, 'PICA_REGISTRY_V3_FINAL_MANIFEST.json'))
        expect(() => loadTagRegistryV3(directory)).toThrow(/Minimal tag runtime manifest is missing/)
    })

    it('refuses modified bytes and oversize assets before CSV/JSON parsing', () => {
        const directory = fixture(), file = path.join(directory, 'aliases-v3.json')
        fs.appendFileSync(file, ' ')
        expect(() => loadTagRegistryV3(directory)).toThrow(/integrity/)
        fs.writeFileSync(file, Buffer.alloc(1024 * 1024 + 1, 32))
        expect(() => loadTagRegistryV3(directory)).toThrow(/byte bound/)
    })

    it('does not allow recomputed file hashes to change the pinned semantic rules', () => {
        const directory = fixture(), name = 'semantic-v2.csv', fields = TAG_RUNTIME_TABLES[name]
        const rows = parseCsv(fs.readFileSync(path.join(directory, name), 'utf8'))
        rows.push({ ...rows[0], normalized_tag: '__synthetic_added__', proposed_canonical_tag: '__synthetic_added__' })
        const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"'
        writeIntegrity(directory, name, Buffer.from([fields.map(quote).join(','), ...rows.map(row => fields.map(field => quote(row[field])).join(','))].join('\n')))
        expect(() => loadTagRegistryV3(directory)).toThrow(/semantic compatibility/)
    })

    it('rejects new alias metadata and non-file payloads without exposing their values', () => {
        const directory = fixture(), name = 'aliases-v2.json'
        const aliases = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')); aliases[0].example_title = 'synthetic-private-value'
        writeIntegrity(directory, name, Buffer.from(JSON.stringify(aliases)))
        expect(() => loadTagRegistryV3(directory)).toThrow(/minimal tag aliases/)
        fs.unlinkSync(path.join(directory, name)); fs.mkdirSync(path.join(directory, name))
        expect(() => loadTagRegistryV3(directory)).toThrow(/regular file/)
    })

    const manifest = readManifest()
    it.each([
        { ...manifest, formatVersion: 2 }, { ...manifest, kind: 'comic-catalogue' },
        { ...manifest, example_title: 'synthetic-only' }, { ...manifest, semanticAuthoritySha256: '0'.repeat(64) },
        { ...manifest, semanticContentSha256: '0'.repeat(64) }, { ...manifest, files: { ...manifest.files, '../unsafe.csv': { bytes: 1, sha256: 'a'.repeat(64) } } },
        { ...manifest, files: { ...manifest.files, 'aliases-v3.json': { bytes: 0, sha256: 'a'.repeat(64) } } },
        { ...manifest, files: { ...manifest.files, 'aliases-v3.json': { bytes: 1048577, sha256: 'a'.repeat(64) } } },
        { ...manifest, files: { ...manifest.files, 'aliases-v3.json': { bytes: 1, sha256: 'A'.repeat(64) } } }
    ])('refuses unsupported/untrusted runtime metadata case %#', value => {
        expect(() => parseTagRuntimeManifest(value)).toThrow(/tag runtime/)
    })

    it('uses the shared exact-allowlist stage in every current platform packager', () => {
        for (const name of ['build-windows-package.ps1', 'build-windows-arm64-experimental.ps1', 'build-linux-experimental.sh', 'build-macos-experimental.sh']) {
            const source = fs.readFileSync(path.join('scripts', name), 'utf8')
            expect(source).toContain('pnpm exec tsx scripts/stage-tag-runtime.ts')
            expect(source).not.toMatch(/(?:registrySource|REGISTRY_SOURCE).*registry-v3-final/)
        }
        expect(fs.readFileSync('scripts/build-macos-experimental.sh', 'utf8')).toContain('scripts/stage-tag-runtime.ts "$RESOURCES"')
        expect(fs.readFileSync('scripts/build-macos-experimental.sh', 'utf8')).not.toContain('for item in app runtime web src ')
        expect(fs.readFileSync('scripts/build-linux-experimental.sh', 'utf8')).toContain('scripts/stage-tag-runtime.ts "$STAGE"')
        expect(fs.readFileSync('src/tag-assets/registry-v3.ts', 'utf8')).not.toMatch(/from ['"].*(?:recommendation|library|providers|database|sync)/)
    })

    it('has an actual three-file application-asset closure without recommendation/storage/provider ownership', async () => {
        const output = await build({ entryPoints: ['src/tag-assets/registry-v3.ts'], bundle: true, platform: 'node', format: 'esm', write: false, metafile: true })
        expect(Object.keys(output.metafile!.inputs).sort()).toEqual(['src/tag-assets/authority.ts', 'src/tag-assets/registry-v3.ts', 'src/tag-assets/runtime-format.ts'])
        const imports = Object.values(output.metafile!.outputs).flatMap(value => value.imports.map(item => item.path))
        const unique = (paths: string[]) => [...new Set(paths)].sort()
        expect(unique(imports)).toEqual(['node:crypto', 'node:fs', 'node:path'])
        expect(unique([...imports, 'node:child_process'])).not.toEqual(['node:crypto', 'node:fs', 'node:path'])
        // The emitted module is not executed by this import-boundary test.
    })
})
