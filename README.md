# Pica Library

Pica Library is a collection-centric manager, explainable discovery engine,
and shared local/GitHub downloader for long-lived Pica libraries.

It keeps stable library state instead of treating every download as a new job:

- **Library:** synchronize or import favorites, filter by tags and normalized authors.
- **Discover:** search the provider and get explainable recommendations from the whole collection.
- **Download:** add any result to one persistent queue with progress, retry, pause and resume.
- **Maintain:** detect new episodes, repair missing files, review author identities and organize folders.

## Try it

This is a private `0.1.0-rc.1` review candidate, not a release. For local review:

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
recommendations, and export a download plan. It never asks for a Pica password.

## Runners

| Runner | Best for | State | Output |
| --- | --- | --- | --- |
| Local Engine | Persistent libraries, resume, updates, repair and organization | SQLite on your machine | Author-first `library/` |
| GitHub Runner | Short, manual, ephemeral download batches | Repository Secrets + temporary job state | Short-lived GitHub Artifact |

Both runners call the same `pica-library` CLI and shared download engine. The
manual GitHub workflow accepts one favorites page or up to 20 comic IDs and
uploads `library/`, `download-result.json`, `manifest.json`, and `errors.json`
when failures exist. Only download material you are authorized to access and
do not redistribute workflow artifacts.

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
