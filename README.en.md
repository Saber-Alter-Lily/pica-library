[简体中文](README.md) | English

# Pica Library

**Organize collections · Discover personally · Incremental downloads · Local reading · Cross-device access**

Pica Library is a local-first manga library manager for long-lived collections. Use Windows to organize, search, discover, download, and read; pair Android to access comics already downloaded on the PC.

**Windows 10/11 x64 · Android Preview · Open source · Free**

[Windows v0.3.11](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.3.11) · [Android Preview v38](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/android-preview) · [Issues](https://github.com/Saber-Alter-Lily/pica-library/issues)

> The Android build is **not published in any app store**. Download the APK only from this repository's GitHub Release.

## What it does

- **Library and collection management** — sync favorites and organize by author, tag, category, shelf, and other local metadata.
- **Search, discovery, and recommendations** — search local/online content and generate personalized recommendations from your collection profile.
- **Persistent download queue** — retain task state across restarts, recover failures, and collapse finished history by default.
- **Local reading** — manage downloaded comics and open them directly from the local library.
- **Desktop ↔ Android** — a paired phone can read comics already downloaded by Desktop without downloading the same files again.
- **WebDAV fallback** — optional backup access path for mobile use when Desktop is unavailable.
- **Personalization** — authenticate your own GitHub account and confirm a Star to unlock `.pica-theme` packs.
- **Verified updates** — Desktop supports in-app incremental updates; Android verifies version, SHA-256, package name, and fixed signing identity.

## Desktop / Web

![Pica Library Desktop / Web overview](docs/assets/desktop-overview.webp)

Desktop provides the full Library, Shelves, Discover, Favorite Atlas, Downloads, Downloaded, and unified Settings experience. Mobile pairing, WebDAV, themes, storage, maintenance, and updates live under Settings.

**[Desktop / Web detailed guide →](docs/desktop-guide.en.md)**

## Android

![Pica Library Android guide](docs/assets/android-overview.webp)

Android uses four primary tabs: **Library / Recommend / Online / Connect**. After pairing with Desktop, it can read local comics stored on the PC and also manage WebDAV, Pica account settings, appearance, and app updates.

**[Android detailed guide →](docs/android-guide.en.md)**

## Cross-device model

| Capability | Desktop / Web | Android |
| --- | --- | --- |
| Library and favorites | ✅ | ✅ |
| Recommendations / online browsing | ✅ | ✅ |
| Download management | ✅ primary download side | ✅ mobile tasks / app updates |
| Read Desktop-downloaded comics | Local | ✅ after pairing |
| WebDAV | ✅ configure / expose info | ✅ fallback access |
| Theme packs | ✅ create / import / sync | ✅ receive / use |
| Active theme | Device-local | Device-local |

Theme packs can sync across devices, but **Desktop and Android do not have to use the same active theme**.

## Downloads and updates

### Windows

- [v0.3.11 full package](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.11/Pica-Library-v0.3.11-windows-x64.zip)
- [v0.3.11 incremental update](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.11/Pica-Library-v0.3.11-update.zip)

v0.3.11 has been individually verified for direct in-app upgrades from every formal **v0.3.x** release:

`v0.3.0 / v0.3.1 / ... / v0.3.9 → v0.3.11`

Prefer **Settings → Software Update** on Desktop.

### Android

Download `Pica-Library-Android-Preview.apk` from the [Android Preview release](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/android-preview).

The Preview is **not distributed through app stores**. Avoid unofficial mirrors and re-uploaded APKs.

## Local-first and security

- User data stays local by default.
- Windows credentials are protected with DPAPI for the current Windows user.
- Official releases publish SHA-256 and build-transparency metadata.
- Android Preview uses a fixed official signing identity.
- GitHub OAuth access tokens are not persisted.
- Theme packs are data/image-only and do not execute arbitrary scripts or binaries.

## Usage notice

Pica Library is an open-source, local-first personal digital-content management tool. It does not sell, host, or redistribute manga content. Users are responsible for ensuring that account use, access, downloading, storage, reading, and backups comply with applicable law, platform terms, copyright, and other permissions.

See [DISCLAIMER.md](DISCLAIMER.md) for the full notice.

## Get started

- [Desktop / Web guide](docs/desktop-guide.en.md)
- [Android guide](docs/android-guide.en.md)
- [Quick start](docs/quick-start.en.md)
- [Windows distribution guide](docs/windows-distribution.md)
- [Architecture](docs/architecture.md)

## Development

```bash
pnpm install --frozen-lockfile
pnpm web:check
pnpm build
pnpm test:unit
```

The Android project lives under `mobile/android-alpha2`. Official Android release signing private keys are not stored in the repository.

## Credits

Pica Library continues from the upstream `pica-cli` work. See [UPSTREAM.md](UPSTREAM.md).

---

**Only download and store content you are authorized to access. Do not redistribute manga files.**
