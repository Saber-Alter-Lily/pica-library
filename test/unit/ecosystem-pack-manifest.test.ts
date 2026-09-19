import { describe, expect, it } from 'vitest'
import {
    computePackContentRoot,
    parseEcosystemPackManifest
} from '../../src/ecosystem/pack-manifest'

function manifest() {
    const files = [
        {
            path: 'payload/works.ndjson',
            sha256: 'a'.repeat(64),
            size: 123
        },
        {
            path: 'payload/aliases.json',
            sha256: 'b'.repeat(64),
            size: 456
        }
    ]
    return {
        schemaVersion: 1,
        packId: 'org.picalibrary.canonical.default',
        packType: 'CANONICAL_KNOWLEDGE',
        generation: '2026.09.19.1',
        createdAt: '2026-09-19T00:00:00.000Z',
        minimumAppVersion: '0.5.0',
        contentLicense: 'CC0-1.0',
        publisher: {
            id: 'org.picalibrary',
            keyId: 'official-2026-01'
        },
        dependencies: [
            {
                packId: 'org.picalibrary.tags.default',
                minimumGeneration: '2026.09.1',
                optional: true
            }
        ],
        files,
        contentRootSha256: computePackContentRoot(files)
    }
}

describe('Recommendation Ecosystem Pack manifest V1', () => {
    it('accepts a deterministic declarative Pack contract', () => {
        expect(parseEcosystemPackManifest(manifest())).toMatchObject({
            schemaVersion: 1,
            packId: 'org.picalibrary.canonical.default',
            packType: 'CANONICAL_KNOWLEDGE',
            generation: '2026.09.19.1',
            publisher: {
                id: 'org.picalibrary',
                keyId: 'official-2026-01'
            }
        })
    })

    it('computes the same content root regardless of manifest file order', () => {
        const value = manifest()
        expect(computePackContentRoot(value.files)).toBe(
            computePackContentRoot([...value.files].reverse())
        )
    })

    it('rejects traversal, user-data paths and non-payload roots', () => {
        for (const badPath of [
            '../outside.json',
            'payload/../outside.json',
            'C:/outside.json',
            'payload\\works.ndjson',
            'manifest/works.ndjson',
            'payload/private/events.ndjson',
            'payload/library.db',
            'payload/.env'
        ]) {
            const value = manifest()
            value.files = [
                {
                    path: badPath,
                    sha256: 'a'.repeat(64),
                    size: 1
                }
            ]
            value.contentRootSha256 = '0'.repeat(64)
            expect(() => parseEcosystemPackManifest(value)).toThrow()
        }
    })

    it('rejects duplicate payload paths and invalid digest metadata', () => {
        const duplicate = manifest()
        duplicate.files = [
            duplicate.files[0],
            { ...duplicate.files[0] }
        ]
        duplicate.contentRootSha256 = '0'.repeat(64)
        expect(() => parseEcosystemPackManifest(duplicate)).toThrow(
            /Duplicate Pack file path/
        )

        const invalidDigest = manifest()
        invalidDigest.files[0].sha256 = 'not-a-digest'
        invalidDigest.contentRootSha256 = '0'.repeat(64)
        expect(() => parseEcosystemPackManifest(invalidDigest)).toThrow(
            /Invalid Pack SHA-256/
        )
    })

    it('rejects an unknown Pack type or a forged content root', () => {
        const unknown = manifest() as ReturnType<typeof manifest> & {
            packType: string
        }
        unknown.packType = 'EXECUTABLE_PLUGIN'
        expect(() => parseEcosystemPackManifest(unknown)).toThrow(
            /Unsupported Pack type/
        )

        const forged = manifest()
        forged.contentRootSha256 = 'f'.repeat(64)
        expect(() => parseEcosystemPackManifest(forged)).toThrow(
            /content root/
        )
    })

    it('rejects duplicate dependencies and malformed publisher identities', () => {
        const duplicateDependency = manifest()
        duplicateDependency.dependencies.push({
            ...duplicateDependency.dependencies[0]
        })
        expect(() => parseEcosystemPackManifest(duplicateDependency)).toThrow(
            /Duplicate Pack dependency/
        )

        const invalidPublisher = manifest()
        invalidPublisher.publisher.id = 'not valid publisher'
        expect(() => parseEcosystemPackManifest(invalidPublisher)).toThrow(
            /Invalid Pack identifier/
        )
    })
})
