# R4 | v0.5.0 Windows profile preservation in existing full updater (Draft)

**Status:** implemented in Draft PR #284; synthetic smoke check passed, exact-HEAD GitHub Actions and physical/user acceptance must be checked separately. No production user data was read or changed.

## Reused product path

The existing stopped-app full-application helper, not a new updater or backup framework, creates and restores the same recovery snapshot. It uses built-in Node fs and crypto and the original config/SQLite storage paths.

## Functional behavior

- New snapshot receipt schema v3 records SHA-256 and byte size for every backed-up regular file. Scope: Desktop config (including opaque credentials and source settings), SQLite library.db/-wal/-shm, saved `packs` (e.g. style/profile assets), and `runtime-state/personalization`. No credential content is written into the receipt or output.
- Snapshot generation compares originals before and after the copy with the saved snapshot; any mismatch prevents application replacement. Recovery verifies all retained v3 file bytes and directory presence **before deleting any current state**, then verifies the restored files.
- Existing receipt schemas v1 and v2 remain restorable without retroactively claiming v3 guarantees or deleting directories not included in those historical backups.
- **Not included in duplicate backup:** manga page bodies, potentially external download folders, regenerated cache, logs, independent upgrade assistant and installed application payload. The updater does not intentionally mutate comic pages; R4 must separately compare their identities across upgrades.
- Symlinks or non-regular entries within the backed-up directories fail closed. A failure retains the recovery snapshot and does not authorize overwrite of the installed application.

## Engineering evidence and next gates

- Focused Vitest: `pnpm exec vitest run test/unit/user-state-snapshot.test.ts`. Round-trip config/SQLite/WAL/packs/personalization and untouched manga bodies; altered/missing SQLite and pack data rejected before destructive recovery; schema-v1/v2 retained compatibility.
- A disposable-data Node smoke executed the v3 round-trip and altered-snapshot refusal. The existing full-upgrade test, actual Windows ZIP unpack/launch, synthetic v0.5.0 full replacement and injected-health-failure rollback remain required at the exact new commit SHA.
- OPEN G3: real v0.5.0 read-only data inventory, permitted one-time backup, cross-version schema/metadata/content comparison, external libraries, physical Windows rollback, Android same-application-ID and real signing continuity. G1 real UI/1500-book performance, G2 verified multi-provider and G4 authorized signed release remain OPEN.

**Release boundary:** Keep main, stable v0.5.0, Android production identity/signature, OTA, and real profiles unchanged until user-approved release acceptance.
