# Reader progress state and ordered effects (local-only)

## Actual two-part seam

`web/reader-progress.js` owns deterministic transitions on the transient Reader object: valid page intents, frozen save snapshots and matching acknowledgements. It has no imports, DOM, timers, provider identity, network, credential or database access. The existing `app.js` queue keeps400ms debounce, captures its existing transport root/CSRF and sends the unchanged three-field payload. Timers and transport remain application adapters.

`src/reader/progress-writes.ts` owns only effect admission/order. It reuses the **already installed MIT p-limit5.0.0**, not a new queue framework or dependency upgrade. A WeakMap uses the exact state-port object as owner, and a declared persisted progress key selects a lane. The real `OnlineReaderService.saveProgress` submits its original metadata/validation/state-write effect through that lane. Hosted Reader instances already share the same database port and principal-owned progress key; separate sessions writing that same array now share ordering. Local Reader's SQL save is already synchronous and remains unchanged.

## Defects corrected

1. Online/hosted saves previously awaited metadata independently. An older invocation could finish metadata late and overwrite a newer save. A lane now completes each effect before starting the next, preserving **service-submission order**, including a later keepalive request that actually reaches the live backend. Failure settles without poisoning the lane. Different owners or persisted keys remain independent.
2. Frontend `dirty = progressSaved !== pageIndex` incorrectly treated a return to the last ACKed page as clean while an intermediate different page could still be in flight. A changed intent now remains dirty until its own acknowledgement.
3. An old request for page3 could clear a newer page3 intent after `3→4→3`. Acknowledgement now matches Reader identity, chapter identity, comic, episode, current page and a transient revision. Invalid/foreign/stale snapshots cannot clear new work. The revision is not transmitted, persisted, synced or used as a source ID.

The backend captures source scope before admission and rechecks it before queued work starts and after metadata. Changing/revoking an account/session while a task waits must not rebind old work to new authority. Existing source validation,100-record progress retention, wire response/fields, hosted CSRF, immediate pagehide keepalive, image caching/concurrency and database format remain.

## Resource and truth boundaries

- p-limit runs one effect per lane. Each owner allows at most64 active/waiting saves in a lane,256 total pending and128 lane records; an idle lane may be evicted. Overload explicitly rejects before accepting an effect. Accepted saves are not discarded with clearQueue. A failed/busy current save leaves Web dirty and retryable; this is not a new durable offline retry mechanism.
- A slow admitted effect can delay later saves of that persisted namespace. There is no new timeout, cancellation protocol, receipt log, extra file or database schema. Existing source/transport errors still apply.
- Ownership is the **same state-port object**, not inferred equivalence between separately wrapped storage ports. Callers sharing storage must share that port identity. Separately created wrappers are not magically coordinated.
- Ordering is within the current backend process by service invocation, not the client's wall-clock intent when packets arrive out of order. No cross-device conflict protocol, persistent sequence receipt, idempotency/replay guarantee, restart/process-crash/power-loss durability or multi-process exclusion is claimed. Those remain distinct work/acceptance, not hidden by passing unit checks.

Public module APIs/schema, raw library facts, native gestures, tag/recommendation/Visual state, source/auth contracts, sync and the one-action application updater remain unchanged. These internal modules ship with the normal application tree rather than separate module updates.

## Evidence

Selected local gates:244 tests/17 files = previous200 checks +26 new state/queue/actual-adapter checks +6 unchanged online Reader SQLite/cache tests +12 unchanged injected-host Reader compatibility checks. New tests use controlled promises and in-memory ports, and execute the actual AST-extracted Web save function. The six original disk tests create only synthetic SQLite/cache files in a realpath-validated private workspace temp root; their generated fixture directories are cleaned by the existing tests. Hosted compatibility uses only injected HTTP/state/cache and fabricated raster bytes, not a real source. No production rows, credentials or real comic pages are read.

The first232-test attempt passed231 and failed the old exact Reader import-closure assertion because it expected only the service file. The guard was updated to the exact two source files and retained/extended the no-SQL/account/filesystem/network checks, not replaced with a broad allowlist. Initial types and51-module syntax passed; raw failure remains. Final source-bound tests/type/syntax are sealed independently after commit. These are not HTTP, full-app/browser, real provider, phone, full CI or installation tests.

## Open-source reuse and current candidate

The installed `p-limit` source, README, package manifest and MIT license were inspected. Existing concurrency-one API and error behavior are used; no package.json/lockfile or shared node_modules change. Upstream reference: [p-limit v5.0.0](https://github.com/sindresorhus/p-limit/tree/v5.0.0). Its async-hooks/yocto-queue support remains the existing dependency closure; no provider or storage dependency enters the scheduler.

The unchanged `9e879d3...`/Dev82 r2 installation candidate does not contain this progress maintenance, the prior input/viewport modules or later guide text. Including it in a future candidate still requires exact-source CI and actual package/browser/device checks. Full modular/local-first/content-free/user-managed-source reader and physical one-action upgrade acceptance remain OPEN. No push, merge, Release/OTA, deployment or production mutation is authorized/performed here.
