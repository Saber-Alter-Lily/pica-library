[简体中文](README.md) | English

# Pica Library

A local library for large Pica collections: sync, organize, discover, download,
and read on your own computer.

Built for Windows 10/11 x64. No Node.js, Git, or command line is required.

![Pica Library](docs/assets/screenshots/v0.3.0/02-library.png)
<!-- CAPTION_PENDING -->

## Get started

1. Open [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases).
2. Download `Pica-Library-v0.3.0-windows-x64.zip`.
3. Extract the complete ZIP.
4. Double-click `Pica Library.exe`.
5. Finish account, optional proxy, and library-folder setup, then sync favorites.

See the [English quick start](docs/quick-start.en.md) for the guided flow.

## What it does

- **Collection management:** Filter a durable local library by author, tag, category, or shelf.
- **Personal recommendations:** Generate explainable batches from your own collection preferences.
- **Collection atlas:** Organize creators, series, themes, and recurring interests into a local profile.
- **Download and read:** Track queues and chapters, resume work, and continue in the built-in reader.
- **Shelves and maintenance:** Normalize author aliases, organize files, and detect new episodes.
- **Safe updates:** Repair local state and install compatible updates from inside the Windows app.

![Recommendations](docs/assets/screenshots/v0.3.0/03-recommendations.png)
<!-- CAPTION_PENDING -->

![Collection atlas](docs/assets/screenshots/v0.3.0/04-atlas.png)
<!-- CAPTION_PENDING -->

## Upgrade from an older version

On v0.2.0, open **Maintenance → Software update → Check and update now** to
install the official v0.3.0 incremental update. For v0.1.x, download and
extract the complete Windows ZIP instead.

The database, collection, and downloads live in a separate data directory, so
a compatible update does not remove them when application files are replaced.

## Data and safety

- Data stays on the local computer by default.
- Provider credentials are protected with Windows DPAPI.
- The local service listens on loopback only.
- Pica passwords are never written to the database, exports, or release packages.

## More

- [Windows guide](docs/windows-distribution.md)
- [Architecture](docs/architecture.md)
- [Private GitHub Runner](docs/private-github-runner.md)
- [License](LICENSE), [notice](NOTICE.md), and [upstream](UPSTREAM.md)
- [Issues](https://github.com/Saber-Alter-Lily/pica-library/issues)

Only download material you are authorized to access. Do not redistribute it.
