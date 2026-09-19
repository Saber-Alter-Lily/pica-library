import { createHash } from 'node:crypto'

export const ECOSYSTEM_PACK_SCHEMA_VERSION = 1

export const ECOSYSTEM_PACK_TYPES = [
    'CANONICAL_KNOWLEDGE',
    'PROVIDER_INTELLIGENCE',
    'TAG_ALIAS',
    'VISUAL_INTELLIGENCE',
    'RECOMMENDATION_POLICY'
] as const

export type EcosystemPackType = (typeof ECOSYSTEM_PACK_TYPES)[number]

export interface EcosystemPackFile {
    path: string
    sha256: string
    size: number
}

export interface EcosystemPackDependency {
    packId: string
    minimumGeneration?: string
    optional?: boolean
}

export interface EcosystemPackPublisher {
    id: string
    keyId?: string
}

export interface EcosystemPackManifestV1 {
    schemaVersion: 1
    packId: string
    packType: EcosystemPackType
    generation: string
    createdAt: string
    minimumAppVersion: string
    contentLicense: string
    publisher: EcosystemPackPublisher
    dependencies: EcosystemPackDependency[]
    files: EcosystemPackFile[]
    contentRootSha256: string
}

const sha256Pattern = /^[0-9a-f]{64}$/
const identifierPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/
const forbiddenPackPath = new RegExp(
    '(^|/)(?:credentials?|cookies?|tokens?|secrets?|downloads?|logs?|private)(?:/|$)|(^|/)\\.env(?:\\.|$)|\\.(?:db|sqlite)(?:-|$)',
    'i'
)

function nonEmpty(value: unknown, field: string) {
    const text = String(value ?? '').trim()
    if (!text) throw new Error(`Pack manifest field is missing: ${field}`)
    return text
}

function identifier(value: unknown, field: string) {
    const text = nonEmpty(value, field)
    if (!identifierPattern.test(text))
        throw new Error(`Invalid Pack identifier: ${field}`)
    return text
}

export function normalizePackPayloadPath(value: string) {
    const text = String(value ?? '').trim()
    if (!text) throw new Error('Pack file path is empty')
    if (text.includes('\\'))
        throw new Error('Pack file paths must use forward slashes')
    if (
        text.startsWith('/') ||
        /^[A-Za-z]:/.test(text) ||
        text.includes(':')
    )
        throw new Error('Pack file path must be relative')
    const parts = text.split('/')
    if (
        parts.some(
            (part) =>
                !part ||
                part === '.' ||
                part === '..' ||
                part.endsWith('.') ||
                part.endsWith(' ')
        )
    )
        throw new Error('Pack file path contains an unsafe segment')
    if (parts[0] !== 'payload')
        throw new Error('Pack payload files must live under payload/')
    const normalized = parts.join('/')
    if (forbiddenPackPath.test(normalized))
        throw new Error(`Private/user data path is forbidden in Packs: ${normalized}`)
    return normalized
}

export function computePackContentRoot(files: EcosystemPackFile[]) {
    const canonical = [...files]
        .map((file) => ({
            path: normalizePackPayloadPath(file.path),
            sha256: String(file.sha256).toLowerCase(),
            size: Number(file.size)
        }))
        .sort((left, right) => left.path.localeCompare(right.path))
        .map((file) => `${file.path}\t${file.sha256}\t${file.size}`)
        .join('\n')
    return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

export function parseEcosystemPackManifest(
    value: unknown
): EcosystemPackManifestV1 {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Pack manifest must be an object')

    const raw = value as Record<string, unknown>
    if (raw.schemaVersion !== ECOSYSTEM_PACK_SCHEMA_VERSION)
        throw new Error('Unsupported Pack manifest schemaVersion')

    const packType = nonEmpty(raw.packType, 'packType')
    if (
        !ECOSYSTEM_PACK_TYPES.includes(
            packType as EcosystemPackType
        )
    )
        throw new Error('Unsupported Pack type')

    const createdAt = nonEmpty(raw.createdAt, 'createdAt')
    if (Number.isNaN(Date.parse(createdAt)))
        throw new Error('Invalid Pack createdAt timestamp')

    if (!Array.isArray(raw.files) || raw.files.length === 0)
        throw new Error('Pack must declare at least one payload file')

    const seenPaths = new Set<string>()
    const files: EcosystemPackFile[] = raw.files.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            throw new Error(`Invalid Pack file entry at index ${index}`)
        const file = entry as Record<string, unknown>
        const filePath = normalizePackPayloadPath(nonEmpty(file.path, 'files.path'))
        if (seenPaths.has(filePath))
            throw new Error(`Duplicate Pack file path: ${filePath}`)
        seenPaths.add(filePath)

        const digest = nonEmpty(file.sha256, 'files.sha256').toLowerCase()
        if (!sha256Pattern.test(digest))
            throw new Error(`Invalid Pack SHA-256: ${filePath}`)
        const size = Number(file.size)
        if (!Number.isSafeInteger(size) || size < 0)
            throw new Error(`Invalid Pack file size: ${filePath}`)
        return { path: filePath, sha256: digest, size }
    })

    const publisherRaw = raw.publisher
    if (
        !publisherRaw ||
        typeof publisherRaw !== 'object' ||
        Array.isArray(publisherRaw)
    )
        throw new Error('Pack publisher is required')
    const publisherValue = publisherRaw as Record<string, unknown>
    const publisher: EcosystemPackPublisher = {
        id: identifier(publisherValue.id, 'publisher.id')
    }
    if (publisherValue.keyId !== undefined)
        publisher.keyId = identifier(publisherValue.keyId, 'publisher.keyId')

    const dependenciesRaw = raw.dependencies ?? []
    if (!Array.isArray(dependenciesRaw))
        throw new Error('Pack dependencies must be an array')
    const dependencyIds = new Set<string>()
    const dependencies: EcosystemPackDependency[] = dependenciesRaw.map(
        (entry, index) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry))
                throw new Error(
                    `Invalid Pack dependency at index ${index}`
                )
            const dependency = entry as Record<string, unknown>
            const packId = identifier(
                dependency.packId,
                'dependencies.packId'
            )
            if (dependencyIds.has(packId))
                throw new Error(`Duplicate Pack dependency: ${packId}`)
            dependencyIds.add(packId)
            const result: EcosystemPackDependency = { packId }
            if (dependency.minimumGeneration !== undefined)
                result.minimumGeneration = nonEmpty(
                    dependency.minimumGeneration,
                    'dependencies.minimumGeneration'
                )
            if (dependency.optional !== undefined) {
                if (typeof dependency.optional !== 'boolean')
                    throw new Error('Pack dependency optional must be boolean')
                result.optional = dependency.optional
            }
            return result
        }
    )

    const contentRootSha256 = nonEmpty(
        raw.contentRootSha256,
        'contentRootSha256'
    ).toLowerCase()
    if (!sha256Pattern.test(contentRootSha256))
        throw new Error('Invalid Pack contentRootSha256')
    const computedRoot = computePackContentRoot(files)
    if (contentRootSha256 !== computedRoot)
        throw new Error('Pack content root does not match declared files')

    return {
        schemaVersion: 1,
        packId: identifier(raw.packId, 'packId'),
        packType: packType as EcosystemPackType,
        generation: nonEmpty(raw.generation, 'generation'),
        createdAt,
        minimumAppVersion: nonEmpty(
            raw.minimumAppVersion,
            'minimumAppVersion'
        ),
        contentLicense: nonEmpty(raw.contentLicense, 'contentLicense'),
        publisher,
        dependencies,
        files,
        contentRootSha256
    }
}
