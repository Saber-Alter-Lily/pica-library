import type {
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

export class WebDavStorageProvider implements RemoteStorageProvider {
    readonly kind = 'webdav' as const
    private readonly baseUrl: string
    private readonly root: string
    private readonly authorization?: string

    constructor(
        config: RemoteStoragePublicConfig,
        credentials: RemoteStorageCredentials = {},
        private readonly timeoutMs = 15_000
    ) {
        if (config.kind !== 'webdav')
            throw new Error('WebDavStorageProvider requires WebDAV config')
        this.baseUrl = normalizeBaseUrl(config.baseUrl)
        this.root = normalizeRoot(config.root)
        this.authorization = basicAuthorization(credentials)
    }

    private url(path = '') {
        const suffix = [this.root, path.replace(/^\/+/, '')]
            .filter(Boolean)
            .join('/')
        return `${this.baseUrl}/${suffix}`
    }

    private async request(
        path: string,
        init: RequestInit,
        accepted: number[]
    ) {
        const headers = new Headers(init.headers)
        if (this.authorization) headers.set('authorization', this.authorization)
        const response = await fetch(this.url(path), {
            ...init,
            headers,
            signal: AbortSignal.timeout(this.timeoutMs)
        })
        if (!accepted.includes(response.status))
            throw new Error(`WebDAV ${init.method ?? 'GET'} failed: HTTP ${response.status}`)
        return response
    }

    async test() {
        const response = await this.request(
            '',
            {
                method: 'PROPFIND',
                headers: { depth: '0' }
            },
            [200, 207]
        )
        return { success: true as const, status: response.status }
    }

    async exists(path: string) {
        const response = await fetch(this.url(path), {
            method: 'HEAD',
            headers: this.authorization
                ? { authorization: this.authorization }
                : undefined,
            signal: AbortSignal.timeout(this.timeoutMs)
        })
        if (response.status === 404) return false
        if (response.ok) return true
        if (response.status === 405) {
            const fallback = await fetch(this.url(path), {
                method: 'PROPFIND',
                headers: {
                    depth: '0',
                    ...(this.authorization
                        ? { authorization: this.authorization }
                        : {})
                },
                signal: AbortSignal.timeout(this.timeoutMs)
            })
            if (fallback.status === 404) return false
            if ([200, 207].includes(fallback.status)) return true
        }
        throw new Error(`WebDAV existence check failed: HTTP ${response.status}`)
    }

    async ensureDirectory(path: string) {
        const segments = path
            .replace(/^\/+|\/+$/g, '')
            .split('/')
            .filter(Boolean)
        let current = ''
        for (const segment of segments) {
            current = current ? `${current}/${segment}` : segment
            const response = await fetch(this.url(current), {
                method: 'MKCOL',
                headers: this.authorization
                    ? { authorization: this.authorization }
                    : undefined,
                signal: AbortSignal.timeout(this.timeoutMs)
            })
            if ([201, 301, 405].includes(response.status)) continue
            if (response.status >= 200 && response.status < 300) continue
            throw new Error(
                `WebDAV MKCOL ${current} failed: HTTP ${response.status}`
            )
        }
    }

    async get(path: string): Promise<RemoteObject | null> {
        const response = await fetch(this.url(path), {
            method: 'GET',
            headers: this.authorization
                ? { authorization: this.authorization }
                : undefined,
            signal: AbortSignal.timeout(this.timeoutMs)
        })
        if (response.status === 404) return null
        if (!response.ok)
            throw new Error(`WebDAV GET failed: HTTP ${response.status}`)
        return {
            path,
            data: Buffer.from(await response.arrayBuffer()),
            contentType: response.headers.get('content-type') ?? undefined,
            etag: response.headers.get('etag') ?? undefined
        }
    }

    async put(path: string, data: Buffer, contentType?: string) {
        const parent = path.split('/').slice(0, -1).join('/')
        if (parent) await this.ensureDirectory(parent)
        await this.request(
            path,
            {
                method: 'PUT',
                body: data,
                headers: contentType ? { 'content-type': contentType } : undefined
            },
            [200, 201, 204]
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
}
