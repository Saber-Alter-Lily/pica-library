# R3 Android original-product source-neutral boundary — 2026-11-03

The current officially published v0.5.0 main and its user data remain unchanged.

## Objective and honest proof level

Build a SOURCE_NEUTRAL_QA variant from the **same original :app** sources; do not fork HomeActivity, the reader, the library store, recommendation ranking or Android navigation. The four original tabs and the real same-signer standalone Host path remain usable. This is a staged excision, **not evidence of source-free distribution** until the R8 + real APK DEX audit passes.

- `:app:assembleCleanSourceQa -PsourceNeutralQa=true` builds isolated `com.picalibrary.android.cleanqa` without changing stable app/signature/default Gradle build. R8 shrinkage is enabled only for this build; the old dev/stable build graph is unchanged. This avoids copying/recreating an alternate product.
- Existing `SourceAccess` returns disabled permits for bundled `pica/eh/jm` providers without parsing account credentials or mutating previous opt-in settings. Startup skips source bootstrap, supporter and updater workers. Source menus and account pages become **separate Host, local, Desktop/LAN and WebDAV** navigation; no login/UI activation of bundled site SDKs. The actual original `HomeActivity`/four tabs, native recommendation, `LocalComicStore`, `:reader-view` and `:signed-reader` are retained.
- Original reader refuses legacy site-bound intent kinds; only local, phone, desktop and WebDAV survive in its direct route. Optional Host uses the existing signed Binder import/Reader activities; it is independently installed and never bundled into the core. Provider thumbnail fetch is skipped, but existing local/desktop/WebDAV covers remain possible.
- Standalone Host target selection now recognizes `com.picalibrary.android.cleanqa` only after its same-signer and exported Activity permission verification, alongside prior two QA identities.
- The clean-build manifest prevents direct launching historic site account/browser screens and removes `REQUEST_INSTALL_PACKAGES`; INTERNET is retained **specifically** for LAN/WebDAV and updates are not enabled in this QA. INTERNET here alone is not evidence of bundled site access.
- The existing Pica/E-H/JM Java source and old JNI/JM runtime dependencies are still in the shared original `:app` source tree at this stage. The R8 audit checks the actual DEX **and mapping** for retained provider classes and refuses to upload an APK under a source-neutral label if found. A compile pass or hidden menu DOES NOT complete G2.
- The first standalone audit lives in one bounded GitHub Actions workflow `.github/workflows/r3-android-clean-source-qa.yml`, not in the 29-check original PR matrix. It reuses the existing Android 35/Gradle 8.9 build and actual APK inspection; no new Reader, source protocol, test harness or mock.

**Next concrete gate** if DEX audit reports retained providers: separate the original recommendation/catalog metadata models from provider client implementations and exclude the legacy source libraries from this variant's runtime dependency graph. Re-run the same DEX audit; do not weaken its forbidden rules. Real three-language 360/393/480dp UI, old profile migration/rollback and production signers G1/G3/G4 remain open.

For the exact product-signed Host and original Android full-app source/Reader/byte-identical offline E2E, see [R3 dual-client handoff](R3_DUAL_CLIENT_PRODUCT_CANDIDATE_20261102.md).

## R8 physical audit follow-up (2026-11-03)

- At `6e70f5ca` the real clean QA APK compiles but the audit correctly FAILED: retained `PicaClient`, `EhClient`, `JmClientManager` and `io.github.jukomu` runtime. This cannot be closed merely by suppressing source UI or BuildConfig flags.
- The original `NativeRecommendationEngine` now bypasses its legacy online provider strategy in `SOURCE_NEUTRAL_QA`; `NativePortableRecommendationCycle` projects the already-ranked Desktop reservoir into the **existing** 12-item batches without network calls, preserving the original recommendation store/feedback UI and not implementing a new ranker. An unused old `MainActivity` entry is removed from the clean manifest; provider ID formatting is independent of `EhClient`.
- This next bounded change splits the previously shared JM dependency by build type: old Debug/Release still use the original runtime; clean QA uses it **compileOnly** solely while the remaining source code is being uncoupled. Never repackage a third-party JM binary in the clean candidate. R8 remains enabled and the same DEX/mapping forbid list still blocks uploading if any classes remain. Temporary `-whyareyoukeeping` diagnostic rules on three old clients and the original JM source print the **actual retention graph** for the next structural cut; these are non-keep diagnostics.
- Exact-head verify required; neither the independent candidate nor the G2 source-free gate can be marked passed until the original client classes and runtime types vanish from the resulting DEX.

## Targeted physical reachability cut after real R8 trace

At `1ec32503` the actual `-whyareyoukeeping` log identified the precise retained chains. `PicaClient` and `JmClientManager` were still instantiated by `ReaderSourceFactory.create` via the manifest-rooted original `ReaderActivity`; `EhClient` was retained through `AuthorWorksActivity.renderShell` → `EhCapabilityStore.load`. Merely guarding providers in an earlier if-branch did not make the later legacy switch unreachable.

The original Reader factory now has a **complete early-return/throw switch** for source-neutral builds, preserving only owned local/phone/Desktop/WebDAV readers; no in-process provider instantiation remains on that path. The original author works screen keeps cached metadata and its filter UI, but refresh is **local only** and the ExH availability probe is removed for clean QA. Old Debug/Release paths are unchanged. The existing real R8 DEX/mapping audit is still authoritative and no forbidden-name/permission checks are softened. If any unwanted classes remain, inspect the updated reachability graph instead of marking G2 passed.

## Source worker & historical library closure (2026-11-03)

At exact `e88b15da`, R8 still showed `PicaClient` from `PicaDownloadWorker.doWork`, `JmClientManager`/JmSource from `JmDownloadWorker.doWork`, and `EhClient` from `HistoryActivity.importLegacySources`. Android WorkManager's `Worker.doWork` dispatch keeps these worker entrypoints conservatively reachable even after automatic source work is disabled.

The original Pica/E-H/JM Download Workers and Pica Bootstrap Worker now **fail closed immediately** in the source-neutral QA variant, including tasks persisted before a future upgrade. User-owned local/Reader/import/transfer tasks are unchanged. All THREE history ID format uses were switched from `EhClient.isEhId` to the identical pure `ComicIdFormat.isEhId`, so the original Home history keeps importing Desktop and WebDAV session metadata without depending on an E-H network client.

This is a targeted dependency cut, not a new Reader/DB/scheduler; ordinary stable/Dev variants remain unchanged. The existing R8 real-APK source-exclusion gate remains strict and must return PASS before distributing a clean QA artifact.

## Final two R8 roots: history resume and reader metadata

At `35a80429`, the physical audit now reports only `EhClient`, `PicaClient`, and its metadata DTO `PicaClient$Comic`. R8 says `PicaClient` is rooted by `HistoryActivity.resumeSupported` for direct Pica resume; `EhClient` by `ReaderProgress.HISTORY.resolve` merely to classify an ID. The original history now **continues showing imported/cached sessions** but in clean QA refuses *direct in-process* source resume, preserving local/phone/Desktop/WebDAV resume. Reader history's provider label uses the exact same pure `ComicIdFormat` regex.

The remaining Pica metadata coupling was also removed from the original `RecommendationPolicyStore.cacheRebaseScore`: `RecommendationEvidenceStore` now provides overloads for `NativeRecommendationStore.Item`, both invoking **one identical shared evidence-weighting implementation**. No change to scoring weights, TagParticipation, stored recommendation cycles, live old-variant Provider ranking or user's saved tag policy. The physical R8 DEX mapping must still return zero residual source classes before uploading a clean QA APK.

## Creator concepts retain no E-H client class

At `547e4b05` the real build's mapped DEX has eliminated `PicaClient`, all `PicaClient$Comic` metadata classes, `JmClientManager`, `JmSource` and third-party JM runtime. The **sole remaining** `EhClient` reference was traced by R8 to original `AuthorConceptStore.build`, which used `EhClient.isEhId` only as a pure regex format check when partitioning cached author data. The creator concept builder now uses `ComicIdFormat.isEhId`, the same exact regex, preserving E-H metadata classification and local creator browsing without retaining or contacting its old HTTP client. Physical APK audit remains enabled and must still demonstrate complete removal.
