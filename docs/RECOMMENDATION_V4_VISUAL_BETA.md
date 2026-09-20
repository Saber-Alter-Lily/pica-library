# Recommendation V4 Visual + Feedback Beta

This branch is an unpublished beta. It layers explicit like/dislike feedback and local visual-style representations on top of the frozen Recommendation V3 recall/ranker.

## Feedback contract

- Like/dislike is committed immediately as an append-only event on Web/Desktop and as latest-wins local feedback on Android.
- Optional reasons are a separate event/state and may be disabled entirely.
- Latest sentiment wins for a comic.
- `already_seen`, `topic`, `author` and `character` do not become strong negative visual-style signals. `style` does.
- Android mirrors the same immediate-feedback / optional-reason interaction contract. Feedbacked items are suppressed from current and future native recommendation batches; likes can seed later native interest profiles.

## Visual contract

- Encoder: DINOv2 Small through Transformers.js 4.2.0.
- Page images remain local to Pica Library. The browser downloads model code/weights on first use; image content is not uploaded to the model host.
- Sources: downloaded body pages (high confidence), bounded remote body-page sampling (medium/high confidence), or cover-only (low confidence).
- Embeddings are versioned by model and sampling policy. Full comic pages are not retained by the visual index.
- User style is multi-prototype, not one global centroid.
- Missing visual data is neutral: candidates are not penalized.
- Modes: OFF, SHADOW (audit only), LIVE (bounded low-weight reranking).
- Visual vectors also power Similar Style browsing.
- The beta visual encoder runs on Web/Desktop only; Android consumes feedback semantics without downloading or running the visual model.

## Multi-provider first-run onboarding

- First-run Web/Desktop onboarding must not hide the whole navigation merely because Pica credentials are not configured yet.
- The Setup screen explicitly states that E-H public search, reading and download do not require login.
- A visible `配置 E-H / ExH` action opens the existing E-H / ExH account controls directly during first run.
- Pica setup remains available, but it is no longer the UI gate to E-H / ExH account access.
- Desktop General settings contains both Pica and E-H / ExH account controls. Recommendation V4 remains a separate visible `推荐与画风 / Recommendations & Visual Style` section.

## Account and mobile UX corrections

- Desktop General settings now contains both Pica and E-H / ExH account controls; there is no separate E-H-only account section in the settings sidebar.
- Recommended Desktop E-H login uses an isolated Microsoft Edge profile controlled by the local Desktop process. Official credentials are entered only on E-H pages; Pica Library captures the stable E-H identity cookies (`ipb_member_id`, `ipb_pass_hash`) plus `igneous` when available, deliberately discards browser-bound `cf_clearance`, verifies the accepted session, stores it through DPAPI, then removes the temporary browser profile.
- A regression test includes an intentionally oversized `cf_clearance` value and requires controlled Desktop login to ignore it while preserving the stable E-H identity cookies.
- Android now exposes a visible `推荐与画风` settings screen. Android keeps feedback-reason preferences locally and, when paired, reads/controls the Desktop visual index and OFF/SHADOW/LIVE mode through the authenticated Mobile Bridge. Android still does not run DINOv2 locally.

## User-feedback fixes staged with this beta

These fixes are intentionally staged on the same unpublished beta branch and must not be released independently before the visual-style review is complete.

- Issue #8 / large download queues: Web/Desktop uses SQL status summaries plus bounded queue pages instead of transferring and rebuilding the entire historical download queue every second. Active-state checks use SQL existence queries, queue indexes are additive schema 11, and a 1,500-job regression fixture validates a 350-finished / 1,150-active queue with a 100-row visible page.
- Issue #28 / author works: Web/Desktop keeps the two-step normalized-author flow, shows known local works immediately, then refreshes the selected author against Pica and E-H and optionally ExH when available. Users do not need to type the Japanese author name manually.
- The legacy full `/api/v1/downloads` route remains available for compatibility; the interactive Web download page uses the bounded summary/page contract.
- These items remain beta validation items until tested in a packaged Windows build; GitHub Issues must not be closed solely on the basis of unit tests.

## Beta validation gates

The branch is not considered test-build ready until all of these gates pass:

1. Web/Desktop type check, web syntax check, unit/integration tests and production build are green.
2. Existing Android unit tests, lint and release build stay green.
3. Like/dislike remains usable when optional reasons are disabled or skipped on both clients.
4. Visual SHADOW mode preserves visible baseline order while retaining auditable shadow ranks.
5. LIVE mode never penalizes a candidate merely because no visual embedding exists.
6. Local, bounded remote and cover-only sampling all persist source/confidence provenance.
7. First-run onboarding exposes E-H / ExH account access without requiring Pica configuration first.
8. Desktop General visibly contains both Pica and E-H / ExH account controls, while Recommendation V4 is reachable from its own visible settings-hub section.
9. Android Settings visibly exposes `推荐与画风`; paired Android can read/control Desktop visual status without running the visual encoder locally.
10. A 1,500-job queue fixture keeps the interactive queue query bounded and preserves summary counts.
11. Web author navigation can refresh Pica/E-H and optional ExH works from the selected normalized author identity without manual text entry.
12. The test artifact workflow creates only ephemeral CI artifacts; it must not create tags or GitHub Releases.

## Safety / release

The formal product version remains `0.4.0` on this unpublished feature branch; the eventual Actions artifact is labeled separately as a Recommendation V4 beta test build. This branch must not publish releases or tags. A test artifact is produced only after CI is green.

## Visual V1 frozen-index QC

- The first frozen Visual V1 user dataset is treated as an immutable analysis asset during QC: 1,808 / 1,827 target comics indexed (98.96%), 19 pending at freeze time.
- Cross-version persistence was manually verified before this QC surface was added. The QC UI reads existing embeddings and never rebuilds them on page load.
- Similar-style retrieval now filters by model + model version + sampling-policy version and ranks vectors before fetching comic metadata, avoiding the former per-vector metadata-query hot path.
- The beta settings surface exposes an indexed-anchor Visual V1 QC panel with Top-12 cosine similarity, source/confidence/sample-count provenance, 0/1/2 human ratings, confound labels and JSON export.
- Pending diagnostics are explicitly separate from indexing. They may read a bounded set of body pages to classify retryability, but they do not save or overwrite embeddings.
- Pending/failure categories distinguish retryable preparation, transient network/provider problems, missing body pages, image errors, model inference, database/save failures and unknown errors, with user-facing retry guidance.
- Library, Downloaded and Shelf cards gain an additive unified detail entry so users can reach visual comparison from their actual collection instead of relying on recommendation/search candidates.
