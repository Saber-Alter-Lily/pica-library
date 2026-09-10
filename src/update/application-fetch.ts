import axios from 'axios'

const nativeFetch = globalThis.fetch.bind(globalThis)

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

function loopback(url: string) {
    try {
        const host = new URL(url).hostname.toLowerCase()
        return host === 'localhost' || host === '127.0.0.1' || host === '::1'
    } catch {
        return false
    }
}

function publicGitHubRead(url: string, method: string, headers: Headers) {
    try {
        const host = new URL(url).hostname.toLowerCase()
        return (
            ['GET', 'HEAD'].includes(method) &&
            ['api.github.com', 'github.com', 'raw.githubusercontent.com'].includes(host) &&
            !headers.has('authorization') &&
            !headers.has('cookie')
        )
    } catch {
        return false
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
 * Uses the application's configured HTTP(S) proxy for outbound desktop fetches.
 * Native fetch stays untouched when no proxy is configured, and loopback
 * traffic is always direct so Desktop/Web health checks cannot be proxied.
 *
 * Public GitHub reads are special-cased: some local HTTP proxy stacks answer
 * GitHub API requests with 401/407 or share an exhausted GitHub rate-limit.
 * When that happens, retry the same anonymous read once through Node's native
 * direct transport before returning the proxy response. Requests carrying
 * Authorization or Cookie headers never take this fallback.
 */
export async function applicationFetch(
    input: string | URL | Request,
    init: RequestInit = {}
): Promise<Response> {
    const source = input instanceof Request ? input : null
    const url = source?.url ?? String(input)
    const proxy = configuredProxy()
    if (!proxy || loopback(url)) return nativeFetch(input, init)

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

    if (
        publicGitHubRead(url, method, headers) &&
        [401, 403, 407, 429].includes(result.status)
    ) {
        try {
            return await nativeFetch(input, init)
        } catch {
            // Keep the original proxy response so callers retain an actionable
            // HTTP status instead of turning a reachable proxy path into a
            // generic direct-network exception.
        }
    }

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

// UpdateManager is imported by the desktop entry point. Installing the wrapper
// here makes every later outbound desktop fetch (release download and Star
// verification included) honor the saved proxy without changing each call site.
if (globalThis.fetch !== applicationFetch)
    globalThis.fetch = applicationFetch as typeof fetch

export const applicationFetchInternals = { configuredProxy, loopback, publicGitHubRead }
