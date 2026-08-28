# Recommendation V3 offline evaluation

The evaluator uses deterministic holdouts from local historical favorites and separates training records from held-out identities. It reports Candidate Recall@100/@500, Recall@12/@20/@50, NDCG@12/@20, MRR, and catalog coverage, with extension points for cluster/author/tag/combination diversity, novelty, and popularity bias.

`evaluateAblations` emits comparable V2, V3-without-combinations, V3-with-pairs, and V3-with-pairs-and-triples result objects. No claim that V3 wins is made without running it against a representative local fixture.

The fixed Live Validation database path was absent in this workspace, so no real user database was opened or modified. The committed automated fixture suite verifies determinism, holdout isolation, finite metrics, and the ablation code path; a maintainer-supplied local catalog is still required for a representative numeric benchmark.
