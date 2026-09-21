# Pica Library Android Guide

> Current stable release: **v0.4.6 · versionCode 46**. The Android app is not distributed through any app store. Download APKs only from this repository's official GitHub Release.

## 1. Download and install

1. Open [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases/latest).
2. Download the current APK. For v0.4.6, use `Pica-Library-Android-v49.apk`.
3. Open the APK and allow the one-time Android install action when prompted.
4. Read and acknowledge the startup usage notice.

Avoid third-party mirrors. Formal updates verify version metadata, package name, SHA-256, and the official signing identity.

## 2. Four main tabs

The main navigation is:

- **Library** — unified library, local content, favorites, shelves, reading history, and downloaded content.
- **Recommend** — independent Android recommendations, batch switching, and recommendation reasons.
- **Online** — Pica and E-Hentai / ExHentai search, categories, rankings, favorites, and online reading.
- **Settings** — connections, recommendations and visual style, accounts, appearance, storage, software updates, project support, and about information.

## 3. Online providers and accounts

### Pica

Supports sign-in, registration, search, categories, rankings, favorite sync, online reading, and downloads. Registration submits only the information you review and confirm; it does not automatically sign in, sync, or download.

A network timeout is not the same as an incorrect password. Local, LAN, and WebDAV reading remain usable when Pica online services are unavailable.

### E-Hentai / ExHentai

E-Hentai provides search, details, online reading, downloads, and favorites. ExHentai is an optional E-H extension; failure to access it does not block E-H, the local library, or recommendations.

## 4. Recommendations and manual controls

Android can run recommendations independently without requiring Desktop to remain online.

Under **Settings → Recommendations & Visual Style**, you can:

- inspect the recommendation profile;
- open **Manual adjustment**;
- set tag, author, and other preferences on a **0–10 scale**;
- block or reduce selected interests;
- set temporary session intent;
- control feedback-reason prompts;
- enable or disable visual-style recommendations;
- compare and synchronize portable recommendation preferences with Desktop.

**5/10 is neutral.** Initial preferences can be configured even when no favorite-based profile exists yet.

Visual-style recommendations can be disabled independently without affecting standard recommendations.

## 5. Pair with Desktop

When phone and PC are on the same LAN:

1. On Desktop, open **Settings → Connections & Sync** and enable mobile access.
2. On Android, open **Settings → Manage connection**.
3. Use the displayed pairing information to connect.

After pairing, Android can:

- read Desktop-local comics and covers;
- read Desktop-downloaded comics directly;
- synchronize portable library and recommendation foundation data;
- compare and merge explicit recommendation adjustments;
- receive theme packs available on Desktop.

After the pairing succeeds, recommendation and shelf synchronization may continue in the background instead of keeping the UI stuck in a connecting state.

## 6. WebDAV

WebDAV can act as a fallback source when Desktop is offline. Configured remote storage can be inspected, switched, and used from Settings.

When Desktop is available, LAN reading is normally preferred; WebDAV can provide fallback access when Desktop is unavailable.

## 7. Reading and downloads

Android supports reading from:

- phone-local content;
- Desktop-downloaded content;
- WebDAV;
- Pica online;
- E-H online.

The reader supports left-to-right, right-to-left, vertical continuous mode, chapter navigation, progress saving, and resume.

Android also supports local downloads with queue progress, failure recovery, pause, and resume.

## 8. Appearance and themes

Settings provide basic light/dark appearance controls and `.pica-theme` theme packs.

Theme packs can be synchronized from Desktop, but Android keeps its active theme selection independently.

## 9. Software updates

Open **Settings → Software Update**.

Formal updates verify:

- versionCode / versionName;
- APK SHA-256;
- application package name;
- official signing identity.

Existing **v42 / 0.4.0** users can update in place directly to **v49 / 0.4.4** through the in-app update chain; no intermediate versions are required.

If an update briefly reports that it is waiting for the Android system download service, Android DownloadManager is usually queueing the request; continue later or restart the download if needed.

## 10. Support the project

Open **Settings → Support the Project** for:

- **AFDIAN** — voluntary support for development, testing, and maintenance;
- **GitHub** — Star the project, report issues, or contribute.

Support is completely voluntary. It does not unlock additional features, content, download privileges, or access.

## 11. Data and usage boundaries

- Pica Library is an open-source, local-first personal digital-content management tool.
- Android sensitive sessions use Android Keystore protection.
- The project does not sell, host, or redistribute manga content.
- Users are responsible for ensuring that account use, access, downloads, storage, and reading comply with applicable law, platform terms, and permissions.

See [DISCLAIMER.md](../DISCLAIMER.md) for the full notice.

---

[Back to README](../README.en.md) · [Desktop / Web guide](desktop-guide.en.md) · [Quick start](quick-start.en.md)
