/**
 * CORE-LIB-04c-02c-02a: original Desktop HTTP request admission during updater
 * handoff. This is a process-local HTTP fence, NOT a global file write barrier.
 *
 * Reuses the real Pica Library HTTP server and UpdateManager rather than a new
 * updater or scheduler. It blocks incoming HTTP work while the helper starts,
 * and refuses handoff while another admitted HTTP request is in flight.
 *
 * Background workers, WebDAV, mobile-bridge sockets, source-worker processes,
 * filesystem consumers and external writers remain separate unproven gates.
 */
export class DesktopHttpHandoffError extends Error {
    constructor(readonly code:
        'DESKTOP_HTTP_ACTIVE_REQUESTS' | 'DESKTOP_HTTP_ALREADY_FROZEN'
    ) {
        super(code === 'DESKTOP_HTTP_ACTIVE_REQUESTS'
            ? 'Finish active Reader and library requests before updating.'
            : 'An update handoff is already in progress.')
        this.name = 'DesktopHttpHandoffError'
    }
}

// The actual Desktop helper health probe uses /api/v1/desktop/status.
// Do NOT exempt unrelated /status (a static/Web fallback) from the freeze.
const diagnostics = new Set([
    '/api/v1/desktop/status', '/api/v1/update/progress'
])

/** Does not inspect the request body, profile, credentials, PID or filesystem. */
export class DesktopHttpHandoffFence {
    private activeRequests = 0
    private frozenOwner: symbol | null = null

    get pendingRequests(): number {
        return this.activeRequests
    }

    get frozen(): boolean {
        return this.frozenOwner !== null
    }

    /**
     * Synchronous per-request admission. Called by the ORIGINAL HTTP server
     * only after its existing local-host/origin/CSRF checks.
     *
     * Return null to send HTTP 503. The returned closure is called at finish
     * or close; it is safe to call twice. Only the pre-existing authenticated
     * POST update/apply command is exempt, since it initiates this freeze.
     */
    enter(method: string, pathname: string): (() => void) | null {
        if (method === 'POST' && pathname === '/api/v1/update/apply')
            return () => undefined
        if (this.frozenOwner !== null) {
            if (method === 'GET' && diagnostics.has(pathname))
                return () => undefined
            return null
        }
        this.activeRequests++
        let released = false
        return () => {
            if (released) return
            released = true
            this.activeRequests--
        }
    }

    /**
     * Acquired synchronously before awaiting UpdateManager.apply(). As long
     * as the returned rollback closure is held, any new non-diagnostic HTTP
     * activity is refused. The caller must execute rollback on helper startup
     * failure, but KEEP the fence frozen after successful helper acknowledgment
     * until the ordinary shutdown/OS process proof completes.
     */
    freezeForHandoff(): () => void {
        if (this.frozenOwner)
            throw new DesktopHttpHandoffError('DESKTOP_HTTP_ALREADY_FROZEN')
        if (this.activeRequests !== 0)
            throw new DesktopHttpHandoffError('DESKTOP_HTTP_ACTIVE_REQUESTS')
        const owner = Symbol('owned-http-update-handoff')
        this.frozenOwner = owner
        let restored = false
        return () => {
            if (restored) return
            restored = true
            if (this.frozenOwner === owner) this.frozenOwner = null
        }
    }
}
