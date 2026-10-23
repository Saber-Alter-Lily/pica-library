import axios, { type AxiosAdapter, type AxiosResponse } from 'axios'
import { requireTrustedCoverUrl, safeRasterContentType } from './url-policy'

export const MEDIA_REQUEST_TIMEOUT_MS = 20_000

/** Stateless image transport. It owns no provider login, cookie jar or database. */
export class HttpMediaClient {
    private readonly client

    constructor(
        options: { proxyUrl?: string | false; adapter?: AxiosAdapter } = {}
    ) {
        const proxy = options.proxyUrl ? new URL(options.proxyUrl) : null
        if (proxy && !['http:', 'https:'].includes(proxy.protocol))
            throw new Error('Media proxy must use HTTP or HTTPS')
        this.client = axios.create({
            proxy: proxy
                ? {
                      protocol: proxy.protocol.slice(0, -1),
                      host: proxy.hostname,
                      port: Number(
                          proxy.port || (proxy.protocol === 'https:' ? 443 : 80)
                      ),
                      auth:
                          proxy.username || proxy.password
                              ? {
                                    username: decodeURIComponent(
                                        proxy.username
                                    ),
                                    password: decodeURIComponent(proxy.password)
                                }
                              : undefined
                  }
                : false,
            adapter: options.adapter
        })
        // Do not inherit API credentials installed in global axios defaults.
        for (const name of Object.keys(this.client.defaults.headers))
            delete this.client.defaults.headers[name]
        this.client.defaults.headers.common = {}
        this.client.defaults.headers.get = {}
        delete this.client.defaults.auth
    }

    async fetchImage(target: string, maxBytes = 5 * 1024 * 1024) {
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
            throw new Error('Image size limit must be a positive integer')
        const response = await this.request(target, {
            maxBytes,
            trustedRaster: true
        })
        const data = Buffer.from(response.data)
        if (!data.length || data.byteLength > maxBytes)
            throw new Error(
                'Provider image is empty or exceeds the configured size limit'
            )
        const contentType = safeRasterContentType(
            response.headers['content-type']
        )
        if (!contentType)
            throw new Error(
                'Provider cover response is not a safe raster image'
            )
        return { data, contentType }
    }

    /** Legacy downloads retain their explicit HTTP opt-in; cover/image reads never use it. */
    async request(
        target: string,
        options: {
            maxBytes?: number
            trustedRaster?: boolean
            allowInsecureHttp?: boolean
        } = {}
    ): Promise<AxiosResponse<Buffer>> {
        const deadline = Date.now() + MEDIA_REQUEST_TIMEOUT_MS
        let current = target
        for (let redirects = 0; redirects <= 5; redirects++) {
            const url = new URL(
                options.trustedRaster
                    ? requireTrustedCoverUrl(current)
                    : current
            )
            if (
                url.protocol !== 'https:' &&
                !(
                    options.allowInsecureHttp &&
                    !options.trustedRaster &&
                    url.protocol === 'http:'
                )
            )
                throw new Error(
                    'Media downloads require HTTPS unless PICA_ALLOW_INSECURE_HTTP=true'
                )
            const remaining = deadline - Date.now()
            if (remaining <= 0)
                throw new Error('Provider media request timed out')
            let response: AxiosResponse<Buffer>
            try {
                response = await this.client.get<Buffer>(url.toString(), {
                    responseType: 'arraybuffer',
                    timeout: remaining,
                    signal: AbortSignal.timeout(remaining),
                    maxContentLength: options.maxBytes,
                    maxBodyLength: options.maxBytes,
                    maxRedirects: 0,
                    headers: { Accept: 'image/*,application/octet-stream' },
                    validateStatus: (status) => status >= 200 && status < 400
                })
            } catch (error) {
                // Axios errors contain request config/proxy credentials. Never expose that object.
                if (
                    axios.isAxiosError(error) &&
                    ['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED'].includes(
                        error.code ?? ''
                    )
                )
                    throw new Error('Provider media request timed out')
                const status = axios.isAxiosError(error)
                    ? error.response?.status
                    : undefined
                throw new Error(
                    Number.isInteger(status)
                        ? `Provider media request failed (HTTP ${status})`
                        : 'Provider media request failed'
                )
            }
            const location = response.headers.location
            if (response.status >= 300 && response.status < 400) {
                if (!location)
                    throw new Error('Provider media redirect has no location')
                current = new URL(String(location), url).toString()
                continue
            }
            return response
        }
        throw new Error('Too many media redirects')
    }
}
