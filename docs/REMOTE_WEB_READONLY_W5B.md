# Remote Web read-only shell — W5B

Status: **experimental read-only browser shell**.

W5B builds on W5A's bearer-to-HttpOnly-session primitive. It does not expose the existing Desktop UI and does not add PWA/offline behavior.

## User-visible scope

The shell is served only when Remote Web sessions are explicitly enabled. It provides:

- session bootstrap with the existing W5A bearer exchange;
- local library search;
- shelf listing and shelf contents;
- comic detail and covers;
- downloaded-library listing;
- downloaded-chapter Reader with single-page navigation;
- language switching for Chinese, English and Japanese;
- logout.

The Reader intentionally does not write reading progress in W5B.

## Read-only enforcement

The browser-session API allowlist is narrower than the operator bearer API allowlist.

Cookie-authenticated browser sessions may use only:

- GET application status/capabilities;
- POST library query, which is semantically read-only;
- GET downloaded library;
- GET shelves and shelf contents;
- GET comic details and covers;
- GET downloaded Reader chapter/page resources.

Browser sessions cannot write reader progress, create downloads, mutate shelves, change favorites, access provider mutation, import data, change settings, control updates, restart/shutdown the engine, or access arbitrary local files.

The long-lived bearer retains the existing W4B Remote API allowlist. W5B does not silently remove operator/API-client capabilities.

## Static shell security

The gateway serves exactly three shell resources:

- /remote/
- /remote/remote.js
- /remote/remote.css

Unknown /remote paths are not treated as a filesystem path and cannot escape the configured asset root.

Shell responses use a restrictive policy including:

- default-src 'none';
- script-src 'self';
- style-src 'self';
- img-src 'self' data:;
- connect-src 'self';
- object-src 'none';
- frame-ancestors 'none';
- worker-src 'none';
- X-Frame-Options: DENY;
- Referrer-Policy: no-referrer;
- Permissions-Policy disabling camera, microphone, geolocation, payment and USB;
- no-store caching.

The HTML contains no inline executable script or style. No CDN or third-party browser dependency is loaded.

## Browser storage boundary

The bootstrap bearer is read only from the login form and cleared immediately after session exchange.

The W5B shell does not use:

- Local Storage;
- Session Storage;
- IndexedDB;
- Cache Storage;
- Service Worker registration.

Session identity remains in the W5A __Host-pica_session HttpOnly cookie and the per-session CSRF token remains only in page memory.

## Reader behavior

W5B renders one downloaded page at a time. This avoids turning the first remote Reader iteration into a large-image queue or long-chapter DOM problem.

Only the existing safe downloaded Reader endpoints are used. Online Provider reading is not part of W5B.

## Automated evidence

The W5B gates require:

- recursive JavaScript syntax checking including web/remote/remote.js;
- source-contract tests proving no browser persistence/offline worker or disallowed API surfaces;
- gateway unit tests for the exact static asset set and security headers;
- gateway tests proving session API routes are not shadowed by static /remote routing;
- browser-session tests proving reader-progress writes are denied while bearer access remains available;
- Chromium smoke for login, local library, detail, shelves, downloaded library, Reader page navigation, language switch and logout;
- Docker/Caddy TLS validation of the actual shell, CSP, session bootstrap and read-only gateway boundary;
- the existing operator Compose preview remaining browser-session disabled by default.

## Deferred

W5C now layers an installable, online-first PWA shell on top of W5B. The W5B read-only API boundary remains unchanged, and user content is still network-only. Neither W5B nor W5C is a formal remote-Web release.

Later gates include:

- operator-friendly bootstrap/onboarding that avoids manual bearer handling;
- formal CSP/reporting policy and static-asset integrity/release provenance;
- user-content offline caching beyond W5C's static shell-only cache;
- cache partitioning and logout purge if user-content caching is ever introduced;
- multi-user/tenant isolation;
- any remote mutation workflow;
- real external-network usability/performance testing;
- formal remote-Web release/support policy.