# Personal tag participation v1 — unpublished acceptance candidate

Branch: `codex/ux-tags-dual-onboarding-20261022`, stacked Draft PR #206. This supersedes only the pending tag portion of NEXT-42; it does not promote #199/#200 or provider/device QA to human acceptance. Main, stable releases, OTA and installed data are outside scope.

## Facts versus personal configuration

Provider metadata, objective collection/Atlas snapshots, registry records and frozen Visual embeddings remain raw authorities. A nested optional `tagPolicy` in existing portable-policy state contains personal configuration only. Legacy omission means ALL; explicit malformed/unknown versions fail closed instead of resetting existing state. No database schema or outer policy version change.

- ALL: all observed/new raw tags participate except explicit exclusions.
- SELECTED: only selected provider identities/private concepts participate. Newly observed tags stay off.
- Identity is `provider|NFKC-normalized-raw-key`, preserving namespaces and source. Pica, EH and JM keys do not silently collapse.
- A disabled tag contributes no soft tag affinity, inferred tag profile, keyword recall or tag-derived fandom allocation for a newly built cycle. Author/category/related routes remain independent. Original raw tags continue to drive hard BLOCK and safety exclusion. Disabling is not a work filter.
- Directory is locally observed metadata, not a claim of complete provider-wide vocabulary. Category/facet comes from the existing registry or observed EH namespace; unknown stays OTHER. Coverage counts unique favorite works, not presumed liking.

E-H's legacy display `tags` flatten namespace values. When lossless `providerMetadata.rawTags` exists, it is used for scope/directory/mapping identity, then enabled values are projected to the existing semantic resolver without overwriting display facts. Android reads the existing E-H semantic store plus optional public `providerRawTags` from paired catalog/candidate metadata; missing legacy namespaces remain unknown, never inferred from a flat label. This additive optional JSON field does not reset the catalog or change pairing authentication. Mobile catalog evidence carries only those public tags back, not provider credentials. Raw local E-H semantics take precedence over cache fallback. Read-only derived semantic views do not write provider stores.

## Private concepts

Stable random `pt_<32 lower-hex>` IDs, separate from names. At most 100 private labels, 4096 total bindings, 4096 entries per scope list, 128 KiB normalized configuration. Names are at most 80 characters; keys at most 200. JSON is validated before persistence.

1. MANUAL: explicit comic IDs only. Matching recognizes those works, not an inferred style classifier for unseen works. An eligible Pica seed may contribute a bounded, attributed RELATED request; no arbitrary private-name search.
2. MAPPED: ANY of the selected provider-scoped original tags. No recursive/private-to-private mapping, mixed binding modes or replacement of platform facts. The private participation switch is independent of its source raw-tag switches. Queries expand only to mapped raw terms on the corresponding provider.

No new automatic JM online recommendation-recall adapter is introduced here. JM identities can be selected and privately matched when metadata/cached candidates exist; this is not a claim of end-to-end automatic JM recall. V5 Shadow private channels currently execute against matched local catalog candidates only, and identify that local provenance. Primary Final V3 mapped routes use existing Pica/EH paths. Budgets remain bounded.

## Serving and cache semantics

Final V3 lifetime profile uses a taste-only projection of enabled original tags. Private concepts are a sidecar, never inserted into the frozen registry. Intent/provider routing, explicit soft controls, tag metadata feedback, candidate fandom/diversity, V5 timescale profiles and Shadow ranking use the personal view. Raw metadata returned/stored stays unchanged. Frozen ranker weights are not edited or trained.

Final convergence also gates V5 semantic diversity's raw EH sidecar and the older V3 cluster-allocation input; ranking inputs and return/display metadata are separate maps. Namespace and portable-candidate round-trip fixtures cover the public facts adapter.

Desktop saves use an expected policy revision. Concurrent editors receive 409 and retain their draft. Save alone does not change an existing batch. Save-and-regenerate requests the existing bounded cycle builder; failure preserves the previous usable cycle. Serving composition marks a mismatching tag baseline stale rather than claiming recomputation finished.

Android preserves normal baseline-delta behavior when the tag scheme is unchanged. A changed scheme cannot subtract opaque historical recall/order effects by a mere explicit-control delta. It instead reranks only the existing cached universe with available neutral author/category features, current enabled explicit/behavior signals and stable ID tie-breaking. Missing route/popularity/Visual features are neutral; old tag reasons are replaced with an explicit cache-only/no-new-retrieval notice. Full native generation uses the current tag scope. No model or new provider call occurs on Save.

## Synchronization

Snapshot/package/baked baseline and portable-policy generation include the nested scheme. Android queues dirty scheme plus its last-synced baseline. Old clients omitting the field leave it unchanged. Whole-scheme three-way conflict detection requires choosing Desktop or Android; no clock-based silent winner. Unresolved conflicts do not apply other mobile mutations or start recomputation. Cancel/failure preserves the mobile queue. A stale acknowledgement cannot clear a newer local policy mutation.

## UI and verification

Both clients stage edits with Save/Undo. Web directory loads only on explicit disclosure; Android loads/counts off the UI thread. Main list pages are bounded to 100 rows and private-binding pickers to 50. Private names/raw metadata render as text, not HTML. zh-CN/en/ja guides distinguish scope, soft preference, block, raw fact, annotation and Visual evidence.

Exact-source unit/browser/Android/build/signature/package results belong in the accompanying validation package; passing fixtures does not establish real provider behavior or physical-device usability. Visual reference sets, automatic fine-grained image labels and broader plugin trust/lifecycle work remain pending. No production data was used to validate this slice.
