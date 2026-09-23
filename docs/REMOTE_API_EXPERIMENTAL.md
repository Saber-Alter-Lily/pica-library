# Experimental authenticated Remote API

This document describes the W4B server boundary. It is an experimental,
opt-in API surface, not a formal remote Web/PWA release.

## Architecture

The normal Pica Library Web/Desktop service remains bound to loopback.
Headless mode may additionally start a separate Remote API gateway with:

```text
remote client
    -> trusted TLS terminator
    -> authenticated Remote API gateway
    -> loopback-only Pica Library engine
```

The gateway is not the Desktop controller. It forwards only an explicit
library/reader allowlist and never forwards its bearer credential upstream.

For TLS termination, prefer a maintained reverse proxy rather than implementing
TLS inside Pica Library. Caddy is the reference topology for W4B because it is
open source and provides automatic HTTPS plus a standard `reverse_proxy`
primitive. nginx, Traefik, or equivalent maintained TLS proxies are also valid.

## Enablement

Remote API is available only when the process is headless and started with:

```text
--headless --remote-api
```

The following configuration is required:

- `PICA_LIBRARY_REMOTE_TOKEN_FILE`: path to a strong bearer-token file.
- `PICA_LIBRARY_REMOTE_HOST`: bind host; defaults to `127.0.0.1`.
- `PICA_LIBRARY_REMOTE_PORT`: bind port; defaults to `8787`.
- `PICA_LIBRARY_REMOTE_ALLOWED_HOSTS`: comma-separated Host allowlist.
- `PICA_LIBRARY_REMOTE_ALLOWED_ORIGINS`: optional browser Origin allowlist.

For any non-loopback bind, all of the following are mandatory:

- `PICA_LIBRARY_REMOTE_BEHIND_TLS_PROXY=true`;
- a non-empty `PICA_LIBRARY_REMOTE_ALLOWED_HOSTS`;
- an actual trusted TLS-terminating proxy in front of the plaintext gateway.

The declaration is a fail-closed deployment assertion; it does not add TLS by
itself.

On POSIX platforms, the token file must be a regular file owned by the current
user or root, must not be accessible by other users, and must not be group
writable/executable. A `0600` file owned by the service user is the preferred
shape. The token is read at startup and is never returned by status/capability
APIs.

## Remote route allowlist

Authenticated callers may access:

- application status and capabilities;
- faceted library query;
- downloaded-library listing;
- shelf listing and shelf contents;
- comic details and covers;
- downloaded-reader chapters and page bytes;
- reader progress read/write.

The gateway intentionally does **not** expose:

- `/api/v1/desktop/*`;
- setup/account/credential endpoints;
- import;
- updater/apply/restart/shutdown controls;
- arbitrary provider mutation;
- arbitrary local files.

`GET /healthz` is the only unauthenticated route. It returns only minimal
service health/identity metadata and remains subject to Host validation and the
remote rate limit.

## Request protections

- Bearer tokens are compared through fixed-length SHA-256 digests with
  constant-time comparison.
- Host is validated before authentication.
- Browser Origin is rejected unless explicitly allowlisted.
- Failed authentication attempts are rate-limited as well as successful API
  traffic.
- Request bodies are bounded.
- Gateway Authorization and Origin headers are stripped before loopback
  forwarding.
- Redirect following is disabled.
- Audit logs contain remote address, method, path, and status, but not bearer
  token values.

## Browser/PWA boundary

This gateway is an API foundation for W4B. It does not yet provide the CORS,
session/bootstrap, offline shell, or browser secret-handling model required by
W5 Remote Web/PWA. Do not treat successful bearer API access as a remotely
deployable Web UI.

## Release state

Remote API remains experimental. It does not change the product version,
formal release channel, Linux `distributionReady`, or Linux `selfUpdate`
capability.
