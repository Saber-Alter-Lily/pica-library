import { normalizeRuntimeComposition, parseRuntimeComposition, RUNTIME_COMPOSITION_PATH, sameRuntimeComposition, type RuntimeComposition } from '../modules/runtime-composition'

export function validateAutomaticFullRuntimeComposition(current: RuntimeComposition, staged: RuntimeComposition, expected?: RuntimeComposition) {
    if (!sameRuntimeComposition(current, staged) || (expected !== undefined && !sameRuntimeComposition(current, expected)))
        throw Error('Automatic application updates cannot add or remove optional source runtimes; select a complete application explicitly')
}

/** Shared by staging and the actual detached helper before any installed-file mutation. */
export function validateIncrementalRuntimeComposition(input: {
    current: RuntimeComposition
    target?: RuntimeComposition
    files: string[]
    deletions: string[]
    descriptor?: string
}) {
    const current = normalizeRuntimeComposition(input.current)
    if (input.deletions.some(name => name.replaceAll('\\', '/').toLowerCase() === RUNTIME_COMPOSITION_PATH))
        throw Error('Runtime composition cannot be removed by an incremental update')
    const entries = input.files.filter(name => name.replaceAll('\\', '/').toLowerCase() === RUNTIME_COMPOSITION_PATH)
    if (entries.length > 1 || entries.some(name => name !== RUNTIME_COMPOSITION_PATH))
        throw Error('Runtime composition must use the canonical path case')
    if (Boolean(entries.length) !== (input.descriptor !== undefined)) throw Error('Runtime composition payload is missing')
    if (input.target === undefined) {
        if (entries.length) throw Error('Runtime composition payload is not declared in the update manifest')
        return
    }
    const target = normalizeRuntimeComposition(input.target)
    if (!sameRuntimeComposition(current, target))
        throw Error('Changing optional source runtimes requires an explicitly selected complete application, not an incremental update')
    if (input.descriptor !== undefined && !sameRuntimeComposition(parseRuntimeComposition(input.descriptor), target))
        throw Error('Runtime composition does not match the target payload')
}
