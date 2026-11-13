import { initialSourcePolicy, normalizeSourcePolicy } from './source-policy'

/** A terminal command selects sources explicitly; credentials are not consent. */
export function cliSourcePolicy(value: string | undefined) {
    if (value === undefined || value === 'none') return initialSourcePolicy()
    try {
        if (!value.trim()) throw new Error('Empty source selection')
        return normalizeSourcePolicy({
            schemaVersion: 1,
            revision: 0,
            enabled: value.split(',').map((id) => id.trim())
        })
    } catch {
        throw new Error('Invalid --sources: choose pica,eh,jm or none')
    }
}

export function cliSourcePolicyFromArgs(argv: readonly string[]) {
    const selections = argv.flatMap((argument, index) =>
        argument === '--sources'
            ? [{value: argv[index + 1]}]
            : argument.startsWith('--sources=')
              ? [{value: argument.slice('--sources='.length)}]
              : []
    )
    if (!selections.length) return initialSourcePolicy()
    if (selections.length !== 1)
        throw new Error('Use --sources exactly once')
    const value = selections[0].value
    if (value === undefined || value.startsWith('--'))
        throw new Error('--sources requires pica,eh,jm or none')
    return cliSourcePolicy(value)
}
