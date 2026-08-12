# Security Audit

Status: PASS for private review candidate.

- Credentials: empty `.env.template` only; `.env*` ignored except template; account
  and password read from environment or Repository Secrets.
- Logs: no code prints credential values. Workflow validation prints only missing-secret guidance.
- Bundle: recursive validation rejects password/token/cookie/secret/API-key fields
  and absolute POSIX/Windows paths.
- Database and user data: `*.db`, WAL/SHM, `.pica-library/`, exports, downloads and artifacts are ignored.
- GitHub Secrets: manual workflows reference `secrets.PICA_ACCOUNT` and
  `secrets.PICA_PASSWORD`; artifacts are short lived and contain no database.
- Server: defaults to `127.0.0.1`, rejects remote binding without an explicit opt-in,
  rejects cross-origin writes and caps request bodies.
- Paths: invalid/control characters and Windows reserved names are sanitized,
  segments are length-limited, unknown placeholders fail, resolved destinations
  cannot escape the library root.
- Artifacts: GitHub output is limited to `library/`, structured result/manifest and
  conditional errors; third-party file upload code was removed.
- Publishing: no Pages deployment, release, package publish or registry workflow exists.

The tracked files and Git history were scanned for common GitHub/AWS/private-key and
non-empty credential assignment patterns. No secrets were detected. Literal field
names and GitHub Secret references are expected safe matches.
