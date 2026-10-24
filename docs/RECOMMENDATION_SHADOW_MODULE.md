# Manual V5 shadow execution and task boundary

Unpublished NEXT-60 candidate. This is an extraction of the existing real ordered pipeline and control state, not a replacement ranker, second scheduler or new recommendation product. It continues frozen NEXT-59 `f4e2c2ba8cb147292e4c344c59ca1619766a4380`.

## Ownership

| Owner | Responsibility | Deliberately absent |
| --- | --- | --- |
| `recommendation/shadow-execution-v5.ts` | Existing planning → retrieval → hygiene → ranking → semantic diversity → correctness/Visual coverage → audit save | SQLite, credentials, filesystem/Registry loading, serving activation, model execution |
| `recommendation/shadow-task-v5.ts` | Existing background state, duplicate start, cooperative pause/resume/cancel, result/error and admission release | New scheduler, network/session ownership, raw-catalog persistence |
| `recommendation/shadow-ports-v5.ts` | Narrow evidence, planning, provider, semantic resolver, source-revision and audit-only capabilities | General DB/service handles, favorite/feedback/seen/batch/cycle writer |
| `services/recommendation-shadow-adapter.ts` | Bind existing normalized policy, Registry, ProviderService and SQLite | New transport, credential copying, alternative persistence |
| `LibraryService` | Compatibility methods and composition using the existing resource coordinator | A second copy of the execution/control methods |

All algorithms, budget clamps, model identities, telemetry fields, trigger, Desktop confirmation and public status/API shapes remain. Source/profile fixtures and oracle contain invented metadata only. Existing MIT project modules, Vitest/esbuild, Node promises and the resource coordinator are reused; no dependency/framework/model is added. V3 serving, Android recommendation policy, Reader, tags, schema and sync protocols are not changed by this extraction.

## Two intentional behavior fixes

1. A shadow run reads `RecommendationPolicyStoreV5.state({initialize:false})`. In a new profile it may save its explicitly requested **audit**, but must not create persistent preferences as a side effect.
2. Capture the installation's source-choice revision when execution begins after resource admission. Existing cooperative checkpoints and the concrete audit-save boundary reject a revision change. Disable→re-enable also invalidates the old run. This prevents a completed obsolete audit even when a synthetic adapter or isolated route failure would otherwise allow orchestration to continue. Real ProviderService already enforces source leases/abort; this adds an orchestration/persistence fence, not a claim that live-provider transport ignored disable.

The save adapter additionally requires `v5-shadow:` cycle identity, exact current composite model version, `mode=SHADOW`, `servingImpact=false` and `persistCandidates=false`. Its only mutation capability is appending an audit candidate-pool record. Candidate comic bodies/metadata are not imported and serving pointers are not activated.

This is not an atomic policy/account snapshot. Any source revision change invalidates the run, including another source's setting. Cooperative cancellation waits for the next checkpoint; it is not a guarantee of immediate interruption of every external request. Existing observer-throw and admission-release-throw semantics are preserved, not newly solved. Legacy/adaptive and work-identity mutation orchestration remain separate follow-ups.

## Evidence design

- `test/fixtures/recommendation-shadow-legacy-authority.json` binds six unformatted old methods to their original SHA256 and source commit. The oracle calls shared unchanged algorithms, never the new execution/task modules.
- Differential tests compare complete return structures, generated IDs aligned to the old result, saved telemetry, every progress event and checkpoint/read/provider order. Cover normal, failed provider, selected/private tags, providers off, missing policy, >25 semantic rows, budget limits, absent Registry and late semantic failure.
- Real temporary SQLite snapshots compare **all tables**, not only selected setter spies. Success permits exactly one audit append; cancellation, source changes and failure permit no writes. A missing policy remains missing; pre-existing serving rows and user-state sentinels remain unchanged.
- Task-control differential checks full public status/result transitions against the frozen implementation: duplicate start, admission wait/failure, pause/resume, pause/cancel, queued cancellation, execution failure and lease release. Service integration checks cancel/source change before actual persistence.
- Browser-platform esbuild checks the actual pure execution/task dependency closure with an explicit allowlist. It must not resolve SQLite, provider/session clients, Registry filesystem I/O or model execution.
- `scripts/test-windows-recommendation-audit.mjs` retains actual read/export/cancel gates and then exercises the unmodified compiled Desktop shadow API in a synthetic source-disabled profile. Missing authority is rejected; a real background task completes and appends exactly one current non-serving audit while all other tables stay equal. It runs **only in GitHub Windows CI**, not on the user's computer. Source-change fault cases use unit fixtures; no fault API is shipped.

## Validation location and acceptance limits

Follow [the effective local safety policy](LOCAL_VALIDATION_SAFETY.md): no local Java/Gradle/apksig/JM worker, random-path application copies, LAN bridges or upgrade runtime matrices. Local work is restricted to type/syntax and inspected no-listener synthetic tests. Full platform/unit/browser/native/runtime/upgrade gates and signed Dev75 construction run in the authorized Draft CI. Preserve failed attempts and label CI results as CI, not independent local execution.

Exact-source runs, artifacts, checksums and raw evidence belong to the completed handoff, not this design document. Engineering CI/package proof is not physical-device/provider/gesture or scientific Visual acceptance. No formal database, account, embedding, feedback, generation pointer or installed application is read or changed. No merge, tag/Release, OTA mutation, key download or deployment is authorized here. The complete modular local-reader objective remains open.
