# S3 CORE-LIB-04c-02c-02b-01 — Mobile Bridge and Remote API shared update ingress

**2026-10-29 (America/Los_Angeles)** · [Unpublished Draft #249](https://github.com/Saber-Alter-Lily/pica-library/pull/249) stacked on Draft #248 · no `main`, official Release, OTA, installer or real-user profile changes.

## Why this slice exists

#248 moved the existing Desktop local HTTP and original `RuntimeResourceCoordinator` behind a process-local update fence. That did **not** cover two other independent listeners started by the same original Desktop executable:

1. `src/mobile/bridge-server.ts`: can pair a new Android device and handle authenticated Reader, library, remote provider and synchronization requests without going through `src/library/server.ts`.
2. `src/remote-api/gateway.ts`: can issue in-memory browser sessions, serve its own Web assets, perform health probes and proxy authenticated requests to the loopback server. A request that entered this listener before freeze can remain active after the loopback check.

It was insufficient to inspect only `mobileBridge.status().activeRequests`, since the original Mobile Bridge activity counter excluded unauthenticated pairing and status requests.

## Existing code reused; no new services

- Reuse the **same** `DesktopHttpHandoffFence` instance and response-lifecycle lease protocol from #248. The original `Node http.ServerResponse` [`finish`/`close` events](https://nodejs.org/api/http.html) give an idempotent per-response release. No new socket daemon, scheduler or lock store.
- In `DesktopHttpHandoffFence.enter(method, pathname, allowDesktopControl)`, the existing three original Desktop control-route exceptions are permitted only for the trusted original Desktop entry. The Mobile and Remote wrappers always pass **`false`**. If their request path is deceptively named `/api/v1/update/apply` or `/api/v1/desktop/status`, it still cannot inherit the exception.
- The original Mobile Bridge pairing code, token storage, persisted device state, account and provider routes are preserved; the new admission executes **before** pairing/authorization/state changes.
- The original Remote API allowlisted Host and Origin tests run **before** admission. The shared admission then runs **before** rate-limit mutation, session creation, Web shell asset reads, upstream fetching and health-check forwarding. The existing bearer/session CSRF validation stays intact for accepted requests.
- Original `src/desktop/main.ts` passes one shared `externalUpdateIngress` to both services. It also registers `mobileBridgeSettingsBusy` in the existing work-lease inventory and refuses new Mobile activation after freeze.
- No alternative SQLite engine, full upgrader, WebDAV client, source SDK, backup daemon or third-party package is introduced.

## Safe behavior and exact test scope

The optional `requestAdmission` port leaves old test/independent service calls unchanged when no Desktop fence is provided. For the actual Desktop runtime, accepted requests increment the **same** counter as local HTTP until the actual response ends or connection closes. If the original updater requests freeze with a pending Mobile/Remote HTTP request, the helper admission fails synchronously. During freeze, both listeners return HTTP **503**, `DESKTOP_UPDATE_HANDOFF_FROZEN`, `Retry-After: 2` and `Connection: close`. After the **existing** helper rejects startup, #248 restores the common fence, and both listeners resume accepting traffic. On helper ACK the existing app exit/handoff retains ownership and the fence stays frozen.

The new `test/unit/desktop-external-http-handoff.test.ts` exercises real services on OS ephemeral loopback ports with synthetic library data only:

- An actual Android pairing POST with an intentionally **partial unfinished request body** holds the shared request lease and blocks update freeze; completion releases the lease.
- While frozen: pairing, mobile status, library and account routes cannot start work or create additional device records. It also verifies no external surface inherits the trusted Desktop update/health exemptions.
- An actual authenticated Remote API GET is held at a synthetic loopback upstream before completion. While it is open, freeze is refused; after it completes, freeze blocks remote API, health, session bootstrap and Web shell routes without issuing a new upstream request.
- After unfreeze both Mobile and Remote calls recover without altering original source settings or closing the core.
- The test redirects the legacy Mobile personalization root to the synthetic OS-temp fixture and restores the environment afterwards.

**Exact focused run**: [GitHub Actions #40986598520](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40986598520) at implementation/test SHA `5f7f4698464812baee37c2bed06e28d65aa26cb0`: **Ubuntu SUCCESS, 64/64 tests**; **Windows SUCCESS, 63 passed + 1 POSIX-only skip**. This includes existing Mobile, Remote, RuntimeResourceCoordinator and local HTTP regression suites.

[Initial full Android/Web/Desktop CI #40986649175](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40986649175) exposed **six real regression-test failures** in `test/unit/desktop-mobile-bridge-opt-in.test.ts`: its existing TypeScript AST + `vm.createContext` harness extracted the actual `startSelectedMobileBridge` function from `main.ts` but did not supply the newly required `updateHttpFence` reference. Original production freeze logic was not removed or bypassed. The fixture now explicitly injects a synthetic `updateHttpFence: { frozen: false }` and `externalUpdateIngress`, asserts the real original function passes the shared ingress to Mobile Bridge, and adds an explicit frozen-state rejection case. The CI regression remains recorded as FAIL.

**Corrected exact-code/test dedicated workflow**: [Linux/Windows #40987086618](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40987086618) at commit `35b9a8e7415b1c4f4f8b2491e5f738b2ab9bf981`: **both SUCCESS; Ubuntu 83/83 tests, Windows 82 passed + 1 POSIX-only skipped**. The original production logic from `5f7f469` is unchanged by later test + workflow commits. [Corrected full Android/Web/Desktop CI #40987068615](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40987068615) corresponds to the executable plus regression-fixture fix `9c92e97688450e23858cd2b604862210eb194363` and must still be read back at terminal status before claiming complete CI acceptance.

## Explicit gaps and blocked production claims

This is a **process-local inbound request fence** for Desktop loopback HTTP, Mobile Bridge, Remote API, plus the shared resource scheduler. It is NOT an application-wide write suspension.

- A started async/fire-and-forget operation may outlive its originating HTTP response.
- Some background/scheduled workers and signed source processes may write without entering the existing runtime lease coordinator or any of these three HTTP listeners.
- Independent processes writing into the same media directory, external WebDAV or network shares cannot be governed by a process-local token.
- The original `stop()` still has a hard-exit deadline and may record cleanup failures without a durable, independently verifiable clean-drain receipt.
- SQLite's native [Online Backup API](https://www.sqlite.org/backup.html) provides consistent database snapshots, but not transactionally atomic media, secret stores and profile files.

**Next S3 04c-02c-02b-02**: prove a complete writer inventory; add a fail-closed database/media mutation barrier for the actual Desktop service, check that no untracked writer survives shutdown, and produce a versioned/validated quiescence receipt with negative fault injection before any user migration/backup. No claim that Windows VSS, SQLite WAL or task state alone establishes cross-volume protection. G1–G4 stay OPEN; all real user data, main, Release and OTA untouched.
