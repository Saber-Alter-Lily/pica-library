# Security Audit

Status: PASS for private review candidate.

- API/media boundary: the signed API Axios client accepts trusted relative Pica API
  paths only. A separate media client follows media redirects without Authorization,
  signature, nonce, API key, cookie, account or password headers.
- Transport: media requires HTTPS by default. `PICA_ALLOW_INSECURE_HTTP=true` is an
  explicit compatibility fallback and does not change the credential-free media path.
- Logs: recursive redaction covers account, email, password, token, authorization,
  cookie, secret and API-key variants in both success and error debug output.
- User secrets: account/password come from environment variables or GitHub Secrets;
  SQLite, Bundles, IndexedDB state and artifact metadata do not store them.
- Provider constants: `src/data/headers.json` and the SDK signing constant are public
  upstream compatibility protocol constants, not user secrets. Account, password and
  login token values remain user secrets.
- Bundle/Lite: recursive validation rejects secret-shaped fields; Bundle validation
  also rejects absolute POSIX/Windows paths.
- Server/paths: loopback is the default, remote bind needs explicit opt-in,
  cross-origin writes and oversized bodies are rejected, and output paths cannot
  escape the library root.
- GitHub Artifact: user-requested GitHub Runner downloads are intentionally uploaded
  to a private Actions Artifact retained for one day. Content is not committed,
  published to Pages, attached to Releases or sent to a third-party temporary host.
- Publishing: no Pages deployment, Release, tag, npm publication or registry workflow
  was performed.

Tracked files and Git history were scanned for GitHub/AWS/private-key signatures and
non-empty account/password assignments. No user secret was detected. Literal field
names, GitHub Secret references and public provider protocol constants are expected.
