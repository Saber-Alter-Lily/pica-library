import { Buffer } from 'node:buffer'
import { SOURCE_HOST_RESPONSE_BYTES, SOURCE_HOST_PAGE_SIZE, SOURCE_HOST_MAX_OFFSET, SourceHostError, sourceHostAbort, type SourceHostConnection } from './contract'
import { SUWAYOMI_QUERIES } from './suwayomi'
import type { SourceHostTransport } from './inspector'

/** Fresh credential-scoped POSTs. No global provider/proxy cookie/credential store or redirects. */
export function sourceHostHttp(connection: SourceHostConnection, fetcher: typeof fetch = globalThis.fetch): SourceHostTransport {
    return {
        async read(operation, variables, signal) {
            sourceHostAbort(signal)
            if (!Object.hasOwn(SUWAYOMI_QUERIES, operation) || (operation === 'info' ? Object.keys(variables).length !== 0 : Object.keys(variables).sort().join(',') !== 'first,offset' || variables.first !== SOURCE_HOST_PAGE_SIZE || !Number.isSafeInteger(variables.offset) || variables.offset < 0 || variables.offset > SOURCE_HOST_MAX_OFFSET || variables.offset % SOURCE_HOST_PAGE_SIZE))
                throw new SourceHostError('INVALID_SOURCE_HOST')
            const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json, application/graphql-response+json' }
            if (connection.auth.mode === 'basic') headers.authorization = 'Basic ' + Buffer.from(connection.auth.username + ':' + connection.auth.password, 'utf8').toString('base64')
            let response: Response
            try {
                response = await fetcher(connection.graphqlUrl, { method: 'POST', headers, body: JSON.stringify({ ...SUWAYOMI_QUERIES[operation], variables }), redirect: 'manual', credentials: 'omit', cache: 'no-store', signal })
            } catch { sourceHostAbort(signal); throw new SourceHostError('SOURCE_HOST_UNAVAILABLE') }
            const discard = () => { void response.body?.cancel().catch(() => {}) }
            // Abort may win after headers arrive but before a reader is acquired.
            try { sourceHostAbort(signal) } catch (error) { discard(); throw error }
            const reject = (code: ConstructorParameters<typeof SourceHostError>[0]): never => { discard(); throw new SourceHostError(code) }
            if (response.status >= 300 && response.status < 400) reject('SOURCE_HOST_REDIRECT')
            if (response.status === 401 || response.status === 403) reject('SOURCE_HOST_AUTH_REQUIRED')
            if (!response.ok) reject('SOURCE_HOST_UNAVAILABLE')
            if (!/^(?:application\/json|application\/graphql-response\+json)(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) reject('SOURCE_HOST_PROTOCOL')
            const length = response.headers.get('content-length')
            if (length !== null && (!/^\d+$/.test(length) || Number(length) > SOURCE_HOST_RESPONSE_BYTES)) reject('SOURCE_HOST_TOO_LARGE')
            const reader = response.body!.getReader(), chunks: Uint8Array[] = []
            let bytes = 0
            const cancel = () => { void reader.cancel().catch(() => {}) }
            signal.addEventListener('abort', cancel, { once: true })
            try {
                sourceHostAbort(signal)
                for (;;) {
                    const part = await reader.read()
                    sourceHostAbort(signal)
                    if (part.done) break
                    bytes += part.value.byteLength
                    if (bytes > SOURCE_HOST_RESPONSE_BYTES) throw new SourceHostError('SOURCE_HOST_TOO_LARGE')
                    chunks.push(part.value)
                }
                const data = Buffer.concat(chunks, bytes)
                try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)) }
                catch { throw new SourceHostError('SOURCE_HOST_PROTOCOL') }
            } catch (error) {
                sourceHostAbort(signal)
                if (error instanceof SourceHostError) throw error
                throw new SourceHostError('SOURCE_HOST_UNAVAILABLE')
            } finally { signal.removeEventListener('abort', cancel); cancel(); reader.releaseLock() }
        }
    }
}
