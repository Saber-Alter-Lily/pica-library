import current from './runtime-contracts.json'

/** Interface versions, not algorithm/model versions or permission to run plugins. */
export interface RuntimeModuleContracts {
    formatVersion: 1
    apis: Record<string, number>
}
export const MODULE_CONTRACT_PATH = 'app/module-contracts.json'
const required = [
    'library',
    'reader',
    'sources',
    'tags',
    'recommendation',
    'sync',
    'update'
]

export function normalizeModuleContracts(
    value: unknown
): RuntimeModuleContracts {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid runtime module contracts')
    const input = value as Record<string, unknown>
    if (
        input.formatVersion !== 1 ||
        Object.keys(input).some(
            (key) => !['formatVersion', 'apis'].includes(key)
        ) ||
        !input.apis ||
        typeof input.apis !== 'object' ||
        Array.isArray(input.apis)
    )
        throw new Error('Unsupported runtime module contract format')
    const apis = input.apis as Record<string, unknown>,
        keys = Object.keys(apis).sort()
    if (
        keys.length > 32 ||
        required.some((id) => !Object.hasOwn(apis, id)) ||
        keys.some(
            (id) =>
                !/^[a-z][a-z0-9-]{0,31}$/.test(id) ||
                !Number.isSafeInteger(apis[id]) ||
                Number(apis[id]) < 1 ||
                Number(apis[id]) > 100000
        )
    )
        throw new Error('Invalid runtime module API versions')
    return {
        formatVersion: 1,
        apis: Object.fromEntries(keys.map((id) => [id, Number(apis[id])]))
    }
}

export function parseModuleContracts(json: string): RuntimeModuleContracts {
    if (json.length > 32 * 1024)
        throw new Error('Runtime module contracts exceed size limit')
    let value: unknown
    try {
        value = JSON.parse(json)
    } catch {
        throw new Error('Runtime module contracts are not valid JSON')
    }
    return normalizeModuleContracts(value)
}
export function runtimeModuleContracts() {
    return normalizeModuleContracts(current)
}
/** Frozen first-adoption compatibility floor; do not follow future current-version edits. */
export function legacyModuleContracts() {
    return normalizeModuleContracts({
        formatVersion: 1,
        apis: {
            library: 1,
            reader: 1,
            sources: 1,
            tags: 1,
            recommendation: 5,
            sync: 1,
            update: 1
        }
    })
}
export function sameModuleContracts(
    left: RuntimeModuleContracts,
    right: RuntimeModuleContracts
) {
    return (
        JSON.stringify(normalizeModuleContracts(left)) ===
        JSON.stringify(normalizeModuleContracts(right))
    )
}
