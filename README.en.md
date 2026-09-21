[简体中文](README.md) | English

# Pica Library

**Local-first manga library, reader, and download manager for Windows & Android.**

Supports **PicACG / Pica, E-Hentai / ExHentai, and WebDAV** across discovery, favorites, unified library management, downloading, reading, recommendations, and Desktop ↔ Android access.

**[Download latest](https://github.com/Saber-Alter-Lily/pica-library/releases/latest)** · [Quick start](docs/quick-start.en.md) · [Android guide](docs/android-guide.en.md) · [Version log](PROJECT_LOG.md)

Windows 10/11 x64 · Android · Local-first · Open Source

## v0.4.7 highlights

- **Long-running work is no longer a black box**: recommendation generation, visual indexing, favorites sync, and WebDAV sync expose phases, progress, pause/resume, cancellation, and failure states while backend task state remains authoritative across page navigation.
- **Fixes recommendation deadlocks on unstable networks and after restart**: ordinary Pica API calls are bounded to 15 seconds, repeated provider failures stop early, and Desktop startup clears stale persisted `buildingCycleId` state left by an interrupted process. Deleting `library.db` is no longer a recovery step.
- **Failed refreshes keep the last usable recommendations**: an insufficient or failed replacement cycle never supersedes the previous usable cycle; Desktop and Android commit new recommendation results only after a complete successful run.
- **Visual analysis is bounded and controllable**: Desktop visual indexing supports pause/resume/cancel, model loading is bounded to 120 seconds, and each page analysis to 45 seconds. Unfinished works remain pending for later continuation.
- **Favorites and WebDAV sync are checkpointed**: favorites sync pauses at page boundaries; WebDAV pauses at comic/chapter/page boundaries and reuses already uploaded SHA-matched objects on the next run. Local WebDAV scanning now uses asynchronous file reads so large scans do not monopolize the Node event loop.
- **Android background jobs are unified**: recommendation, Pica favorites sync, Desktop favorites/covers import, and downloads have task-center controls for pause/resume/cancel/retry. Downloads persist each completed page for true resume; pausing recommendation restarts the current computation on resume while preserving the last usable snapshot.
- **Upgrade path**: Windows v0.4.0 uses the v0.4.7 upgrade assistant; v0.4.1–v0.4.6 can use scoped incremental updates. Android formal release is v50 / 0.4.7.

See [PROJECT_LOG.md](PROJECT_LOG.md) for the core project evolution.

## Main capabilities

### Unified library

- Unifies Pica, E-H, Desktop, local, Android, and WebDAV state into one comic record.
- Filters by title, author, tag, category, provider, storage location, and online availability.
- Includes shelves, reading history, resume, list view, and multiple grid densities.
- Normalized authors retain canonical name, aliases, circle, and provider bindings for cross-source navigation.

### Online discovery and accounts

- **Pica**: login, registration, search, categories, rankings, favorites, and sync.
- **E-Hentai**: public search, details, online reading, downloads, Latest / Popular / Favorites / Watched / Toplists, and advanced filters.
- **ExHentai**: optional E-H account capability; unavailability never blocks E-H or recommendations.
- E-H supports official web login; Windows protects secrets with DPAPI and Android with Android Keystore.

### Chinese tags and cross-source semantics

- E-H keeps native `namespace:value` canonical tags; Chinese is a presentation and reverse-lookup layer only.
- EhTagTranslation provides Chinese tag display and search assistance.
- Pica and E-H tags map into shared interest concepts only when justified, while each provider keeps its native retrieval syntax.

### Recommendations

- Pica and E-H favorites form the long-term preference profile, with recent behavior, explicit controls, and explainable evidence kept separately.
- Providers recall candidates independently before unified ranking, deduplication, and batch allocation.
- Includes profile views, manual adjustment, explicit feedback, batch navigation, and recommendation reasons.
- Visual-style recommendation is fully optional and has no effect on normal ranking when disabled.
- Desktop and Android can recommend independently; pairing syncs portable preferences and foundations without forcing the current batch or session to match.

### Reading and downloads

- Reads from Android local storage, Desktop downloads, WebDAV, Pica online, and E-H online.
- Reader supports left-to-right, right-to-left, vertical continuous mode, chapter navigation, progress saving, and resume.
- Reading history groups by comic while retaining exact chapter and page.
- Downloads use a persistent queue with bounded concurrency, pause/resume, failure recovery, and completed-task tracking.
- Android can download locally or directly read Desktop-downloaded comics after pairing.

### Storage, cross-device, and personalization

- Multiple WebDAV targets with selected upload, remote deletion, switching, and mobile fallback access.
- Desktop ↔ Android pairing shares portable library/recommendation foundations and access to Desktop content.
- `.pica-theme` theme packs can be created, imported, and synced; active theme remains device-local.
- Reader cache, preloading, download directories, and storage policies are configurable.

### Updates and maintenance

- Windows supports compatible incremental updates, official Release checks, local update ZIPs, and rollback.
- The public user upgrade baseline is v0.4.0. Windows v0.4.0 users should use the **Windows upgrade assistant** from the v0.4.7 Release to move directly to the latest release without installing intermediate versions.
- Android performs in-place APK updates using official metadata and verifies version, package ID, SHA-256, and signing identity.
- Logs, repair, cache, export, and diagnostic tools are available from the app.

## Platform capability matrix

| Capability | Windows / Web | Android |
| --- | --- | --- |
| Unified library, filters, shelves | ✓ | ✓ |
| Pica / E-H online | ✓ | ✓ |
| Optional ExH capability | ✓ | ✓ |
| Recommendation profile & controls | ✓ | ✓ |
| Visual-style recommendations | ✓ | ✓ |
| Reading history & resume | ✓ | ✓ |
| Online reader | ✓ | ✓ |
| Local downloads | Primary download side | ✓ |
| Read Desktop downloads | Local | Direct after pairing |
| Multiple WebDAV targets | Configure / sync / manage | Read / switch / fallback |
| Theme packs | Create / import / sync | Receive / use |
| App updates | Incremental / full-package assistant | Official in-place APK |

## Install and update

Official builds are published through [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases).

### Windows

Download and fully extract `Pica-Library-vX.Y.Z-windows-x64.zip`, then run `Pica Library.exe`.

User data is stored separately from application files. Compatible releases use:

`Settings → Software Update → Check and update (automatic when compatible)`

Existing **v0.4.0** users should download `Pica-Library-v0.4.7-upgrade-assistant.zip`, extract it, and run `Upgrade-Pica-Library-v0.4.7.cmd` to move directly to the current release; no intermediate versions are required. The assistant protects `%LOCALAPPDATA%\Pica Library` and performs package verification, backup, replacement, health checks, and rollback on failure.

### Android

Android APKs are distributed only through this repository's official Release. Existing **v42 / 0.4.0** users can update in place directly to **v50 / 0.4.7** through the in-app update chain; no intermediate versions are required.

## Local-first and security

- Library data, shelves, history, and settings remain local or in the user-selected WebDAV target.
- Windows credentials use the current Windows user's DPAPI; Android sensitive sessions use Android Keystore.
- User data is separated from application files so program replacement does not overwrite the personal database.
- Official Releases include SHA-256, signing identity, and build-transparency metadata.
- Theme packs contain controlled data and images only and cannot execute arbitrary scripts.

## Support

Pica Library is free and open source. Development can be supported voluntarily through [AFDIAN](https://afdian.com/a/PicaLibrary).

Support does not unlock extra features, content, or download privileges and does not affect the complete free version.

## Usage boundary

Pica Library is a local-first personal digital-content management tool. It does not sell, host, or redistribute manga content. Users are responsible for ensuring that account use, access, downloading, storage, reading, and backups comply with applicable law, platform terms, and authorization scope.

See [DISCLAIMER.md](DISCLAIMER.md).

## Documentation

[Quick start](docs/quick-start.en.md) · [Desktop / Web](docs/desktop-guide.en.md) · [Android](docs/android-guide.en.md) · [Windows distribution](docs/windows-distribution.md) · [Version log](PROJECT_LOG.md) · [Architecture](docs/architecture.md)

## Development

```bash
pnpm install --frozen-lockfile
pnpm type:check
pnpm web:check
pnpm test
pnpm build
```

The Android project is under `mobile/android-alpha2`. Official Android release signing private keys are not stored in the repository.

## Credits

CLI capabilities continue to build on upstream `pica-cli` work. See [UPSTREAM.md](UPSTREAM.md).

---

Only download and store content you are authorized to access. Do not redistribute comic files.
