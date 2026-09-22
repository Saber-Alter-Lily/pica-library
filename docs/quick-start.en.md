# Pica Library Quick Start

Current stable release: **v0.4.8**. A typical first-time Windows setup consists of downloading the application, completing initial settings, synchronizing the library, and optionally configuring recommendations.

## 01 Download and extract

Download the current stable Windows package from [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases/latest).

For v0.4.8:

`Pica-Library-v0.4.8-windows-x64.zip`

Extract the complete archive to a normal folder. Do not run the executable from inside an archive viewer.

## 02 First launch

Run `Pica Library.exe`. The local setup page opens in your browser.

Configure as needed:

- Pica account sign-in or registration;
- library/download folder;
- download behavior;
- HTTP/HTTPS proxy.

Leave the proxy disabled unless your network actually requires one to reach an online provider.

The Windows executable is currently not commercially code-signed, so SmartScreen may show a warning. Verify that the package came from the official GitHub Release and compare its SHA-256 before running it.

## 03 Build the unified library

After account setup, synchronize favorites and build the local library.

The unified library can represent:

- Pica;
- E-Hentai / ExHentai;
- Desktop-local content;
- Android;
- WebDAV;
- downloaded content.

Filter by title, author, tags, categories, provider, storage location, and related fields.

## 04 Configure recommendations

Recommendations combine lifetime favorites, recent behavior, explicit preferences, and current-session intent.

Open **Settings → Recommendations & Visual Style** to inspect the profile and use manual controls.

Manual preferences use a **0–10 scale**:

- **5/10** — neutral;
- above 5 — show more;
- below 5 — show less;
- blocking is also available;
- temporary session intents can be set independently.

Initial preferences can be configured even before enough favorite data exists to build a recommendation profile.

Visual-style recommendations are optional and can be disabled without affecting standard recommendations.

## 05 Browse, download, and read

Online views provide Pica and E-Hentai / ExHentai search, details, favorites, and reading where supported.

Download tasks can be monitored, paused, resumed, and retried. The reader supports:

- left-to-right;
- right-to-left;
- vertical continuous mode;
- chapter navigation;
- progress saving;
- resume from history.

## 06 Pair Android

On Desktop, open **Settings → Connections & Sync**. On Android, open **Settings → Manage connection**.

After pairing, Android can read Desktop-downloaded comics directly without downloading a duplicate copy. Portable library data, recommendation foundation data, explicit preferences, and theme packs can also be synchronized.

Recommendations continue to run independently on each device; synchronization does not force both devices to use the same current batch.

## 07 Support the project

Desktop: **Settings → General → Support the Project**

Android: **Settings → Support the Project**

AFDIAN and the GitHub project page are available there. Support is voluntary and never unlocks extra features, content, or access.

## 08 Software updates

On Windows, open **Settings → Software Update**.

Existing **v0.4.0** users should move directly to the current release:

- download `Pica-Library-v0.4.8-upgrade-assistant.zip` from the v0.4.8 Release;
- run `Upgrade-Pica-Library-v0.4.8.cmd`;
- no intermediate versions are required.

The assistant verifies the official full package, protects `%LOCALAPPDATA%\Pica Library`, creates application/database backups, replaces the application, runs health checks, and rolls back on failure.

Android v42 / 0.4.0 users can update directly through the in-app chain to v51 / 0.4.7; intermediate versions are not required.

Application files and user data are separate. Do not delete `%LOCALAPPDATA%\Pica Library` during an upgrade.

## 09 More documentation

- [Desktop / Web guide](desktop-guide.en.md)
- [Android guide](android-guide.en.md)
- [Windows distribution and upgrades](windows-distribution.md)
- [Project log](../PROJECT_LOG.md)
- [Usage boundaries and disclaimer](../DISCLAIMER.md)
