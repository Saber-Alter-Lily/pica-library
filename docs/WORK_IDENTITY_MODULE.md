# Stored work identity: views, explicit commands and evidence task

NEXT-61 unpublished candidate, continuing frozen NEXT-60 `2c3f7d647100441398b28fbdc0cc41a5e8ffd0cc`. Existing matching algorithms, confidence/cover thresholds, identity IDs, schema14, public endpoints and module APIs remain unchanged. This is local metadata management, not a content source or permission to merge works automatically.

## Actual ownership

| Owner | Responsibility | Excluded authority |
| --- | --- | --- |
| `identity/queries-v5.ts` | Actual variants/detail funnel, audit, evidence/review, dry-run plan and preparation-history views | SQL/credentials/filesystem/model execution, preference initialization, writes |
| `identity/commands-v5.ts` | Existing explicit evidence refresh, human decision/clear, confirmed plan preparation | Automatic Work/Edition/upload binding, serving generation or image retrieval |
| `identity/task-v5.ts` | Existing admission, detached CPU audit, progress, duplicate control, pause/resume/cancel/result and release | Provider transport, decision/policy or canonical binding writer |
| `services/work-identity-adapter.ts` | Bind existing stored-fact queries, normalized policy, SHA256 and SQLite capabilities | New persistence engine, source protocol or scheduler |
| `LibraryService` | Existing public compatibility methods, full-catalog callback and existing resource-coordinator composition | Retained copies of the migrated view/command/task method bodies |

This is a Library identity domain under `src/identity`, not ownership by the recommender. The only policy projection entering it is a frozen `explicitDistinctPairs` list; tag controls, taste/session profiles and device-sync state are not capabilities. Legacy shared matcher/key-helper locations are retained for compatibility, not claimed as completely decomposed. Their matcher input annotations are narrowed to these facts; canonical emitted JavaScript is hash-checked identical to frozen NEXT-60.

Type-only storage signatures express the exact existing record shapes; the actual browser-platform runtime graph must exclude the database/service implementation. Runtime objects are frozen and narrow too: task reads only catalog/distinct facts and saves only evidence. Trusted application modules are not an untrusted-code sandbox; downloadable extension trust remains a separate open design.

## Verified old gaps and bounded corrections

The clean NEXT-60 synthetic baseline found audit/detail reads initializing an absent portable policy. A failed policy write could also leave a saved human decision, or delete a decision while retaining its KEEP_SEPARATE policy pair. No production profile, account, body or vector was used for these probes.

- Views and evidence-only refresh use ephemeral normalized defaults, never `state()` initialization. Explicit human mutations still initialize/update the same persistent policy and revision as before.
- One explicit decision/clear now runs inside the existing synchronous, nested-safe `LibraryDatabase.withAppStateTransaction`. Decision row, distinct-pair policy and the returned review projection are one savepoint. Policy validation/write failure (including after the actual SQL write), or review-projection failure, rolls back the unit. No schema/key/format or SQLite transaction kernel is added or altered.
- The return projection stays inside the synchronous transaction so an RPC error during that projection does not conceal a committed decision. This extends the transaction through existing bounded view computation; no network, body IO or `await` belongs there. Large-profile latency/external-connection contention is not accepted by small synthetic tests.
- Evidence batching retains its existing transaction, separately from human-decision savepoints. Materialization remains **DRY_RUN/PREPARED_ONLY**, idempotent by existing request key/version/digest. No apply endpoint or binding capability is introduced. SAME_WORK/EDITION_VARIANT are adjudicated evidence; existing KEEP_SEPARATE policy semantics remain.

This is not a new durability protocol, crash/power-loss proof, external multi-process concurrency contract, or universal claim about errors after SQLite commit/release. Existing cooperative-task and admission-release-throw semantics are retained. Cancellation waits for a safe checkpoint; task control is not persisted across application restart. Human/scientific identity acceptance is never inferred from engineering CI.

## Evidence and execution locations

- `test/fixtures/work-identity-legacy-authority.json` binds15 original methods (including the original catalog helper) at the frozen source. The old fixture retains exact unformatted bodies and calls shared unchanged matchers, never replacement modules.
- Complete output, table rows and read/write ordering are compared across plain, decided, KEEP_SEPARATE, bound, cover-only synthetic vectors and absent-policy fixtures. UUID-only storage IDs are controlled at the synthetic storage seam, not stripped from comparisons. Larger-than5000 decision windows, bounds, preparation replay/blockers/stale authority and local-only explicit pairs are included.
- All-table rollback tests cover pre-/post-policy-write and review failures, normalized-ID rejection and nested savepoints. Old gaps are retained as actual baseline evidence. Query/refresh tests prohibit implicit preferences and canonical binding changes.
- Actual background audit/control behavior is compared to the old task: success, duplicate admission, pause/resume/cancel, queued cancellation, read/save/admission failures and lease release. The task cannot gain human-decision or canonical-write ports.
- Browser bundling enforces the real runtime dependency closure; public service methods are AST-checked as delegation. The existing TypeScript compiler API, Vitest/esbuild, Node SHA256, SQLite savepoint and resource coordinator are reused. No new dependency/framework/model is added, and no inference/training is run.
- The existing **CI-only** Windows artifact gate adds real identity GETs, background evidence refresh and explicit save/change/clear against an owned source-disabled two-comic synthetic profile. An external, unshipped preload injects two failures **after actual SQLite policy writes**. Both must leave every table equal to the respective pre-call snapshot. A prepared plan must remain idempotent/nonexecuting with zero Work/Edition/binding creation. No fault API is shipped.

Follow [LOCAL_VALIDATION_SAFETY.md](LOCAL_VALIDATION_SAFETY.md): local source/type/syntax and inspected no-Java/no-listener tests only; no local Java/Gradle/apksig/JM worker, downloaded application, browser runtime, LAN bridge or upgrade matrix. Full Windows/Linux/browser/JVM/native/signature/package/upgrade gates run on the authorized Draft CI. Exact-source results and complete artifacts belong to the handoff; previous green runs are not current evidence. Dev76 must preserve Dev75 package/certificate and increase versionCode; physical installation/data retention remains deferred.

The full local-first modular-reader objective remains open: legacy/adaptive recommendation ownership, optional source runtime/trust host, export/orphan/recovery-copy retention, concentrated physical/provider/gesture/tag/AI/offline QA and published OTA/old-controller first-hop/crash/UNC acceptance. No production account/data, main merge, tag/Release, stable OTA mutation, private-key download, install or deployment.
