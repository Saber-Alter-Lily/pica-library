# Recommendation V3 offline evaluation

The evaluator uses deterministic holdouts from local historical favorites and separates training records from held-out identities. It reports Candidate Recall@100/@500, Recall@12/@20/@50, NDCG@12/@20, MRR, and catalog coverage, with extension points for cluster/author/tag/combination diversity, novelty, and popularity bias.

`evaluateAblations` emits comparable V2, V3-without-combinations, V3-with-pairs, and V3-with-pairs-and-triples result objects. The V2 baseline uses the existing V2 recommendation path, while held-out items are retained only as non-favorite candidates so the evaluation cannot leak labels.

`scripts/run-v3-offline-benchmark.ts` provides a deterministic 80-item synthetic fixture covering four independent tag interests. It is suitable for regression and metric-shape checks, but its numbers are not evidence about any real user's preferences.

The current synthetic run produced the following deterministic metrics (8 held-out favorites): V2 Recall@12 `0`, NDCG@12 `0`; V3 without combinations Recall@12 `0.5`, NDCG@12 `0.64794`; V3 with pairs and with pairs+triples produced the same values on this fixture. This demonstrates evaluator operation and that combinations did not change this fixture, not a claim of production lift.

The fixed Live Validation database path was absent in this workspace, so no real user database was opened or modified. The committed automated fixture suite verifies determinism, holdout isolation, finite metrics, and the ablation code path; a maintainer-supplied local catalog is still required for a representative real-user benchmark.
