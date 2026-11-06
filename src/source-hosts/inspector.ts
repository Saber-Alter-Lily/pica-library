import { SOURCE_HOST_DEADLINE_MS, SOURCE_HOST_PAGE_SIZE, SourceHostError, sourceHostAbort, sourceHostRequest, type SourceHostConnection, type SourceHostInspection } from './contract'
import { suwayomiServer, suwayomiSourcePage, type SourceHostOperation } from './suwayomi'

export interface SourceHostTransport {
    read(operation: SourceHostOperation, variables: Record<string, number>, signal: AbortSignal): Promise<unknown>
}
export type SourceHostTransportFactory = (connection: SourceHostConnection) => SourceHostTransport

async function boundedRead(client: SourceHostTransport, operation: SourceHostOperation, variables: Record<string, number>, signal: AbortSignal) {
    sourceHostAbort(signal)
    let abort = () => {}
    const cancelled = new Promise<never>((_resolve, reject) => {
        abort = () => { try { sourceHostAbort(signal) } catch (error) { reject(error) } }
        signal.addEventListener('abort', abort, { once: true })
    })
    try { return await Promise.race([client.read(operation, variables, signal), cancelled]) }
    finally { signal.removeEventListener('abort', abort) }
}

/** Ephemeral explicit queries, not an extension installer, provider account or catalog writer. */
export class SourceHostInspector {
    private active?: AbortController
    private closed = false
    constructor(private readonly transport: SourceHostTransportFactory) { }
    get busy() { return Boolean(this.active) }
    cancel() { this.active?.abort() }
    close() { this.closed = true; this.cancel() }
    async inspect(value: unknown, signal?: AbortSignal): Promise<SourceHostInspection> {
        if (this.closed) throw new SourceHostError('SOURCE_HOST_CANCELLED')
        const { connection, offset } = sourceHostRequest(value)
        if (this.active) throw new SourceHostError('SOURCE_HOST_BUSY')
        // The pinned TS5.3 DOM declarations predate this standard API; packaged Node24 implements it.
        const standardAbort = AbortSignal as typeof AbortSignal & { any(signals: AbortSignal[]): AbortSignal }
        if (typeof standardAbort.any !== 'function') throw new SourceHostError('SOURCE_HOST_UNSUPPORTED')
        const controller = new AbortController()
        const combined = standardAbort.any([controller.signal, AbortSignal.timeout(SOURCE_HOST_DEADLINE_MS), ...(signal ? [signal] : [])])
        this.active = controller
        try {
            sourceHostAbort(combined)
            const client = this.transport(connection)
            const server = suwayomiServer(await boundedRead(client, 'info', {}, combined))
            sourceHostAbort(combined)
            const page = suwayomiSourcePage(await boundedRead(client, 'sources', { first: SOURCE_HOST_PAGE_SIZE, offset }, combined), offset)
            sourceHostAbort(combined)
            return { kind: 'suwayomi', protocolVersion: 1, server, page, capabilities: { sourceInspection: true, reader: false, libraryImport: false, extensionInstall: false }, persisted: false }
        } catch (error) {
            sourceHostAbort(combined)
            if (error instanceof SourceHostError) throw error
            throw new SourceHostError('SOURCE_HOST_UNAVAILABLE')
        } finally { if (this.active === controller) this.active = undefined }
    }
}
