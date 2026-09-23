export type RemoteApiTransportSecurity =
    | 'loopback-http'
    | 'tls-terminated-proxy'

export interface RemoteApiConfiguration {
    host: string
    port: number
    tokenFile: string
    allowedHosts: string[]
    allowedOrigins: string[]
    webSessions: boolean
    transportSecurity: RemoteApiTransportSecurity
}

function list(value: string | undefined) {
    return String(value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
}

function enabled(value: string | undefined) {
    return String(value ?? '').trim().toLowerCase() === 'true'
}

export function isLoopbackRemoteHost(value: string) {
    return ['127.0.0.1', 'localhost', '::1'].includes(value)
}

export function remoteApiConfiguration(
    remoteApiEnabled: boolean,
    environment: NodeJS.ProcessEnv = process.env
): RemoteApiConfiguration | null {
    if (!remoteApiEnabled) return null

    const tokenFile = String(
        environment.PICA_LIBRARY_REMOTE_TOKEN_FILE ?? ''
    ).trim()
    if (!tokenFile)
        throw new Error(
            'Remote API requires PICA_LIBRARY_REMOTE_TOKEN_FILE'
        )

    const host = String(
        environment.PICA_LIBRARY_REMOTE_HOST ?? '127.0.0.1'
    ).trim()
    if (!host) throw new Error('Remote API host is invalid')

    const rawPort = Number(environment.PICA_LIBRARY_REMOTE_PORT ?? 8787)
    if (!Number.isInteger(rawPort) || rawPort < 1 || rawPort > 65535)
        throw new Error('Remote API port must be between 1 and 65535')

    const loopback = isLoopbackRemoteHost(host)
    const behindTlsProxy = enabled(
        environment.PICA_LIBRARY_REMOTE_BEHIND_TLS_PROXY
    )
    if (!loopback && !behindTlsProxy)
        throw new Error(
            'Remote API non-loopback binding requires PICA_LIBRARY_REMOTE_BEHIND_TLS_PROXY=true and a trusted TLS-terminating reverse proxy'
        )

    let allowedHosts = list(environment.PICA_LIBRARY_REMOTE_ALLOWED_HOSTS)
    if (!allowedHosts.length && loopback)
        allowedHosts = ['127.0.0.1', 'localhost', '::1']
    if (!allowedHosts.length)
        throw new Error(
            'Remote API non-loopback binding requires PICA_LIBRARY_REMOTE_ALLOWED_HOSTS'
        )

    const allowedOrigins = list(
        environment.PICA_LIBRARY_REMOTE_ALLOWED_ORIGINS
    )
    const webSessions = enabled(
        environment.PICA_LIBRARY_REMOTE_WEB_SESSIONS
    )
    if (webSessions) {
        if (loopback || !behindTlsProxy)
            throw new Error(
                'Remote Web sessions require a non-loopback gateway behind a trusted TLS-terminating proxy'
            )
        if (!allowedOrigins.length)
            throw new Error(
                'Remote Web sessions require PICA_LIBRARY_REMOTE_ALLOWED_ORIGINS'
            )
        for (const origin of allowedOrigins) {
            let parsed: URL
            try {
                parsed = new URL(origin)
            } catch {
                throw new Error(
                    'Remote Web session origins must be valid HTTPS origins'
                )
            }
            if (
                parsed.protocol !== 'https:' ||
                parsed.origin !== origin.replace(/\/$/, '')
            )
                throw new Error(
                    'Remote Web session origins must be exact HTTPS origins'
                )
        }
    }

    return {
        host,
        port: rawPort,
        tokenFile,
        allowedHosts,
        allowedOrigins,
        webSessions,
        transportSecurity: loopback
            ? 'loopback-http'
            : 'tls-terminated-proxy'
    }
}
