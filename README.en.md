[简体中文](README.md) | English

# Pica Library

**Local-first manga library, reader, and download manager for Windows & Android.**

Supports **PicACG / Pica, E-Hentai / ExHentai, and WebDAV**, bringing discovery, favorites, library management, downloads, reading, recommendations, and cross-device access into one app.

**[Download latest](https://github.com/Saber-Alter-Lily/pica-library/releases/latest)** · [Quick start](docs/quick-start.en.md) · [Android guide](docs/android-guide.en.md) · [Version log](PROJECT_LOG.md)

Windows 10/11 x64 · Android · Local-first · Open Source

## v0.5.0 highlights

- **One-click Windows upgrade from v0.4.11 to v0.5.0** through the existing Software Update page, without manual extraction or reinstall.
- **Persistent external upgrade assistant**: v0.5.0 registers a verified runtime/helper under `runtime-state/upgrade-assistant`, so later schema jumps or updater replacement can still use one-click full-application replacement.
- **More direct Android batch actions**: long-press Library/Shelf selection exposes add/remove/unfavorite actions in a contextual bottom bar.
- **Library and recommendation interaction cleanup**: favorite-order sorting, known page count, visible same-work checks, cycle-level author exposure control, and fewer unnecessary full reloads.
- **Simpler Desktop/Web hierarchy** across Settings, Library display controls, connection state, and onboarding.
- **Project support moved to AZZ** across Web, Android, documentation, and GitHub Funding.

See [PROJECT_LOG.md](PROJECT_LOG.md) for the core version history.

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

`Pica-Library-v0.5.0-windows-x64.zip`

Then run `Pica Library.exe`.

Existing **v0.4.11** users can open **Settings → Maintenance → Software Update** and use **One-click check & update**. The stable channel selects:

`Pica-Library-v0.5.0-update-from-v0.4.11.zip`

and performs verification, application replacement, database migration, and automatic reconnect without an intermediate install.

If the in-app path is unavailable, the same Release provides the recovery fallback:

`Pica-Library-v0.5.0-upgrade-assistant-from-v0.4.11.zip`

Personal data remains outside the application tree; neither normal updating nor the fallback assistant treats the library database, shelves, history, downloads, or account configuration as application files.

### Android

The formal Android release is **v55 / 0.5.0**. The public v54 / 0.4.11 package has passed an in-place upgrade acceptance to v55.

Android APKs are distributed only through this repository's official Release.

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
