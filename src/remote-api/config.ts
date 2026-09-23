export interface RemoteApiConfiguration {
    host: string
    port: number
    tokenFile: string
    allowedHosts: string[]
    allowedOrigins: string[]
}

function list(value: string | undefined) {
    return String(value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
}

function loopbackHost(value: string) {
    return ['127.0.0.1', 'localhost', '::1'].includes(value)
}

export function remoteApiConfiguration(
    enabled: boolean,
    environment: NodeJS.ProcessEnv = process.env
): RemoteApiConfiguration | null {
    if (!enabled) return null

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

    let allowedHosts = list(environment.PICA_LIBRARY_REMOTE_ALLOWED_HOSTS)
    if (!allowedHosts.length && loopbackHost(host))
        allowedHosts = ['127.0.0.1', 'localhost', '::1']
    if (!allowedHosts.length)
        throw new Error(
            'Remote API non-loopback binding requires PICA_LIBRARY_REMOTE_ALLOWED_HOSTS'
        )

    return {
        host,
        port: rawPort,
        tokenFile,
        allowedHosts,
        allowedOrigins: list(
            environment.PICA_LIBRARY_REMOTE_ALLOWED_ORIGINS
        )
    }
}
