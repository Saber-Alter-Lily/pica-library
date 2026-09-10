[简体中文](README.md) | English

# Pica Library

Turn a Pica collection into a durable local manga library for organizing, discovering, downloading, reading, and cross-device access.

**Windows 10/11 x64 · Android Preview · current source is open again.**

## Current versions

- **Windows / Desktop:** v0.3.7
- **Android Preview:** v34 · 0.1.0-alpha8.7.1-star-401-hotfix
- **Public source:** Alpha8.7.1

### Downloads

- [Windows v0.3.7 full package](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.7/Pica-Library-v0.3.7-windows-x64.zip)
- [Windows v0.3.7 update package](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.7/Pica-Library-v0.3.7-update.zip)
- [Windows v0.3.7 release](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.3.7)
- [Android Preview release](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/android-preview)

The v0.3.7 incremental update is verified for direct upgrades from **v0.3.3, v0.3.4, v0.3.5, and v0.3.6**. Prefer the in-app **Settings → Software Update** flow.

## Alpha8.7.1 hotfix

- **Real-client Star HTTP 401 fix:** GitHub currently answers anonymous repository-stargazer-list requests with `401 Requires authentication`. Desktop and Android now continue to the named user's public starred-repositories endpoint instead of treating that first 401 as a failed verification.
- **Desktop network fallback:** anonymous public GitHub GET requests that receive 401/403/407/429 through the configured application proxy may retry once through the native direct transport. Requests carrying Authorization or Cookie headers never use this fallback.
- **Dual verification paths:** Star verification keeps both repository stargazers and user starred repositories as independent evidence routes; either route can confirm the Star and persist the local proof.
- **Acceptance parity:** the release gate reproduced the anonymous primary HTTP 401, then confirmed `Saber-Alter-Lily/pica-library` through the second anonymous API with HTTP 200 and no Authorization header before publication.

## Alpha8.7

- **Desktop Settings hub:** the former Maintenance and Settings top-level areas are merged into one Settings entry with General, Connections & Sync, Appearance, Downloads & Storage, Maintenance, and Software Update sections.
- **Personalization layout:** the Star unlock and Theme Studio surfaces use the full content width with responsive controls instead of the previous squeezed column.
- **Download queue:** `COMPLETED` and `CANCELLED` history is collapsed by default; `FAILED` jobs stay visible for retry, and historical records are not deleted.
- **Theme data preservation:** Pica Violet · 星漫 and existing custom themes keep their original local storage across the upgrade.

## Alpha8.6

- **GitHub Star personalization:** personalization is a community Star reward and is independent from donations. Official builds remember a successful public Star verification locally.
- **Pica Violet · 星漫:** the built-in official theme available immediately after Star unlock.
- **Theme Studio:** enter a short theme description and reference images, export an AI Creator Kit, then drag the returned `.pica-theme` back into Desktop to validate, apply, and sync it to a paired phone.
- **Data-only theme packs:** controlled JSON plus PNG/JPG/WebP resources only; no script, HTML, font, or executable payloads.
- **Unified brand icon:** Desktop/Web and Android use the same anime-style application identity.
- **Android header cleanup:** Recommendation refresh and Online account use compact icon actions; the mobile bottom navigation remains **Library / Recommend / Online / Connect**.

## Main features

- **Library:** sync favorites and filter by author, tag, category, and shelf.
- **Personal recommendations:** generate explainable recommendation batches from the local collection profile; favoriting an item no longer destroys the current recommendation batch.
- **Online browsing:** favorites, search, categories, and **24-hour / 7-day / 30-day** rankings.
- **Download and read:** manage downloads, retries, reading progress, and local caches.
- **Desktop ↔ Android:** a paired phone can read comics already downloaded by Desktop and sync personalization state.
- **WebDAV:** an optional fallback source for mobile reading while the Desktop is offline.
- **Updates:** Desktop uses GitHub Release API with a release-file fallback path; Android Preview verifies version, SHA-256, package name, and the fixed official signing identity before installation.

## Personalization

The official-build personalization gate is a GitHub Star community reward, not a paid feature:

1. Star this repository.
2. Enter your GitHub username in the Desktop or Android personalization page and verify the public Star state.
3. Use **Pica Violet · 星漫** immediately.
4. Use Desktop Theme Studio to create your own `.pica-theme` through the AI Creator Kit workflow.
5. Pair Desktop and Android to sync the Star proof and active theme to the phone.

## Open source and security

The current application source is public again. The repository does not contain official Android signing private keys/keystores, account credentials, CI secrets, local databases, downloaded comics, or user caches.

User data stays local by default. Windows credentials are protected with DPAPI for the current Windows user. Official binaries remain tied to published SHA-256 values, build transparency metadata, and the fixed Android Preview signing identity.

## Get started

1. Download and fully extract the Windows ZIP.
2. Double-click `Pica Library.exe`.
3. Finish account, optional proxy, and library-folder setup.
4. Sync favorites and start using the library.
5. Pair Android using the Desktop-provided connection information when needed.

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
