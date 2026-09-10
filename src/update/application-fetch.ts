import axios from 'axios'

function configuredProxy(value = process.env.PICA_PROXY) {
    if (!value?.trim()) return null
    const parsed = new URL(value.trim())
    if (!['http:', 'https:'].includes(parsed.protocol))
        throw new Error('Only HTTP and HTTPS proxies are supported')
    const port = parsed.port
        ? Number(parsed.port)
        : parsed.protocol === 'https:'
          ? 443
          : 80
    return {
        protocol: parsed.protocol.slice(0, -1),
        host: parsed.hostname,
        port,
        auth:
            parsed.username || parsed.password
                ? {
                      username: decodeURIComponent(parsed.username),
                      password: decodeURIComponent(parsed.password)
                  }
                : undefined
    }
}

function responseHeaders(value: Record<string, unknown>) {
    const headers = new Headers()
    for (const [key, item] of Object.entries(value)) {
        if (item === undefined || item === null) continue
        headers.set(key, Array.isArray(item) ? item.join(', ') : String(item))
    }
    return headers
}

/**
 * Uses the application's configured HTTP(S) proxy for outbound GitHub traffic.
 * Native fetch stays untouched when no proxy is configured. Axios is already
 * bundled by the desktop build, so this does not add another proxy stack.
 */
export async function applicationFetch(
    input: string | URL | Request,
    init: RequestInit = {}
): Promise<Response> {
    const proxy = configuredProxy()
    if (!proxy) return fetch(input, init)

    const source = input instanceof Request ? input : null
    const url = source?.url ?? String(input)
    const headers = new Headers(source?.headers)
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    const method = String(init.method ?? source?.method ?? 'GET').toUpperCase()

    const result = await axios.request<ArrayBuffer>({
        url,
        method,
        headers: Object.fromEntries(headers.entries()),
        data: init.body ?? undefined,
        responseType: 'arraybuffer',
        maxRedirects: init.redirect === 'manual' ? 0 : 5,
        validateStatus: () => true,
        signal: init.signal ?? undefined,
        proxy
    })
    const response = new Response(Buffer.from(result.data), {
        status: result.status,
        statusText: result.statusText,
        headers: responseHeaders(result.headers as Record<string, unknown>)
    })
    const finalUrl =
        (result.request as { res?: { responseUrl?: string } } | undefined)?.res
            ?.responseUrl ?? url
    Object.defineProperty(response, 'url', { value: finalUrl })
    return response
}

export const applicationFetchInternals = { configuredProxy }
