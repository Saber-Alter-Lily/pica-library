import { Buffer } from 'node:buffer'
import { SourceHostError, sourceHostAbort, SOURCE_HOST_RESPONSE_BYTES, type SourceHostConnection } from './contract'

/** Shared bounded transport. Callers supply only reviewed fixed operations/routes, never browser queries. */
export async function sourceHostBytes(connection: SourceHostConnection, route: string, body: string | undefined, signal: AbortSignal, limit: number, raster: boolean, fetcher: typeof fetch = globalThis.fetch) {
    sourceHostAbort(signal)
    if (!/^(?:api\/graphql|api\/v1\/manga\/[1-9]\d{0,9}\/chapter\/\d{1,9}\/page\/\d{1,5})$/.test(route)) throw new SourceHostError('INVALID_SOURCE_HOST')
    const headers: Record<string, string> = raster ? { accept: 'image/png,image/jpeg,image/gif,image/webp' } : { 'content-type': 'application/json', accept: 'application/json, application/graphql-response+json' }
    if (connection.auth.mode === 'basic') headers.authorization = 'Basic ' + Buffer.from(connection.auth.username + ':' + connection.auth.password, 'utf8').toString('base64')
    let response: Response
    try { response = await fetcher(new URL(route, connection.endpoint).toString(), { method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : { body }), redirect: 'manual', credentials: 'omit', cache: 'no-store', signal }) }
    catch { sourceHostAbort(signal); throw new SourceHostError('SOURCE_HOST_UNAVAILABLE') }
    const discard = () => { void response.body?.cancel().catch(() => {}) }
    try { sourceHostAbort(signal) } catch (error) { discard(); throw error }
    const reject = (code: ConstructorParameters<typeof SourceHostError>[0]): never => { discard(); throw new SourceHostError(code) }
    if (response.status >= 300 && response.status < 400) reject('SOURCE_HOST_REDIRECT')
    if (response.status === 401 || response.status === 403) reject('SOURCE_HOST_AUTH_REQUIRED')
    if (!response.ok) reject('SOURCE_HOST_UNAVAILABLE')
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!(raster ? ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(contentType) : ['application/json', 'application/graphql-response+json'].includes(contentType)) || !response.body) reject('SOURCE_HOST_PROTOCOL')
    const length = response.headers.get('content-length')
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) reject('SOURCE_HOST_TOO_LARGE')
    const reader = response.body!.getReader(), chunks: Uint8Array[] = []
    let bytes = 0
    const cancel = () => { void reader.cancel().catch(() => {}) }
    signal.addEventListener('abort', cancel, { once: true })
    try {
        sourceHostAbort(signal)
        for (;;) {
            const part = await reader.read(); sourceHostAbort(signal)
            if (part.done) break
            bytes += part.value.byteLength
            if (bytes > limit) throw new SourceHostError('SOURCE_HOST_TOO_LARGE')
            chunks.push(part.value)
        }
        return { data: Buffer.concat(chunks, bytes), contentType }
    } catch (error) { sourceHostAbort(signal); if (error instanceof SourceHostError) throw error; throw new SourceHostError('SOURCE_HOST_UNAVAILABLE') }
    finally { signal.removeEventListener('abort', cancel); cancel(); reader.releaseLock() }
}
export async function sourceHostGraphql(connection: SourceHostConnection, operation: { operationName: string; query: string }, variables: Record<string, unknown>, signal: AbortSignal, fetcher: typeof fetch = globalThis.fetch) {
    const { data } = await sourceHostBytes(connection, 'api/graphql', JSON.stringify({ ...operation, variables }), signal, SOURCE_HOST_RESPONSE_BYTES, false, fetcher)
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)) }
    catch { throw new SourceHostError('SOURCE_HOST_PROTOCOL') }
}
