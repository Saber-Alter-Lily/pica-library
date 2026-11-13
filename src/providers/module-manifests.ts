import type { OnlineSource, ProviderId } from './types'

/** Compiled adapters only. This is not permission to load executable plugins. */
export const SOURCE_ADAPTER_API_VERSION = 1
export interface SourceModuleManifest {
    apiVersion: number
    id: ProviderId
    adapterVersion: string
    comicNamespace: string | null
    sourceAliases: OnlineSource[]
    pageSchemes: string[]
    legacyUnprefixedIds: boolean
}

const manifests: Record<ProviderId, SourceModuleManifest> = {
    pica: {
        apiVersion: 1,
        id: 'pica',
        adapterVersion: '1.0.1',
        comicNamespace: null,
        sourceAliases: ['pica'],
        pageSchemes: ['https', 'http'],
        legacyUnprefixedIds: true
    },
    eh: {
        apiVersion: 1,
        id: 'eh',
        adapterVersion: '1.0.0',
        comicNamespace: 'eh',
        sourceAliases: ['eh', 'exh'],
        pageSchemes: ['eh-page'],
        legacyUnprefixedIds: false
    },
    jm: {
        apiVersion: 1,
        id: 'jm',
        adapterVersion: '1.0.1',
        comicNamespace: 'jm',
        sourceAliases: ['jm'],
        pageSchemes: ['jm-page'],
        legacyUnprefixedIds: false
    }
}

export function sourceModuleManifest(id: ProviderId): SourceModuleManifest {
    const value = manifests[id]
    if (!value)
        throw new Error('Source module has no compiled routing manifest')
    return normalizeSourceModuleManifest(value, id)
}

/** Validate before registration so a bad/colliding module cannot half-register. */
export function normalizeSourceModuleManifest(
    value: SourceModuleManifest,
    id: ProviderId
): SourceModuleManifest {
    const identifier = /^[a-z][a-z0-9-]{0,31}$/
    if (
        !value ||
        value.id !== id ||
        value.apiVersion !== SOURCE_ADAPTER_API_VERSION ||
        !/^\d+\.\d+\.\d+$/.test(value.adapterVersion)
    )
        throw new Error('Unsupported source module contract')
    for (const list of [value.sourceAliases, value.pageSchemes])
        if (
            !Array.isArray(list) ||
            !list.length ||
            list.length > 8 ||
            new Set(list).size !== list.length ||
            list.some(
                (item) => typeof item !== 'string' || !identifier.test(item)
            )
        )
            throw new Error('Invalid source module routes')
    if (
        typeof value.legacyUnprefixedIds !== 'boolean' ||
        (value.comicNamespace !== null &&
            !identifier.test(value.comicNamespace)) ||
        (!value.comicNamespace && !value.legacyUnprefixedIds)
    )
        throw new Error('Invalid source module identity namespace')
    return {
        apiVersion: value.apiVersion,
        id,
        adapterVersion: value.adapterVersion,
        comicNamespace: value.comicNamespace,
        sourceAliases: [...value.sourceAliases],
        pageSchemes: [...value.pageSchemes],
        legacyUnprefixedIds: value.legacyUnprefixedIds
    }
}
