# Recommendation cycle module (NEXT-53, unpublished)

## What owns what

`src/recommendation` contains the V3 cycle/batch commands, persisted-result queries and explicit storage/build/runtime ports. It does not import SQLite, LibraryService, provider clients, credentials, network transports, registry loaders or model runners. The domain receives already-built candidates. It reuses the existing V3 batch allocator, V5 ownership/block filter and tag rules; ranking weights, model versions and Visual settings do not change.

`recommendationCycleReadStoreV3` binds the existing database reads and policy normalization. Its returned object is frozen and has no save/allocate methods. Missing policy state can be read without initializing a saved scheme. `recommendationCycleWriteStoreV3` adds only the explicit cycle writes, reusing the existing SQLite methods and allocation transaction. The old `CycleCoordinatorV3` constructor remains an application compatibility facade. The application supplies generation, IDs and time; domain modules do not own provider accounts or the database connection.

Mihon's [domain repository interface](https://github.com/mihonapp/mihon/blob/main/domain/src/main/java/tachiyomi/domain/manga/repository/MangaRepository.kt), reviewed 2026-10-23, is an architectural reference for explicit domain operations rather than concrete storage ownership. No Kotlin implementation or assets were copied. This candidate reuses its own existing algorithms, TypeScript compiler and esbuild, with no new framework/dependency.

## Local reading and recommendation commands

- Opening the local server no longer automatically prepares the legacy online recommendation cycle. Existing explicit recommendation actions retain their behavior.
- Desktop `current` is an explicit POST command and can allocate the first local batch from an already-generated pool. `next` retains request idempotency and the six-batch cap. Building an unusable replacement retains the previous usable cycle.
- Mobile GET current/cache uses the read capability only. It cannot call the builder, allocate a batch, create cycle/policy state or advance the seen ledger. Existing source/cached markers and result fields remain.
- If a pool is ready but Desktop has never prepared a first batch, current GET returns an empty result with additive `awaitingFirstBatch` / `READY_NO_BATCH` state. It does not silently prepare one. An explicitly requested mobile recompute POST builds and prepares the first batch before reporting completion, so the next GET can immediately read it.
- Portable candidates and current batches use the same ownership-aware eligibility view, including reviewed canonical work bindings. Original pool scores, order, batch IDs/evidence and stored candidates are not rewritten by delivery filtering.

## Warm-cache correctness

Eligibility invalidation includes owned identities/binding version and explicit distinction decisions, plus raw hard BLOCK controls, private binding policy, legacy suppression, seen/duplicate facts and active temporary suppression. This corrects the previous case where a warmed cycle could keep serving a subsequently blocked/seen item. Temporary expiry also changes the active mask. These are eligibility corrections, not a new ranker or recomputation of scores.

Queries retain compact owned/candidate ID fetches and a bounded two-cycle in-memory view. The retained types describe catalog facts, not database handles. A browser-platform bundle gate follows actual runtime imports and allows only the domain, existing batch allocator, portable policy and tag rules. This complements TypeScript port checking; metadata alone is not a module-boundary proof.

## Compatibility and evidence

The state keys, SQLite schema14, profile/pool/batch serialization, public module API versions and mobile portable policy format remain. Normal existing V3 cycles are read directly. The new Dev build increments code67 -> code68 with the same package/certificate; native app logic and shared JVM sources are unchanged in this slice.

Synthetic tests exercise real SQLite adapters and paired mobile HTTP: empty and ready-without-batch reads, explicit recompute, repeated current/cache reads, preserved scores/batches/seen state, restart, new blocks/factual masks, temporary expiry and canonical owned-work filtering. Existing V3 generation, allocation, retry and network-recovery suites continue through the compatibility facade. Actual installables and Windows prior/stable application replacement/failed-health rollback are checked after building; exact results and hashes belong in the separate handoff.

## Remaining work

This slice originally separated cycle orchestration and delivery from storage. NEXT-57 now separates the [real build pipeline and its application adapters](RECOMMENDATION_BUILD_PIPELINE.md), with frozen old/new comparison and actual runtime import closure. V5 audit/export and legacy/adaptive implementations remain separate follow-ups; optional source-runtime/trust and concentrated real-device/provider acceptance are not completed by this boundary. NEXT-54 independently adds bounded native local import. No source account or production data is used by these tests.
