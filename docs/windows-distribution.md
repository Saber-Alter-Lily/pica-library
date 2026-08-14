[简体中文](windows-distribution.zh-CN.md) | English

# Windows One-Click Distribution

## Export a Browser Lite Data Package

After preparing the library, open **Settings → Browser Lite** and choose
**Export Browser Lite Data Package**. Save the default
`pica-library-bundle.json`, then select that file on the Browser Lite page.
The web page does not need or request the Pica account or password.

Pica Library v0.1.3 targets Windows 10/11 x64 as its ordinary-user
package. Download the ZIP, extract the entire directory, and double-click
`Pica Library.exe`. Do not run the executable from inside an archive viewer.

For the v0.1.3 to v0.2.0 upgrade, download and extract the complete v0.2.0
Windows ZIP. v0.1.3 cannot consume the new incremental update format. v0.2.0
establishes the updater baseline for future compatible releases.

The first launch opens a setup page on `127.0.0.1`. Enter the Pica account and
password, choose a library folder and performance profile, and optionally add
an HTTP or HTTPS proxy. The folder picker is native to Windows; a path can also
be entered manually. Later launches open the existing Library UI directly.

## Local Data and Credentials

Mutable application files live under `%LOCALAPPDATA%\Pica Library` by default:

- `config/` contains non-secret settings and DPAPI-protected credentials.
- `data/` contains the default SQLite library and downloads.
- `cache/` is reserved for local cache data.
- `logs/` contains redacted diagnostic logs.
- `runtime-state/` contains the single-instance lock and active local URL.

The password is encrypted with Windows DPAPI for the current user. Pica Library
does not fall back to plaintext if DPAPI is unavailable. The normal config,
SQLite database, logs, Browser Lite data, Bundles, and release ZIP do not store
the plaintext account or password.

The optional proxy is disabled by default. Only HTTP and HTTPS proxy URLs are
accepted. Proxy username/password components use the same DPAPI credential
store and are removed from normal configuration and logs.

## Settings and Exit

Use **Settings** in the Web UI to change the account, password, library folder,
download profile, or proxy; test the connection; open the library or log
folder; view the version; or exit Pica Library. The saved password is never
shown. Changing the library folder restarts the local engine against the new
directory without deleting the old directory.

Only one engine runs per Windows user. A second launch opens the healthy
existing instance. Port 4789 is preferred; when another service owns it, Pica
Library selects a free loopback port and opens the correct URL. The server does
not bind to the LAN by default.

## Updates and Trust

Application files and mutable data are separate. A future application ZIP can
be extracted to a new directory without deleting the existing database,
configuration, cache, or downloads.

The v0.1.3 Windows release is unsigned. Windows may display a SmartScreen or
reputation warning for a new unsigned open-source executable. No self-signed
certificate is presented as production signing.

The package includes an official Node.js Windows x64 runtime, but users do not
need a system Node.js, npm, pnpm, Git, terminal, or administrator privileges.
Advanced users may continue to use the source CLI and environment-variable
workflow documented in the main README.

## Verify SHA-256

Download `SHA256SUMS.txt` from the same official GitHub Release. In PowerShell,
run `Get-FileHash .\Pica-Library-v0.1.3-windows-x64.zip -Algorithm SHA256`
and compare the complete value with the published checksum before extracting.
