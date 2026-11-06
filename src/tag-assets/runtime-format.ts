import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { LEGACY_TAG_AUTHORITY_SHA256, LEGACY_TAG_SEMANTIC_SHA256 } from './authority'

export const TAG_RUNTIME_MANIFEST = 'TAG_RUNTIME_MANIFEST.json'
export const TAG_RUNTIME_SOURCE = 'src/data/tag-runtime-v1'
export const TAG_RUNTIME_PACKAGED = 'app/runtime-assets/tag-runtime-v1'
export const TAG_RUNTIME_TABLES = {
    // The original BOM-prefixed raw_tag was not read by the legacy adapter.
    // Omitting that unused field preserves sourceKey=undefined, not a parser fix.
    'semantic-v2.csv': ['normalized_tag', 'proposed_canonical_tag', 'proposed_facet_v2', 'proposed_recommendation_role', 'proposed_retrieval_utility', 'recommendation_eligible', 'safety_status'],
    'semantic-v3.csv': ['normalized_tag', 'canonical_tag', 'facet', 'recommendation_role', 'retrieval_utility', 'recommendation_eligible', 'safety_status'],
    'entities-v3.csv': ['entity_key', 'canonical_name', 'normalized_source_tag', 'entity_type', 'parent_entity_key', 'recommendation_role', 'retrieval_utility', 'recommendation_eligible', 'safety_status'],
    'unresolved-v3.csv': ['normalized_tag']
} as const
export const TAG_RUNTIME_FILES = [...Object.keys(TAG_RUNTIME_TABLES), 'aliases-v2.json', 'aliases-v3.json'] as const
export type TagRuntimeManifestV1 = {
    formatVersion: 1
    kind: 'legacy-tag-rules-compatibility'
    semanticAuthoritySha256: string
    semanticContentSha256: string
    files: Record<string, { bytes: number; sha256: string }>
}
export const tagAssetSha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const keys = (value: Record<string, unknown>, expected: readonly string[]) => JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())

/** Pins the compatibility semantic identity separately from transport/manifest bytes. */
export function parseTagRuntimeManifest(value: unknown): TagRuntimeManifestV1 {
    if (!object(value) || !keys(value, ['formatVersion', 'kind', 'semanticAuthoritySha256', 'semanticContentSha256', 'files']) || value.formatVersion !== 1 || value.kind !== 'legacy-tag-rules-compatibility' || value.semanticAuthoritySha256 !== LEGACY_TAG_AUTHORITY_SHA256 || value.semanticContentSha256 !== LEGACY_TAG_SEMANTIC_SHA256 || !object(value.files) || !keys(value.files, TAG_RUNTIME_FILES))
        throw new Error('Unsupported tag runtime manifest or semantic authority')
    for (const file of Object.values(value.files))
        if (!object(file) || !keys(file, ['bytes', 'sha256']) || !Number.isSafeInteger(file.bytes) || Number(file.bytes) < 1 || Number(file.bytes) > 1024 * 1024 || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256))
            throw new Error('Invalid tag runtime asset integrity record')
    return value as TagRuntimeManifestV1
}

/** Static application assets only. Bounds actual reads and refuses directories/symlinks. */
function boundedAsset(file: string, maximum: number) {
    if (!fs.lstatSync(file).isFile()) throw new Error('Tag runtime asset must be a regular file')
    const descriptor = fs.openSync(file, 'r')
    try {
        const info = fs.fstatSync(descriptor)
        if (!info.isFile()) throw new Error('Invalid tag runtime asset')
        if (info.size > maximum) throw new Error('Tag runtime asset exceeds byte bound')
        const buffer = Buffer.alloc(info.size + 1)
        let size = 0
        while (size < buffer.length) {
            const read = fs.readSync(descriptor, buffer, size, buffer.length - size, null)
            if (!read) break
            size += read
        }
        if (size > maximum) throw new Error('Tag runtime asset exceeds byte bound')
        if (size !== info.size) throw new Error('Tag runtime asset changed during read')
        return buffer.subarray(0, size)
    } finally { fs.closeSync(descriptor) }
}

export function readMinimalTagAssets(directory: string) {
    const manifestBytes = boundedAsset(path.join(directory, TAG_RUNTIME_MANIFEST), 16384)
    const decode = (bytes: Buffer) => new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const manifest = parseTagRuntimeManifest(JSON.parse(decode(manifestBytes)))
    const names = fs.readdirSync(directory).sort()
    if (JSON.stringify(names) !== JSON.stringify([...TAG_RUNTIME_FILES, TAG_RUNTIME_MANIFEST].sort()))
        throw new Error('Unexpected file in minimal tag runtime')
    const files: Record<string, string> = {}
    for (const name of TAG_RUNTIME_FILES) {
        const bytes = boundedAsset(path.join(directory, name), 1024 * 1024)
        if (bytes.length !== manifest.files[name].bytes || tagAssetSha256(bytes) !== manifest.files[name].sha256)
            throw new Error('Tag runtime asset integrity failure: ' + name)
        files[name] = decode(bytes)
    }
    return { manifest, files, manifestSha256: tagAssetSha256(manifestBytes) }
}
