[简体中文](README.md) | English

# Pica Library

Turn a Pica collection into a durable local manga library for organizing, discovering, downloading, reading, and cross-device access.

**Windows 10/11 x64 · Android Preview · current source is open again.**

## Current versions

- **Windows / Desktop:** v0.3.8
- **Android Preview:** v35 · 0.1.0-alpha8.8-account-auth-theme-decouple
- **Public source:** Alpha8.8

## Alpha8.8

- **Authenticated GitHub Star access:** personalization no longer accepts a public username and infers Star state. Desktop and Android use GitHub Device Flow, identify the authenticated account, and check the current user's Star of `Saber-Alter-Lily/pica-library`. The access token is transient and is not persisted.
- **Per-device active themes:** Desktop may sync `.pica-theme` packs to Android, but it no longer syncs `activeThemeId`. Desktop and Android independently choose which installed theme is active.
- **Versioned startup disclaimer:** Desktop/Web and Android show an open-source-tool usage notice on first run; acknowledgement is device-local and the notice appears again only when its version changes. The Windows package includes `DISCLAIMER.md`.
- **Alpha8.7 improvements retained:** unified Settings hub, improved personalization layout, collapsed finished-download history, and proxy-aware update networking remain in place.

### Downloads

Windows v0.3.8 and Android v35 will use the existing in-app update channels after the formal release is published. Until then, GitHub Releases `latest` remains the authoritative stable version.

## Main features

- **Library:** sync favorites and filter by author, tag, category, and shelf.
- **Personal recommendations:** generate explainable recommendation batches from the local collection profile.
- **Online browsing:** favorites, search, categories, and 24-hour / 7-day / 30-day rankings.
- **Download and read:** manage downloads, retries, reading progress, and local caches.
- **Desktop ↔ Android:** a paired phone can read comics already downloaded by Desktop and receive theme packs and selected state; each device keeps its own active theme.
- **WebDAV:** an optional fallback source for mobile reading while Desktop is offline.
- **Updates:** Desktop uses GitHub Release API with a release-file fallback path; Android Preview verifies version, SHA-256, package name, and the fixed official signing identity before installation.

## Personalization

The official-build personalization gate is a GitHub Star community reward, not a paid feature:

1. Star this repository.
2. Choose GitHub account authentication in Desktop or Android personalization settings.
3. Approve the GitHub Device Flow request.
4. Pica Library identifies the currently authenticated account and checks that account's Star of this repository.
5. Only the verified GitHub username, immutable user ID, and verification timestamp are retained locally; the OAuth access token is not persisted.
6. Desktop can create, import, and sync `.pica-theme` packs, while Desktop and Android independently retain their selected active theme.

## Usage notice

Pica Library is an open-source, local-first personal digital-content management tool. It does not sell, host, or redistribute manga content. Users are responsible for ensuring that account use, access, downloading, storage, reading, and backups comply with applicable law, platform terms, copyright, and other permissions. See [DISCLAIMER.md](DISCLAIMER.md) for the full notice.

## Open source and security

The repository does not contain official Android signing private keys/keystores, account credentials, CI secrets, local databases, downloaded comics, or user caches. User data stays local by default. Windows credentials are protected with DPAPI for the current Windows user. Official binaries remain tied to published SHA-256 values, build transparency metadata, and the fixed Android Preview signing identity.

## Get started

1. Download and fully extract the Windows ZIP.
2. Double-click `Pica Library.exe`.
3. Read and acknowledge the versioned usage notice.
4. Finish account, optional proxy, and library-folder setup.
5. Sync favorites and start using the library.
6. Pair Android using the Desktop-provided connection information when needed.

See the [quick start](docs/quick-start.en.md) for the guided flow.

## Development

```bash
pnpm install --frozen-lockfile
pnpm web:check
pnpm build
pnpm test:unit
```

The Android project lives under `mobile/android-alpha2`. Official Android release signing private keys are not stored in this repository.

## More

[Quick start](docs/quick-start.en.md) · [Windows guide](docs/windows-distribution.md) · [Architecture](docs/architecture.md) · [Issues](https://github.com/Saber-Alter-Lily/pica-library/issues) · [LICENSE](LICENSE) · [UPSTREAM](UPSTREAM.md)

Only download material you are authorized to access. Do not redistribute it.
