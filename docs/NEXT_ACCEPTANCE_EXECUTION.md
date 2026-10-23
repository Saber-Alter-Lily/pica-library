# Next consolidated acceptance candidate

## 2026-10-23 NEXT-49: Desktop source lifecycle (unpublished)

Continues frozen NEXT-48 `963af71c96e55578722f0806e37393b5bfa40c13` and its unchanged complete handoff SHA256 `ec732724f7435eecc8a012008d290f8a9c34252671fffa8f70536a3c28eb0f86`. Adds persisted local source choices, atomic/CAS save, transport-level cancellation and late-result fences while local Reader/LAN stays independent. Legacy upgrades preserve existing adapter behavior; fresh local setup starts all external sources off. Native Android receives the Desktop relay availability contract, not a forced copy of Desktop choices. [Full scope and pending native lifecycle](SOURCE_LIFECYCLE.md). New exact-source gates belong to the new handoff; do not reuse the previous build's green checks.

## 2026-10-23 NEXT-48: actual local-content ingestion (unpublished)

Continues frozen NEXT-47 `241734856565b09f6bf18dae43b4f2fba6094268`, whose complete source/media handoff SHA256 is `bf344a511dc5ad5abb854f61a5f3629cef06c95e03078741bad88ceca7845798`. Prior artifacts remain unchanged. Adds one-comic folder/CBZ native selection → bounded preview → confirmed owned copy → existing Reader/LAN, stable local namespace, reimport/progress preservation, cover browser revalidation, native foreign-source guards and expanded CSV identity. Library/tag module APIs2 deliberately require full one-click replacement; schema14 remains unchanged. Dev code63 retains package/certificate. [Limits, workflow, failure behavior and holds](LOCAL_CONTENT_INGESTION.md).

Local automation and exact-archive gates must bind to the newly frozen source in its final handoff; previous green packages are not reused. Native file dialogs, OEM gestures, physical installs, real accounts/AI and published OTA are still unverified; no user test is forced now. Main/Release/OTA, installed applications and production data are untouched.

## 2026-10-23 NEXT-47: source-owned media continuation

After frozen NEXT-45 source `4230e66c3c86` (complete handoff SHA256 `b736ef3f76b2dcb76a4b2f645cccce147bdf82eaada69c2b33d4aa6717aa58fc`), this isolated continuation extracts credential-free media transport, routes covers through their owning source and removes JM cover dependence on Pica login. Cover cache gains source/session scope, per-comic writer serialization and stale-response rejection. No database migration, recommendation change, source account or production data. Candidate Dev versionCode62 keeps the fixed identity. Exact new source, package hashes and new gates must be recorded separately; previous green checks are not reused. [Scope, safety and local-ingestion continuation](SOURCE_MEDIA_BOUNDARY.md).

## 2026-10-23 continuation: modular local-first reader foundation

The product authority is now recorded in [MODULAR_LOCAL_READER_ARCHITECTURE.md](MODULAR_LOCAL_READER_ARCHITECTURE.md): a local reader/library, no included comic bodies, optional external sources and independently maintainable functional modules with one application update action. This is the NEXT-45 candidate, not a claim that every module or source ecosystem is finished.

Implemented source slice: pure standalone tag domain with an old-path compatibility barrel; compiled source routing manifests and capability inspection; public module API declarations bound into incremental packages; incompatible APIs use the existing full-application path; source-free local setup/relaunch and no automatic online generation; preservation of unrelated source credentials when Pica settings change. New module and local-first behavior tests complement the existing update/rollback gates. Actual source-bound results must be recorded after the final build.

Previous NEXT-44 is frozen at `9ff972e50446b40445c9c54e24350f8ce9ef312b`, with its independently verified handoff retained unchanged. It passed automated/package gates but still has real-AI/provider/device holds. Tags/private mappings and AI file exchange are implemented in that previous slice; the older "first UX slice" descriptions below are historical, not the current feature inventory.

The complete objective remains open: NEXT-48 adds the bounded folder/CBZ slice, not all local formats. Source enable/disable/trust lifecycle, further recommendation/native separation, relocation/watchers/native direct import and physical gestures/upgrade acceptance remain. No old hold/issue is silently closed.

## 2026-10-22 continuation: daily UX and two separate guides

Current local slice: `codex/ux-tags-dual-onboarding-20261022`, based on frozen `e3c0ff365153555511f396321be6cdb63c981384`. The user authorized isolated writes despite the DPAPI claim failure, then separately authorized pushing this new branch, a Draft PR and fixed-signature unpublished builds. No main merge, stable release/OTA, private-key download or deployment.

Implemented: short daily onboarding and optional advanced chapters on Web/Android; independent help state and v2 compatibility; opt-in full preference controls and advanced diagnostic tools; two linked Chinese handbooks. Local Desktop unit/integration and real-browser gates are recorded in the slice evidence. Fresh Android/package evidence must bind to its new source SHA; previous candidate results are not reused.

This is the **first UX/onboarding slice**, not completion of tag participation or #200. Whitelist gating, private work tags, provider-tag mappings, visual reference sets and automatic Save-and-apply recomputation remain pending. See [scope and evidence](UX_SIMPLIFICATION_DUAL_ONBOARDING.md), [daily guide](DAILY_USE_GUIDE.zh-CN.md) and [advanced guide](ADVANCED_FEATURES_GUIDE.zh-CN.md).

Status: UNPUBLISHED / NEXT-42 DUAL ONBOARDING FIRST SLICE. Fresh exact-source CI/package results belong in the accompanying post-build validation. This is an integration candidate, not a release or device-acceptance result.

Earlier history: frozen source `43d9c2bc5a789994973703fe84408e8824962d5c` completed NEXT-40 automated/package gates in run `39759492930`; it did not establish real-provider/device acceptance. NEXT-41 subsequently covered native JM source-screen localization, operation feedback and duplicate prevention with synthetic tests, preserved in the current base `e3c0ff365153555511f396321be6cdb63c981384`. See [JM_SOURCE_UI_ACCEPTANCE.md](JM_SOURCE_UI_ACCEPTANCE.md) and the retained [download boundary](JM_NATIVE_DOWNLOAD_ACCEPTANCE.md). This new slice does not reuse those build results as its own.

## Authority and baseline

- The user authorized the agreed issue/source/reader integration plan and, after a failed Local Memory DPAPI claim, explicitly authorized isolated development and package builds for this run.
- No coordinator identity or secret is changed. No main merge, tag, Release or stable OTA change is included.
- The user separately authorized pushing this isolated candidate branch, creating a Draft PR and running existing fixed-signature CI. The private signing key must remain in Actions and is not downloaded to this workstation.
- GitHub main verified on 2026-10-21: `095d6910c34e00824e03b08a30af0ce4e708137e`.
- Existing issue implementation: `e12d48839d0ad1ac86964c14cdc0164a5ebfe0a0`, based on the isolated post-stable candidate `454e9fef1a04a5fdbc17227af2fe755e52c6fbd7`.
- Branch: `codex/next-acceptance-sources-jm`. The previous working directory is preserved; the seven existing Reader gesture files were copied into this isolated checkout.
- Production databases, Visual vectors, settings, credentials and installed applications are outside the write scope. Tests use temporary/synthetic data.

## Work and evidence ledger

| Work | Current evidence | Remaining gate |
| --- | --- | --- |
| #199 collection view filtering | Opt-in BLOCK/LESS projection retained; synthetic read-only and browser regressions passed | Human objective/filter/objective comparison on the next isolated package |
| #200 preference discovery and explanations | Desktop full-local-catalog search retained; Android search-only OpenCC aliases, explicit staged Save/Undo, rotation retention and collection-frequency wording added | Human tuning-burden reduction; external taxonomy and versioned alias migration are NOT implemented |
| #204 JM account favorites | Shared maintained SDK adapter; bounded complete scan → preview → additive confirmation; account binding, cancellation and summary/detail preservation tests | Real JM account/folder/pagination/weak-network acceptance |
| Source registry | Pica/EH/JM registration and capabilities; legacy Pica IDs preserved; unknown namespaces fail closed; Web Reader and generic download routing corrected | This is a compiled adapter extension point, NOT downloadable third-party extensions |
| Reader gestures | Existing seven-file local change integrated; final full Android tests/lint/Dev and Release shrinker build passed | Physical touch/OEM/device QA |
| Packages | JM JRE/JAR built; offline status probe passed; isolated candidate workflow added | Exact-source Windows ZIP / fixed-certificate Android Dev APK, integrity and isolated startup gates |

No previous CI run validates later integration changes. Source implementation, automated tests, packaged startup and human acceptance must remain separate evidence levels.

## Source selection gate

Selected `JUKOMU/JMComic-Api-Java` v1.1.12 (MIT), using the same thin Java adapter on Desktop's bundled private JVM and Android's native runtime. Keiyoushi/Mihon and Suwayomi remain researched alternatives, not embedded runtimes. See [source provenance and explicit limits](JM_SOURCE_ADAPTER_ACCEPTANCE.md).

Remote favorites are collection evidence, not implicit explicit Likes. Import must be previewable, idempotent and non-destructive on partial failure. Remote mutations are not required in this candidate.

## Automated evidence before source freeze

- Desktop: 228 unit/integration files, 1245 PASS + 1 pre-existing skip; TypeScript and Web syntax 39/39 passed.
- Browser: 29/29 real headless Edge/Chromium checks passed with synthetic APIs, including the new JM panel and three-language/narrow-screen layout. A detected English narrow-screen overflow was fixed, not waived.
- Shared JVM: four synthetic adapter tests passed; bundled runtime's status probe has no account and performs no provider request.
- Android final gate: 34 files / 151 tests, zero failures; lint, Dev APK and Release R8 build passed. The native catalog/SPI regression reproduces correct replacement semantics with a test-only AtomicFile rename shadow: Windows `File.renameTo` does not replace the existing target, while Android POSIX rename does. Production AtomicFile is unchanged. Physical crash/durability acceptance is not established by this fixture.
- Android removes the desktop WebP ImageIO dependency on every dependency path, retains the native SPI and Gson DTOs, and enables pinned Java-library desugaring for older Android APIs. R8 still reports upstream SDK record stack-map warnings in unused novel/profile DTOs; the current pinned build completes. This is not a zero-warning or device-compatibility claim. [Android desugaring reference](https://developer.android.com/studio/write/java8-support).
- No production database, credential store, installed app, favorites, Visual embedding/mode or sync state was read or changed. No DINO/model training was run.

## Deliberately unfinished

- JM is opt-in. Existing automatic recommendation retrieval remains Pica/EH/ExH; imported JM collection metadata may enter existing local evidence, but there is no JM-specific ranking boost or automatic JM candidate recall.
- JM summary endpoints omit tags; an explicit cancellable detail-enrichment batch is limited to 20 favorites. Missing tags/authors are not fabricated and a summary refresh cannot erase enriched tags.
- Desktop inherits an unauthenticated HTTP proxy through private stdin configuration. Unsupported authenticated/HTTPS/SOCKS proxies are rejected rather than silently bypassed; changing the proxy requires restarting this candidate. Native JM uses the device/SDK network path; native proxy parity remains future work.
- Android JM has native search, details, chapters and online reading without Desktop. NEXT-40 adds explicit phone downloads, task-center controls and complete-chapter offline reading. NEXT-41 localizes the source screen and improves its operation feedback, cancellation and search-state recovery; this is not full-app locale/device acceptance. JM-specific cross-device progress and native proxy parity remain unimplemented; existing LAN/local/WebDAV paths remain available.
- New adapter code is independent implementation; no recovered reference-APK code, library, art asset or private analysis payload is imported.

## Handoff gate

Freeze one source commit after integration. Deliver permitted source/patches, dependency provenance/licenses, compact validation evidence, checksums, an acceptance checklist, rollback instructions and available installables in a self-contained review ZIP. Report unavailable or failed gates explicitly. Physical Windows/Android/provider acceptance remains pending until the user tests the candidate.

Task-owned build caches and temporary artifacts stay outside retained deliverables. Before handoff, verify the final manifest and remove only reconstructible disposable artifacts created by this task; preserve the original working tree and all required audit evidence.
