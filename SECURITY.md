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
- Non-loopback binding is rejected unless `PICA_LIBRARY_ALLOW_REMOTE=true` is set.
- Cross-origin browser writes are rejected.
- Add trusted TLS, authentication and a reverse proxy before any cross-device use;
  the current server must not be exposed directly to the public internet.

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
