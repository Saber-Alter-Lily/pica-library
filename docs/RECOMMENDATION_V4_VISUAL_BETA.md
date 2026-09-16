# Recommendation V4 Visual + Feedback Beta

This branch is an unpublished beta. It layers explicit like/dislike feedback and local visual-style representations on top of the frozen Recommendation V3 recall/ranker.

## Feedback contract

- Like/dislike is committed immediately as an append-only event.
- Optional reasons are a separate event and may be disabled entirely.
- Latest sentiment wins for a comic.
- `already_seen`, `topic`, `author` and `character` do not become strong negative visual-style signals. `style` does.

## Visual contract

- Encoder: DINOv2 Small through Transformers.js 4.2.0.
- Page images remain local to Pica Library. The browser downloads model code/weights on first use; image content is not uploaded to the model host.
- Sources: downloaded body pages (high confidence), bounded remote body-page sampling (medium/high confidence), or cover-only (low confidence).
- Embeddings are versioned by model and sampling policy. Full comic pages are not retained by the visual index.
- User style is multi-prototype, not one global centroid.
- Missing visual data is neutral: candidates are not penalized.
- Modes: OFF, SHADOW (audit only), LIVE (bounded low-weight reranking).
- Visual vectors also power Similar Style browsing.

## Beta validation gates

The branch is not considered test-build ready until all of these gates pass:

1. Web/Desktop type check, web syntax check, unit/integration tests and production build are green.
2. Existing Android unit tests, lint and release build stay green.
3. Like/dislike remains usable when optional reasons are disabled or skipped.
4. Visual SHADOW mode preserves visible baseline order while retaining auditable shadow ranks.
5. LIVE mode never penalizes a candidate merely because no visual embedding exists.
6. Local, bounded remote and cover-only sampling all persist source/confidence provenance.
7. The test artifact workflow creates only ephemeral CI artifacts; it must not create tags or GitHub Releases.

## Safety / release

This branch must not publish releases or tags. A test artifact is produced only after CI is green.
