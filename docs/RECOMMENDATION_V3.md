# Recommendation V3

Recommendation V3 is a local-first, explainable recommendation engine layered on the existing Pica Library v0.2 contracts.

## Architecture

The engine separates bootstrap evidence, first-party events, item features, tag combinations, multi-interest clusters, item-graph observations, bounded retrieval, feature extraction, ranking, re-ranking, adaptive batches, and offline evaluation. V2 remains available as a compatibility fallback.

## Bootstrap and profiles

The first profile is derived from current favorites and cached metadata. Favorite order is not treated as recency. Historical evidence is kept conceptually separate from derived profiles. Lifetime, recent (decayed), and current-session profiles are built only from local first-party events.

## Events and exposure

`user_events` is append-only. Events carry app session, context, cycle, session, batch, and rank attribution. Generated/allocation state remains in the legacy recommendation tables; viewport impression is recorded separately after at least 50% visibility for 800ms and is idempotent by context, batch, and comic.

Authoritative favorite and download transitions are recorded by the server. Browser Lite does not require the engine API and continues to import the existing bundle format.

## Tag combinations and interests

Deterministic local mining computes bounded pairs and triples with favorite/background support, enrichment, interaction, specific interaction, smoothing, and reliability shrinkage. Ranking uses residual interaction bonuses to avoid counting single-tag affinity twice. Taste clusters are deterministic, size-aware, and expose representative authors, circles, tags, and combinations.

## Retrieval, ranking, and re-ranking

Retrieval is route- and budget-aware. Multi-tag combinations use local conjunction filtering when provider search is not an arbitrary AND query. Related results are cached as repeated item-graph observations. Each candidate can carry route provenance and telemetry. A centralized linear feature model supports historical, lifetime, recent, session, author, circle, category, behavior, graph, popularity, novelty, and exposure signals. MMR-style re-ranking limits author/circle concentration and preserves exploration.

## Adaptive batches

Connected mode may use the schema-8 V3 candidate pool: provider recall is reused, while remaining candidates are ranked again for each 12-item batch using current local evidence. The legacy session endpoint and tables remain available for V2 clients and Browser Lite snapshots.

## Privacy, fallback, and evaluation

No events, profiles, graph data, or evaluations leave the local data directory. Metadata validation rejects credential-like fields. V3 failures fail safe to V2. The evaluator supports random, author-stratified, cluster-stratified, and long-tail holdouts, retrieval/ranking metrics, and pair/triple ablations without putting held-out favorites into the training profile.

## Update compatibility

The candidate keeps APP API 2, update manifest 1, bundle format 1, reader API 1, and adds only schema 8 tables. The v0.2.0 updater protocol, launcher, and bundled Node runtime remain unchanged. A stable incremental package must contain only allowlisted application changes and no user data or runtime replacement.
