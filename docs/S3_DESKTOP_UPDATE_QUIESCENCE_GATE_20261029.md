# CORE-LIB-04c-02c-01 — Real Desktop Update Admission / Quiescence Preflight

Date: 2026-10-29. Status: **Draft PR #247, unpublished**, stacked on Draft #246. This is the FIRST production-entry gate against unsafe update handoff, **not** a complete application freeze or old-profile migration.

## Open-source reuse and what not to reinvent

| Existing source | Actually used | What is NOT claimed |
| --- | --- | --- |
| Original Pica `InstanceLock.assertHeld()` | Validates the same exact lock ownership before and after live task status capture | A lock does not itself mean every file write is drained |
| Original `activeDesktopWorkLeases()` in `src/desktop/main.ts` | Already used to stop idle browser shutdown during active work; reused for real update admission without a second task inventory | It currently covers a defined set of tasks but is not guaranteed to observe every future source, queue, model or WebDAV writer |
| Original `UpdateManager.apply`, `applyUpdateAndScheduleShutdown`, existing helper | Preserve helper startup ACK, idempotent same-update requests and delayed host shutdown; add one optional preflight hook | No second updater, no new PID killer and no replacement of verified helper transactions |
| [SQLite Online Backup](https://www.sqlite.org/backup.html) and [WAL](https://www.sqlite.org/wal.html) | Retain project `node:sqlite.backup` and existing synthetic rollback QA in Draft #243 | A consistent SQLite backup cannot be asserted to cover downloaded media, secrets, WebDAV, or other independently written files |
| Existing [legacy-transition guard](../src/update/legacy-transition-guard.ts) | Remains the authoritative existing Windows process-stopped proof for its specific legacy helper path | Does not prove an application-wide clean drain or freeze across user data and external disks |

Avoided: a new database engine, separate process monitor, custom scheduling framework, background backup daemon, or arbitrary extension runtime.

## Real implementation

- Add `src/desktop/update-quiescence.ts`: synchronous `requireDesktopUpgradeQuiescence` checks owned real Desktop instance, initialized engine/database/LibraryService, not already stopping, and zero active work leases. Any invalid/unknown snapshot is rejected; active leases produce a single safe user-facing error, never echo private task names or credentials.
- Extend original `src/desktop/update-command.ts` with an optional `preflight` callback invoked before `UpdateManager.apply`. On refusal, no helper handoff and no scheduled shutdown. Earlier callers without the hook remain behavior-compatible.
- Wire the hook to **real** `src/desktop/main.ts` `applyUpdate` using the actual `instance`, `engineReady/stopping/database/service` values and the existing `activeDesktopWorkLeases` function.
- New `test/unit/desktop-update-quiescence.test.ts` uses the existing `InstanceLock` against a disposable OS Temp directory, tests active/paused/unknown statuses, owner loss on both checks, missing services, helper not called on refusal, retry after error, duplicate apply and original code wiring. Existing update-command and instance lock tests retained.
- New `.github/workflows/s3-desktop-update-quiescence.yml` runs pinned Node 24.15 on Linux and Windows, full TypeScript check, focused tests plus historical admission regressions.

## What this does NOT yet solve

A pre-apply check cannot prevent a **new write from beginning immediately after the snapshot**. Also current `stop()` in the existing Desktop has a hard process deadline and records individual cleanup errors while still exiting; this is NOT a durable, signed shutdown-success receipt. No claim of a clean quiescence proof is made.

**Next sequential gate (CORE-LIB-04c-02c-02)**:
1. Add a real application-wide write admission barrier (HTTP/user commands/background runners/source adapters/remote storage) integrated with the current scheduler and resource coordinator; reject all new mutations while a proposed snapshot is outstanding.
2. Request orderly completion/cancellation, await all active writers, close HTTP endpoints, remote services, download queues and database, then independently prove instance/process termination. On any failure, abort the helper before it can replace anything and preserve the last known good installation.
3. Couple a frozen, versioned snapshot receipt to the existing updater and validate its process/data/tree identity. Investigate Windows VSS/robocopy? Only if required by media consistency and real-user install testing, not as an unreviewed extra dependency.
4. After that, implement OS-protected/encrypted backup, cross-file byte hashes, failure injection and real isolated v0.5.0 upgrade/rollback tests. Explicit external library consent, DPAPI, large library capacity and third-party writers remain blockers.

This Draft is not released and does not authorize real profile access, backups, rollback, Android package migration or G1–G4 acceptance.

## Verification ledger

The first [Linux/Windows dedicated run #40974599032](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40974599032) found a **test-only event-count mismatch**: the second `assertHeld` call is the third trace entry because activity snapshot was recorded between. Corrected test to count actual assert calls, rather than loosen runtime guard.

[Corrected exact-source dedicated CI #40974706377](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40974706377) and [full project CI #40974712298](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40974712298) require terminal readback before marking PASS. Past failures remain failures.
