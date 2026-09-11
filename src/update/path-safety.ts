import path from 'node:path'

const allowedRoots = ['app/', 'web/', 'licenses/']
const allowedRootFiles = new Set([
    'LICENSE',
    'NOTICE.md',
    'UPSTREAM.md',
    'README-WINDOWS.txt',
    'README-WINDOWS.zh-CN.txt',
    'SOURCE_SHA.txt'
])

export function normalizeUpdatePath(raw: string): string {
    if (!raw || raw.includes('\0')) throw new Error('Update path is empty')
    const normalized = raw.replaceAll('\\', '/')
    if (
        normalized.startsWith('/') ||
        normalized.startsWith('//') ||
        /^[a-zA-Z]:/.test(normalized) ||
        normalized.includes(':')
    )
        throw new Error(`Absolute or ADS update path is forbidden: ${raw}`)
    const segments = normalized.split('/')
    if (
        segments.some(
            (segment) =>
                !segment ||
                segment === '.' ||
                segment === '..' ||
                /[. ]$/.test(segment)
        )
    )
        throw new Error(`Unsafe update path is forbidden: ${raw}`)
    const portable = segments.join('/')
    if (
        !allowedRootFiles.has(portable) &&
        !allowedRoots.some((root) => portable.startsWith(root))
    )
        throw new Error(
            `Update path is outside the application allowlist: ${raw}`
        )
    return portable
}

export function resolveUpdatePath(root: string, raw: string): string {
    const portable = normalizeUpdatePath(raw)
    const resolved = path.resolve(root, ...portable.split('/'))
    const relative = path.relative(path.resolve(root), resolved)
    if (relative.startsWith('..') || path.isAbsolute(relative))
        throw new Error('Update path escaped the application root')
    return resolved
}

export function updaterSelfReplacement(paths: string[]) {
    return paths.some(
        (value) => normalizeUpdatePath(value) === 'app/updater.js'
    )
}
