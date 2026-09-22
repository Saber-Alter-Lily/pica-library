[简体中文](README.md) | English

# Pica Library

**Local-first manga library, reader, and download manager for Windows & Android.**

Supports **PicACG / Pica, E-Hentai / ExHentai, and WebDAV**, bringing discovery, favorites, library management, downloads, reading, recommendations, and cross-device access into one app.

**[Download latest](https://github.com/Saber-Alter-Lily/pica-library/releases/latest)** · [Quick start](docs/quick-start.en.md) · [Android guide](docs/android-guide.en.md) · [Version log](PROJECT_LOG.md)

Windows 10/11 x64 · Android · Local-first · Open Source

## v0.4.11 highlights

- **Better “Same work” detection**: cross-provider, cross-language, and alternate uploads are more likely to be linked from comic details.
- **Android can resolve same-work candidates independently** even when Desktop is not connected.
- **Large libraries are handled more completely**, without dropping older entries from identity checks.
- **Web detail pages preserve your position**: closing a comic detail returns to the same place in Library, Shelves, Search, or Recommendations.

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

`Pica-Library-v0.4.11-windows-x64.zip`

Then run `Pica Library.exe`.

Existing **v0.4.0** users can download:

`Pica-Library-v0.4.11-upgrade-assistant.zip`

Extract it and run `Upgrade-Pica-Library-v0.4.11.cmd` to move directly to the latest release without installing intermediate versions. Personal data is stored separately; the assistant verifies, backs up, and rolls back on failure.

### Android

The formal Android release is **v54 / 0.4.11**. Existing **v42 / 0.4.0** and later users can update in place through the in-app update chain.

Android APKs are distributed only through this repository's official Release.

## Local-first and security

- Library data, shelves, history, and settings remain local or in the WebDAV target you choose.
- User data is separated from application files, so application updates do not replace the personal database.
- Windows credentials use the current Windows user's protection; Android sensitive sessions use Android Keystore.
- Formal Releases publish SHA-256 and Android signing verification information.

## Support

Pica Library is free and open source. Development can be supported voluntarily through [AFDIAN](https://afdian.com/a/PicaLibrary).

Support does not unlock extra features, content, or download privileges.

## Usage boundary

Pica Library is a local-first personal digital-content management tool. It does not sell, host, or redistribute manga content. Users are responsible for ensuring that account use, access, downloads, storage, reading, and backups comply with applicable law, platform terms, and authorization scope.

See [DISCLAIMER.md](DISCLAIMER.md).

## Documentation

[Quick start](docs/quick-start.en.md) · [Desktop / Web](docs/desktop-guide.en.md) · [Android](docs/android-guide.en.md) · [Windows distribution](docs/windows-distribution.md) · [Version log](PROJECT_LOG.md)

## Credits

CLI capabilities continue to build on upstream `pica-cli` work. See [UPSTREAM.md](UPSTREAM.md).
