import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

/** Executes only application-owned Host UI modules against the caller's inert DOM/ports. */
export function inertHostWebModules(
    context: Record<string, unknown>,
    copy: (...values: string[]) => string
) {
    const allowed = new Set([
        'web/host-library.js',
        'web/host-download-view.js',
        'web/host-downloads.js',
        'web/saved-source-hosts.js'
    ])
    const cache = new Map<string, Record<string, unknown>>()
    function load(file: string): Record<string, unknown> {
        if (!allowed.has(file))
            throw Error('Unknown inert Host UI module: ' + file)
        const cached = cache.get(file)
        if (cached) return cached
        const output: Record<string, unknown> = {}
        cache.set(file, output)
        const require = (name: string) => {
            if (name === './locale-runtime.js') return { copy }
            if (!name.startsWith('./'))
                throw Error('Nonlocal inert UI dependency')
            return load(path.posix.join(path.posix.dirname(file), name))
        }
        const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022
            }
        }).outputText
        vm.runInNewContext(
            '(function(){\n' + source + '\n})()',
            { ...context, exports: output, require },
            { timeout: 1000, filename: file }
        )
        return output
    }
    return load
}
