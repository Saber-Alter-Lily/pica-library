[简体中文](windows-distribution.zh-CN.md) | English

# Windows One-Click Distribution

> Current stable release: **v0.4.4**.

## Download and start

1. Download the current stable Windows package from [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases/latest). For v0.4.4, use `Pica-Library-v0.4.4-windows-x64.zip`.
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

Closing the browser tab does not stop the Desktop process. Use the in-app exit action when you want to stop the local service completely.

## Browser Lite

When needed, export a Browser Lite data package from the related advanced Settings area. Browser Lite does not need and does not receive the Pica account or password.

## Upgrades

Open **Settings → Software Update** and check the current formal release.

### Public upgrade path: v0.4.0 → v0.4.4

Download from the **v0.4.4 Release**:

`Pica-Library-v0.4.4-upgrade-assistant.zip`

Extract it and run:

`Upgrade-Pica-Library-v0.4.4.cmd`

The assistant:

- verifies the official full-package SHA-256 and target version;
- identifies the old application directory;
- protects `%LOCALAPPDATA%\Pica Library`;
- creates application and SQLite safety snapshots;
- closes the old version and replaces the application;
- performs version/database health checks;
- rolls back automatically on failure.

This is the recommended public-user path. Intermediate versions are not required.

### Manual replacement

Manual replacement remains available as a fallback: fully exit the old version, extract the latest complete ZIP to a new directory, and run it.

**Do not delete `%LOCALAPPDATA%\Pica Library`.** Database, shelves, reading history, settings, credentials, and downloaded content are stored separately from application files.

If the library/download folder is inside the old application directory, the upgrade assistant refuses automatic replacement and asks you to move the data first.

## Verify SHA-256

Download `SHA256SUMS.txt` from the same official Release and run:

```powershell
Get-FileHash .\Pica-Library-v0.4.4-windows-x64.zip -Algorithm SHA256
```

Compare the full hash with the official Release value before extracting the package.
