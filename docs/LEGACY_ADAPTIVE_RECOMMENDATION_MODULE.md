# Legacy recall and compatibility recommendation sessions

NEXT-62 continues frozen NEXT-61 `3ce697566f379fef2dc566af9e91f3ee183c2d21`. This is a compatibility-engine boundary, not a prerequisite for local reading or a replacement for the active Final V3/V5 cycle. No comic bodies/catalog service, competitor code/assets, new dependency or framework is supplied.

## Actual ownership and reuse

`src/recommendation/legacy-retrieval`, `legacy-sessions`, `adaptive-batches` and `compatibility-queries` now own the actual ordered recall/session/batch bodies. The old service/import paths are composition/compatibility adapters, not duplicate implementations.18 old methods migrate; the19-method frozen authority also includes the original policy-view helper. Both full old controllers and the converter are captured from the exact baseline, not rewritten to call replacements.

Retrieval receives bound catalog/events/graph reads, only edge/catalog writes, tag policy, four historical Pica recall operations and converter/clock/concurrency ports. Credentials, concrete SDK/SQLite and source leases remain application adapters. Status functions receive no generator/writer/allocator. Existing `p-limit` owns concurrency3, total recall tasks stay24, and seed/page/related limits remain. All profile/rank/rerank functions are reused. The helper imports the same existing pure normalization owner directly rather than its Node-crypto re-export; function bodies are unchanged.

This reuses the existing [domain/repository design reference](RECOMMENDATION_CYCLE_MODULE.md), [p-limit](https://github.com/sindresorhus/p-limit), TypeScript/esbuild and synchronous SQLite savepoint. No new queue, transaction engine, IPC protocol, provider implementation or ranking algorithm is built. Schema14, module APIs, state keys, serialized fields and scoring rules remain.

## Reproduced gaps and corrections

Three actual temporary-SQLite probes found: V2 status creates `recommendation.activeCycle`, adaptive status creates `recommendation.v3.activeCycle`, and rejected batch persistence leaves consumed `recommendation_seen` IDs despite no saved batch. Frozen source hashes and `BASELINE_GAPS.json` retain the evidence.

Missing status state is now an ephemeral per-controller draft: same string-ID response shape, stable on repeated reads, persistent only after an explicit command. It is not a generated recommendation cycle or a stable ID across restarts before any command.

Adaptive pool+pointer and final allocation+batch+pointer+returned view reuse existing nested-safe savepoints. Pool cache is updated only after commit; no await/network/ranking occurs within the savepoint. Before/after-write, returned-view and nested failures must restore every table, and retry must deliver unconsumed candidates. Legacy recall additionally rejects source-revision/disable-reenable changes before importing late metadata/edges. Still-current partial-provider failures retain the old fail-safe.

## Evidence and limits

Inspected local checks use only source/type/Web syntax and synthetic SQLite: complete old/new outputs, scores, rows and observation order, frozen methods/classes, pure import closure, source fences and rollback. Full/native/browser/signing/application/updater checks run only in authorized Draft CI under [the user's safety restriction](LOCAL_VALIDATION_SAFETY.md).

The CI-only unmodified Windows gate requires repeated idle GETs without any table change, disabled-source recall rejection, two failures after actual batch/pointer SQL, full rollback/retry and unchanged final-serving/policy state. External fault preload and synthetic nonfavorite/pool seeding are test seams, never product endpoints or shipped files. No real provider or production profile is involved.

V2's existing session+seen transaction and prepared-session/prewarm/pointer behavior are retained, not claimed as a new whole-generation transaction. Command overlap/idempotency, large real profiles, crashes/power loss/external connections, old-controller OTA first hop, physical providers/phones/gestures/tags/AI/offline sync and full modular-reader acceptance remain OPEN. No scientific recommendation/identity/Visual acceptance follows from engineering gates. Optional source host/trust and other domain seams remain unfinished. No main merge, release/tag, OTA, key download, install or deployment.
