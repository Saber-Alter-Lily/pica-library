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
- A visible `配置 E-H / ExH` action opens the existing E-H / ExH account panel directly during first run.
- Pica setup remains available, but it is no longer the UI gate to E-H / ExH account access.
- The desktop settings hub must expose dedicated `账号与来源 / Accounts & Providers` and `推荐与画风 / Recommendations & Visual Style` sections. The runtime hub must move `settings-eh-account` and `settings-recommendation-v4` into those visible sections before hiding the legacy Settings container.

## Beta validation gates

The branch is not considered test-build ready until all of these gates pass:

1. Web/Desktop type check, web syntax check, unit/integration tests and production build are green.
2. Existing Android unit tests, lint and release build stay green.
3. Like/dislike remains usable when optional reasons are disabled or skipped on both clients.
4. Visual SHADOW mode preserves visible baseline order while retaining auditable shadow ranks.
5. LIVE mode never penalizes a candidate merely because no visual embedding exists.
6. Local, bounded remote and cover-only sampling all persist source/confidence provenance.
7. First-run onboarding exposes E-H / ExH account access without requiring Pica configuration first.
8. Desktop Settings visibly exposes both E-H / ExH account controls and Recommendation V4 visual controls through dedicated settings-hub navigation sections.
9. The test artifact workflow creates only ephemeral CI artifacts; it must not create tags or GitHub Releases.

## Safety / release

The formal product version remains `0.4.0` on this unpublished feature branch; the eventual Actions artifact is labeled separately as a Recommendation V4 beta test build. This branch must not publish releases or tags. A test artifact is produced only after CI is green.
