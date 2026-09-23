# Remote Web session bootstrap — W5A

Status: **experimental session primitive only**.

W5A does not expose the existing Desktop UI as a public Web app and does not claim PWA/offline support. It only adds the authentication/session layer required before a browser-facing shell can be designed safely.

## Boundary

The W4B Remote API keeps its protected long-lived bearer token. W5A allows that bearer to bootstrap a bounded browser session, so the bearer does not need to be stored in browser JavaScript, Local Storage, IndexedDB, service-worker caches, or a remotely served HTML bundle.

Browser sessions are disabled by default. Enabling PICA_LIBRARY_REMOTE_WEB_SESSIONS=true requires a non-loopback Remote API, PICA_LIBRARY_REMOTE_BEHIND_TLS_PROXY=true, a Host allowlist, and at least one exact HTTPS PICA_LIBRARY_REMOTE_ALLOWED_ORIGINS value.

The operator Server Compose preview intentionally leaves browser sessions disabled.

## Session security contract

- Cookie name: __Host-pica_session.
- Cookie attributes: Path=/; HttpOnly; Secure; SameSite=Strict; no Domain.
- The raw opaque session token exists only in the cookie. The gateway stores only its SHA-256 digest in process memory.
- Default TTL is eight hours and the in-memory session table is bounded.
- Process restart or gateway close invalidates all browser sessions.
- The long-lived bearer is never copied into session response headers or body.

## CSRF and Origin

POST /remote/v1/session/bootstrap requires both the existing bearer and an exact allowlisted HTTPS Origin. A new session is bound to that Origin and receives a separate random CSRF token.

Session-authenticated state-changing requests require the same Origin plus X-Pica-CSRF. Missing or mismatched Origin/CSRF returns 403. Existing bearer-authenticated API clients retain the W4B behavior and are not forced through browser CSRF checks.

Session endpoints:
- POST /remote/v1/session/bootstrap
- GET /remote/v1/session
- POST /remote/v1/session/logout

## Unchanged W4B allowlist

W5A does not expose Desktop management, setup/account credentials, import, updater/restart/shutdown, arbitrary provider mutation, or arbitrary local files. Bearer headers, session cookies, and browser Origin are not forwarded to the loopback engine.

## Automated evidence

Unit and Docker TLS gates verify fail-closed configuration, exact cookie attributes, cookie-only reads, CSRF-protected writes, credential/header stripping, bearer non-disclosure, and session invalidation after Pica process restart while bearer API access recovers.

## Deferred

Remote Web UI, CSP/static shell policy, operator bootstrap UX, PWA/service worker/offline caching, cache purge, multi-user isolation, remote provider mutation, and formal remote Web release/support policy remain later W5 gates.