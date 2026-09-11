# Pica Library Android Guide

> Current build: **Android Preview v38 · Alpha8.11**. The Android app is **not published in any app store**. Download the APK only from this repository's GitHub Release.

![Android overview](assets/android-overview.webp)

## Download and install

1. Open the [Android Preview release](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/android-preview).
2. Download `Pica-Library-Android-Preview.apk`.
3. Open the APK and allow the one-time sideload/install action when Android asks.
4. Read and acknowledge the startup usage notice.

Avoid third-party mirrors. The official Preview uses a fixed signing identity and verifies package metadata and SHA-256 during updates.

## Four main tabs

- **Library** — local, favorite, history, and downloaded content.
- **Recommend** — personalized recommendations.
- **Online** — search, categories, rankings, and other online views.
- **Connect** — Desktop pairing, WebDAV, Pica account, appearance, storage, and updates.

## Pair with Desktop

When the phone and PC are on the same LAN, open **Connect → Manage connection**, select the Desktop, and finish pairing. Once paired, Android can access content already downloaded by Desktop instead of downloading the same files again.

## WebDAV and Pica account

WebDAV can be configured as a fallback source when Desktop is offline. Pica account configuration is used by features that require online account access.

## Appearance and personalization

System/light/dark appearance modes are available directly.

Android can use locally available theme packs and can sync available packs from a paired Desktop. If a theme action requires additional verification, follow the prompt shown inside the app.

Theme packs may be shared, but **Desktop and Android independently keep their selected active theme**.

## Reading Desktop downloads

One of the main Android workflows is reading comics already stored on Desktop over the LAN. WebDAV may be used as a fallback source when needed.

## Updates

Use **Connect → Software Update**. The Preview updater verifies version, APK SHA-256, package name, and the fixed signing certificate before installation.

If an update briefly shows that it is waiting for the Android system download service, Android's DownloadManager is usually queueing the task; wait or restart the download if needed.

## Usage notice

Pica Library is an open-source, local-first personal content-management tool. It does not sell, host, or redistribute manga content. Users are responsible for ensuring that access, downloading, storage, and reading comply with applicable law, platform terms, copyright, and other permissions.

See [DISCLAIMER.md](../DISCLAIMER.md) for the full notice.

---

[Back to README](../README.en.md) · [Desktop / Web guide](desktop-guide.en.md)
