import path from 'node:path'

export const defaultLibraryTemplate =
    '{author}/{title} [{short_id}]/{chapter_order} - {chapter}'

export interface PathTemplateValues {
    author: string
    title: string
    comic_id: string
    short_id?: string
    chapter_order: string | number
    chapter: string
    circle?: string
    category?: string
}

const placeholders = new Set<keyof PathTemplateValues>([
    'author',
    'title',
    'comic_id',
    'short_id',
    'chapter_order',
    'chapter',
    'circle',
    'category'
])
const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i

export function safePathSegment(value: unknown, fallback = '_') {
    let output = String(value ?? '')
        .normalize('NFKC')
        .trim()
        // eslint-disable-next-line no-control-regex
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
        .replace(/[. ]+$/g, '')
        .slice(0, 120)
    if (!output || output === '.' || output === '..') output = fallback
    if (reserved.test(output)) output = `_${output}`
    return output
}

export function renderLibraryPath(
    root: string,
    template: string,
    values: PathTemplateValues
) {
    const shortId = values.short_id ?? values.comic_id.slice(0, 8)
    const rendered = template.replace(/\{([a-z_]+)\}/g, (_, key: string) => {
        if (!placeholders.has(key as keyof PathTemplateValues))
            throw new Error(`Unknown path placeholder: {${key}}`)
        return safePathSegment(
            key === 'short_id' ? shortId : values[key as keyof PathTemplateValues]
        )
    })
    const segments = rendered.split(/[\\/]+/).filter(Boolean)
    if (segments.length === 0) throw new Error('Path template produced no path')
    const resolvedRoot = path.resolve(root)
    const destination = path.resolve(resolvedRoot, ...segments)
    if (
        destination !== resolvedRoot &&
        !destination.startsWith(`${resolvedRoot}${path.sep}`)
    )
        throw new Error('Path template escaped the library root')
    return destination
}

export function previewLibraryPath(
    root: string,
    template: string,
    values: PathTemplateValues,
    occupied: ReadonlySet<string> = new Set()
) {
    const destination = renderLibraryPath(root, template, values)
    if (!occupied.has(destination)) return destination
    const suffix = safePathSegment(values.short_id ?? values.comic_id.slice(0, 8))
    return `${destination} [${suffix}]`
}
