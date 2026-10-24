# Upgrade recovery and bounded acceptance diagnostics — NEXT-55, unpublished

NEXT-58 continues this implementation through [shared lifecycle/state modules, acknowledged helper startup and incremental recovery](INCREMENTAL_UPDATE_RUNTIME.md). The older paragraphs below describe NEXT-55 evidence, not automatic acceptance of the newer source or old installed OTA controllers.

## Product boundary

One-click updates still replace only the Windows application tree, using the existing external helper and separately retained user data. No parallel updater, new format, migration or dependency was introduced. Public module API/instruction/progress fields remain compatible. Android keeps the fixed Dev identity/certificate and increments to code70; no uninstall is proposed. Formal source accounts/data, Visual, ranking, tags, favorites, caches/sync protocols and stable OTA are not inputs to this development pass.

The previous frozen NEXT-54 Windows CI attempt returned code1 at the full-upgrade gate, but its runner-local progress file was not emitted. Its cause remains **UNDETERMINED**. A passed retry cannot establish that cause or prove a fix. This slice instead adds independently reproducible fault cases and ensures future runner failures retain bounded diagnostics.

## Verified independent recovery corrections

1. `spawn()` returns before asynchronous process creation errors are delivered. The helper now awaits `spawn`/`error` before entering health checks, and awaits the real baseline launch during rollback. An asynchronous error must remain in the existing transaction, not terminate the helper through an unhandled EventEmitter event.
2. Failure to write `rollback`/`failed` status no longer blocks application/config/database recovery. Status is best effort during recovery; the original error remains authoritative. Reporting/cleanup after proven health still cannot undo a healthy installation.
3. Backup ownership is recorded immediately after the application-directory rename, before copying any target bytes. Partial copy failures use the single outer recovery path. A pre-existing backup is never claimed by this invocation or deleted as its recovery state.
4. Browser fallback gets an error handler: automatic browser opening is post-health convenience, not an application commit gate.

Synthetic orchestration tests cover old application/config/database restoration, partial copy, asynchronous launch rejection, status-write errors, pre-existing backup retention, successful commit, post-health reporting failure and nonfatal browser opening. Counterfactual tests execute the same new assertions against the frozen old source and reject it at the async launch/status cases. These are not evidence that either caused the earlier runner incident.

## Actual packaged Windows gate

The established artifact test now covers normal replacement, deliberately wrong target-version health failure, and a deterministic **test-only first-spawn asynchronous error**. The latter uses Node's existing [CommonJS/ESM built-in synchronization](https://nodejs.org/api/module.html#modulesyncbuiltinesmexports) through an explicitly loaded fixture. It does not modify the input package, install a production fault switch or claim to simulate every Windows/antivirus failure. On rollback the shim delegates to the actual baseline executable. Ordinary replacement/health tests launch actual Windows applications without that shim.

The old real packaged Node/helper is rejected by this new gate: progress remained `health-check` after an injected unhandled asynchronous launch error. Its bounded stderr/phase evidence is retained. The new actual package must reach `failed` after restoring and starting the old application, with original SOURCE_SHA/config/database preserved. A work directory containing spaces verifies explicit Start-Process argument quoting. Private production processes are never test cleanup targets: process executable paths must belong to the exact UUID acceptance root.

## Bounded diagnostic module and Actions retention

`scripts/lib/windows-upgrade-diagnostics.ps1` is a test-storage adapter, not production profile export. It accepts only an exact synthetic temp root and fixed input names. It emits:

- target source SHA, scenario, gate outcome, helper exit and observation time;
- only `phase/current/total/targetVersion/message/updatedAt` progress fields;
- at most the last64KiB each of helper stdout/stderr, with source/read byte counts and truncation markers;
- explicit exclusions for instruction/environment/instance secrets, config, database, snapshots, bodies and signing inputs.

Links/arbitrary input paths, over-limit reads and oversized progress files reject or are marked unavailable; malformed JSON does not become fabricated status. Lines mentioning credential/token/password/Cookie/CSRF/authorization/secret are omitted. Synthetic canary tests prove those values and nonallowlisted progress fields do not reach the report. This is bounded test-only diagnostics, not a guarantee that arbitrary real application logs are safe for public upload.

The candidate workflow uploads only `artifacts/upgrade-diagnostics/` with `if: always()`, including after a failed Windows gate. Artifact names include `github.run_attempt`: [upload-artifact artifacts are immutable](https://github.com/actions/upload-artifact#not-uploading-to-the-same-artifact), so a retry must retain the first failure rather than collide with or overwrite it. No temp/profile wildcard or new GitHub secret is used. The harness preserves a failed synthetic root for local diagnosis, stops only its own verified children, and cleans successful roots after copying diagnostic reports outside them. Missing/failed diagnostic export must not silently turn a successful test into an accepted evidence record.

## Remaining gates and work

NEXT-56 adds the [SQLite filename/deep-path seam and detached build closure](SQLITE_PATH_ADAPTER.md). Shared application modules must be inlined into each external helper, because the existing bootstrap copies a single JS file. A real Rollup/empty-directory startup gate now enforces that contract rather than relying on source-level unit imports or the installed application tree.

Exact-source unit/real-browser, actual installable identity/signature, current diagnostic artifacts and full success/health/async-launch rollback must be verified in this slice's immutable handoff. v0.5.0 and prior NEXT-54 state-retaining application replacement/rollback remain required; a blocked nonallowlisted incremental package must still select full replacement.

The original runner-only failure is not retroactively resolved. Real Android overwrite install/OEM/picker/SD-card/source/gesture/tag/offline-sync acceptance remains deferred. Complete recommendation build-pipeline/V5/legacy separation, optional source runtime/trusted extension policy, native body export and orphan/retired-generation collection remain open. No main merge, tag/Release, stable OTA, key download, deployment or production access is authorized by these engineering gates.
