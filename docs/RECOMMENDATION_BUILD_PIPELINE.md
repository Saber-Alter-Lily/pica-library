# Recommendation build pipeline — NEXT-57, unpublished

## Scope and ownership

Continues frozen NEXT-56 `2167576eea14e2c02f4d143e2097f4ca24da8856`. The complete prior handoff remains unchanged (SHA256 `593c0b28eadebbe89acb4758e587c5fee22de4896bf46eb1b6d0db9af8e61874`). This slice separates the real Final V3 build, not just a demonstration wrapper.

- `src/recommendation/build-pipeline.ts`: ordered profile → intents → routes → retrieval → frozen ranking → feedback/personal policy → Visual rerank → result/telemetry assembly. It receives explicit capabilities, never a LibraryService/database handle, account, filesystem or model runner.
- `build-ports.ts`: stage-specific evidence snapshots, semantic profile/tag resolution, generic retrieval, checkpoints, progress, source-revision fences and versions. Read timing stays unchanged: feedback early; graph after retrieval; Visual settings/vectors late. This is not a new all-at-once snapshot or a recommendation algorithm.
- `src/services/recommendation-build-adapter.ts`: existing SQLite reads/policy initialization and Registry loader/profile binding. Policy initialization remains allowed only for an explicit build, not a GET/query.
- `recommendation-retrieval-adapter.ts`: existing Pica/E-H/ExH requests, import conversion, per-build caches and budgets (E-H4 / ExH2). Existing provider request cancellation and both source-revision fences remain. This adapter is deliberately not a generic third-party executable plugin host, nor a new JM recall policy.
- `LibraryService`: application resource lease, pause/resume/cancel/error state and adapter wiring. Cycle commands still persist/promote through the existing store. No schema, state key, HTTP payload, ranker/model/version, tag policy or Visual OFF/SHADOW/LIVE default changes.

The ranker previously imported the crypto-bearing author identity file for two pure string functions. Those exact normalizers now live in `library/author-normalization.ts`; the old file re-exports them. There is no new author matching rule.

## Reuse and enforceable boundaries

This continues the existing [cycle module/domain-port design](RECOMMENDATION_CYCLE_MODULE.md), using the project's current planner, query translator, retriever, ranker, private-tag and Visual algorithms. No framework, source dependency, copied competitor implementation, neural model or new training is added. Existing TypeScript AST and esbuild tools verify the frozen oracle and actual runtime dependency closure. The build entry must compile for the browser with a closed allowlist of pure modules; Node/SQL/session/Registry-loader/model execution dependencies fail the gate. Existing query/command boundary tests are retained separately, not broadened to permit I/O.

## Persistence-progress correction

The frozen pre-extraction application reports computation complete before the coordinator saves/promotes the pool. A deterministic synthetic save failure reproduces the false-complete UI while no active cycle exists. The accepting path supplies an optional non-authoritative commit observer: `persisting` → `committed`, or `failed` / `discarded`. During persistence, pause/cancel are unavailable. A failed save reports failure and keeps the previous active cycle. Obsolete cycle notifications cannot change a newer build's state; a throwing presentation observer cannot change the storage outcome. The compatible three-argument coordinator and direct-build result contract remain available. This changes status truthfulness, not scores or wire storage.

## Evidence and limits

`test/fixtures/recommendation-build-legacy.ts` freezes the old method from the source above (method SHA256 `de00250b8e20584b9e9005c0b322222976d3481fd95cfff55d031d4a8ca221b2`). It does not call the new pipeline. Full deterministic old/new comparison checks output scores/order/evidence/telemetry/versions and observed read/checkpoint/provider order using separate synthetic SQLite databases, repo Registry assets and tiny synthetic vectors. Scenarios cover Visual OFF/SHADOW/LIVE, Pica-only/E-H-only, partial provider failure, selected/mapped/manual tags, limited/insufficient pools, both revision fences, cancellation and resource release. Pause/resume, failed replacement preserving the old batch, read-only cache delivery, commit failure/retry and observer isolation have dedicated tests. No real account, comic page, production database or embedding is opened.

Exact-source CI/installables and downloaded-Windows source-free/startup/assets/tag/local-reader/query/SQLite/deep-update/stable-and-prior-upgrade gates are recorded in this slice's new immutable handoff. Native/JVM app logic is unchanged, but a current signed Dev72 must preserve Dev71 package/certificate. These are packaging continuity gates, not physical installation.

Still open: V5 audit/export/legacy-adaptive decomposition, optional source runtime/trusted extension policy, native body export and retired/crash-orphan cleanup, concentrated physical/OEM/provider/gesture/tag/AI/offline-sync acceptance. Generic legacy **incremental** updater asynchronous-launch error parity is not proved by the full-updater tests; it remains a separate follow-up. No main merge, tag/Release, stable OTA change, key download, production access or deployment.
