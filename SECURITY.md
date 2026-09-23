# Security and content policy

## Credentials

- Account and password values are read only from process environment variables,
  Repository Secrets, or a Git-ignored `.env.local` file.
- The SDK redacts credential-shaped fields from debug success and error output.
- SQLite, portable Bundles and artifact metadata do not store account, password,
  login token, cookie, or other user secrets.
- Never commit `.env.local`, databases, personal exports, or downloaded content.

Upstream API signing values in `src/data/headers.json` and the SDK are public
provider protocol compatibility constants. They are not user credentials. Real
account, password and login-token values remain user secrets and must never enter
source code, logs, Bundles, or artifact metadata.

## Media requests

Pica API requests and media-host requests use separate clients. Only the trusted
Pica API client receives signing and login authorization headers. Media requests
never receive those credentials, including redirects and the explicitly opted-in
`PICA_ALLOW_INSECURE_HTTP=true` fallback. HTTPS is required by default.

## Local web service

- The service listens on `127.0.0.1` by default.
- Unauthenticated non-loopback binding is rejected unconditionally. The historical
  `PICA_LIBRARY_ALLOW_REMOTE` bypass is not supported.
- Cross-origin browser writes are rejected.
- Headless / Docker mode does not change this network boundary.
- Remote Web / NAS access never exposes the local Desktop/Web controller. The
  experimental Remote API is a separate, bearer-authenticated allowlist gateway,
  enabled only by explicit headless opt-in.
- The Remote API defaults to loopback. A non-loopback bind is rejected unless the
  operator explicitly declares a trusted TLS-terminating reverse proxy, provides
  an allowed Host list, and supplies the bearer secret through a protected file.
- The gateway does not implement TLS itself. Use a maintained reverse proxy such
  as Caddy, nginx, Traefik, or an equivalent TLS terminator. Do not publish the
  gateway's plaintext port directly to an untrusted network.
- Browser/PWA remote access is a later surface. The Remote API gateway does not
  make the local Web UI remotely accessible and does not expose Desktop
  management, setup, import, update, shutdown, or credential endpoints.

## Downloaded content

- Downloaded content is never committed to Git, published to Pages, or attached
  to a GitHub Release automatically.
- The manual GitHub Runner intentionally uploads user-requested downloads as a
  private GitHub Actions Artifact. The download workflow currently retains that
  artifact for one day.
- The project does not upload downloads to a third-party temporary file host.
- Users are responsible for having the right to access downloaded content and
  for complying with provider rules, applicable law, and redistribution limits.

## Reporting

Report credential exposure, path traversal, cross-origin writes, or arbitrary file
overwrite privately through a GitHub Security Advisory. Do not attach real account
values, tokens, personal collection exports, or downloaded files to public issues.
