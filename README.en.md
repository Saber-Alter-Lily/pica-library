[简体中文](README.md) | English

# Pica Library

Pica Library is a local-first manga library, discovery, download, and reading application for long-lived collections.

Windows provides full management and downloading. Android provides mobile reading, online discovery, and remote access. Web/Desktop and Android share the same source model, preference semantics, recommendation logic, and reading model while adapting interaction layout to each screen.

## v0.4.1 highlights

- **Android top-level navigation**: Library, Recommendations, Online, and Settings now switch inside one Home surface; Online and Settings no longer use visibly different Activity transitions.
- **Android responsiveness**: recommendation profile/control data loads off the UI thread; policy, evidence, portable candidates, and hot metadata paths reuse parsed state.
- **Recommendation batches**: Desktop reuses a frozen serving snapshot within a cycle; Android rerenders only the current 12-item batch.
- **Visual recommendations**: independent opt-in module with Off / Analyze only / Apply modes and Light / Standard / Strong influence levels.
- **Visual index compatibility**: existing DINOv2 Patch Mean indexes remain valid while new indexing can retain compact CLS and Patch Mean views from the same inference pass.
- **Reader and history**: explicit next-chapter action at chapter end; history groups by comic while preserving chapter progress and covers.
- **Mobile hierarchy**: primary disclosure groups, secondary groups, and concrete controls now use distinct typography and surfaces.
- **Formal distribution**: Windows upgrades from v0.4.0 by replacing the full application package while preserving the separate user-data directory; Android advances to versionCode 43 with the same package ID and signing identity.

See [PROJECT_LOG.md](PROJECT_LOG.md) for the core project evolution.

## Main capabilities

### Library

- **Library → Search**: title, author, tag, and category search.
- **Library → Filters**: local phone/PC, WebDAV, online availability, and provider filters.
- **Library → Author / Tag / Category**: unified facets without duplicating one work per source.
- **Library → Shelves**: local organization; deleting a shelf never deletes comic files or remote favorites.
- **Library → Reading History**: Today, 7 days, 30 days, All, or an exact date.
- **Library → Display**: list and multiple grid densities.

### Online

- **Online → All Sources**: Pica and E-H discovery together; ExH is added only when available.
- **Online → Pica**: search, favorites, ranking, and categories.
- **Online → E-Hentai**: public Gallery search and reading works without an account.
- **Online → E-H Browse**: Latest, Popular, cloud Favorites, Watched, Categories, and Toplists.
- **Online → E-H Filters**: category, language, include/exclude tags, rating, and page count.
- **Online → ExHentai**: entry and capability monitoring remain available; failure never blocks E-H or recommendations.

### Chinese tags and semantics

- **E-H tag display**: EhTagTranslation provides Chinese presentation and reverse lookup.
- **E-H identity**: `namespace:value` canonical tags remain the stored identity.
- **Cross-source semantics**: Pica tags and E-H namespaced tags map into a shared interest concept only when the mapping is defensible.
- **Provider recall**: Pica keeps its own query language; E-H uses exact namespaced tag queries.

### Recommendations

- **Recommend → Profile**: Pica cloud favorites and E-H cloud favorites jointly form the long-term preference profile.
- **Recommend → Candidates**: Pica and E-H recall independently; ExH adds candidates only when available.
- **Recommend → Ranking**: preserves explainable intent, source evidence, and ranker constraints.
- **Recommend → Batches**: previous/next batches and seen-cycle state are tracked explicitly.

### Comic details and authors

- **Details → Favorites**: Pica favorites; E-H local favorites plus ten native E-H cloud favorite slots.
- **Details → Shelves**: add or remove a comic from one or more shelves.
- **Details → Sources & Replicas**: inspect online source bindings and phone/Desktop/WebDAV copies.
- **Details → Author**: author directory first, then the normalized author's cross-source works.
- **Author normalization**: canonical name, aliases, circle, and provider bindings are retained; E-H `artist:` and `group:` are not blindly merged.

### Reading

- **Reader → Sources**: phone download, Desktop download, WebDAV, Pica online, and E-H online.
- **Reader → Modes**: left-to-right, right-to-left, and vertical continuous reading.
- **Reader → Progress**: local-first bookmark, then portable sync when Desktop/WebDAV is available.
- **Reader → History**: session-based reading history instead of treating the latest bookmark as full history.
- **History → Resume**: restores chapter and page; falls back to Details when the original source is unavailable.

### Downloads and storage

- **Downloads**: persistent queue, bounded concurrency, retry/recovery, and completed-task management.
- **Android downloads**: local mobile downloads plus direct reading of Desktop-downloaded content.
- **WebDAV**: remote catalog, selected upload, remote deletion, and mobile fallback access.
- **Multiple WebDAV targets**: save several remote targets and switch the active target.
- **Cache & preload**: Reader cache and prefetch are independently configurable.

### Accounts and sources

- **Pica account**: login, registration, and favorite synchronization.
- **E-H account**: official web login is the normal path; manual cookie/session import is an advanced fallback.
- **E-H session security**: Windows uses DPAPI; Android uses Android Keystore AES-GCM.
- **ExH state**: Available, Currently unavailable, Unable to confirm, or Pending check; one failed probe is never treated as a permanent permission verdict.

### Cross-device and personalization

- **Desktop ↔ Android**: a paired phone can read comics already downloaded on the PC.
- **Theme packs**: create/import `.pica-theme` packs and sync them across devices.
- **Active theme**: selected independently on Desktop and Android.
- **Settings → Storage & Downloads**: local folders, WebDAV, cache, and download policies.
- **Settings → Software Update**: Windows supports official incremental and local ZIP updates; Android uses official APK update metadata.

## Platform capability matrix

| Capability | Windows / Web | Android |
| --- | --- | --- |
| Unified library, filters, shelves | Yes | Yes |
| Pica online | Yes | Yes |
| E-Hentai online | Yes | Yes |
| Optional ExH capability | Yes | Yes |
| Dual-source preference profile | Yes | Yes |
| Author normalization and works navigation | Yes | Yes |
| Reading history | Yes | Yes |
| Online reader | Yes | Yes |
| Local downloads | Primary download side | Yes |
| Read Desktop-downloaded content | Local | Direct after pairing |
| WebDAV | Configure, sync, manage | Read, switch, fallback |
| Theme packs | Create, import, sync | Receive, use |
| In-app updates | Incremental ZIP | Official APK |

## Install and update

Official builds are published through [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases).

### Windows

Extract the full ZIP and run the app. User data is stored separately from application files, so program updates do not replace the personal database.

Existing users should prefer:

`Settings → Software Update → Check and update`

The official `Pica-Library-vX.Y.Z-update.zip` can also be dropped into the local update area.

### Android

The Android APK is not distributed through app stores. Download it only from this repository's official Release.

Official APK updates verify version, package name, SHA-256, and the fixed signing certificate identity.

## Local-first and security

- Library data, shelves, history, and settings stay local or in the user-selected WebDAV target.
- Windows secrets are protected with the current Windows user's DPAPI.
- Android E-H sessions are protected with Android Keystore AES-GCM.
- E-H canonical tags are separate from the Chinese presentation layer; translation updates never rewrite content identity.
- Theme packs contain controlled data and images only; they do not execute arbitrary code.
- Official releases publish SHA-256, signing identity, and build-transparency metadata.

## Usage boundary

Pica Library is an open-source, local-first personal digital-content management tool. It does not sell, host, or redistribute manga content.

Users are responsible for ensuring that account use, access, downloading, storage, reading, and backups comply with applicable law, platform terms, and authorization scope.

See [DISCLAIMER.md](DISCLAIMER.md).

## Documentation

- [Project version log](PROJECT_LOG.md)
- [Quick start](docs/quick-start.en.md)
- [Desktop / Web guide](docs/desktop-guide.en.md)
- [Android guide](docs/android-guide.en.md)
- [Windows distribution](docs/windows-distribution.md)
- [Architecture](docs/architecture.md)

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
