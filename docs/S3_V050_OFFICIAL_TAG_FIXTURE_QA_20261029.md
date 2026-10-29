# CORE-LIB-04c-02b-03b-01 — Official v0.5.0 source-built migration fixture

Date: 2026-10-29. State: **DRAFT / QA-ONLY**; PR #245 stacked on #244. This is a compatibility assessment, not an installed-profile migration, backup authority, installer or release.

## Open-source reuse decisions

| Existing technology | What we reuse | Why no new implementation |
| --- | --- | --- |
| Project's published v0.5.0 source commit `bec7f9f31828e8c57e0a2c103b6b1206c22c37cf` | The real `LibraryDatabase`, `desktop/config` and migrations from the old tag; Git checkout and five blob SHA pins | Creates the old-format fixture with actual historical code instead of a newly handwritten imitation |
| Existing Node 24 `node:sqlite`, SQLite [Online Backup API](https://www.sqlite.org/backup.html) and #243 WAL tests | Existing snapshot implementation and regression suite | SQLite's official backup API already handles WAL consistency, but it does not freeze a separately mutable media directory |
| Android open-source Room [MigrationTestHelper pattern](https://developer.android.com/reference/androidx/room/testing/MigrationTestHelper) | **Methodology only**: create data with old schema/runtime, reopen/validate with new code | Do not import an Android framework into the Node/Desktop test |
| [Litestream](https://github.com/benbjohnson/litestream) / [WAL design](https://litestream.io/how-it-works/) | Studied as an alternative for continuous database disaster recovery | Not adopted: a streaming background replication service adds a daemon and still cannot prove a full app-wide atomic snapshot of SQLite, downloaded files, opaque credentials and WebDAV state |

No new DB engine, scraping protocol, updater, backup library or model has been added. The test intentionally uses existing `tsx`, GitHub Actions, Git, SQLite and current project modules.

## Exact provenance

The GitHub Actions job checks out two *different* code trees: the current Draft source and the real release commit SHA with `persist-credentials: false`. A CI-only script first validates the exact commit and these five original source blob IDs:

- `src/library/database.ts`: `649f19b65ca67996b934b9e15535135f8889b96f`
- `src/desktop/config.ts`: `58792d6f15315b6000cd28db20319132f5bba91b`
- `src/desktop/types.ts`: `e63de26c3a592542ea1b0efc0c06b0fd50c70e72`
- `src/desktop/paths.ts`: `f4cf5e3f6bf3d5b9603dbbcc295d8ff58659ae8d`
- `src/storage/sqlite/migrations.ts`: `4a98683fb29feec31970d3958385968f65af6365`

The release checkout must be clean. Its original `src/library/database.ts` and `src/desktop/config.ts` are loaded from the pinned second checkout, *not* from current `src/`. A failure to verify provenance is a hard test failure.

## Implemented and verified flow

`scripts/qa/v050-release-tag-interoperability.ts` is **CI-only** (`GITHUB_ACTIONS` and exact repository identity required). The script creates one unique and marked OS-temp `pica-v050-history-qa-*` directory, builds the release config with a synthetic, never-sent account/password, and writes a fake opaque credential byte file. It calls actual release `LibraryDatabase` to:

1. Create real migration-14 SQLite schema and import one synthetic favourite with author and tags.
2. Add one synthetic episode and page with a local 1×1 PNG and a synthetic downloader-completion record.
3. Create a shelf, add the work, and save reader progress.
4. Close the legacy database, assert no WAL/SHM/journal sidecars, hash config/DB/credential/media bytes.
5. Ask the new `qualifyV050HistoricalFixtureReadOnly` gate to verify the old SQLite and release-shaped config. Test exact migrations, selected table/column shape, integrity, secret-free sanitized status and no file changes.
6. Reuse the *release's own* `buildConfig` for conservative / balanced / fast and optional proxy settings, checking three original download-profile shapes plus proxy admission against the current gate.
7. As deliberate mutated synthetic negative cases, reject an unconsented nonexistent external library path **without inspecting it**, reject post-release `externalSources` fields, and classify a config with omitted `openBrowser` / `preferredPort` as REVIEW_REQUIRED even though the release's own `loadConfig` accepts it. This omission is now an explicit future compatibility decision, not silently converted.
8. Refuse synthetic old instance-lock and WAL marker without deletion, and verify the final original config/DB SHA-256 is preserved. Total **nine** source-built/negative admission scenarios.
9. Remove only the temporary fixture in `finally`. No artifact, updater, source plugin, login, DPAPI call or live-data migration.

The combined workflow also runs prior historical read-only and WAL backup tests. It uses pinned Node 24.15.0, `pnpm@11.16.0`, separate Linux/Windows runner jobs and checkout SHA proofs.

## Test and evidence boundaries

- First source-built three-case run [#40914858557](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40914858557) passed **2/2 Linux/Windows**; both original job logs printed official tag SHA, actual historic module execution and 20/20 associated unit regressions.
- Expanded final executable script `2abcc1f6ebff1508975aa6dc5b0cde82cafed491` passed [exact-head nine-case official-source CI #40915400620](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40915400620): **Linux SUCCESS and Windows SUCCESS (2/2)**. Linux log independently confirms `scenarioCount=9`, `productionMigrationAuthorized=false`, `realUserProfileTouched=false`, `artifactPublished=false`. The run also passed the existing old read-only and SQLite WAL snapshot regressions. The executable script's test status must not be conflated with production migration readiness.
- The original #244 synthetic gate had tested a modern `LibraryDatabase` with identical old migrations. This slice **eliminates that historical-runtime substitution** by executing the original `v0.5.0` implementation in its own pinned checkout.
- A passing test proves only **synthetic tag-code compatibility with the new read-only gate**. It does **not** establish the complete diversity of existing user databases, real credentials, Windows installation roots, external library consent, crash-safe SQLite-plus-media snapshots, encrypted production backups, Android migration, or one-click upgrade/rollback.
- PR #245 remains Draft, #244/#243 remain unmerged, main `095d691` and published `v0.5.0` / OTA remain unchanged.

## Next safe stage: CORE-LIB-04c-02b-03b-02

Build a **source-authored historical edge-case matrix** without expanding filesystem authority: original config profiles/optional fields, historical schema sequences, post-release signatures, live/stale locks, WAL/SHM/hot journal, directory junction/symlinks/hardlinks, custom/external local files, large media/disk budgets and partial copies. First classify `READ_ONLY`, `REVIEW_REQUIRED`, `BLOCKED`; do not perform real backup/migration or set future-user consent solely based on an automated fixture.

After those gates: application-wide write quiescence, complete media inventory, native SQLite backup plus protected opaque-file snapshot, authenticated/encrypted manifest, disk-full/kill/failure-injection rollback, and old-version one-click updater integration on **an isolated copy**. User approval, Android source-free APK, G1 UI, G2 source isolation, G3 migration and G4 release are all OPEN.
