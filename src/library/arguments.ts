export function parsePositionals(
    argv: string[],
    command: string,
    flagsWithValues: ReadonlySet<string>
) {
    const start = argv.indexOf(command) + 1
    const result: string[] = []
    for (let index = start; index < argv.length; index += 1) {
        const argument = argv[index]
        if (argument.startsWith('--')) {
            const name = argument.slice(2).split('=', 1)[0]
            if (!argument.includes('=') && flagsWithValues.has(name)) index += 1
            continue
        }
        result.push(argument)
    }
    return result
}
