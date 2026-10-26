# Explicit runtime-choice transaction gate — local preparation

Status: **LOCAL_SOURCE_AND_OFFLINE_GATES_PASS / HOSTED_EXECUTION_PENDING / LEGACY_RECOVERY_HOLD / FULL_OBJECTIVE_OPEN**.

This continues frozen PR211/source `e9b08b418c2fdbc55dbf499afb74f7b927b12434` on a new local branch. It does not modify PR211, Dev87 installables, PR210/Dev86, G-drive installations, production data/schema, signing identities, main, Release or OTA. The Local Memory claim again failed with DPAPI; the human's standing isolated-goal exception is used without repairing/reprovisioning that secret. No local application, Java, browser or TCP listener is authorized or started.

## What this closes, and what it does not

The product already implements explicit optional-runtime preview/consent/prepare/apply using the single application updater. Existing function/DOM tests and same-composition replacement tests do not prove the combined browser/HTTP/add-remove transaction. This slice prepares that missing actual-package gate; it does not introduce another updater, source marketplace, default source, user content or a new product feature.

The new core/JM pair must be built from one committed source with the existing Windows packager and actual JM runtime. A CI-only version-metadata override produces **synthetic 0.5.1** inputs, not a proposed/reserved release. The builder restores exact `package.json` bytes/environment and marks both ZIPs/receipt **NOT FOR INSTALLATION**. Compiled application/helper bytes are not edited to bypass stable-only selection. These fixtures must never enter a user installable handoff or Release.

## Required execution

Only a separately authorized disposable GitHub-hosted Windows job may run:

```powershell
pwsh -NoProfile -File scripts/build-windows-runtime-choice-fixtures.ps1 -ExpectedSourceSha <exact-committed-sha>
node scripts/test-windows-runtime-choice.mjs artifacts/runtime-choice-fixtures <exact-committed-sha> <scenario>
```

Prerequisites: exact pinned released launcher ZIP in `artifacts/release-base`, actual JM runtime built by the existing CI recipe, existing Node/dependencies, and `PICA_PLAYWRIGHT_TOOL_ROOT` pointing to a disposable RUNNER_TEMP tool installation of the existing pinned `@playwright/test@1.63.0` with Chromium. The runner never installs tooling or rewrites dependencies. These commands are documentation, not permission to run them locally or dispatch a workflow. No workflow/version whitelist is changed in this slice.

Run all six scenarios independently; do not allow one failure to cancel the others or mark a real failure successful:

| Scenario | Actual gate required |
| --- | --- |
| `roundtrip` | Shipped settings UI, real disclaimer/Later actions, preview cancellation without archive download, then confirmed core→JM→core. Actual prepare/apply endpoints, installed helper, new PID/CSRF, browser reload, exact application trees and selected-state canaries after both replacements. |
| `guardrails` | Actual HTTP rejects wrong Origin/CSRF/method/query/content type/extra fields/oversize body. Superseded and one-use plans reject. Ordinary same-version update cannot change composition; no helper starts. Future-version composition switching remains a separate manager gate, not claimed here. |
| `request-abort` | Disconnect after the synthetic stream emits body bytes; real route propagates cancellation. A fresh operation obtains the freed download slot and can also be cancelled via the actual cancel endpoint. No helper or staged application remains. |
| `hash-mismatch` | Published digest stays fixed, delivered archive differs; real prepare rejects without helper, staged application, application-tree or selected-state mutation. |
| `health-rollback` | Real current helper replaces and launches target. After an actual loopback capability request, only the helper's received response is faulted; its unchanged health policy must trigger actual old-composition recovery and a healthy new session. |
| `launch-rollback` | Only the target launch emits asynchronous EACCES. Actual helper must recover the original tree/session; no uncaught-exception consumption or direct driver helper launch. |

## Safety and evidence

The external preload lives outside the application tree. It checks owned canonical temp roots, source/archive/entry/helper hashes, refuses Java, external HTTP/sockets and nonloopback listeners. Publisher metadata/checksums/archive bytes are synthetic exact official-URL responses, not real Release/OTA modification. Browser requests are not fulfilled with fake app endpoints. The compiled product performs the actual local HTTP and replacement operations; product instructions, deadlines and retry behavior are not patched.

The shared selected-state contract keeps the original first-hop scope and adds a separate runtime-choice root scope. It exercises an actual disposable SQLite favorite, chapter/page progress, private-tag/gesture canary, behavioral event, config marker and downloaded-byte sentinel. This proves only the selected canaries, not full profile restoration, real credential portability, physical devices or real provider acceptance.

Each scenario writes a new receipt, audit, progress and launcher logs. Exact owned processes are checked before termination/deletion. Successful disposable staging may be removed only after evidence is captured; failed staging and raw failures are retained. No formal data is copied into diagnostics.

Offline tests run the actual boundary text with inert process/network ports, real synthetic SQLite canaries, real stream cancellation, early CI refusal, and PowerShell parse/refusal. They are **not execution of these six actual-package scenarios**. Do not convert a source gate into hosted PASS.

### Narrow product fix found during preparation

The new actual-callback/real-Node-memory-stream regression reproduced an oversized runtime command destroying its request before a useful error response could finish (`unit-5`, one genuine failure). The route now uses the server's existing `destroyOnReturn:false` body-reader mode, closes the connection after its bounded JSON error, and keeps the same4096-byte cap,5-second deadline and Origin/CSRF/method checks. Malformed-body errors are fixed messages rather than potential JSON-parser input excerpts. The VM test explicitly shares `JSON`/`Error` intrinsics so a cross-realm `instanceof Error` mismatch cannot hide those excerpts. Earlier weaker VM-only checks are not evidence of the original real-runtime privacy behavior. No accounts, schema, sources, ranking, recommendation state or sync protocol change.

Final local evidence: `unit-10` executes23 files/296PASS/0failure/0skip; `types-7` passes complete TypeScript checking; all three new MJS syntax checks pass, and actual PowerShell builder parse/CI-refusal passes without a build. Windows C:/D: path-port tests check actual RUNNER_TEMP confinement without assuming os.tmpdir equals it. Offline I/O audits record0blocked runtime attempts. Raw earlier failures are retained. The six previous frozen archive hashes, including Dev86/Dev87, were read back unchanged. No actual Windows runtime-choice scenario, new installable build, cloud dispatch, push or deployment occurred in this slice.

## Existing blockers stay separate

PR211's e9b08b4 builds/ordinary CI succeeded, but its candidate run `40274664757` is FAIL: exact old public v0.5.0 health rollback reports EPERM and asynchronous-launch recovery exits without terminal restoration. Normal first hop and hash rejection passed. These real failures are not repaired or waived by a new current-helper gate. A supported legacy transition/recovery solution is still required for the one-action upgrade objective; manual extraction is not an equivalent success.

Remaining full-goal requirements include completely audited content-free/source-neutral packaging, extension trust/lifecycle and cross-client identity, real issue #199/#200 and provider/device/manual acceptance, and broader backup/restore. They are not silently marked complete or added as new UI features in this gate-preparation slice.
