# Recommendation Desktop ↔ Android Sync Contract V1

Status: frozen development contract for the next paired-client acceptance build.

## Product rule

Desktop and Android are independent recommendation runtime nodes.

They share portable knowledge, durable preference evidence and reusable heavy-compute artifacts. They do **not** share a live recommendation cycle, current batch, current session intent or current screen state.

The sync contract therefore has three layers.

## 1. Foundation Baseline — Desktop → Android

Desktop is authoritative for work that is expensive, global or requires a full local corpus.

Examples:

- Canonical Work / Series / Edition identity decisions and generation metadata;
- Visual model identity and Visual preference generation;
- precomputed Visual affinity for portable candidates;
- semantic/tag registry generation;
- portable candidate reservoir produced from a deeper Desktop candidate pool.

Android consumes these artifacts. It does not rebuild DINOv2 embeddings or run full-corpus identity reconciliation.

Foundation synchronization is versioned and replaceable. It is not treated as user intent.

## 2. Portable User State — bidirectional

Both devices may independently create durable user intent.

Included:

- persistent 1–10 preference corrections;
- MORE / LESS / BLOCK controls;
- Like / Dislike and optional reasons;
- permanent item suppression;
- taste-profile exclusions;
- durable recent exposure summaries where applicable;
- other explicitly portable recommendation evidence.

Sync uses a common base snapshot plus per-device mutation journal. A conflict exists when Desktop and Android both changed the same explicit preference after their last common base and the resulting values differ.

Conflicts are never silently averaged and are never resolved only by timestamp. The user chooses Desktop or Android for that preference.

Independent event evidence such as a Like on one comic and a Like on another is unioned by mutation/event identity.

## 3. Runtime State — device local

Never synchronized as authoritative state:

- current recommendation cycle ID;
- current batch and batch index;
- current Session Intent / "本次想看";
- current page / scroll / Reader screen;
- current provider availability;
- in-flight jobs;
- current session exposures before they become portable recent evidence.

A sync must never replace the recommendation list currently being viewed on the other device.

## Portable Candidate Reservoir

Desktop can send a bounded reservoir rather than a preselected visible batch.

Each candidate keeps provenance and enough metadata for Android to independently rank it:

- comic/provider identity;
- title / author / canonical author;
- tags / categories;
- pages / popularity fields when available;
- source cycle and reservoir generation;
- optional precomputed Visual affinity/confidence.

Android may merge this reservoir with candidates it discovers itself.

The same reservoir can produce different Desktop and Android rankings because each device owns its own Recent / Session / Explicit runtime state.

## Visual portability

Desktop performs heavy Visual preprocessing.

Android receives a compact generation:

- model / model-version / sampling-policy identifiers;
- Visual profile generation;
- per-candidate Visual affinity and confidence for candidates with known embeddings;
- coverage metadata.

Missing Visual data never blocks recommendation. A candidate without Visual data is ranked using non-Visual features.

Android can report missing candidate IDs at the next sync so Desktop can later fill coverage.

## Pairing-time UX

Normal connection with no divergence is silent apart from a small synced status.

If either side has portable changes, show a summary:

- Android → Desktop durable changes;
- Desktop → Android baseline/policy changes;
- Foundation Baseline generation updates;
- candidate-reservoir update;
- explicit conflicts.

Actions:

- 双向同步;
- 查看详情;
- 稍后.

If conflicts exist, resolving them is required before those conflicting explicit controls are applied. Non-conflicting durable evidence remains safe to merge.

## Security

The recommendation sync contract does not transfer Pica passwords/tokens, E-H cookies, GitHub credentials or WebDAV credentials.

Provider Relay is separate from recommendation-state sync.

## Release rule

This contract may evolve by schema version, but a released client must preserve:

1. independent runtime cycles;
2. device-local Session Intent;
3. explicit three-way conflict handling;
4. no heavy Visual rebuild on Android;
5. no silent credential handoff;
6. additive/migratable local recommendation history.
