# Pica Library Desktop / Web Guide

> For Windows Desktop and the local Web UI. Current stable release: **v0.4.7**.

## 1. Install and start

1. Download the current stable Windows package from [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases/latest). For v0.4.7, use `Pica-Library-v0.4.7-windows-x64.zip`.
2. Extract the complete ZIP to a normal folder. Do not run the application from inside an archive viewer.
3. Run `Pica Library.exe`. The local Web UI opens in your browser.
4. Configure accounts, library location, download behavior, and an HTTP/HTTPS proxy only when needed.

Pica Library runs locally. The Desktop process owns data, downloads, updates, and the local service; the browser page is the user interface for that local process.

## 2. Main areas

- **Home** — common entry points, status, and recent activity.
- **Library** — unified records from Pica, E-H, Desktop, Android, local downloads, and WebDAV, with filtering by title, author, tags, categories, provider, and storage location.
- **Shelves** — organize comics into user-defined groups.
- **Recommend / Discover** — personalized recommendations and discovery.
- **Online** — Pica and E-Hentai / ExHentai search, categories, rankings, favorites, and related online features.
- **Reading history** — resume a title at the saved chapter and page.
- **Downloads / Downloaded** — persistent download queue, recovery, and local downloaded content.
- **Settings** — recommendations, connections, appearance, storage, maintenance, and software updates.

## 3. Online providers and accounts

### Pica

Supports sign-in, registration, search, categories, rankings, favorite sync, online reading, and downloads. Registration only submits the information you review and confirm; it does not automatically sign in, sync, or download.

### E-Hentai / ExHentai

E-Hentai supports public search, details, online reading, downloads, Latest, Popular, Favorites, Watched, Toplists, and advanced filters. ExHentai is an optional extension under the E-H account; failure to access it does not block E-H, the local library, or recommendations.

E-H tags retain their canonical `namespace:value` identity. Chinese display and search assistance are presentation/lookup layers and do not replace canonical tags.

## 4. Recommendations and manual controls

Recommendations combine lifetime interests, recent behavior, explicit preferences, and current-session intent. Pica and E-H retrieve candidates independently before unified ranking, deduplication, and batching.

Under **Settings → Recommendations & Visual Style**, you can:

- inspect the recommendation profile;
- adjust interests on a **0–10 scale**;
- block or reduce selected interests;
- set temporary intents such as what you want to see this session;
- enable or disable visual-style recommendations;
- review and synchronize portable recommendation preferences with Android.

**5/10 is neutral.** A new user can configure initial preferences manually even before enough favorite data exists to build a profile.

Visual-style recommendations are an independent module. Turning them off does not disable normal recommendations.

## 5. Downloads, reading, and history

The download queue persists across restarts. Failed tasks can be retried, and active tasks can be paused or resumed.

Reading supports Desktop-local downloads, Pica online content, E-H online content, and WebDAV. The reader supports left-to-right, right-to-left, vertical continuous mode, chapter navigation, progress saving, and resume.

A paired Android device can read comics already downloaded by Desktop without downloading the same files again.

## 6. Settings hub

The current Desktop Settings Hub has seven areas:

### General

Account and basic settings, plus **Support the Project**. AFDIAN and GitHub links are available here. Support is voluntary and never unlocks extra features, content, or access.

### Recommendations & Visual Style

Recommendation profile, 0–10 manual controls, explicit feedback, cross-device recommendation sync, visual-style settings, and related advanced diagnostics.

### Connections & Sync

Android pairing, cross-device sync, remote access, and WebDAV.

### Appearance & Personalization

Light/dark appearance, theme packs, and personalization. Theme packs may sync across devices while each device keeps its active theme independently.

### Downloads & Storage

Library location, cache, download tasks, and storage policy.

### Maintenance

Library repair, logs, exports, and advanced maintenance tools.

### Software Update

Official Release checks, compatible updates, local update ZIPs, verification, restart, and rollback.

## 7. Android pairing and sync

When the phone and PC are on the same LAN, enable mobile access under **Settings → Connections & Sync** on Desktop, then finish pairing from **Android → Settings → Manage connection**.

After pairing, Android can:

- read Desktop-local comics and covers;
- read Desktop-downloaded content directly;
- synchronize portable library and recommendation foundation data;
- compare and merge explicit recommendation adjustments;
- receive available theme packs;
- use the LAN for fast Desktop content access.

Recommendations can run independently on both devices. Sync does not force both devices to share the same current recommendation batch or session.

WebDAV can serve as a fallback when Desktop is offline.

## 8. Personalization

Desktop can create, import, and manage `.pica-theme` packs and synchronize available packs to Android. Theme packs contain controlled data and image resources only; they do not execute arbitrary scripts.

Desktop and Android keep their active theme selections independently.

## 9. Software updates

Prefer **Settings → Software Update**.

The public user upgrade path is intentionally simple:

- **v0.4.0 → current release v0.4.7**: use `Pica-Library-v0.4.7-upgrade-assistant.zip` from the v0.4.7 Release and move directly to the latest release. No intermediate versions are required.

The upgrade assistant verifies the official full package, protects `%LOCALAPPDATA%\Pica Library`, creates application/database safety snapshots, replaces the application, runs health checks, and rolls back on failure.

Application files and user data are separate. Do not delete `%LOCALAPPDATA%\Pica Library` during an upgrade.

## 10. Data and safety

- Pica Library is a local-first personal digital-content management tool.
- The project does not sell, host, or redistribute manga content.
- Windows secrets are protected with DPAPI for the current Windows user.
- Official releases publish SHA-256 and build-transparency information.
- Library data, shelves, reading history, settings, and downloaded content are kept separately from application files by default.
- Only access and save content you are authorized to use.

See [DISCLAIMER.md](../DISCLAIMER.md) for the full usage notice.

---

[Back to README](../README.en.md) · [Android guide](android-guide.en.md) · [Quick start](quick-start.en.md)
