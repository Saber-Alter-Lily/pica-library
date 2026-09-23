import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const REMOTE_WEB_SESSION_COOKIE = '__Host-pica_session'
export const DEFAULT_REMOTE_WEB_SESSION_TTL_MS = 8 * 60 * 60 * 1000
const DEFAULT_MAX_SESSIONS = 32

export interface RemoteWebSession {
    key: string
    origin: string
    csrfToken: string
    createdAt: number
    expiresAt: number
}

function digest(value: string) {
    return createHash('sha256').update(value).digest('hex')
}

function safeEqual(left: string, right: string) {
    const a = createHash('sha256').update(left).digest()
    const b = createHash('sha256').update(right).digest()
    return timingSafeEqual(a, b)
}

function cookieValue(header: string | undefined) {
    if (!header) return null
    for (const part of header.split(';')) {
        const index = part.indexOf('=')
        if (index <= 0) continue
        const name = part.slice(0, index).trim()
        if (name !== REMOTE_WEB_SESSION_COOKIE) continue
        const value = part.slice(index + 1).trim()
        return value || null
    }
    return null
}

export function remoteWebSessionCookie(token: string, ttlMs: number) {
    const maxAge = Math.max(1, Math.floor(ttlMs / 1000))
    return `${REMOTE_WEB_SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`
}

export function clearRemoteWebSessionCookie() {
    return `${REMOTE_WEB_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
}

export class RemoteWebSessionStore {
    private readonly sessions = new Map<string, RemoteWebSession>()

    constructor(
        private readonly ttlMs = DEFAULT_REMOTE_WEB_SESSION_TTL_MS,
        private readonly maxSessions = DEFAULT_MAX_SESSIONS,
        private readonly now: () => number = Date.now
    ) {
        if (!Number.isFinite(ttlMs) || ttlMs < 60_000)
            throw new Error('Remote Web session TTL must be at least 60 seconds')
        if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 256)
            throw new Error('Remote Web session capacity is invalid')
    }

    create(origin: string) {
        this.prune()
        while (this.sessions.size >= this.maxSessions) {
            const oldest = [...this.sessions.values()].sort(
                (a, b) => a.createdAt - b.createdAt
            )[0]
            if (!oldest) break
            this.sessions.delete(oldest.key)
        }
        const token = randomBytes(32).toString('base64url')
        const csrfToken = randomBytes(24).toString('base64url')
        const createdAt = this.now()
        const session: RemoteWebSession = {
            key: digest(token),
            origin,
            csrfToken,
            createdAt,
            expiresAt: createdAt + this.ttlMs
        }
        this.sessions.set(session.key, session)
        return {
            token,
            session: { ...session },
            cookie: remoteWebSessionCookie(token, this.ttlMs)
        }
    }

    authenticate(cookieHeader: string | undefined) {
        this.prune()
        const token = cookieValue(cookieHeader)
        if (!token) return null
        const key = digest(token)
        const session = this.sessions.get(key)
        if (!session) return null
        if (session.expiresAt <= this.now()) {
            this.sessions.delete(key)
            return null
        }
        return { ...session }
    }

    csrfMatches(session: RemoteWebSession, value: string | undefined) {
        return Boolean(value) && safeEqual(session.csrfToken, String(value))
    }

    revoke(session: RemoteWebSession) {
        this.sessions.delete(session.key)
    }

    activeCount() {
        this.prune()
        return this.sessions.size
    }

    clear() {
        this.sessions.clear()
    }

    private prune() {
        const now = this.now()
        for (const [key, session] of this.sessions)
            if (session.expiresAt <= now) this.sessions.delete(key)
    }
}
