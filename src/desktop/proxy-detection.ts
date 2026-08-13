import net from 'node:net'

export type ProxyCandidate = {
    url: string
    source: 'saved' | 'windows' | 'environment' | 'loopback'
}

const KNOWN_PORTS = [7890, 7891, 7897, 10809, 1080, 8080, 8888]

export function redactProxyUrl(input: string) {
    try {
        const value = new URL(input)
        if (value.username || value.password) {
            value.username = '***'
            value.password = '***'
        }
        return value.toString().replace(/\/$/, '')
    } catch {
        return '***'
    }
}

export function proxyCandidates(
    input: {
        saved?: string
        windows?: string
        environment?: Record<string, string | undefined>
        listeningPorts?: number[]
    } = {}
): ProxyCandidate[] {
    const result: ProxyCandidate[] = []
    const add = (url: string | undefined, source: ProxyCandidate['source']) => {
        if (!url?.trim()) return
        try {
            const value = new URL(url.trim())
            if (!['http:', 'https:'].includes(value.protocol)) return
            const normalized = value.toString().replace(/\/$/, '')
            if (!result.some((candidate) => candidate.url === normalized))
                result.push({ url: normalized, source })
        } catch {
            // Ignore malformed or PAC values; detection must never guess.
        }
    }
    add(input.saved, 'saved')
    add(input.windows, 'windows')
    const env = input.environment ?? process.env
    add(env.HTTPS_PROXY, 'environment')
    add(env.HTTP_PROXY, 'environment')
    add(env.ALL_PROXY, 'environment')
    for (const port of input.listeningPorts ?? [])
        if (KNOWN_PORTS.includes(port))
            add(`http://127.0.0.1:${port}`, 'loopback')
    return result
}

export function knownProxyPorts() {
    return [...KNOWN_PORTS]
}

export async function isLoopbackListening(port: number, timeoutMs = 200) {
    return await new Promise<boolean>((resolve) => {
        const socket = net.createConnection({ host: '127.0.0.1', port })
        const finish = (value: boolean) => {
            socket.destroy()
            resolve(value)
        }
        socket.setTimeout(timeoutMs, () => finish(false))
        socket.once('connect', () => finish(true))
        socket.once('error', () => finish(false))
    })
}
