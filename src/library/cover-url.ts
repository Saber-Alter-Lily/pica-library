import { isIP } from 'node:net'

export const SAFE_RASTER_CONTENT_TYPES = new Set([
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp'
])

function isPrivateIpv4(hostname: string) {
    const parts = hostname.split('.').map(Number)
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
        return true
    const [a, b] = parts
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127) ||
        a >= 224
    )
}

function isPrivateIpv6(hostname: string) {
    const value = hostname.toLowerCase().replace(/^\[|\]$/g, '')
    return (
        value === '::' ||
        value === '::1' ||
        value.startsWith('fc') ||
        value.startsWith('fd') ||
        /^fe[89ab]/.test(value) ||
        value.startsWith('ff') ||
        value.startsWith('::ffff:')
    )
}

export function trustedCoverUrl(raw: unknown): string | undefined {
    if (typeof raw !== 'string' || !raw.trim()) return undefined
    try {
        const url = new URL(raw)
        const hostname = url.hostname.toLowerCase()
        const ipHostname = hostname.replace(/^\[|\]$/g, '')
        if (
            url.protocol !== 'https:' ||
            url.username ||
            url.password ||
            !hostname ||
            hostname === 'localhost' ||
            hostname.endsWith('.localhost')
        )
            return undefined
        const version = isIP(ipHostname)
        if (
            (version === 4 && isPrivateIpv4(ipHostname)) ||
            (version === 6 && isPrivateIpv6(ipHostname))
        )
            return undefined
        return url.toString()
    } catch {
        return undefined
    }
}

export function requireTrustedCoverUrl(raw: unknown): string {
    const value = trustedCoverUrl(raw)
    if (!value) throw new Error('Provider cover URL is not trusted')
    return value
}

export function safeRasterContentType(raw: unknown): string | undefined {
    const value = String(raw ?? '')
        .split(';', 1)[0]
        .trim()
        .toLowerCase()
    return SAFE_RASTER_CONTENT_TYPES.has(value) ? value : undefined
}
