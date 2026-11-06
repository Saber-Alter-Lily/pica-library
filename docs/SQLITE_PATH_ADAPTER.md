# SQLite disk-path adapter — NEXT-56, unpublished

## Same data, one storage seam

`src/storage/sqlite/filename.ts` converts an already resolved logical disk filename to the existing SQLite runtime's location string. `LibraryDatabase.file`, configuration, imports, manifests, backups and updater instructions keep their original ordinary absolute paths. No database is relocated, renamed, recreated on failure or migrated to another engine. Schema14/public module APIs are unchanged. No app/user content is added to the distribution.

On Windows with the bundled Node24.15.0, paths needing extended Win32 access (or already explicitly namespaced) are fully percent-encoded into a SQLite URI selecting **`win32-longpath`**, not either `*-none` VFS. Ordinary short profiles keep their exact prior location/VFS normalization behavior, including legacy trailing-dot/space spellings; this is not an implicit relocation to a differently normalized directory. Other platforms keep the existing location unchanged. No new dependency/native extension, custom SQLite, global registry setting, administrator step, junction or drive mapping is introduced.

Reuse authorities:

- [Node `path.toNamespacedPath`](https://nodejs.org/download/release/v24.15.0/docs/api/path.html#pathtonamespacedpathpath) provides the existing namespace conversion.
- [SQLite Windows VFS and URI selection](https://sqlite.org/vfs.html) documents ordinary `win32`, `win32-longpath` and the separate no-lock variants. We do not use no-lock, immutable, shared-cache or relaxed-journaling shortcuts.
- [Node24.15.0 SQLite source](https://github.com/nodejs/node/blob/v24.15.0/src/node_sqlite.cc) uses URI-enabled `sqlite3_open_v2`; [Node22.15.0](https://github.com/nodejs/node/blob/v22.15.0/src/node_sqlite.cc) does too, unlike the originally supported [Node22.5.0](https://github.com/nodejs/node/blob/v22.5.0/src/node_sqlite.cc). The older-runtime fallback uses namespace paths within its default VFS budget and rejects deeper unsupported names before I/O. It never passes a URI to a runtime that would interpret it literally.
- [Microsoft path namespaces and filesystem limits](https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation) distinguishes Win32 MAX_PATH, namespace-prefixed paths, component limits and shell constraints. This change does not promise arbitrary shell/Explorer/third-party support.

## Reproduced boundary, not an inferred fix

Frozen NEXT-55 package `acab174c7b01f3ee32883b2bb89cfbf717ac0bf7` / Windows SHA256 `e5b09601992eb636920822c2ff7527d9c923f8682de2e41ac4d72cd0f2ef427a` supplies the actual Node24.15.0/SQLite3.51.3 used by the isolated matrix. Normal filenames can create an empty database but fail the first journaled DDL at253 characters (the transition was251 pass /252 fail in this fixture). A namespace prefix alone solves that boundary but later reaches the default VFS byte ceiling; a `win32-longpath` URI without the namespace still reaches Win32's boundary. Their combination completes DELETE-mode DDL, WAL write, checkpoint and read-only reopen at every tested length through4096 characters. The fixture includes Unicode/spaces; hash/percent filename preservation is tested separately in actual application gates.

This explains the separately retained deep-profile startup failure found after NEXT-55. It does **not** explain the older runner-only code1 incident whose missing progress evidence remains UNDETERMINED. Old failures remain preserved; a later successful run is not substituted as their cause.

## Before mutation and during recovery

The adapter checks native character/UTF-8/component budgets with room for the existing pre-migration/reconciliation backup suffix. Unsupported paths get an actionable bilingual error, without clearing/moving data. This is not a 260-character product cap: supported deep paths use the built-in long-path VFS.

- Setup validates before saving a new library directory.
- `LibraryDatabase` validates before mkdir/open and closes its connection if later startup/backup/migration work fails, preserving the original error.
- Full-update `apply` validates before preparing a helper or asking the live application to exit; the external helper independently validates before waiting/snapshotting/replacing anything.
- Complete path encoding prevents literal percent/hash/query-like filename text from adding SQLite URI options. No URI is serialized into saved user state.

## Required evidence and unproven boundaries

### Detached build closure

The first local exact-source package in this slice (`4c507125ff1f`) passed deep CLI/Reader/restart but failed the real full-upgrade gate **before progress**: Rollup had split the newly shared filename adapter into an extra chunk while the existing external-helper contract copies only one JS file. The bounded `ERR_MODULE_NOT_FOUND` report is retained as an iteration failure, not attributed to the old runner incident or relabeled as a path success.

CLI/Desktop may still share in-tree chunks. Each detached updater now gets its own Rollup entry with [inline dynamic imports](https://rollupjs.org/configuration-options/#output-inlinedynamicimports), and a [generateBundle](https://rollupjs.org/plugin-development/#generatebundle) guard rejects non-built-in external imports, extra chunks or referenced files. Helpers currently use only our code/Node; introducing a third-party helper dependency requires explicit license-notice handling rather than silently dropping notices. The application's existing third-party notice generation is retained. Real Rollup unit tests copy only each generated helper into a fresh empty directory, start it and require its own instruction-error boundary rather than a missing-module error; a split-chunk fixture rejects at the guard. No duplicated path policy or parallel update protocol is introduced.

New pure/native tests cover platform mapping, URI option confinement, old-runtime behavior, native limits, real deep LibraryDatabase use, ordinary-client WAL locks, setup/update preflight, and closing a failed startup connection. Windows-only native assertions are explicitly skipped on Linux and must run on Windows; no previous test results are relabeled.

The actual Windows gate uses a source-free archive and synthetic profiles at database lengths253/1200/4096. It must prove compiled local import, pre-migration physical backup, catalog/Reader/body access, progress/restart, an invalid setting rejected without changing config, originals preserved and no credentials. An independent packaged child must honor locks held by an ordinary short-path SQLite client and see committed state afterward.

The first pushed candidate's signing-step gate still compared against literal Dev70 after requesting Dev71. This separate workflow defect is retained with its failed-run metadata. One public version authority now drives both build and manifest verification, with a regression rejecting the old mismatch. Package ID, label, fixed certificate checks, pre-secret unit/lint/R8 and final independent APK verification remain required; no pass is inferred from the earlier failed attempt.

The established full-upgrade harness additionally tests a1200-character data path: normal replacement, deliberately mismatched health, and test-only asynchronous first-spawn failure, retaining the original synthetic database row/config. Because the pre-fix release cannot start at this path, these deep recovery gates use **two copies of the current candidate** and are labeled same-source fixtures. They do not claim historical deep-path compatibility. The public v0.5.0→candidate and prior-candidate success/rollback gates still run on supported ordinary paths. Diagnostic artifacts separate `deep-1200/` from the historical-baseline scenarios and retain bounded reports only.

Exact-source CI/installable/signature/checksum and gate results belong to the new immutable handoff, not these implementation notes. UNC network shares, removable/network storage locking, maximum-length endpoints, antivirus/OEM behavior, physical Android updates and released OTA remain unverified. No network share or production profile is opened by these tests. Native/JVM app logic remains unchanged; Dev71 must preserve Dev70 package/certificate. The recommendation build pipeline, trusted optional extension host, native export/orphan collection and concentrated device/provider/gesture/tag/offline acceptance remain open. No main merge, Release/tag, stable OTA edit, private-key download or deployment.
