# Issues #199 / #200 — first implementation, unreleased

Date: 2026-10-06. Branch: `codex/issue199-200-preference-discovery`.
Parent: `454e9fef1a04a5fdbc17227af2fe755e52c6fbd7` (the separate post-v0.5.0 readiness work).

This is a Desktop/Web change, not a release, database migration, recommendation-policy migration, or replacement of the current production installation. No issue is closed by this implementation.

## What the reporter actually requested

- [#199](https://github.com/Saber-Alter-Lily/pica-library/issues/199): optionally hide unwanted items in statistics/semantic maps, **without changing the underlying collection**. High collection frequency should not be presented as an explicit personal preference. BLOCK/LESS and a manual exclusion list were alternative designs, not a demand to delete tags or retrain the ranker.
- [#200](https://github.com/Saber-Alter-Lily/pica-library/issues/200): sparse/coarse upstream tags and inadequate interest explanations cause manual-tuning burden. The [Moegirl suggestion](https://github.com/Saber-Alter-Lily/pica-library/issues/200#issuecomment-5966132082) is a possible taxonomy reference, not an agreed data import.

The previous read-only audit identified separate collection summaries, Registry semantics, explicit portable controls, and Visual representations. They must not be collapsed into a single claim of what the user likes. No private catalog, behavior events, credentials, screenshots, or production database copies are included in this change or its tests.

## NEXT-34 / #199 — implemented display projection

`GET /api/v1/recommendation/profile/view?hideBlocked=false&hideLess=false`

- Reads the existing cached atlas and existing persistent controls; never calls atlas rebuild, policy initialization/save, recommendation generation, sync, or Visual mode changes.
- Both switches default off. Choices are browser-local (`pica-chronicle-display-filter-v1`), survive refresh, and are not synced to Android or written into recommendation state.
- BLOCK and LESS are independent switches. LESS remains a soft recommendation preference; hiding it here does **not** convert it to a recommendation block.
- TAG/FANDOM controls hide matching semantic items, fandom rows, affected themes, incident theme edges, and combinations containing the hidden anchor. AUTHOR controls only hide corresponding author-summary rows; this is not comic-level exclusion, and it does not remove their representative works or change themes. Session controls are ignored. CATEGORY/STYLE_FAMILY are explicitly reported as non-applicable, rather than fabricated into semantic tags.
- Display identity is derived from the existing checked Registry, including aliases and canonical entity keys. Provider namespaces are preserved. Ambiguous simplified/traditional identities are not guessed. The editable control label is not treated as identity authority.
- Original favorites/global totals, facet comic counts, support shares, snapshot ID and timestamp remain unchanged. The displayed theme count is the visible count. Hidden items are not backfilled from outside the cached snapshot.
- Objective labels replace “interest universe / preference map.” The filtered view is explicitly **not** a newly inferred personal-interest profile. Original global summary cards are hidden in the projection to avoid suggesting a recomputation.
- Empty projections, old unsupported atlas formats and unavailable Registry assets have explicit states. Old responses cannot overwrite a newer selection. Failed requests clear stale displayed results.
- The existing fixed-layout PDF is objective-only in this first implementation. Export is disabled while filtered, loading or failed, with an explanation to turn filters off first. Browser printing is not advertised as a filtered export.

Not included: a separate manual exclusion list, filtered PDF design, Android atlas, or recalculated percentages. These are not prerequisites to the selected opt-in BLOCK/LESS alternative.

## NEXT-35 / #200 — search/discovery slice, not complete resolution

`GET /api/v1/recommendation-v5/preferences/search?q=...&limit=100`

- Searches all local favorite-derived AUTHOR/TAG/CATEGORY signals plus existing non-STYLE_FAMILY controls. It calls `listAllComics`, not the ordinary capped list API. Explicit taste-excluded comics remain excluded from the inferred catalog.
- Matching is performed **before** response truncation. Default response is 100, hard maximum 200, with `total` and `truncated`; query length is capped at 160. The UI requests explicit search on Find/Enter, not on every slider move or keystroke.
- NFKC/case/space normalization plus OpenCC traditional-to-simplified search folding, and existing Registry aliases, allow e.g. simplified input to discover the actual traditional raw tag. Unknown tags are still unknown, not invented evidence.
- Search folding is **presentation only**. Persisted control IDs, `normalizePreferenceKey`, `matchesControlV5`, provider queries, ranker, cached candidate baselines, Android portable-policy contract and the default 500-item snapshots are unchanged. This avoids silently changing offline/online recommendation semantics.
- Different raw tag keys remain separately editable, even when the Registry supplies the same display label. The original key is shown when it differs. This does **not** claim that one adjustment now applies to every spelling of a tag. A versioned cross-client alias-matching migration requires separate design and acceptance.
- Staged slider edits retain their source signal across searches/clear. Saving a result found with simplified input posts the original raw key. Failed searches never offer a misleading “not found, add a tag” action; stale responses are discarded.
- The UI distinguishes collection occurrence counts from explicit liking. Existing custom controls with no collection evidence show an unknown system baseline and neutral starting point.

### Remaining #200 decisions

1. Agree a small explanation contract separating “collected for this artist/style” from tag/IP frequency; measure whether it reduces manual corrections, rather than merely adding controls.
2. Evaluate opt-in user annotations / missing-evidence states. DINO body-page similarity is not a fine-grained semantic label annotator.
3. Design any alias consolidation consistently for Desktop retrieval/ranking, Android offline deltas, existing controls and cached policy baselines. Do not migrate IDs in this UI patch.
4. Assess external taxonomy licensing, provenance, mapping, ambiguity, updates and user control. The Moegirl taxonomy page was not fully accessible in the prior audit, so no complete content/mapping review is claimed. Its [official user agreement](https://app.moegirl.org.cn/usercontract/index.html) must be considered before reuse; no taxonomy was scraped or imported.
5. Android full-catalog discovery parity, representative library latency/memory, and actual manual-tuning burden remain unverified.

## Dependency and package boundary

`opencc-js` is pinned to **1.0.5** in package.json and the frozen lockfile. Only its t2cn implementation is imported on the server; no browser CDN or online conversion service is called. The package integrity was checked against npm's SHA-512. [Upstream](https://github.com/nk2028/opencc-js) is the conversion implementation, not a new manga taxonomy authority.

Rollup retains the implementation's MIT license and the bundled OpenCC dictionary's Apache-2.0 notice (`docs/licenses/OPENCC_DATA.txt`) in `dist/licenses/THIRD_PARTY_LICENSES.txt`. No new runtime data-file copy rule is needed; dictionary data is bundled into the JavaScript artifact.

Local dependency setup: the pre-existing pnpm module layout prompted for replacement, so it was **not purged**. The lockfile was updated normally; the missing pinned package was unpacked after integrity verification. A fresh frozen install/CI on another host is still a separate gate, not implied by this local setup.

## Validation on this branch

All tests use synthetic fixtures / temporary databases / intercepted browser API responses. No production application was launched or deployed.

| Gate | Evidence |
| --- | --- |
| TypeScript | `tsc --noEmit --incremental false` PASS |
| Dependency lock | Frozen lockfile-only verification PASS, 455 entries; not a fresh node_modules install |
| Web syntax | 38/38 modules PASS |
| Unit + integration | 226 files PASS; 1231 tests PASS, 1 existing skip |
| Real browser | 28/28 tests PASS, headless Microsoft Edge (Chromium), Playwright 1.62.1 |
| Build | Rollup Desktop/CLI/updater bundles PASS; both OpenCC licenses present |
| Data invariance | Read-only service regression verifies no policy initialization/write and unchanged temporary DB/atlas bytes |
| Repository hygiene | `git diff --check`; no version, registry authority, database schema, release tag or OTA modifications |
| Windows package / real library acceptance | NOT RUN in this implementation; no replacement of the user's app |
| Android native build/device validation | NOT RUN; no Android source changes and no cross-client parity claim |
| Remote CI | NOT RUN for this local implementation; prior PR #203 checks are not this patch's checks |

Browser coverage includes main navigation, three-language responsive layout, onboarding, polling, reconnect, Remote Web, and new full-search/atlas behavior. The new tests are included in the CI smoke entrypoint, which currently pins Playwright 1.63.0; local Edge success is not claimed as a fresh remote CI run.

Acceptance for a later isolated package: compare objective → BLOCK-only → LESS-only → both → objective on the same cached snapshot; refresh and reopen; verify original counts/percentages, no recommendation generation, search for a known low-frequency label, change two sliders across searches, and confirm saving changes only the intended raw keys. Do not use production data for automated mutation tests.

## Handoff / safety

- Official release, main, tags, stable OTA and the G-drive installation are unchanged.
- Source changes and this task log are the deliverables, recorded as a local commit on the independent branch; no push, automatic issue response/closure or release is performed.
- Retain compact local validation evidence under `_validation/issue199-200`; remove only disposable scratch owned by this task. Pre-existing research, RC packages and validation artifacts are outside cleanup scope.
- NEXT-34 is implemented with automated evidence but still needs human package acceptance. NEXT-35 is PARTIAL by design. No recommendation/model-science completion claim.
