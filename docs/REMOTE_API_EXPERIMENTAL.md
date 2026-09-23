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

The automated Docker acceptance pins the current Caddy `2.11.4-alpine`
official image for reproducibility. The CI topology keeps the Pica container
unpublished on the host, exposes only Caddy HTTPS, verifies Caddy's internal CA
instead of disabling certificate validation, and confirms that the authenticated
path recovers after the Pica container restarts. `tls internal` is strictly an
isolated CI mechanism; ordinary deployments should use a real hostname so Caddy
can obtain and renew a trusted certificate.

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

## Docker TLS acceptance boundary

The experimental Docker gate models the intended trust topology:

```text
host/browser
    -> HTTPS only
    -> Caddy
    -> private Docker network
    -> Pica Remote API :8787
    -> loopback-only application engine
```

The Pica container itself has no published host port. The bearer token is stored
in a dedicated read-only volume as a `0600` file owned by the non-root Pica
runtime identity, and is not injected through container environment metadata.
The gate verifies unauthenticated rejection, Host/Origin rejection, Desktop
management denial, secret non-disclosure in logs, and restart recovery.

This is still not a deployment release. A formal Docker/Server channel must
add an operator-facing compose/secret setup, image registry/signing policy,
versioned image promotion, health-driven replacement and rollback evidence.

## Image replacement and rollback gate

The Docker workflow also pins the first accepted W4B authenticated Remote API
image as a baseline. It builds that historical image and the candidate image as
distinct immutable source builds, seeds one external `/config` volume, and
then exercises this sequence:

1. start the baseline image and record library, shelf, task and schema state;
2. stop the baseline cleanly and create a tar snapshot of the external config
   volume;
3. start the candidate image against the same volume and verify inherited state;
4. create candidate-only state;
5. if the candidate schema is newer, require the normal pre-migration database
   backup;
6. stop the candidate, restore the pre-candidate volume snapshot, and start the
   baseline image again;
7. verify the baseline source identity and state return, while candidate-only
   state disappears.

This follows Docker's volume backup/restore model rather than treating image
rollback as data rollback. The image and the mutable volume are separate
artifacts and must be handled separately during recovery.

## Operator Compose preview

The reviewed operator topology lives at
`packaging/docker/server-preview/compose.yaml`, with the deployment and
recovery runbook in `docs/SERVER_DOCKER_PREVIEW_DEPLOYMENT.md`.

The Compose bundle preserves the same W4B trust boundary:

- a one-shot network-disabled init service converts the operator's file secret
  into the private `0600`, UID/GID 10001 runtime secret;
- the long-running Pica service is non-root, read-only, capability-dropped and
  has no published host port;
- Pica and Caddy communicate over an internal backend network while separate
  egress networks retain Provider/ACME access;
- Caddy starts only after Pica's Remote API healthcheck passes and remains the
  only host ingress;
- image promotion requires a stopped-volume snapshot and explicit rollback
  procedure.

The CI acceptance renders the real Compose model, boots the services with an
isolated internal-CA Caddyfile, validates certificate trust, authentication and
management-route denial, and checks restart recovery. Production deployments
use the normal Caddyfile and a real DNS hostname.

## Browser/PWA boundary

W5A adds an opt-in bearer-to-browser-session primitive with an in-memory
HttpOnly/Secure/Strict cookie, exact HTTPS Origin binding and CSRF protection.
It is disabled by default and documented in
`docs/REMOTE_WEB_SESSION_W5A.md`.

W5B adds an isolated read-only Remote Web shell for local-library browse,
shelves, downloaded content and downloaded Reader access. The browser-session
allowlist is narrower than the bearer API and blocks reader-progress mutation.

This still does not provide PWA/offline cache, multi-user isolation, provider
mutation, or a polished operator UX for supplying the long-lived bearer. The
operator Server Compose preview keeps browser sessions/shell disabled by
default.

## Release state

Remote API remains experimental. It does not change the product version,
formal release channel, Linux `distributionReady`, or Linux `selfUpdate`
capability.

After the TLS and image-replacement gates pass, the remaining W4B work is
operator-facing deployment packaging: a reviewed Compose/secret setup, pinned
published-image provenance, health-driven promotion procedure, and a documented
rollback command/path. The W5A session primitive is additive and opt-in; the
browser application/PWA layers remain later gates.
