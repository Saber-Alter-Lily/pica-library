import { SourceHostError, object, sourceHostAbort, sourceHostEndpoint, sourceHostRequest, type SourceHostInspection } from './contract'
import type { SourceHostInspector } from './inspector'

/** A user-owned endpoint permission, not a content source/catalogue/provider identity. */
export interface SourceHostRecord {
    id: string
    kind: 'suwayomi'
    label: string
    endpoint: string
    allowInsecureLan: boolean
    authMode: 'none' | 'basic'
    enabled: boolean
    revision: number
}
export interface SourceHostRegistry {
    schemaVersion: 1
    revision: number
    hosts: SourceHostRecord[]
}
export interface SourceHostRegistryStore {
    load(): unknown
    save(value: SourceHostRegistry): void
}
const MAX_HOSTS = 16
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
function fields(value: Record<string, unknown>, expected: string[]) {
    if (Object.keys(value).some(key => !expected.includes(key))) throw new SourceHostError('INVALID_SOURCE_HOST')
}
function revision(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) >= Number.MAX_SAFE_INTEGER) throw new SourceHostError('INVALID_SOURCE_HOST')
    return Number(value)
}
function id(value: unknown): string {
    if (typeof value !== 'string' || !UUID.test(value)) throw new SourceHostError('INVALID_SOURCE_HOST')
    return value
}
function label(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 100 || /[\u0000-\u001f\u007f]/.test(value)) throw new SourceHostError('INVALID_SOURCE_HOST')
    return value
}
/** Strict schema: credentials, repositories and future permissions cannot be smuggled into JSON. */
export function sourceHostRegistry(value: unknown): SourceHostRegistry {
    if (value === null || value === undefined) return { schemaVersion: 1, revision: 0, hosts: [] }
    const root = object(value)
    fields(root, ['schemaVersion', 'revision', 'hosts'])
    if (root.schemaVersion !== 1 || !Array.isArray(root.hosts) || root.hosts.length > MAX_HOSTS) throw new SourceHostError('INVALID_SOURCE_HOST')
    const seen = new Set<string>(), endpoints = new Set<string>()
    const hosts = root.hosts.map(raw => {
        const row = object(raw)
        fields(row, ['id', 'kind', 'label', 'endpoint', 'allowInsecureLan', 'authMode', 'enabled', 'revision'])
        const key = id(row.id)
        if (row.kind !== 'suwayomi' || typeof row.enabled !== 'boolean' || typeof row.allowInsecureLan !== 'boolean' || !['none', 'basic'].includes(String(row.authMode))) throw new SourceHostError('INVALID_SOURCE_HOST')
        const endpoint = sourceHostEndpoint(row.endpoint, row.allowInsecureLan)
        if (endpoint.endpoint !== row.endpoint || (row.authMode === 'basic' && !endpoint.encrypted && !endpoint.loopback) || seen.has(key) || endpoints.has(endpoint.endpoint)) throw new SourceHostError('INVALID_SOURCE_HOST')
        seen.add(key); endpoints.add(endpoint.endpoint)
        return { id: key, kind: 'suwayomi' as const, label: label(row.label), endpoint: endpoint.endpoint, allowInsecureLan: row.allowInsecureLan, authMode: row.authMode as 'none' | 'basic', enabled: row.enabled, revision: revision(row.revision) }
    })
    return { schemaVersion: 1, revision: revision(root.revision), hosts }
}

/** No default host, discovery, network at construction, account inheritance or content ownership. */
export class SourceHostConnections {
    private registry: SourceHostRegistry
    private active?: { id: string; controller: AbortController }
    private closed = false
    private unreadable = false
    constructor(private readonly store: SourceHostRegistryStore, private readonly inspector: Pick<SourceHostInspector, 'inspect'>, private readonly newId: () => string) {
        this.registry = sourceHostRegistry(null)
        try { this.registry = sourceHostRegistry(store.load()) }
        catch { this.unreadable = true }
    }
    get busy() { return Boolean(this.active) }
    cancel() { this.active?.controller.abort() }
    close() { this.closed = true; this.cancel() }
    snapshot() {
        return {
            ...sourceHostRegistry(this.registry),
            // No inheritance of future source permissions from this version's consent.
            scope: 'inspect-only' as const,
            capabilities: { sourceInspection: true, reader: false, libraryImport: false, extensionInstall: false },
            credentials: 'per-request-not-stored' as const,
            storage: this.unreadable ? 'unavailable' as const : 'available' as const
        }
    }
    private writable() {
        if (this.closed) throw new SourceHostError('SOURCE_HOST_CANCELLED')
        if (this.unreadable) throw new SourceHostError('SOURCE_HOST_STORAGE')
    }
    private find(value: unknown) {
        const host = this.registry.hosts.find(row => row.id === id(value))
        if (!host) throw new SourceHostError('INVALID_SOURCE_HOST')
        return host
    }
    private commit(hosts: SourceHostRecord[]) {
        const next = sourceHostRegistry({ schemaVersion: 1, revision: this.registry.revision + 1, hosts })
        // Commit the durable authority before publishing it in memory. Failure cannot grant access.
        try { this.store.save(next) } catch { throw new SourceHostError('SOURCE_HOST_STORAGE') }
        this.registry = next
        return this.snapshot()
    }
    command(value: unknown) {
        const input = object(value)
        if (input.action === 'list') { fields(input, ['action']); return this.snapshot() }
        this.writable()
        if (input.action === 'save') {
            fields(input, ['action', 'kind', 'label', 'endpoint', 'authMode', 'allowInsecureLan', 'scope', 'consent'])
            if (input.consent !== true || input.scope !== 'inspect-only') throw new SourceHostError('SOURCE_HOST_CONSENT_REQUIRED')
            if (input.kind !== 'suwayomi' || !['none', 'basic'].includes(String(input.authMode)) || typeof input.allowInsecureLan !== 'boolean' || this.registry.hosts.length >= MAX_HOSTS) throw new SourceHostError('INVALID_SOURCE_HOST')
            const endpoint = sourceHostEndpoint(input.endpoint, input.allowInsecureLan)
            if (input.authMode === 'basic' && !endpoint.encrypted && !endpoint.loopback) throw new SourceHostError('SOURCE_HOST_INSECURE')
            if (this.registry.hosts.some(row => row.endpoint === endpoint.endpoint)) throw new SourceHostError('SOURCE_HOST_DUPLICATE')
            // Saving is not enabling. Editing/replacing an endpoint creates a new connection identity.
            return this.commit([...this.registry.hosts, { id: id(this.newId()), kind: 'suwayomi', label: label(input.label), endpoint: endpoint.endpoint, allowInsecureLan: input.allowInsecureLan, authMode: input.authMode as 'none' | 'basic', enabled: false, revision: 0 }])
        }
        if (input.action === 'set-enabled' || input.action === 'remove') {
            fields(input, input.action === 'remove' ? ['action', 'id', 'expectedRevision', 'consent'] : ['action', 'id', 'expectedRevision', 'enabled', 'consent'])
            if (input.consent !== true) throw new SourceHostError('SOURCE_HOST_CONSENT_REQUIRED')
            const host = this.find(input.id)
            if (revision(input.expectedRevision) !== host.revision) throw new SourceHostError('SOURCE_HOST_STALE')
            if (input.action === 'set-enabled' && typeof input.enabled !== 'boolean') throw new SourceHostError('INVALID_SOURCE_HOST')
            // Revocation wins over late results, even if the following disk write fails.
            if (this.active?.id === host.id) this.active.controller.abort()
            if (input.action === 'remove') return this.commit(this.registry.hosts.filter(row => row.id !== host.id))
            return this.commit(this.registry.hosts.map(row => row.id === host.id ? { ...row, enabled: Boolean(input.enabled), revision: row.revision + 1 } : row))
        }
        throw new SourceHostError('INVALID_SOURCE_HOST')
    }
    async inspect(value: unknown, signal: AbortSignal): Promise<SourceHostInspection> {
        this.writable()
        const input = object(value)
        fields(input, ['id', 'expectedRevision', 'offset', 'auth', 'consent'])
        if (input.consent !== true) throw new SourceHostError('SOURCE_HOST_CONSENT_REQUIRED')
        const host = this.find(input.id)
        if (revision(input.expectedRevision) !== host.revision) throw new SourceHostError('SOURCE_HOST_STALE')
        if (!host.enabled) throw new SourceHostError('SOURCE_HOST_DISABLED')
        if (this.active) throw new SourceHostError('SOURCE_HOST_BUSY')
        const auth = object(input.auth ?? { mode: 'none' })
        if (auth.mode !== host.authMode) throw new SourceHostError('SOURCE_HOST_AUTH_REQUIRED')
        const request = { kind: host.kind, endpoint: host.endpoint, allowInsecureLan: host.allowInsecureLan, auth, offset: input.offset ?? 0, consent: true }
        sourceHostRequest(request)
        const controller = new AbortController(), forward = () => controller.abort(signal.reason)
        signal.addEventListener('abort', forward, { once: true })
        if (signal.aborted) forward()
        this.active = { id: host.id, controller }
        try {
            sourceHostAbort(controller.signal)
            const result = await this.inspector.inspect(request, controller.signal)
            sourceHostAbort(controller.signal)
            const current = this.registry.hosts.find(row => row.id === host.id)
            if (this.closed || !current?.enabled || current.revision !== host.revision) throw new SourceHostError('SOURCE_HOST_CANCELLED')
            return result
        } finally { signal.removeEventListener('abort', forward); if (this.active?.controller === controller) this.active = undefined }
    }
}
