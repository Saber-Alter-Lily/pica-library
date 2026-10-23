# Native personal-tag module (NEXT-52, unpublished)

## Boundary and reuse

`tags/TagPolicyRules` is a pure Java domain: immutable normalized policy, provider-scoped raw identities, manual/ANY-mapped private bindings, participation masks, derived tags and unique-work directory counts. It receives facts; it cannot fetch, persist, rank candidates or change provider metadata. `compileTagPolicyBoundary` compiles the directory with an empty classpath. No new JSON framework, tag taxonomy package, protocol or neural model is added.

The existing Android `org.json` codec is isolated in `TagPolicyJson`. `TagFactSnapshot` is the read-only catalog/portable/E-H raw-fact adapter; its precedence remains E-H semantic facts > catalog sidecar > portable candidate sidecar > current comic tags. `TagParticipation` remains the compatibility/application facade used by the current UI, recommendation policy and stores. `TagParticipationActivity` keeps its existing editor and explicit save flow, delegating directory aggregation to the domain. Desktop retains `src/tags/policy.ts`.

The cross-language contract is the single tracked, hand-authored synthetic `test/fixtures/tag-policy/golden-v1.json`. Vitest and Robolectric SDK28/35 both read the same 44 cases and fixed expected outputs. They cover legacy/default and selected-only policies, provider isolation including local comics, E-H namespaces, private manual/ANY bindings, normalization, malformed states, controls and favorite-work counts. Android adapter tests separately exercise real score/save callers; they do not replace the shared contract.

## User-visible rules preserved

- ALL enables every identity except `disabled`; SELECTED enables only `selected`. A saved ALL policy may retain an old selected list, but that list cannot affect participation until SELECTED is chosen again.
- `local|line`, `pica|line`, `eh|line` and `jm|line` are distinct. Unscoped controls consider all four namespaces, including local.
- E-H raw namespace facts remain authoritative when available; a display label is not a new platform tag. The application's score caller also passes current comic tags, so gating does not depend on having first loaded a separate sidecar.
- A private manual binding uses comic identity. A mapped binding matches ANY exact provider-scoped raw identity. Neither rewrites those facts or implies a user's liking strength. A private signal cannot be forged by a raw provider tag beginning `@private/`.
- Directory support counts are distinct favorite works, not repeated tag occurrences or inferred preference strength. Personal participation affects taste signals; existing explicit raw BLOCK checks remain independent.
- Visual embeddings/style settings and recommendation weights are not changed. A user can label their own style groups with private tags; this does not turn visual similarity into an automatic platform tag or ground truth.

## Compatibility and bounded fixes

This is an internal extraction, not a new wire/schema version. Schema1, module API2, provider raw tags, private IDs, policy/pending/base/cache formats, explicit-save/CAS conflict rules and sync protocol remain. Valid old policies normalize identically. Missing/null legacy state still means ALL; explicit invalid state (including false or non-string private names) is rejected rather than reset/coerced. Unicode normalization uses NFKC, ECMAScript-compatible whitespace and locale-independent lowercase on both clients.

Regression fixes: Android unscoped controls now include local; ALL no longer consults a stale E-H selected list; current comic facts reach soft-control gating; codec validation no longer silently accepts a numeric private name. No schema migration or production-data rewrite occurs.

Dev code66 -> code67 retains the Dev application/signing identity. Exact-source local/CI counts, actual APK signature/version checks, Windows full replacement/forced rollback and synthetic state-retention receipts are frozen separately after the build. No older green run is evidence for this source.

## Limits and continuation

Forty-four golden cases are a reviewed contract sample, not a proof of every Unicode/runtime combination. The codec/storage/UI remain adapters inside the Android app; this is not a standalone user-installable tag plugin. New provider namespaces still require explicit cross-client review. No dependency version is changed.

Concentrated physical-device/real-provider acceptance remains pending, including tag editing/offline sync and the previous Reader/gesture/source UI work. Recommendation service decomposition, Android direct local import, optional source-runtime packaging and trusted extension-host design remain open. No main merge, tag/Release, stable OTA, production profile access, installation or deployment is authorized by this slice.
