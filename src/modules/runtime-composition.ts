/** Application packaging facts only. Never a source permission or executable loader. */
export interface RuntimeComposition {
    formatVersion: 1
    sourceRuntimes: Array<'jm'>
}

export const RUNTIME_COMPOSITION_PATH = 'app/runtime-composition.json'

export function normalizeRuntimeComposition(value: unknown): RuntimeComposition {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid runtime composition')
    const input = value as Record<string, unknown>
    if (
        input.formatVersion !== 1 ||
        Object.keys(input).some(key => !['formatVersion', 'sourceRuntimes'].includes(key)) ||
        !Array.isArray(input.sourceRuntimes) ||
        input.sourceRuntimes.length > 1 ||
        input.sourceRuntimes.some(id => id !== 'jm')
    ) throw new Error('Unsupported runtime composition')
    return { formatVersion: 1, sourceRuntimes: [...input.sourceRuntimes] }
}

export function parseRuntimeComposition(text: string) {
    if (text.length > 4096) throw new Error('Runtime composition exceeds size limit')
    let value: unknown
    try { value = JSON.parse(text) }
    catch { throw new Error('Runtime composition is not valid JSON') }
    return normalizeRuntimeComposition(value)
}

export function coreRuntimeComposition(): RuntimeComposition {
    return { formatVersion: 1, sourceRuntimes: [] }
}

export function sameRuntimeComposition(left: RuntimeComposition, right: RuntimeComposition) {
    return JSON.stringify(normalizeRuntimeComposition(left)) === JSON.stringify(normalizeRuntimeComposition(right))
}

export function runtimeCompositionSuffix(value: RuntimeComposition) {
    return normalizeRuntimeComposition(value).sourceRuntimes.includes('jm') ? '-with-jm' : ''
}

/** Validate the actual payload, including historical packages with no descriptor. */
export function compositionFromPayload(paths: Iterable<string>, descriptor?: string): RuntimeComposition {
    const names = [...paths]
    const identity = new Set<string>()
    for (const name of names) {
        const key = name.replaceAll('\\', '/').toLowerCase()
        if (identity.has(key)) throw new Error('Duplicate runtime payload path')
        identity.add(key)
        if (key === RUNTIME_COMPOSITION_PATH && name !== RUNTIME_COMPOSITION_PATH)
            throw new Error('Runtime composition must use the canonical path case')
        if (key.startsWith('runtime/jm/') && !name.startsWith('runtime/jm/'))
            throw new Error('Source runtime must use the canonical path case')
    }
    const jm = names.some(name => name.startsWith('runtime/jm/'))
    const composition = descriptor === undefined
        ? { formatVersion: 1 as const, sourceRuntimes: jm ? ['jm' as const] : [] }
        : parseRuntimeComposition(descriptor)
    if (identity.has(RUNTIME_COMPOSITION_PATH) !== (descriptor !== undefined))
        throw new Error('Runtime composition descriptor/payload mismatch')
    if (composition.sourceRuntimes.includes('jm') !== jm)
        throw new Error('Runtime composition does not match the actual source runtime')
    if (jm && (!identity.has('runtime/jm/lib/pica-jm-source.jar') ||
        !identity.has('runtime/jm/pica_jm_runtime.json') ||
        !['runtime/jm/bin/java.exe', 'runtime/jm/bin/java'].some(name => identity.has(name))))
        throw new Error('Incomplete JM runtime payload')
    return normalizeRuntimeComposition(composition)
}
