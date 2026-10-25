/** A read-only projection, not a catalogue import or permission to connect a source. */
export type ReadingChannel = 'local' | 'online' | 'hosted'
export interface ReadingPosition {
    episodeId: string
    pageIndex: number
    updatedAt: string
}
export interface ReadingLibraryRow {
    source: { key: string; label: string }
    comicId: string
    title: string | null
    channel: ReadingChannel
    available: boolean
    progress?: ReadingPosition
}
export interface ReadingLibraryPort {
    id: string
    /** Must only read already-owned state. Network, activation and writes are not allowed. */
    snapshot(): readonly ReadingLibraryRow[]
}
export interface ReadingLibraryQuery {
    text?: string
    sourceKey?: string
    recentOnly?: boolean
    offset?: number
    limit?: number
}
export interface ReadingLibraryItem {
    key: string
    source: { key: string; label: string }
    comicId: string
    title: string | null
    routes: Array<{ channel: ReadingChannel; available: boolean; progress?: ReadingPosition }>
    lastReadAt: string | null
}
export class ReadingLibraryInputError extends Error {
    constructor() { super('Invalid reading library query') }
}
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
function text(value: unknown, maximum: number, empty = false): string {
    if (typeof value !== 'string' || value.length > maximum || (!empty && !value.trim()) || /[\u0000-\u001f\u007f]/.test(value)) throw new ReadingLibraryInputError()
    return value
}
export function readingLibraryQuery(value: unknown): Required<ReadingLibraryQuery> {
    if (!object(value) || Object.keys(value).some(key => !['text', 'sourceKey', 'recentOnly', 'offset', 'limit'].includes(key))) throw new ReadingLibraryInputError()
    const offset = value.offset ?? 0, limit = value.limit ?? 20
    if (!Number.isSafeInteger(offset) || Number(offset) < 0 || Number(offset) > 2000 || !Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 100 || value.recentOnly !== undefined && typeof value.recentOnly !== 'boolean') throw new ReadingLibraryInputError()
    return { text: text(value.text ?? '', 200, true).trim(), sourceKey: text(value.sourceKey ?? '', 512, true), recentOnly: value.recentOnly ?? false, offset: Number(offset), limit: Number(limit) }
}
function row(value: ReadingLibraryRow): ReadingLibraryRow {
    if (!object(value) || !object(value.source) || !['local', 'online', 'hosted'].includes(value.channel) || typeof value.available !== 'boolean') throw new ReadingLibraryInputError()
    const source = { key: text(value.source.key, 512), label: text(value.source.label, 160) }
    const comicId = text(value.comicId, 2048), title = value.title === null ? null : text(value.title, 1000)
    let progress: ReadingPosition | undefined
    if (value.progress !== undefined) {
        if (!object(value.progress) || !Number.isSafeInteger(value.progress.pageIndex) || value.progress.pageIndex < 0 || value.progress.pageIndex >= 10000) throw new ReadingLibraryInputError()
        const updatedAt = text(value.progress.updatedAt, 64)
        if (!Number.isFinite(Date.parse(updatedAt))) throw new ReadingLibraryInputError()
        progress = { episodeId: text(value.progress.episodeId, 2048), pageIndex: value.progress.pageIndex, updatedAt }
    }
    return { source, comicId, title, channel: value.channel, available: value.available, ...(progress ? { progress } : {}) }
}
const timestamp = (value?: ReadingPosition) => value ? Date.parse(value.updatedAt) : -Infinity
const searchText = (value: string) => value.normalize('NFKC').toLowerCase()

/** Source-independent composition. Adapter identities are opaque and never inferred from titles. */
export class ReadingLibrary {
    private readonly ports: readonly ReadingLibraryPort[]
    constructor(ports: readonly ReadingLibraryPort[]) {
        const ids = ports.map(port => text(port.id, 120))
        if (new Set(ids).size !== ids.length || ids.length > 5) throw new ReadingLibraryInputError()
        this.ports = [...ports]
    }
    query(input: unknown = {}) {
        const query = readingLibraryQuery(input), items = new Map<string, ReadingLibraryItem>()
        const issues: Array<{ port: string; code: 'READING_STATE_UNAVAILABLE' }> = []
        let sourceLabels = new Map<string, string>()
        for (const port of this.ports) {
            let rows: ReadingLibraryRow[]
            try {
                const values = port.snapshot()
                if (!Array.isArray(values) || values.length > 500) throw new ReadingLibraryInputError()
                rows = values.map(row)
                const labels = new Map(sourceLabels)
                for (const value of rows) {
                    const expected = labels.get(value.source.key)
                    if (expected !== undefined && expected !== value.source.label) throw new ReadingLibraryInputError()
                    labels.set(value.source.key, value.source.label)
                }
                sourceLabels = labels
            } catch {
                issues.push({ port: port.id, code: 'READING_STATE_UNAVAILABLE' })
                continue
            }
            for (const value of rows) {
                const key = JSON.stringify([value.source.key, value.comicId])
                const item = items.get(key) ?? { key, source: value.source, comicId: value.comicId, title: value.title, routes: [], lastReadAt: null }
                if (item.title === null && value.title !== null) item.title = value.title
                const previous = item.routes.find(route => route.channel === value.channel)
                if (!previous) item.routes.push({ channel: value.channel, available: value.available, ...(value.progress ? { progress: value.progress } : {}) })
                else {
                    // A source cannot grant availability through a duplicate stale replica.
                    previous.available = previous.available && value.available
                    if (timestamp(value.progress) > timestamp(previous.progress)) previous.progress = value.progress
                }
                if (value.progress && (!item.lastReadAt || Date.parse(value.progress.updatedAt) > Date.parse(item.lastReadAt))) item.lastReadAt = value.progress.updatedAt
                items.set(key, item)
            }
        }
        const filtered = [...items.values()].filter(item => (!query.recentOnly || item.lastReadAt !== null) && (!query.text || searchText((item.title ?? '')+'\n'+item.comicId).includes(searchText(query.text))))
        const sources = new Map<string, { key: string; label: string; count: number }>()
        for (const item of filtered) {
            const source = sources.get(item.source.key) ?? { ...item.source, count: 0 }
            source.count++; sources.set(source.key, source)
            item.routes.sort((a, b) => Number(b.available) - Number(a.available) || timestamp(b.progress) - timestamp(a.progress) || a.channel.localeCompare(b.channel))
        }
        const selected = filtered.filter(item => !query.sourceKey || item.source.key === query.sourceKey)
        selected.sort((a, b) => (b.lastReadAt ? Date.parse(b.lastReadAt) : -Infinity) - (a.lastReadAt ? Date.parse(a.lastReadAt) : -Infinity) || a.key.localeCompare(b.key))
        return { items: selected.slice(query.offset, query.offset + query.limit), total: selected.length, sources: [...sources.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)), query, issues, complete: issues.length === 0 }
    }
}
