import type {
    RemoteJsonVersion,
    RemoteObject,
    RemoteStorageCredentials,
    RemoteStorageProvider,
    RemoteStoragePublicConfig
} from './types'

function normalizeBaseUrl(value: string) {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('WebDAV URL must use HTTP or HTTPS')
    url.username = ''
    url.password = ''
    return url.toString().replace(/\/$/, '')
}

function normalizeRoot(value: string) {
    return value
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '')
}

function basicAuthorization(credentials: RemoteStorageCredentials) {
    if (!credentials.username && !credentials.password) return undefined
    return `Basic ${Buffer.from(`${credentials.username ?? ''}:${credentials.password ?? ''}`, 'utf8').toString('base64')}`
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function retryableStatus(status: number) {
    return (
        status === 408 ||
        status === 425 ||
        status === 429 ||
        (status >= 500 && status <= 599)
    )
}

export class WebDavStorageProvider implements RemoteStorageProvider {
    readonly kind = 'webdav' as const
    private readonly baseUrl: string
    private readonly root: string
    private readonly authorization?: string
    private readonly ensuredDirectories = new Set<string>()
    private readonly metadataTimeoutMs: number
    private readonly uploadTimeoutMs: number

    constructor(
        config: RemoteStoragePublicConfig,
        credentials: RemoteStorageCredentials = {},
        timeoutMs = 30_000
    ) {
        if (config.kind !== 'webdav')
            throw new Error('WebDavStorageProvider requires WebDAV config')
        this.baseUrl = normalizeBaseUrl(config.baseUrl)
        this.root = normalizeRoot(config.root)
        this.authorization = basicAuthorization(credentials)
        this.metadataTimeoutMs = Math.max(15_000, timeoutMs)
        this.uploadTimeoutMs = Math.max(120_000, timeoutMs)
    }

    private url(path = '') {
        const suffix = [this.root, path.replace(/^\/+/, '')]
            .filter(Boolean)
            .join('/')
        return suffix ? `${this.baseUrl}/${suffix}` : this.baseUrl
    }

    private rawUrl(path = '') {
        const suffix = path.replace(/^\/+/, '')
        return suffix ? `${this.baseUrl}/${suffix}` : this.baseUrl
    }

    private headers(extra?: HeadersInit) {
        const headers = new Headers(extra)
        if (this.authorization) headers.set('authorization', this.authorization)
        return headers
    }

    private async fetchWithRetry(
        url: string,
        init: RequestInit,
        timeoutMs: number,
        attempts: number
    ) {
        let lastError: unknown = null
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                const response = await fetch(url, {
                    ...init,
                    headers: this.headers(init.headers),
                    signal: AbortSignal.timeout(timeoutMs)
                })
                if (!retryableStatus(response.status) || attempt === attempts)
                    return response
                try {
                    await response.body?.cancel()
                } catch {
                    // Best-effort connection cleanup before retrying.
                }
                await sleep(Math.min(4000, 500 * 2 ** (attempt - 1)))
            } catch (error) {
                lastError = error
                if (attempt === attempts) throw error
                await sleep(Math.min(4000, 500 * 2 ** (attempt - 1)))
            }
        }
        throw lastError instanceof Error
            ? lastError
            : new Error('WebDAV request failed')
    }

    private async request(
        path: string,
        init: RequestInit,
        accepted: number[],
        timeoutMs = this.metadataTimeoutMs,
        attempts = 2
    ) {
        const response = await this.fetchWithRetry(
            this.url(path),
            init,
            timeoutMs,
            attempts
        )
        if (!accepted.includes(response.status))
            throw new Error(
                `WebDAV ${init.method ?? 'GET'} failed: HTTP ${response.status}`
            )
        return response
    }

    async test() {
        // Test the configured WebDAV endpoint itself. The PicaLibrary root may
        // not exist yet; the first sync is responsible for creating it.
        const response = await this.fetchWithRetry(
            this.baseUrl,
            { method: 'PROPFIND', headers: { depth: '0' } },
            this.metadataTimeoutMs,
            2
        )
        if (![200, 207].includes(response.status))
            throw new Error(`WebDAV PROPFIND failed: HTTP ${response.status}`)
        return { success: true as const, status: response.status }
    }

    async exists(path: string) {
        const response = await this.fetchWithRetry(
            this.url(path),
            { method: 'HEAD' },
            this.metadataTimeoutMs,
            2
        )
        if (response.status === 404) return false
        if (response.ok) return true
        if (response.status === 405) {
            const fallback = await this.fetchWithRetry(
                this.url(path),
                { method: 'PROPFIND', headers: { depth: '0' } },
                this.metadataTimeoutMs,
                2
            )
            if (fallback.status === 404) return false
            if ([200, 207].includes(fallback.status)) return true
        }
        throw new Error(
            `WebDAV existence check failed: HTTP ${response.status}`
        )
    }

    async ensureDirectory(path: string) {
        // WebDAV MKCOL is comparatively expensive on many hosted providers.
        // Cache every confirmed collection for the lifetime of this provider so
        // a large page sync does not recreate/check the same parent path.
        const segments = [this.root, path]
            .filter(Boolean)
            .join('/')
            .replace(/^\/+|\/+$/g, '')
            .split('/')
            .filter(Boolean)
        let current = ''
        for (const segment of segments) {
            current = current ? `${current}/${segment}` : segment
            if (this.ensuredDirectories.has(current)) continue
            const response = await this.fetchWithRetry(
                this.rawUrl(current),
                { method: 'MKCOL' },
                this.metadataTimeoutMs,
                3
            )
            if (
                [201, 301, 405].includes(response.status) ||
                (response.status >= 200 && response.status < 300)
            ) {
                this.ensuredDirectories.add(current)
                continue
            }
            throw new Error(
                `WebDAV MKCOL ${current} failed: HTTP ${response.status}`
            )
        }
    }

    async get(path: string): Promise<RemoteObject | null> {
        const response = await this.fetchWithRetry(
            this.url(path),
            { method: 'GET' },
            this.metadataTimeoutMs,
            2
        )
        if (response.status === 404) return null
        if (!response.ok)
            throw new Error(`WebDAV GET failed: HTTP ${response.status}`)
        return {
            path,
            data: Buffer.from(await response.arrayBuffer()),
            contentType: response.headers.get('content-type') ?? undefined,
            etag: response.headers.get('etag') ?? undefined,
            lastModified: response.headers.get('last-modified') ?? undefined
        }
    }

    async put(path: string, data: Buffer, contentType?: string) {
        const parent = path.split('/').slice(0, -1).join('/')
        await this.ensureDirectory(parent)
        await this.request(
            path,
            {
                method: 'PUT',
                body: data,
                headers: contentType
                    ? { 'content-type': contentType }
                    : undefined
            },
            [200, 201, 204],
            this.uploadTimeoutMs,
            3
        )
    }

    async getJson<T>(path: string) {
        const value = await this.get(path)
        if (!value) return null
        return JSON.parse(value.data.toString('utf8')) as T
    }

    async putJson(path: string, value: unknown) {
        await this.put(
            path,
            Buffer.from(JSON.stringify(value, null, 2), 'utf8'),
            'application/json; charset=utf-8'
        )
    }

    async getJsonVersioned<T>(path: string): Promise<RemoteJsonVersion<T>> {
        const object = await this.get(path)
        if (!object) return { value: null, exists: false }
        return {
            value: JSON.parse(object.data.toString('utf8')) as T,
            exists: true,
            etag: object.etag,
            lastModified: object.lastModified
        }
    }

    async putJsonConditional(
        path: string,
        value: unknown,
        expected: Pick<
            RemoteJsonVersion<unknown>,
            'exists' | 'etag' | 'lastModified'
        >
    ) {
        const parent = path.split('/').slice(0, -1).join('/')
        await this.ensureDirectory(parent)
        const headers: Record<string, string> = {
            'content-type': 'application/json; charset=utf-8'
        }
        if (!expected.exists) headers['if-none-match'] = '*'
        else if (expected.etag) headers['if-match'] = expected.etag
        else if (expected.lastModified)
            headers['if-unmodified-since'] = expected.lastModified
        else
            throw new Error(
                'WebDAV server did not return ETag/Last-Modified; safe portable-state update is unavailable'
            )
        const response = await this.fetchWithRetry(
            this.url(path),
            {
                method: 'PUT',
                body: Buffer.from(JSON.stringify(value, null, 2), 'utf8'),
                headers
            },
            this.uploadTimeoutMs,
            3
        )
        if (response.status === 412) return false
        if (![200, 201, 204].includes(response.status))
            throw new Error(
                `WebDAV conditional PUT failed: HTTP ${response.status}`
            )
        return true
    }
}
