# Remote Web installable online-first PWA shell — W5C

Status: **experimental installable Remote Web shell; user content remains network-only**.

W5C builds on W5A browser sessions and the W5B read-only shell. Its purpose is to make the Remote Web surface installable on supported browsers without silently introducing offline copies of library data, covers, manga pages, session responses, or credentials.

## Open-source design reference

The design follows the separation seen in mature self-hosted Web clients:

- Komga publishes a standard Web App Manifest and install icons while serving Web resources with conservative cache policy;
- Jellyfin separates its Web client manifest/service-worker layer from media transport and does not treat service-worker presence as permission to indiscriminately cache media.

Pica therefore treats **installability** and **user-content offline storage** as separate gates.

## Installability

The Remote Web shell now publishes:

- `/remote/manifest.webmanifest`;
- `/remote/icon.svg`;
- `/remote/sw.js`.

The manifest is scoped to `/remote/`, starts at `/remote/`, uses `display: standalone`, and identifies the application as `Pica Library Remote`. The scalable icon is declared at both 192x192 and 512x512 so Chromium installability checks see the expected manifest sizes while the project keeps one reviewed SVG source.

The service worker is registered with scope `/remote/`; it is never granted a broader root scope.

## Shell-only cache

The W5C service worker has one explicit allowlist:

- `/remote/`;
- `/remote/remote.js`;
- `/remote/remote.css`;
- `/remote/manifest.webmanifest`;
- `/remote/icon.svg`.

No other request is intercepted.

In particular, the worker does not contain or cache:

- `/api/` routes;
- `/remote/v1/` session routes;
- comic covers;
- Reader page bytes;
- downloaded-library JSON;
- bearer Authorization values;
- `__Host-pica_session` values.

For allowlisted shell assets the strategy is **network first, cache fallback**. When online, the browser prefers the current server asset and refreshes the shell cache. If the network is unavailable, only those static shell resources may fall back to Cache Storage.

## Offline behavior

W5C deliberately supports only an **offline application shell**.

When offline:

- the installed Pica Library Remote shell can start;
- the sign-in/session UI can render;
- library, shelf, cover, Reader and session/API requests remain network-only and therefore unavailable;
- no previously viewed manga page or API response is served from Cache Storage.

This is not offline manga reading.

## Session and browser-storage boundary

W5A/W5B rules remain unchanged:

- the long-lived bearer is never persisted in browser storage;
- the browser session remains in the `__Host-pica_session` HttpOnly/Secure/Strict cookie;
- CSRF state remains in page memory;
- Local Storage, Session Storage and IndexedDB are not used for authentication/session state.

The service worker cannot read HttpOnly cookies and its route allowlist never includes session or API endpoints.

## CSP changes

W5B's restrictive CSP remains in force. W5C changes only two directives required for the installable shell:

- `manifest-src 'self'`;
- `worker-src 'self'`.

`default-src 'none'`, same-origin script/style/connect/image restrictions, `object-src 'none'`, `frame-ancestors 'none'`, no-referrer, DENY framing and restrictive Permissions-Policy remain.

## Capability model

`remoteWebPwa` is reported separately from:

- `remoteApi`;
- `remoteWebSessions`;
- `remoteWebShell`.

This prevents clients or operators from equating Remote API availability with an installable browser surface.

The normal Server Compose preview still does not configure browser Origins or enable Remote Web sessions, so Remote Web shell/PWA remains opt-in there.

## Automated evidence

W5C requires:

- manifest/schema/scope/icon source-contract tests;
- service-worker source audit proving only the five shell paths are cacheable;
- recursive Web syntax checks including `sw.js`;
- gateway tests for manifest/worker/icon fixed routes and CSP;
- Chromium proof that the worker registers, Cache Storage contains only shell assets, and an offline reload renders the shell while API access fails;
- Docker/Caddy TLS proof for manifest, worker, icon, PWA capability and CSP;
- all existing Linux/macOS/Windows ARM64/Desktop/Android gates to remain green.

## Deferred

Explicitly deferred beyond W5C:

- offline caching of covers, manga pages, library JSON or Reader data;
- cache partitioning by user/session;
- logout-driven deletion of user-content caches;
- cache quota/eviction UX;
- background sync;
- multi-user/tenant isolation;
- remote mutation workflows;
- formal Remote Web/PWA release and support policy.

User-content offline support must not be added until cache identity, partitioning, purge, quota and multi-user threat boundaries are designed and reviewed.