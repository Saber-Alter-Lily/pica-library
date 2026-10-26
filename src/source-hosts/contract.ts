/** Optional, user-selected remote source hosts. No provider/account/catalog authority. */
export const SOURCE_HOST_PAGE_SIZE = 25
export const SOURCE_HOST_MAX_OFFSET = 5000
export const SOURCE_HOST_RESPONSE_BYTES = 1024 * 1024
export const SOURCE_HOST_DEADLINE_MS = 12000

export type SourceHostErrorCode =
    | 'INVALID_SOURCE_HOST'
    | 'SOURCE_HOST_CONSENT_REQUIRED'
    | 'SOURCE_HOST_INSECURE'
    | 'SOURCE_HOST_AUTH_REQUIRED'
    | 'SOURCE_HOST_UNSUPPORTED'
    | 'SOURCE_HOST_PROTOCOL'
    | 'SOURCE_HOST_REDIRECT'
    | 'SOURCE_HOST_TOO_LARGE'
    | 'SOURCE_HOST_UNAVAILABLE'
    | 'SOURCE_HOST_BUSY'
    | 'SOURCE_HOST_CANCELLED'
    | 'SOURCE_HOST_TIMEOUT'
    | 'SOURCE_HOST_STORAGE'
    | 'SOURCE_HOST_DUPLICATE'
    | 'SOURCE_HOST_STALE'
    | 'SOURCE_HOST_DISABLED'
    | 'SOURCE_HOST_READER_CONSENT_REQUIRED'
    | 'SOURCE_HOST_SCOPE_REQUIRED'
    | 'SOURCE_HOST_SOURCE_SELECTION_REQUIRED'
    | 'SOURCE_HOST_DOWNLOAD_CONSENT_REQUIRED'

export class SourceHostError extends Error {
    constructor(readonly code: SourceHostErrorCode) {
        // Never use a remote error/body, URL, username, password or header as public text.
        super(code)
        this.name = 'SourceHostError'
    }
}

export interface SourceHostConnection {
    readonly endpoint: string
    readonly graphqlUrl: string
    readonly auth: { mode: 'none' } | { mode: 'basic'; username: string; password: string }
}
export interface SourceHostRequest {
    connection: SourceHostConnection
    offset: number
}
export interface HostedSource {
    /** Upstream LongString, never Number or a Pica/Library comic identity. */
    id: string
    name: string
    language: string
    supportsLatest: boolean
}
export interface SourceHostInspection {
    kind: 'suwayomi'
    protocolVersion: 1
    server: { name: string; version: string }
    page: { offset: number; size: number; total: number; hasNext: boolean; hasPrevious: boolean; sources: HostedSource[] }
    capabilities: { sourceInspection: true; reader: false; libraryImport: false; extensionInstall: false }
    persisted: false
}

export function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new SourceHostError('SOURCE_HOST_PROTOCOL')
    return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, allowed: string[]) {
    if (Object.keys(value).some(key => !allowed.includes(key)))
        throw new SourceHostError('INVALID_SOURCE_HOST')
}
function ipv4(host: string) {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null
    const octets = host.split('.').map(Number)
    return octets.every(n => n >= 0 && n <= 255) ? octets : null
}

/** No DNS scan/resolution or discovery. Plain LAN HTTP requires explicit one-request consent. */
export function sourceHostEndpoint(value: unknown, allowInsecureLan: boolean) {
    if (typeof value !== 'string' || !value || value.length > 2048 || value !== value.trim() || /[\\\s@?#%\u0000-\u001f\u007f]/.test(value))
        throw new SourceHostError('INVALID_SOURCE_HOST')
    const pathStart = value.indexOf('/', value.indexOf('://') + 3)
    if (pathStart >= 0 && value.slice(pathStart).split('/').some(segment => segment === '.' || segment === '..'))
        throw new SourceHostError('INVALID_SOURCE_HOST')
    let url: URL
    try { url = new URL(value) } catch { throw new SourceHostError('INVALID_SOURCE_HOST') }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !url.hostname || !/^\/(?:[a-zA-Z0-9._~-]+\/)*[a-zA-Z0-9._~-]*$/.test(url.pathname))
        throw new SourceHostError('INVALID_SOURCE_HOST')
    const host = url.hostname.toLowerCase(), ip = ipv4(host)
    const loopback = host === 'localhost' || host === '[::1]' || Boolean(ip && ip[0] === 127)
    const privateLan = Boolean(ip && (ip[0] === 10 || (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) || (ip[0] === 192 && ip[1] === 168)))
    if ((ip && (ip[0] === 0 || ip[0] >= 224 || (ip[0] === 169 && ip[1] === 254))) || /^\[(?:fe[89ab]|ff|::ffff:)/i.test(host) || host === '[::]')
        throw new SourceHostError('INVALID_SOURCE_HOST')
    if (url.protocol === 'http:' && !loopback && !(privateLan && allowInsecureLan))
        throw new SourceHostError('SOURCE_HOST_INSECURE')
    url.pathname = url.pathname.replace(/\/$/, '') + '/'
    return { endpoint: url.toString(), graphqlUrl: new URL('api/graphql', url).toString(), loopback, encrypted: url.protocol === 'https:' }
}

export function sourceHostRequest(value: unknown): SourceHostRequest {
    let input: Record<string, unknown>
    try { input = object(value) } catch { throw new SourceHostError('INVALID_SOURCE_HOST') }
    keys(input, ['kind', 'endpoint', 'auth', 'consent', 'allowInsecureLan', 'offset'])
    if (input.consent !== true) throw new SourceHostError('SOURCE_HOST_CONSENT_REQUIRED')
    if (input.kind !== 'suwayomi' || (input.allowInsecureLan !== undefined && typeof input.allowInsecureLan !== 'boolean'))
        throw new SourceHostError('INVALID_SOURCE_HOST')
    const target = sourceHostEndpoint(input.endpoint, input.allowInsecureLan === true)
    const offset = input.offset === undefined ? 0 : input.offset
    if (!Number.isSafeInteger(offset) || Number(offset) < 0 || Number(offset) > SOURCE_HOST_MAX_OFFSET || Number(offset) % SOURCE_HOST_PAGE_SIZE)
        throw new SourceHostError('INVALID_SOURCE_HOST')
    let auth: Record<string, unknown>
    try { auth = object(input.auth === undefined ? { mode: 'none' } : input.auth) } catch { throw new SourceHostError('INVALID_SOURCE_HOST') }
    keys(auth, auth.mode === 'none' ? ['mode'] : ['mode', 'username', 'password'])
    let credentials: SourceHostConnection['auth']
    if (auth.mode === 'none') credentials = { mode: 'none' }
    else if (auth.mode === 'basic') {
        if (typeof auth.username !== 'string' || !auth.username || auth.username.length > 256 || /[:\u0000-\u001f\u007f]/.test(auth.username) || typeof auth.password !== 'string' || !auth.password || auth.password.length > 4096 || /[\u0000-\u001f\u007f]/.test(auth.password))
            throw new SourceHostError('INVALID_SOURCE_HOST')
        if (!target.encrypted && !target.loopback) throw new SourceHostError('SOURCE_HOST_INSECURE')
        credentials = { mode: 'basic', username: auth.username, password: auth.password }
    } else throw new SourceHostError('INVALID_SOURCE_HOST')
    return { connection: { endpoint: target.endpoint, graphqlUrl: target.graphqlUrl, auth: credentials }, offset: Number(offset) }
}

export function sourceHostAbort(signal: AbortSignal) {
    if (signal.aborted)
        throw new SourceHostError(signal.reason?.name === 'TimeoutError' ? 'SOURCE_HOST_TIMEOUT' : 'SOURCE_HOST_CANCELLED')
}
