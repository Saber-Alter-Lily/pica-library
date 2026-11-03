# R4 first delivery: Windows v0.5.0 upgrade snapshot integrity (Draft)

**Scope:** the existing Windows full-application updater in Draft PR #284. This is not a separate backup utility, nor an authorized v0.5.0 user upgrade or release.

## Product behavior changed

- Before replacing the application, the existing stopped-app snapshot now records schema-v2 relative-file SHA-256 and byte sizes for all files under the original Desktop config plus \`library.db\`, \`library.db-wal\`, and \`library.db-shm\`. It checks source-before-copy, copy, and source-after-copy for consistency; a mismatch aborts before replacing the application.
- Rollback checks the complete retained schema-v2 manifest and copied bytes **before removing any current config/database**. Missing or changed bytes refuse restoration while preserving recovery evidence. A successful restore is checked again.
- The existing schema-v1 receipt remains restorable for in-flight/older rollback compatibility; it did not contain an integrity manifest, so it cannot acquire v2 guarantees retroactively.
- Library comic page bodies, external library folders, caches, Visual models, user sources, WebDAV and preference stores outside the config folder are **not snapshotted by this change**; the updater does not deliberately mutate them. Their complete cross-version preservation still requires separate R4 verification.
- No new runtime/SQLite connection, source adapter, updater, external dependency, installer identity, or production key. Node built-in fs/crypto are reused.

## Reproducible engineering checks

- Focused Vitest: \`pnpm exec vitest run test/unit/user-state-snapshot.test.ts\` (round-trip with a WAL, body untouched; tampered and missing snapshot detected before live profile deletion; v1 compatibility).
- Existing full-upgrade unit, staged Windows ZIP and synthetic v0.5.0 replacement/failure rollback gate remain required; green checks belong to this exact SHA and may not be inherited from a parent.
- A local disposable-data smoke check exercised the digest, WAL restore and pre-delete refusal path. It does not represent an installed v0.5.0 profile or an actual Windows application process.

## Still OPEN

G3 real v0.5.0 read-only inventory/consented backup, non-config persisted state and external library comparison, production signing continuity, Windows physical upgrade/rollback and Android same-app-ID migration. G1 real handset and desktop UX, G2 approved multi-provider, G4 signed release approval also remain open. Do not merge main, publish OTA/Release, or touch a real user profile.
