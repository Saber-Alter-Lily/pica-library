# S3 CORE-LIB-04c-02b-03b-02 — Original-release historical migrations and synthetic media boundaries

Date: 2026-10-29. Scope: **Draft PR #246**, stacked on #245, not main.
Status: **QA ONLY / RELEASE AND USER DATA NOT AUTHORIZED**.

## 1. The concrete issue

The prior #245 suite used the official v0.5.0 `LibraryDatabase` to generate fresh schema-14 fixtures. That was a valuable origin check, but it could not demonstrate that **existing data created under older schema versions** survived the release's own migration chain. We therefore test source-authored `5→14`, `11→14`, `13→14`. This is the same compatibility question normally tested by [AndroidX Room's MigrationTestHelper](https://developer.android.com/reference/androidx/room/testing/MigrationTestHelper): prepare real old-schema input, execute the real migration code, then compare rows and validate the destination schema. We borrow the method, not the Room dependency.

## 2. Reused open-source code and deliberate non-adoption

| Source | Adopted here | Boundary |
| --- | --- | --- |
| Pinned open-source Pica Library v0.5.0 commit `bec7f9f` | The **real release `migrations.ts`, `LibraryDatabase` constructor and `desktop/config.ts`**, verified by Git SHA and five original file blobs | No imitation SQL schema or second migration framework |
| [SQLite official Online Backup API](https://www.sqlite.org/backup.html) | Retain the existing #243 `node:sqlite.backup` WAL-safe snapshot tests; official release itself creates its pre-migration DB backup | Native SQLite consistency is not SQLite-plus-all-media cross-file atomicity |
| [SQLite PRAGMA documentation](https://www.sqlite.org/pragma.html) | Both `integrity_check` and `foreign_key_check` because the former does **not** detect foreign-key violations | No irreversible DB repair and no assumption that absence of corruption proves external media are valid |
| [Microsoft Reparse Points](https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points) / Node fs | Use `lstat` for synthetic, owned trees and reject symlinks, Windows junctions, and hardlinks | No declaration that every Windows custom reparse tag is reliably classified by this Node-only QA prototype |
| [Litestream](https://github.com/benbjohnson/litestream) | Reviewed WAL replication model in earlier #245 audit, not installed | A streaming daemon does not replace application stop/quiescence, file inventory, OS credential protection or rollback |

We share v0.5.0 source provenance through `scripts/qa/v050-release-identity.ts`; the previous official-tag test and new 5/11/13 test reuse it. **No new dependencies, updater, SQLite engine, production data paths, source SDK, executable package or network service**.

## 3. Implemented source

- `scripts/qa/v050-official-migration-matrix.ts`: CI-only pinned-release checkout. For each old schema 5, 11, and 13, create a uniquely marked OS-temp synthetic profile, call the official `runMigrations` with the original published migration prefix, seed a synthetic comic, episode, completed local picture, downloaded record, shelf and reading position. Add historical app state, events or work identity only when those schema objects existed at that origin.
- Before upgrade, the current `qualifyV050HistoricalFixtureReadOnly` correctly classifies non-final schema `SCHEMA_MIGRATIONS_UNEXPECTED`; it never runs migration itself.
- Run the **release LibraryDatabase constructor**, which uses the actual published `backupBeforeMigration` and migration runner, not a test reimplementation. Verify the separate `pre-migration-v14.bak` retains the original version and original rows. Verify the final SQLite has schema 14, retains *all rows that were present at the old version*, and passes SQLite integrity and FK checks.
- `src/desktop/v050-owned-media-inventory-qa.ts`: separately gated by historical-synthetic acceptance. Inventory only `profile/data` and optional `profile/cache` using bounded file metadata. Compare `pictures.local_path` and `byte_size` only when lexically inside the owned data folder; reject outside refs before stat/open. Reject symlink/junction leaves or parents, file hardlinks, unsafe names and oversized budget. **No image content is read or copied; output never includes filenames/paths**.
- `test/unit/v050-owned-media-inventory-qa.test.ts`: realistic temporary SQLite with metadata-only read, foreign media reference, missing image, incorrect metadata size, hardlinks, symlink/junction, sparse oversized file, locked profile and static no-write/source-free guard.
- `.github/workflows/s3-v050-historical-schema-media-qa.yml`: pinned Node 24.15.0, original v0.5.0 SHA checkout, full typecheck, prior source-author and WAL regressions, both Linux and Windows. No artifacts uploaded.

## 4. Evidence / known failures (do not erase)

Initial [workflow #40921581059](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40921581059) reached the new migration matrix and failed. Exact first failing phase was hidden by the conservative failure reporter, so a phase-only/whitelisted-error diagnostic was added rather than printing private SQL, config, path or stack. The following run exposed a test expectation error: a schema-5-origin fixture must **not** be expected to have app-state/events/work-identity rows added only in later schema releases. The assertion has been corrected to distinguish *target schema version* from *origin row availability*. These failures remain in Actions history; no migration logic was silently removed or weakened.

The new exact-head dual-OS and Android/Web/Desktop jobs must be checked independently before a PASS classification. A synthetic fixture can never authorize a real user migration, a production backup/restore, or an in-place upgrade.

## 5. Explicit open risks / next steps

1. The owner-hash/metadata inventory is **not a snapshot**. File contents have not been SHA-verified; TOCTOU, open files, missing runtime freeze, Windows nonstandard reparse tags, volume boundaries and large libraries still require separate tests.
2. Original external or custom library references remain **REVIEW_REQUIRED**, not scanned. Actual user opt-in and independent external-volume ownership checks are absent.
3. Windows DPAPI secrets, encrypted signed backup and trust roots, disk-full/kill/forced reboot recovery, transactional updater integration and actual old-install package signature verification are not implemented.
4. G1 Android UI visual/physical user acceptance, G2 pure-core provider isolation, G3 real no-loss upgrade and G4 final package acceptance all **OPEN**. The public v0.5.0 release and main remain unchanged.

No PR may be merged or released solely because this QA passes.
