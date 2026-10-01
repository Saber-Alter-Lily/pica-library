[简体中文](windows-distribution.zh-CN.md) | English

# Windows One-Click Distribution

> Current stable release: **v0.5.0**.

## Download and start

1. Download the current stable Windows package from [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases/latest). For v0.5.0, use `Pica-Library-v0.5.0-windows-x64.zip`.
2. Extract the complete ZIP to a normal folder. Do not run the executable from inside an archive viewer.
3. Run `Pica Library.exe`.
4. The local setup page opens in your browser. Configure accounts, library location, download behavior, and an HTTP/HTTPS proxy only when needed.

No system Node.js, npm, pnpm, Git, terminal, or administrator privileges are required.

## SmartScreen

The Windows executable is currently not commercially code-signed, so Windows SmartScreen may show a reputation warning. Confirm that the package came from the official GitHub Release and verify the published SHA-256 before deciding to run it.

Do not disable Defender or SmartScreen globally for Pica Library.

## Local data and credentials

User data lives under `%LOCALAPPDATA%\Pica Library` by default:

- `config/` — non-secret settings and DPAPI-protected credentials;
- `data/` — SQLite library and related persistent data;
- `cache/` — local cache;
- `logs/` — redacted diagnostic logs;
- `runtime-state/` — single-instance lock and local-service state.

Passwords use Windows DPAPI for the current user. Pica Library does not fall back to plaintext storage if DPAPI is unavailable. Normal configuration, SQLite data, logs, exported data, and release ZIPs do not contain plaintext account passwords.

The optional proxy is disabled by default. Proxy credentials use the same protected credential store.

## Settings hub

Desktop Settings currently includes:

- **General** — account, basic settings, and project support;
- **Recommendations & Visual Style** — recommendation profile, 0–10 manual controls, visual style, and recommendation sync;
- **Connections & Sync** — Android pairing, WebDAV, and remote access;
- **Appearance & Personalization** — light/dark mode and theme packs;
- **Downloads & Storage** — library location, cache, and storage policy;
- **Maintenance** — repair, logs, exports, and advanced tools;
- **Software Update** — official updates, local update ZIPs, verification, installation, and rollback.

Closing the last browser tab now stops an idle Desktop Node process after a short grace period only when no paired Android device needs the Mobile Bridge. If a phone is paired, the Desktop service stays available. Use the in-app exit action for an explicit full shutdown.

## Browser Lite

When needed, export a Browser Lite data package from the related advanced Settings area. Browser Lite does not need and does not receive the Pica account or password.

## Upgrades

Open **Settings → Maintenance → Software Update**.

### Recommended path: v0.4.11 → v0.5.0

Public v0.4.11 users can use **One-click check & update**. The stable Release provides a source-scoped package:

`Pica-Library-v0.5.0-update-from-v0.4.11.zip`

The already-shipped v0.4.11 updater verifies and applies the compatible payload, moving the database from schema 13 to 14. v0.5.0 then starts and reconnects the Web UI automatically.

On first v0.5.0 startup, Desktop registers the persistent helper under:

`%LOCALAPPDATA%\Pica Library\runtime-state\upgrade-assistant\`

It stores the verified Node runtime, `full-upgrader.js`, and `assistant.json`. Future schema jumps, updater replacement, or full application-tree replacement can prepare an isolated bootstrap from this external location and continue using the same one-click update entry.

### Fallback Upgrade Assistant

If the in-app channel is unavailable, download from the same v0.5.0 Release:

`Pica-Library-v0.5.0-upgrade-assistant-from-v0.4.11.zip`

Extract it and run `Upgrade-Pica-Library-v0.5.0.cmd`. The fallback assistant pins the target full-package SHA-256, SOURCE_SHA, and database schema, preserves user data, and rolls back on failure.

### Manual replacement

Manual replacement remains a final fallback: fully exit the old version, extract the latest complete ZIP to a new directory, and run it.

**Do not delete `%LOCALAPPDATA%\Pica Library`.** Database, shelves, reading history, settings, credentials, and downloaded content remain outside the application tree.

If the library/download folder is inside the old application directory, automatic full replacement refuses to proceed until the data is moved.

## Verify SHA-256

Download `SHA256SUMS.txt` from the same official Release and run:

```powershell
Get-FileHash .\Pica-Library-v0.5.0-windows-x64.zip -Algorithm SHA256
```

Compare the full hash with the official Release value before extracting the package.
