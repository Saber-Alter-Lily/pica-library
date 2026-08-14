[简体中文](README.zh-CN.md) | English

# Pica Library

Pica Library is a collection-centric manager, explainable discovery engine,
and shared local/GitHub downloader for long-lived Pica libraries.

It keeps stable library state instead of treating every download as a new job:

- **Library:** synchronize or import favorites, filter by tags and normalized authors.
- **Discover:** search the provider and get explainable recommendations from the whole collection.
- **Download:** add any result to one persistent queue with progress, retry, pause and resume.
- **Maintain:** detect new episodes, repair missing files, review author identities and organize folders.

## Try it

Current stable release: `v0.2.0`. This release provides a Windows 10/11
x64 package for ordinary users:

1. Download `Pica-Library-v0.2.0-windows-x64.zip` from the release.
2. Extract the entire ZIP.
3. Double-click `Pica Library.exe` and complete setup in the browser.

v0.2.0 includes full Simplified Chinese localization, bilingual onboarding,
and the Browser Lite data-package export flow.

The stable v0.2.0 release adds quick favorites synchronization,
shelves, author/tag facets and advanced filtering, persistent recommendation
sessions with background pre-generation and previews, real add/remove Pica
favorite actions, richer download and downloaded-library management, an
internal Web Reader with reading progress, ZIP/CBZ export, and the incremental
update framework.

Important upgrade note: users of v0.1.3 must download and extract the full
`Pica-Library-v0.2.0-windows-x64.zip` package. v0.1.3 does not contain the new
UpdateManager and cannot consume a v0.2.0 incremental package. v0.2.0
establishes the baseline from which future compatible releases may use the
built-in incremental Update ZIP flow.

### Browser Lite

Browser Lite displays an exported library in the browser and never asks for a
Pica account or password. To prepare its recommended data package:

1. Download and open the [Pica Library Windows release](https://github.com/Saber-Alter-Lily/pica-library/releases).
2. Complete setup and prepare the library.
3. Open **Settings → Browser Lite → Export Browser Lite Data Package**.
4. Open Browser Lite and import `pica-library-bundle.json`.

The complete package can carry prepared library, author and recommendation
data. Existing compatible CSV and JSON imports remain available.

v0.2.0 provides an internal Web Reader and ZIP/CBZ export. It also exposes an
external-reader integration interface, but does not bundle a third-party
reader or import arbitrary local CBZ/ZIP files.

The package carries its own official Node.js runtime. It does not require a
terminal, Node.js, npm, pnpm, Git, administrator access, or `.env.local`.
Credentials are protected for the current Windows user with DPAPI and are never
stored in the normal configuration file. The unsigned open-source executable
may initially show a Windows SmartScreen reputation warning.

Application data lives under `%LOCALAPPDATA%\Pica Library` by default, separate
from the extracted application. Replacing a future application folder will not
remove the library database, cover cache, configuration, or downloads.

For source development and advanced local use:

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.template .env.local
pnpm build
node dist/pica-library.js serve
```

Open `http://127.0.0.1:4789`. Connected commands read `PICA_ACCOUNT` and
`PICA_PASSWORD` from the local environment. Credentials are not written to the
database, Bundle, artifact, or logs.

The static `web/` directory also works in Browser Lite mode. It can import a
Pica Library Bundle, browse and filter records, review authors, view prepared
recommendations, and export a download plan. Cover references stay lightweight;
images are loaded lazily and failed images fall back to a local placeholder. It
never asks for a Pica password.

The connected Library defaults to a cover grid, offers a compact list view, and
renders large collections 48 items at a time. Discover combines bounded related,
author, circle, tag, and category recall into personalized, explainable
recommendations. Scores and recall evidence remain available in data/audit
outputs while normal cards stay concise.

## Runners

| Runner | Best for | State | Output |
| --- | --- | --- | --- |
| Local Engine | Persistent libraries, resume, updates, repair and organization | SQLite on your machine | Author-first `library/` |
| GitHub private caller | Short, manual, ephemeral download batches | Secrets and run belong to a private repository | One-day private Artifact |

Both runners call the same `pica-library` CLI and shared download engine. The
GitHub engine accepts one favorites page or up to 20 comic IDs and uploads
`library/`, `download-result.json`, `manifest.json`, and `errors.json` when
failures exist. The reusable workflow refuses any caller whose repository is
not private. This keeps credentials, run logs, and downloaded artifacts in a
user-controlled private repository even if the source repository becomes
public. See [the private runner guide](docs/private-github-runner.md). Only
download material you are authorized to access and do not redistribute it.

## Security boundaries

- Provider credentials are environment/Repository Secrets only; they are not
  persisted in SQLite, Browser Lite, Bundles, or artifacts.
- API authentication and media transfer use separate HTTP clients. Cover and
  page requests never inherit API Authorization/signature headers.
- The local server binds to loopback by default. Its cover route accepts a comic
  ID, never an arbitrary proxy URL, and caches only bounded `image/*` responses
  under the selected data directory.
- Portable Bundles contain metadata, not embedded base64 cover libraries or
  absolute maintainer paths.

## CLI

```text
pica-library library sync|list|import|export
pica-library discover search|recommend
pica-library download list|run|pause|resume|retry|cancel
pica-library maintenance updates|repair|authors|health
pica-library serve
pica-library doctor
```

Run `pica-library help` for compatibility commands and options.

## Provenance

The provider transport, API client and mature picture transfer behavior are
derived from the MIT-licensed [`justorez/pica-cli`](https://github.com/justorez/pica-cli)
by Neo. Pica Library is independently maintained and adds the persistent library,
author, recommendation, queue, maintenance, Bundle, runner integration and Web
architecture. See [UPSTREAM.md](UPSTREAM.md), [NOTICE.md](NOTICE.md), and
[LICENSE](LICENSE).

Architecture and review records are in [docs/architecture.md](docs/architecture.md)
and [docs/audit](docs/audit).

See the [Windows distribution guide](docs/windows-distribution.md) for setup,
upgrades, SmartScreen guidance and SHA-256 verification.
