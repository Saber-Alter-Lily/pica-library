import { describe, expect, it } from 'vitest'
import {
    REMOTE_WEB_SESSION_COOKIE,
    RemoteWebSessionStore,
    clearRemoteWebSessionCookie,
    remoteWebSessionCookie
} from '../../src/remote-api/browser-session'

describe('Remote Web in-memory session W5A', () => {
    it('uses a host-only HttpOnly Secure Strict cookie without Domain', () => {
        const cookie = remoteWebSessionCookie('abc_123-XYZ', 60_000)
        expect(cookie).toContain(
            `${REMOTE_WEB_SESSION_COOKIE}=abc_123-XYZ`
        )
        expect(cookie).toContain('Path=/')
        expect(cookie).toContain('Max-Age=60')
        expect(cookie).toContain('HttpOnly')
        expect(cookie).toContain('Secure')
        expect(cookie).toContain('SameSite=Strict')
        expect(cookie).not.toMatch(/Domain=/i)

        const cleared = clearRemoteWebSessionCookie()
        expect(cleared).toContain('Max-Age=0')
        expect(cleared).toContain('HttpOnly')
        expect(cleared).toContain('Secure')
        expect(cleared).toContain('SameSite=Strict')
    })

    it('stores only a digest key and expires sessions in memory', () => {
        let now = 1_000
        const store = new RemoteWebSessionStore(
            60_000,
            4,
            () => now
        )
        const created = store.create('https://reader.example')
        expect(created.token).toMatch(/^[A-Za-z0-9_-]+$/)
        expect(created.session.key).not.toBe(created.token)
        expect(created.session.key).toMatch(/^[0-9a-f]{64}$/)
        expect(created.session.origin).toBe('https://reader.example')
        expect(
            store.authenticate(
                `other=x; ${REMOTE_WEB_SESSION_COOKIE}=${created.token}`
            )
        ).toMatchObject({
            key: created.session.key,
            origin: 'https://reader.example'
        })
        expect(
            store.csrfMatches(
                created.session,
                created.session.csrfToken
            )
        ).toBe(true)
        expect(store.csrfMatches(created.session, 'wrong')).toBe(false)

        now += 60_001
        expect(
            store.authenticate(
                `${REMOTE_WEB_SESSION_COOKIE}=${created.token}`
            )
        ).toBeNull()
        expect(store.activeCount()).toBe(0)
    })

    it('keeps capacity bounded and clear invalidates all process-local sessions', () => {
        let now = 1_000
        const store = new RemoteWebSessionStore(
            60_000,
            2,
            () => now
        )
        const first = store.create('https://reader.example')
        now += 1
        const second = store.create('https://reader.example')
        now += 1
        const third = store.create('https://reader.example')

        expect(store.activeCount()).toBe(2)
        expect(
            store.authenticate(
                `${REMOTE_WEB_SESSION_COOKIE}=${first.token}`
            )
        ).toBeNull()
        expect(
            store.authenticate(
                `${REMOTE_WEB_SESSION_COOKIE}=${second.token}`
            )
        ).not.toBeNull()
        expect(
            store.authenticate(
                `${REMOTE_WEB_SESSION_COOKIE}=${third.token}`
            )
        ).not.toBeNull()

        store.clear()
        expect(store.activeCount()).toBe(0)
    })
})
