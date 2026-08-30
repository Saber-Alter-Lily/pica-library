[简体中文](README.md) | English

# Pica Library

Turn a Pica collection into a durable local manga library for organizing, discovering, downloading, and reading in one place.

**Windows 10/11 x64 · extract and run · data stays local by default.**

![Pica Library](docs/assets/screenshots/v0.3.0/02-library.png)

> Sync favorites once, then keep filtering and organizing the same local library by author, tag, category, and shelf.

## Get started

1. Download `Pica-Library-v0.3.0-windows-x64.zip` from [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases).
2. Extract the complete ZIP.
3. Double-click `Pica Library.exe`.
4. Finish account, optional proxy, and library-folder setup.
5. Sync favorites and start using the library.

See the [quick start](docs/quick-start.en.md) for the guided flow.

## Main features

- **Library:** Sync favorites and filter by author, tag, category, and shelf.
- **Personal recommendations:** Generate explainable batches from your own collection profile, then switch batches or regenerate a cycle.
- **Collection atlas:** Summarize series/IPs, creators, and long-term semantic interests into a local profile and result card.
- **Download and read:** Manage queues, retries, and reading progress with the built-in Web Reader.
- **Maintenance and updates:** Check content updates, repair missing files, and install compatible official updates inside the app.

![Recommendations](docs/assets/screenshots/v0.3.0/03-recommendations.png)

> Recommendations are built from the local collection profile and include concise reasons for why an item was surfaced.

![Collection atlas](docs/assets/screenshots/v0.3.0/04-atlas.png)

> The collection atlas organizes series/IPs, creators, and long-term semantic preferences without publishing personal collection data.

## Upgrade from an older version

- **v0.2.0 → v0.3.0:** Open **Maintenance → Software update → Check and update now**.
- **v0.1.x:** Download and extract a fresh full Windows ZIP.

The database, collection, and downloads live in a separate data directory, so compatible updates do not remove them when application files are replaced.

## Data and safety

- Data stays on the local computer by default.
- Provider credentials are protected with Windows DPAPI.
- The local service listens on `127.0.0.1` only.
- Pica passwords are never written to the database, exports, or release packages.

## More

[Quick start](docs/quick-start.en.md) · [Windows guide](docs/windows-distribution.md) · [Architecture](docs/architecture.md) · [Issues](https://github.com/Saber-Alter-Lily/pica-library/issues) · [LICENSE](LICENSE) · [UPSTREAM](UPSTREAM.md)

Only download material you are authorized to access. Do not redistribute it.
