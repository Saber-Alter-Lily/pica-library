[简体中文](README.md) | English

# Pica Library

Turn a Pica collection into a durable local manga library for organizing, discovering, downloading, reading, and cross-device access.

**Windows 10/11 x64 · Android Preview · current source is open again.**

## Current versions

- **Windows / Desktop:** v0.3.10
- **Android Preview:** v37 · 0.1.0-alpha8.10-release-readiness
- **Public source:** Alpha8.10

## Alpha8.10

- **All v0.3.x upgrade compatibility:** release gates cover direct in-app upgrades from v0.3.0 through v0.3.9.
- **UI cleanup:** redundant helper copy is removed across Desktop/Web and Android while status, errors, and essential safety messaging remain.
- **Strict personalization gate:** themes cannot be imported, synced, activated, or served before authenticated GitHub Star proof is present.
- **Star surprise copy removed:** the Star action no longer carries teaser microcopy.

## Alpha8.9

- **HTTP 204 Star success fix:** the Desktop proxy fetch layer now constructs bodyless 204/205/304 responses correctly instead of throwing `Invalid response status code 204`.
- **See the code before leaving the app:** Desktop now renders the GitHub device code first and exposes separate Copy Code and Open GitHub actions; it no longer opens GitHub automatically.
- **Android device-code persistence:** Android follows the same explicit two-step flow and does not rebuild the theme-auth page when returning from the external browser while authorization is pending.
- **Android disclaimer insets:** the startup notice reserves status-bar, display-cutout, and bottom-system-bar space.
- **Alpha8.8 security model retained:** authenticated GitHub identity, transient OAuth access tokens, per-device active themes, and theme-pack sync remain unchanged.

## Alpha8.8

- **Authenticated GitHub Star access:** personalization no longer accepts a public username and infers Star state. Desktop and Android use GitHub Device Flow, identify the authenticated account, and check the current user's Star of `Saber-Alter-Lily/pica-library`. The access token is transient and is not persisted.
- **Live authenticated acceptance passed:** the production GitHub App Client ID completed a real Device Flow for `Saber-Alter-Lily`, and the authenticated current-user Star check returned HTTP 204.
- **Per-device active themes:** Desktop may sync `.pica-theme` packs to Android, but it no longer syncs `activeThemeId`. Desktop and Android independently choose which installed theme is active.
- **Versioned startup disclaimer:** Desktop/Web and Android show an open-source-tool usage notice on first run; acknowledgement is device-local and the notice appears again only when its version changes. The full Windows package includes `DISCLAIMER.md`; in-app upgrades deliver the actual Web startup disclaimer without forcing updater self-replacement for the root documentation copy.
- **Alpha8.7 improvements retained:** unified Settings hub, improved personalization layout, collapsed finished-download history, and proxy-aware update networking remain in place.

### Downloads

- [Windows v0.3.9 full package](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.9/Pica-Library-v0.3.9-windows-x64.zip)
- [Windows v0.3.9 update package](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.9/Pica-Library-v0.3.9-update.zip)
- [Windows v0.3.9 release](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.3.9)
- [Android Preview v36](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/android-preview)

The Windows v0.3.9 incremental update is verified for **v0.3.3 / v0.3.4 / v0.3.5 / v0.3.6 / v0.3.7 / v0.3.8**. Prefer **Settings → Software Update** on Desktop and the existing Preview update screen on Android.

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
3. First confirm or copy the one-time GitHub device code shown inside Pica Library, then explicitly open the GitHub authorization page.
4. After authorization, return to Pica Library; it identifies the currently authenticated account and checks that account's Star of this repository.
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
