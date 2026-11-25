[简体中文](README.md) | English

# Pica Library

**Windows v0.5.1** · [Windows x64](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.5.1/Pica-Library-v0.5.1-windows-x64.zip) · [Android v57](https://github.com/Saber-Alter-Lily/pica-library/releases/download/android-preview/Pica-Library-Android-v57.apk) · [Desktop release notes](docs/V051_RELEASE_NOTES.md)

**Local-first manga library, reader, and download manager for Windows & Android.**

Supports **PicACG / Pica, E-Hentai / ExHentai, and WebDAV**, bringing discovery, favorites, library management, downloads, reading, recommendations, and cross-device access into one app.

**[Download latest](https://github.com/Saber-Alter-Lily/pica-library/releases/latest)** · [Quick start](docs/quick-start.en.md) · [Android guide](docs/android-guide.en.md) · [Version log](PROJECT_LOG.md)

Windows 10/11 x64 · Android · Local-first · Open Source

For v0.4.11 installations, first follow the [v0.5.0 upgrade instructions](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.5.0). Incremental packages are source-version specific.

## What's new in v0.5.1

Library filters, sort and subscription updates sit together. Reshuffle without changing the library. Browse unread chapters by cover or author. Recommendation pages stay in the same round; generating another round uses a new plan. Android keeps the single-column feed and improves long chapter lists, dark contrast and narrow layouts.

## Main features

### Unified library

- Browse Pica, E-H, Desktop, Android, and WebDAV content in one library.
- Filter by title, author, tag, category, source, favorite state, and download state.
- Shelves, reading history, resume, list view, and multiple grid sizes.
- Comic details can show other versions of the same work for quick comparison.

### Online discovery

- **Pica**: sign in, register, search, categories, rankings, favorites, online reading, and downloads.
- **E-Hentai / ExHentai**: search, details, favorites, online reading, downloads, popular lists, and advanced filters.
- Chinese E-H tag display and search assistance are supported.

### Recommendations

- Personalized recommendations based on favorites and usage.
- 0–10 manual controls, reduce, block, session intent, and feedback.
- Batch navigation and recommendation reasons.
- Visual-style recommendations are optional and can be disabled without affecting normal recommendations.
- Desktop and Android can both recommend independently; pairing can synchronize portable preferences.

### Reading and downloads

- Read phone-local comics, Desktop downloads, WebDAV, Pica online, and E-H online.
- Left-to-right, right-to-left, vertical continuous reading, chapter navigation, progress saving, and resume.
- Persistent download queues with progress, pause/resume, and failure recovery.
- Android can download locally or read Desktop-downloaded comics after pairing.

### Cross-device and storage

- Pair Desktop and Android over the local network.
- Use WebDAV as remote storage and a fallback reading source.
- Multiple WebDAV configurations with remote sync and mobile switching.
- Theme packs, light/dark appearance, and personalization.

### Updates and maintenance

- Windows supports in-app updates, local update ZIPs, and rollback.
- Android supports checking and installing official APK updates in app.
- Cache, logs, export, repair, and storage tools are available.

## Install and update

Official builds are published through [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases).

### Windows

New users should download and fully extract:

Use the complete Windows x64 package for a new installation. From v0.5.0 use the built-in updater; the incremental ZIP and fallback Upgrade Assistant are available on the same release. Keep the data directory.

### Android

Use the in-app update to install **Android v57 / 0.5.1.1** over v56 without uninstalling. Start or resume from the detail page; online lists return to the top on successful page changes and preserve position when returning from details. [Android release notes](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/android-preview). The separate Dev app is not a production update target.

## Local-first and security

- Library data, shelves, history, and settings remain local or in the WebDAV target you choose.
- User data is separated from application files, so application updates do not replace the personal database.
- Windows credentials use the current Windows user's protection; Android sensitive sessions use Android Keystore.
- Formal Releases publish SHA-256 and Android signing verification information.

## Support

Pica Library is free and open source. Development can be supported voluntarily through [AZZ](https://azz.net/PicaLibrary).

Support does not unlock extra features, content, or download privileges.

## Usage boundary

Pica Library is a local-first personal digital-content management tool. It does not sell, host, or redistribute manga content. Users are responsible for ensuring that account use, access, downloads, storage, reading, and backups comply with applicable law, platform terms, and authorization scope.

See [DISCLAIMER.md](DISCLAIMER.md).

## Documentation

[Quick start](docs/quick-start.en.md) · [Desktop / Web](docs/desktop-guide.en.md) · [Android](docs/android-guide.en.md) · [Windows distribution](docs/windows-distribution.md) · [Version log](PROJECT_LOG.md)

## Credits

CLI capabilities continue to build on upstream `pica-cli` work. See [UPSTREAM.md](UPSTREAM.md).
