# Recommendation V2 Report

Recommendation V2 builds a bounded preference profile from favorites, selects
deterministic author/tag-diverse seeds, and recalls candidates through related,
author, circle, tag, and category routes. Route fanout is bounded and runs with
concurrency three; it never calls the provider's unbounded `searchAll` or
`comicsAll` helpers for recommendation recall.

Candidates are deduplicated while preserving recall provenance. Existing
favorites are excluded. Personal affinity dominates a deliberately weak
normalized popularity term. A deterministic diversity rerank limits repeated
authors/circles, and exploration is at most 15% and remains connected to a known
profile signal.

Normal UI cards show cover, title, normalized author, and up to three
discriminative tags. Scores, reasons, matched signals, recall provenance, and
audit metrics remain available for review rather than cluttering the card.

Deterministic unit coverage includes profile bounds/normalization, diverse seed
selection, deduplication/provenance, favorite exclusion, popularity resistance,
author concentration, exploration bounds, and stable ordering.

Sanitized live validation on the existing 1770-item Library returned 30 results
from 240 deduplicated candidates. Twelve seeds represented twelve normalized
authors and 89 seed tags. Fifty-two recalled favorites were excluded, every
result carried cover metadata, and no author appeared more than twice in the
top 30. Exploration was zero for this run; the algorithm's maximum remains 15%.
These metrics demonstrate bounds and diversity, not subjective user preference.
