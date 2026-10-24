import { SOURCE_HOST_PAGE_SIZE, SOURCE_HOST_MAX_OFFSET, SourceHostError, sourceHostAbort, type SourceHostConnection } from './contract'
import { SUWAYOMI_QUERIES } from './suwayomi'
import type { SourceHostTransport } from './inspector'
import { sourceHostGraphql } from './http-body'

/** Fixed inspection allowlist; sharing HTTP mechanics does not grant reading permissions. */
export function sourceHostHttp(connection: SourceHostConnection, fetcher: typeof fetch = globalThis.fetch): SourceHostTransport {
    return {
        async read(operation, variables, signal) {
            sourceHostAbort(signal)
            if (!Object.hasOwn(SUWAYOMI_QUERIES, operation) || (operation === 'info' ? Object.keys(variables).length !== 0 : Object.keys(variables).sort().join(',') !== 'first,offset' || variables.first !== SOURCE_HOST_PAGE_SIZE || !Number.isSafeInteger(variables.offset) || variables.offset < 0 || variables.offset > SOURCE_HOST_MAX_OFFSET || variables.offset % SOURCE_HOST_PAGE_SIZE)) throw new SourceHostError('INVALID_SOURCE_HOST')
            return sourceHostGraphql(connection, SUWAYOMI_QUERIES[operation], variables, signal, fetcher)
        }
    }
}
