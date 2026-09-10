# Security and verification

Only install Pica Library from this repository's official Releases.

Android official signing certificate SHA-256:
`64fb87dc7d8bd6bc7b2cec92cc8c83fad3afe8cfb07591a2e53d53cbd3ab2f9d`

The Android updater verifies SHA-256, package name, version code, and signing-certificate continuity before allowing installation. Release builds use R8 shrinking/obfuscation. The updater exposes download progress and allows a stalled/failed DownloadManager task to be cancelled and restarted inside the app.

Security review is welcome. Historical source remains auditable; current private source may be provided to selected reviewers under a separate review arrangement when appropriate. Please report suspected vulnerabilities through GitHub Issues without posting secrets, tokens, account credentials, or exploit payloads containing private user data.
