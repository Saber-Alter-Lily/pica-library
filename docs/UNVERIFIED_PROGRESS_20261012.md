# 已推进但未验证 — 2026-10-12

This is a documentation-only progress reconciliation, not a release announcement. Authoritative task IDs are NEXT-33–37 in [DEVELOPMENT_TASK_LOG.md](../DEVELOPMENT_TASK_LOG.md). Released/versioned history remains in [PROJECT_LOG.md](../PROJECT_LOG.md).

The public baseline remains **v0.5.0 / Android v55**. GitHub main was checked at `095d6910c34e00824e03b08a30af0ce4e708137e`. This record is kept on **Draft PR #203**, not merged into main. “Implemented locally” below does not mean the implementation has been uploaded to this PR, built in remote CI or installed.

## Evidence levels

| Work | Verified progress | Not established |
| --- | --- | --- |
| NEXT-33 post-stable RC | [Run 37492489884](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/37492489884), source `454e9fef1a04a5fdbc17227af2fe755e52c6fbd7`: contract, Windows, Android and summary jobs all succeeded | Representative manual/physical acceptance; the run's artifact API lists no downloads on 2026-10-12 |
| NEXT-34/35 community feedback | Local `e12d48839d0ad1ac86964c14cdc0164a5ebfe0a0`: automated Desktop/Web checks passed | Fresh remote CI/dependency install, Windows package/human QA, complete #200 resolution |
| NEXT-36 reader reference | Static capture/Reader analysis and 14-feature inventory audited | Reference APK execution, recovered-code correctness, 28 runtime QA scenarios |
| NEXT-37 phone-local gestures | Local uncommitted implementation; 28/28 targeted tests passed | Full Android app build/lint/APK, ReaderActivity integration and real-device QA |

No earlier RC run validates the newer local issue or gesture code. No APK from those local changes is delivered by this update.

## NEXT-34/35 — Issues #199/#200 local implementation

### #199: optional display filtering, not data filtering

[Issue #199](https://github.com/Saber-Alter-Lily/pica-library/issues/199) asks for an optional view of existing collection statistics. The local implementation adds separate default-off BLOCK/LESS switches over the cached atlas. It preserves the underlying snapshot, objective counts/denominators, favorites and recommendation policy. LESS remains a soft recommendation preference; hiding it in this view does not turn it into a recommendation block.

Browser-local persistence, stale/error/empty states and read-only service behavior have synthetic-fixture coverage. The old objective PDF export is disabled while filtered. A manual exclusion list and filtered PDF are **not** implemented.

Still required: fresh remote checks and an isolated Windows package; human comparison of objective → BLOCK → LESS → both → objective, refresh/reopen and original totals, without touching production data.

### #200: discovery slice, not a new tag authority

[Issue #200](https://github.com/Saber-Alter-Lily/pica-library/issues/200) concerns sparse/coarse upstream tags, misleading collection-frequency explanations and manual adjustment burden. The local slice searches the full local favorite-derived signal catalog **before** capping results, supports simplified/traditional and existing-alias discovery, preserves original preference keys, and retains staged slider changes across searches.

Search folding is presentation-only. Provider queries, ranker, preference identity/matching, default/mobile snapshots and offline candidate-policy semantics are not migrated. No external taxonomy is scraped/imported and no model is trained. OpenCC implementation/data license notices were checked in the local bundle.

Still open: measure actual tuning-burden reduction; explain artist/style collection versus tag/IP frequency; define unknown-evidence and opt-in annotations; design versioned cross-client alias matching; Android discovery parity; external taxonomy licensing/provenance/mapping. Search improvements alone do not solve missing semantic evidence.

### Exact local validation boundary

Local branch: `codex/issue199-200-preference-discovery`, commit `e12d48839d0ad1ac86964c14cdc0164a5ebfe0a0`, based on the separate PR #203 candidate.

- TypeScript PASS; Web syntax **38/38**.
- Unit/integration: **226 files, 1231 PASS, 1 existing skip**.
- Headless Microsoft Edge/Chromium: **28/28**, Playwright 1.62.1.
- Rollup Desktop/CLI/updater build and OpenCC MIT/Apache notices PASS.
- Frozen lockfile-only verification PASS; **not a fresh dependency installation**.
- Synthetic fixtures/temporary databases only; no production app deployment or mutation.
- Windows packaging, Android native/device checks and remote CI for this implementation: **NOT RUN**.

Both issues remain open. The application source from this local commit is not included in this documentation update.

## NEXT-36 — Reference-reader analysis, not feature migration

User-provided MH-ARK 0.4.3.3 was studied in an isolated local analysis area.

- Original APK/DEX/Smali/native capture and coverage were audited. High-level Java/native recovery remains **PARTIAL**, not original rebuildable source or proven behavior.
- Reader analysis verified **5 JNI classes / 27 bindings / 48 configuration fields**. Its **27** passing tests exercise an analysis design model, not the Android app.
- The feature inventory contains **14 cards / 51 evidence groups / 142 anchors**. Its selected **115** protected inputs were unchanged at that phase.
- Target APK execution and all **28** inventory runtime QA scenarios remain pending. Native layout internals, performance, compatibility and network behavior are not fully validated.

Promising small adaptations are per-comic reading presets, adjustable gestures, and split/spread display. Local directory/CBZ reading and comic/chapter cache controls are later design candidates. Existing multi-WebDAV, cache categories, preloading and library filtering should be reused. None of these candidates, apart from the small NEXT-37 gesture slice, is claimed implemented in Pica.

Design constraints: do not copy third-party code/resources/binaries; independently implement chosen behavior. Do not inherit original-file deletion as ordinary cache cleanup, claim a privacy lock is encryption, or infer complete archive streaming from a Range header. Private recovered material remains local and is not attached here.

## NEXT-37 — Android Reader gestures, local-only slice

Local branch: `codex/android-reader-gesture-polish`, based on `e12d48839d0a`, **not asserted to be latest main**. Four production classes and three test files are modified/new locally and remain uncommitted.

Implemented entry: **Reader → 阅读设置 → 手势与放大（仅此手机）**.

- Double-tap zoom on/off, default on.
- 1.5× / 2× / 3× choices, default 2×.
- No double-tap confirmation wait when disabled; pinch remains available.
- Current and recycled/rebound pages use current settings without reloading the chapter or resetting progress/zoom.
- Scrollable Chinese/English/Japanese options, local to this phone rather than a portable/synced setting.

Targeted verification: **28/28 PASS, zero failures/skips** — settings 5, options 4, zoom 9, existing ReaderPolicy 10. This means **18 new tests plus 10 existing regressions**, not 28 new tests. The isolated Java/Robolectric 4.17 harness compiles the repository settings/options/zoom classes directly at API 35, with JDK 21 and harness Gradle 9.0.0. It is **not** the full Android AGP/CI build.

`git diff --check` and the seven recorded file hashes were rechecked. ReaderSource, provider, cache, reading-progress implementation, portable settings/sync, Desktop/recommendation source, version and signing configuration were not changed by this slice.

Still required, in order:

1. Review the local source against current main without losing existing issue work.
2. Run the full Android build/lint and verify a Dev APK; the earlier local verification had no Android SDK.
3. Verify ReaderActivity integration and real-device single/double tap, pinch/pan, cancellation and parent-scroll/page conflicts.
4. Check relaunch persistence, page recycling/rebind, orientation, immediate active-page updates and unchanged chapter/progress/cache/source/sync behavior.
5. Obtain human acceptance before merge or release.

## Publication and data boundary

This update contains Markdown progress records only. It uploads no application implementation, APK, recovered source/library/resource, private catalog, database, credentials, screenshots or behavior records. Production data and installation remain untouched; no release, tag, stable OTA, version bump or deployment is performed.

The documentation commit skips automatic push/PR CI to avoid creating new package/signing jobs for a record-only change. Historical PASS results keep their exact source identities. This document is not authorization to merge PR #203 or to begin any new feature slice.

## 2026-10-21 — Separately authorized integration follow-up

The user has now authorized NEXT-38 isolated implementation/build and, separately, a candidate-branch push, Draft PR and fixed-signature CI. This does not retroactively change the documentation-only scope above. The previous issue and Reader implementations are preserved and integrated with the opt-in JM adapter; current results and remaining gaps are in [NEXT_ACCEPTANCE_EXECUTION.md](NEXT_ACCEPTANCE_EXECUTION.md). Main merge, formal release/OTA, deployment and physical/provider acceptance remain outside the completed gates.
