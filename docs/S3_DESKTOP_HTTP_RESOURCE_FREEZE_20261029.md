# CORE-LIB-04c-02c-02a — Live Desktop HTTP + runtime admission while helper starts

2026-10-29. **Unpublished Draft PR #248** stacked on Draft #247. This is a genuine original Desktop request/runtime admission change, **not** an app-wide write-freeze or user-data migration.

## Reuse open-source project primitives, no parallel subsystem

- Existing `startLibraryServer` (the original full multi-feature `src/library/server.ts`) continues routing every original Reader, shelf, metadata, HTTP update and Web route, including its existing local-host, Origin and CSRF authorization. `requestAdmission` is a tiny optional structural port; source-free local Core instances without this port are unchanged.
- Existing `src/desktop/main.ts` still owns `InstanceLock`, `LibraryService`, `activeDesktopWorkLeases`, `RuntimeResourceCoordinator`, `UpdateManager` and original shutdown. **Both** normal and fallback HTTP startup attach the same admission fence.
- Existing `applyUpdateAndScheduleShutdown` keeps idempotent same-package apply, helper startup confirmation and scheduled shutdown; optional preflight now returns an idempotent restore callback, invoked only if helper startup fails.
- [Node.js HTTP ServerResponse events](https://nodejs.org/api/http.html): response `finish` and `close` each release the same idempotent HTTP lease; premature client disconnect must not silently leave an active request forever. We count ALL verified local HTTP routes, not just POST, because some GET endpoints can start/cache work.
- [SQLite Online Backup](https://www.sqlite.org/backup.html) and [SQLite WAL](https://www.sqlite.org/wal.html): remain the existing database-level snapshot mechanisms from Draft #243. They do **not** establish atomicity with independent media/credential files, and are not reimplemented here.

No new SQLite engine, source plugin runtime, scheduler, process scanner or backup daemon.

## Exact implementation

1. `src/desktop/update-http-fence.ts`: process-local synchronous request counter and frozen token. Update handoff refuses while another HTTP request remains in flight. While frozen all new ordinary original Desktop routes receive `503 DESKTOP_UPDATE_HANDOFF_FROZEN` with Retry-After and Connection: close. Only the existing update-apply control request and narrowly enumerated GET `/status`, GET `/api/v1/desktop/status` and GET `/api/v1/update/progress` remain accessible; the original Origin/CSRF checks continue to run **before** this control-route exemption.
2. `src/library/server.ts`: one centralized admission after host/origin/CSRF checks and before ANY business-route dispatch, using `response.once('finish')` and `response.once('close')`. Unknown endpoint access also freezes. When no fence is installed, behavior is unchanged.
3. `src/runtime/resource-coordinator.ts`: reuse the existing runtime lease coordinator in both `observe` and `enforce` modes. A synchronous update freeze refuses if any existing active or waiting lease remains, and rejects any new `acquire` / `withLease` until the original helper ACK+exit or a failed-start rollback. It never kills, cancels or discards tasks; the previous task prioritization/normal scheduling stay unchanged.
4. `src/desktop/main.ts`: the original update action first performs the #247 lock + service + full task diagnostics, then synchronously freezes HTTP admissions and existing runtime resource acquisitions, then rechecks task/ownership while both barriers are held (no `await` in this critical section). Returns the combined restore function if the actual UpdateManager helper fails.
5. `src/desktop/update-command.ts`: on failed helper apply, call returned restore callback and leave old app alive; on accepted helper keep both admission gates frozen until normal shutdown. This does not invent an ACK/receipt format.
6. Real original HTTP+SQLite tests, including CSRF and an actual local server, use disposable OS Temp data only. No user account, source credentials, third-party manga URL, signed package or true installed profile is opened.

## Evidence and closure limits

- Initial HTTP-only exact code source `06000c802a6123d90fe2ff1660f8c0832d32de26`: [Linux/Windows real HTTP focused #40981591695](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40981591695) **2/2 SUCCESS, each 79/79 tests**. Full Android/Web/Desktop [#40981636646](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40981636646) must be read separately.
- Following actual source audit, the existing runtime coordinator was added to the freeze because a worker can start after HTTP admission even without a new HTTP request. This is a genuine executable change: the previous 79/79 result must NOT be applied to the expanded code.
- Expanded exact executable/test source (to be pinned after runs) [Linux/Windows focused #40981944161](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40981944161) and [full Android/Web/Desktop #40981949826](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40981949826) **require terminal verification**. Failure history and changes must stay visible.
- This is **process-local HTTP + shared scheduler admission**, not a complete application-wide write barrier. Mobile Bridge, external source workers, out-of-band WebDAV writers, already scheduled fire-and-forget tasks and third-party processes might bypass both gates. No background-work cancellation/drain/ack receipt, signed instance/process exit proof, cross-file SQLite/media atomicity, OS-protected encryption, power-loss simulation, or real-user backup has been implemented. Correct next task: `CORE-LIB-04c-02c-02b` unify non-HTTP writers and explicit drain/exit receipt before any production upgrade authorization.

**main, stable v0.5.0, Releases, OTA, signed packages and all real user data remain untouched. G1–G4 remain OPEN.**
