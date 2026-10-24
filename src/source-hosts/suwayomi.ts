import { object, SourceHostError, SOURCE_HOST_PAGE_SIZE, type HostedSource } from './contract'

/** Fixed read-only operations from official v2.4.2366 API, commit40bc5da57820324ed0ae724cbbc020cc4673b594. */
export const SUWAYOMI_QUERIES = {
    info: { operationName: 'PicaSourceHostInfo', query: 'query PicaSourceHostInfo { aboutServer { name version } }' },
    sources: { operationName: 'PicaSourceHostSources', query: 'query PicaSourceHostSources($first: Int!, $offset: Int!) { sources(first: $first, offset: $offset) { nodes { id name lang supportsLatest } pageInfo { hasNextPage hasPreviousPage } totalCount } }' }
} as const
export type SourceHostOperation = keyof typeof SUWAYOMI_QUERIES

export function sourceHostData(value: unknown) {
    const response = object(value)
    if ((response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length)) || !response.data)
        throw new SourceHostError('SOURCE_HOST_PROTOCOL')
    return object(response.data)
}
function text(value: unknown, max: number) {
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value))
        throw new SourceHostError('SOURCE_HOST_PROTOCOL')
    return value
}
export function suwayomiServer(value: unknown) {
    const server = object(sourceHostData(value).aboutServer)
    const name = text(server.name, 100), version = text(server.version, 60)
    if (!/^suwayomi(?:[ -]server)?$/i.test(name) || !/^v?2\.4\.\d{1,9}$/.test(version))
        throw new SourceHostError('SOURCE_HOST_UNSUPPORTED')
    // A version claim is compatibility input, not cryptographic host/extension attestation.
    return { name, version }
}
export function suwayomiSourceId(value: unknown) {
    if (typeof value !== 'string' || !/^(?:0|-?[1-9]\d{0,18})$/.test(value))
        throw new SourceHostError('SOURCE_HOST_PROTOCOL')
    const number = BigInt(value)
    if (number < -9223372036854775808n || number > 9223372036854775807n)
        throw new SourceHostError('SOURCE_HOST_PROTOCOL')
    return value
}
export function suwayomiSourcePage(value: unknown, offset: number) {
    const result = object(sourceHostData(value).sources), page = object(result.pageInfo)
    if (!Array.isArray(result.nodes) || result.nodes.length > SOURCE_HOST_PAGE_SIZE || !Number.isSafeInteger(result.totalCount) || Number(result.totalCount) < 0 || Number(result.totalCount) > 2147483647 || typeof page.hasNextPage !== 'boolean' || typeof page.hasPreviousPage !== 'boolean')
        throw new SourceHostError('SOURCE_HOST_PROTOCOL')
    const seen = new Set<string>()
    const sources: HostedSource[] = result.nodes.map(item => {
        const row = object(item), id = suwayomiSourceId(row.id)
        if (seen.has(id) || typeof row.supportsLatest !== 'boolean') throw new SourceHostError('SOURCE_HOST_PROTOCOL')
        seen.add(id)
        return { id, name: text(row.name, 200), language: text(row.lang, 32), supportsLatest: row.supportsLatest }
    })
    return { offset, size: SOURCE_HOST_PAGE_SIZE, total: Number(result.totalCount), hasNext: page.hasNextPage, hasPrevious: page.hasPreviousPage, sources }
}
