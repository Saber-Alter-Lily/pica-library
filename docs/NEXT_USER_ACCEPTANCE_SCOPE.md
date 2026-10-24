# Next concentrated user acceptance — scope, remaining development and timing

Observed 2026-10-24 while NEXT-67 source is being closed. This is not a release authorization, a new goal, or a claim that the full modular reader is complete. Keep the full local-first/content-free/user-managed-source/modular/one-update-action objective intact.

## Actual state

Frozen prior NEXT-66 source91b62d0 passed exact candidate3/3,39 successful+6 conditional skipped PR checks,57 Chromium and402 native tests. The current NEXT-67 has real host-library/shared-Reader/private-progress code and148 local source assertions/typecheck/Web48/48 passing, but needs its own clean-source CI/browser/compiled-Windows/signature/installable evidence. Prior greens are not current-source proof. User/device/provider acceptance remains deferred.

The first NEXT-67 push15c56be was **not accepted**: full CI found ordinary-app localization text outside dictionaries, and the separate J7 benchmark timed out. Dictionary ownership and a source-oracle-reproduced busy-controls/lost-click mechanism are being corrected without relaxing gates. This is precisely why current-source CI/compiled/browser proof is required before giving the user a test package; timing below is conditional, not an assertion that the failed build is ready.

The repaired source has148/148 inspected local assertions across10 files, types and Web48/48 passing. The old/new real handler reproduction is a pure fake-port test, not a local browser run or proof of the unique cause of that historical timeout. Current CI needs to establish actual browser and packaged behavior before the estimate becomes a readiness statement.

The second source d7cb690 passed its full source/type/unit/build and JVM source gate, ordinary Android job, unchanged strict J7 benchmark and Android recovery. It still **failed acceptance**: real Chromium passed57/60; the three new hosted-Reader language cases attempted to select a control inside the existing collapsed Reader-settings details without opening it. Raw logs and CI screenshots are retained. The test now follows the actual user interaction (open settings → select single-page → verify mode → close settings → page/progress); no force-click, timeout/retry/skip relaxation or production UI change. The new clean-source browser and dependent installable gates must run again. This is a known test-flow correction, not a ready-for-test claim or a reason to reuse old binaries.

## Not fully built versus built but not accepted

| Area | Implemented foundation | Still unfinished development / distinct acceptance |
| --- | --- | --- |
| Optional sources | Compiled Pica/EH/JM adapters; Desktop/native enable/disable; user-owned host configuration; new Desktop user-host library Reader | Host provider-wide search, unified catalogue/tag/history/phone/sync identity; opt-in secure remembered sessions; reviewed third-party adapter installation/trust/version/rollback. No official source marketplace will be built. |
| Local library/data | Local-only setup, folder/CBZ ingestion, owned copies, standard body-only export | Whole-profile backup/restore, identity-preserving relocation/reimport, retired generations/crash-orphans/watchers; broader CBR/PDF formats. Body export is not a complete personal-state backup. |
| Reader/gestures | Desktop shared rendering and Reader source ports; native local/JM reading; extracted gesture decisions/settings | Physical gesture/OEM/SD-card durability and retention acceptance; hosted-source Android parity. Existing code is not 'not built' merely because physical QA is pending. |
| Tags/AI exchange | Participation allowlist, personal work labels/platform mappings, Desktop/native rules; AI export→preview→explicit apply→undo; minimal exact runtime | New hosted catalogue integration, external/versioned taxonomy and alias migrations/provenance; actual AI return-file and user tuning-burden acceptance. Do not rewrite provider facts. |
| Recommendation/Visual | Cycle/build/read-delivery/audit/export/shadow/identity/legacy modules; protected ranker and frozen Visual assets | Remaining serving/sync/Visual/build orchestration seams and real-profile performance/quality. No new embedding extraction/training or scientific acceptance is authorized. |
| Cross-device/sync | Existing paired LAN/catalog/policy and WebDAV paths; credentials not blindly copied | JM/source-specific progress/proxy parity, hosted IDs/tags/progress across phone, richer offline conflicts and revocable secure session handoff. |
| One-action updating | Existing incremental/full replacement/health rollback, module-API compatibility, preserved external config/SQLite and fixed Dev signature | Current-candidate full/deep regression, physical overwrite/retention/OEM acceptance and broader old-controller/UNC/power-loss coverage. No parallel per-module updater is needed. |
| Daily UX/guides/issues | Daily/advanced onboarding and handbooks; #199 projection and #200 full-local tag discovery/control implementations | Whether the reporter's actual filtering/tuning burden is solved in real use; #204 real JM account/folder/paging/weak-network; new-source guidance and concentrated user QA. No automatic issue closure. |

## Next test package: freeze what is actually implemented

The next concentrated test need not wait for every long-term expansion above. Its checklist combines the existing issue fixes, JM native search/favorites/offline reading, tag/private mappings/AI profile, daily+advanced guides, local folder/CBZ read/export, Reader gestures, existing pairing/LAN/WebDAV, application overwrite/retention and the new **Desktop-only** hosted-library Reader. Unsupported new-source phone/search/plugin features must be marked unavailable, never faked or synced under Pica IDs.

Before asking the user to test:

1. Freeze one candidate SHA. Current-source source/HTTP/three-language browser/Windows actual body-cache-progress-resume-stale-revocation and inherited update/native/signature gates pass; inspect raw results, not only green badges.
2. Inspect actual Windows ZIP/APK source IDs, module/runtime assets, package/certificate/version/digests and protected-data exclusion; preserve failure evidence and platform skips.
3. Produce one self-contained acceptance ZIP and one concise grouped checklist with supported platform/scope, update/rollback and data-retention instructions. Review current daily/advanced guidance for contradictions. No repeated requests to test each internal refactor.

This is a test-readiness milestone, not permission to merge main, tag/Release, change stable OTA, read production data, install/deploy or claim the full objective achieved.

## Conditional timing, not a promise

The last exact candidate's observed jobs took4.8min Web/source,4.7min Android and15.5min Windows, with Windows/Android following the Web gate (approximately20min critical chain, plus queue/download/inspection). If the current candidate passes first time, **30–60min** is a reasonable estimate for its engineering artifact/evidence package. A genuine failure requires a fix and fresh exact-source gate; do not skip or relabel it to hit a deadline.

The broader concentrated Windows+Android checklist/guidance/package closeout is provisionally **half to one working day**, conditional on current browser/compiled-package gates and no new blocker. This is a working estimate, not an exact scheduled completion or assurance that all source/plugin/native/backup work fits that window. Reassess from actual CI results before saying 'ready to test'. The user is not being asked to test now.
