# Recommendation Pro Plan Status — 2026-09-19

Status: living roadmap. This file maps the broader Recommendation Pro research/engineering plan to the current implementation so unfinished work cannot be hidden by phase numbering.

Legend:

- **IMPLEMENTED** — product/engineering contract exists and is testable.
- **SHADOW** — implemented but intentionally does not control current serving.
- **PARTIAL** — meaningful foundation exists but the problem is not closed.
- **EVIDENCE BLOCKED** — implementation exists, but real longitudinal evidence is not mature enough for promotion.
- **DEFERRED** — intentionally not started because prerequisite evidence is absent.

## 1. Semantic state separation

### Observed Behavior
**IMPLEMENTED**

Durable events and portable bounded behavior exist. Exposure, detail open, reading completion and explicit feedback are distinguishable.

Remaining:
- continue validating event completeness and dedupe under real Desktop/Android use.

### Inferred Preference
**IMPLEMENTED**

Lifetime / 7d / 30d / 90d / Session shadow/profile layers exist.

Remaining:
- validate calibration against longer real use;
- avoid interpreting collection prevalence as equivalent to user intent.

### Explicit Preference
**IMPLEMENTED**

1–10, MORE / LESS / BLOCK and explicit custom targets are separate from inferred preference.

Remaining:
- usability and discoverability validation.

### Session Intent
**IMPLEMENTED**

Session intent is device-local and excluded from cross-device authoritative sync.

Remaining:
- real session evidence quality and session-mode usability.

### Hard Constraints
**IMPLEMENTED**

Owned / Seen / Duplicate / Temporary Suppression / BLOCK are separated from taste negatives.

Remaining:
- validate work-level suppression after Canonical coverage improves.

## 2. Canonical identity

### Series / Work / Edition / Upload model
**PARTIAL**

Evidence tables, reversible decisions, preview, deterministic dry-run and prepare-only transaction contract exist.

Not complete:
- controlled materialization is still disabled;
- broad coverage and false-merge rate are not mature;
- rollback has not been validated against a large real identity graph.

Promotion requirement:
- explicit human-authorized materialization pilot with reversible audit.

## 3. Behavior evidence quality

### Positive/negative evidence hierarchy
**IMPLEMENTED / SHADOW**

Taste, ownership, exposure, identity reports and constraints have separate evidence semantics.

Remaining:
- tune strength using longitudinal outcomes;
- verify repeated-reading semantics;
- confirm cancellation/removal actions are not misinterpreted.

### Exposure bias
**PARTIAL**

Exposure is no longer automatically treated as positive taste evidence.

Not complete:
- no propensity correction;
- no randomized serving assignments;
- no counterfactual evaluation.

Current decision:
- do not implement sophisticated exposure debiasing until serving telemetry can support it.

## 4. Candidate generation

### Multi-channel retrieval
**SHADOW**

Session / Recent / Lifetime / Explicit channels map to provider-specific AUTHOR / FANDOM / TAG / CATEGORY / RELATED / EXPLORATION / REDISCOVERY / TARGET routes.

### Provider query compiler
**SHADOW**

Pica / E-H / ExH capabilities and safe fallbacks are explicit.

### Provider-isolated retrieval
**SHADOW**

Failures, latency and yield are audited by route/provider.

Remaining:
- longitudinal route-quality benchmark;
- formal serving promotion decision.

## 5. Ranking and diversity

### Explainable relevance ranker
**SHADOW**

Transparent feature contributions and reason codes exist.

Remaining:
- compare with current serving on mature future-outcome windows;
- calibrate feature magnitudes.

### Diversity
**SHADOW**

Author / fandom-IP / semantic-tag concentration is controlled after relevance ranking.

Remaining:
- validate user-perceived usefulness;
- quantify relevance loss tolerance.

### Novelty / serendipity / long-tail
**PARTIAL**

EXPLORE channels and diversity provide mechanism-level support.

Not complete:
- no reliable serendipity metric;
- no robust long-tail preference/outcome definition;
- no proof that novelty is useful rather than merely different.

## 6. Session modes

DEFAULT / FAMILIAR / RECENT / EXPLORE / TARGET:
**SHADOW**

Remaining:
- product-facing mode acceptance;
- mature outcome comparison before serving activation.

## 7. Visual intelligence

### Frozen representation
**IMPLEMENTED**

DINOv2-small representation is frozen/versioned and reusable.

### Representation QC
**IMPLEMENTED / READ-ONLY**

Author/IP/provider/source/page-count nuisance checks exist.

### Author multi-prototype atlas
**IMPLEMENTED / READ-ONLY**

### Provisional style families
**PARTIAL**

Graph families exist but are not authoritative art-style labels.

### Visual coverage planning
**IMPLEMENTED / PLAN-ONLY**

### Visual serving
**EVIDENCE BLOCKED**

Android can consume compact portable Visual affinity with a device-local OFF/SHADOW/LIVE switch, but formal global activation remains gated.

Remaining:
- coverage;
- outcome increment;
- nuisance robustness;
- user acceptance.

## 8. Evaluation

### Fixed offline metrics
**IMPLEMENTED**

Precision / Recall / NDCG / Hit / MRR / coverage/correctness are versioned.

### Future-outcome benchmark
**EVIDENCE BLOCKED**

Framework exists, but current mature future windows and exact runs are insufficient for formal promotion.

### Steerability
**IMPLEMENTED**

Control-plane monotonicity can be audited.

Remaining:
- more real explicit-control examples.

### Explanation usefulness
**PARTIAL**

The system can expose reason codes and profile composition.

Not complete:
- no evidence that explanations help users correct the system faster;
- no user-facing explanation quality benchmark.

## 9. Cold start

**PARTIAL / NOT PRODUCT-COMPLETE**

Current system works best with an existing library/favorite history.

Still required:

- new user with almost no favorites;
- new work with no behavior history;
- new author;
- newly added Provider;
- new/provisional style family.

Preferred direction:

1. explicit onboarding interests;
2. provider/popularity priors with low authority;
3. bounded exploration;
4. fast transition from priors to user-specific evidence.

Do not solve cold start by over-weighting global popularity.

## 10. Long-term fatigue

**PARTIAL**

Recent/session layers and diversity reduce repetition mechanically.

Not complete:

- explicit topic/author fatigue model;
- repeated recommendation decay across long horizons;
- recovery after a user returns to an old interest.

Do not add a complex fatigue model until repeated-exposure telemetry is mature.

## 11. Desktop / Android architecture

### Independent runtime nodes
**IMPLEMENTED**

Desktop and Android own separate cycles/batches/sessions.

### Portable Foundation
**IMPLEMENTED**

Desktop can provide candidate reservoir, Canonical bindings and compact Visual artifacts.

### Three-way durable state merge
**IMPLEMENTED**

Conflicting explicit controls require user resolution.

### Provider Relay
**IMPLEMENTED DEVELOPMENT BASELINE**

Pica and account-required E-H/ExH actions can be relayed without copying provider secrets.

### Secure paired transport
**PARTIAL**

Stable device identity exists, but the current LAN Bridge is still HTTP with bearer-token pairing.

Remaining:
- authenticated encrypted transport;
- certificate/public-key device identity;
- explicit fingerprint/identity verification;
- only then consider any revocable session handoff.

## 12. Recommendation Ecosystem

### Pack architecture
**IMPLEMENTED CONTRACT / NO RUNTIME ACTIVATION**

V1 manifest and architecture now cover:

- Canonical Knowledge;
- Provider Intelligence;
- Tag/Alias;
- Visual Intelligence;
- Recommendation Policy.

Remaining:
- read-only Pack inventory/loader;
- compatibility UI;
- shadow consumption;
- standard signature verification;
- key rotation;
- official Pack distribution.

User-private recommendation state is explicitly not a Pack.

## 13. Upgrade and release safety

### Windows public v0.4.0 Schema 9 → current
**IMPLEMENTED AUTOMATED REGRESSION**

Dedicated preservation test and pre-migration backup requirement exist.

### Full application upgrade path
**PARTIAL**

Contract is frozen, but the production update flow still needs its final one-click full-package implementation/UX.

### Android public v0.4.0 → next stable
**PARTIAL / RELEASE BLOCKER**

Known invariant:

- package `com.picalibrary.android`;
- public versionCode 42.

Still required:

- target versionCode >42;
- same production signing certificate;
- actual in-place signed APK install;
- local-state preservation acceptance.

The current `.dev` QA APK cannot prove this.

## 14. Advanced learning

### Learning-to-Rank
**DEFERRED**

May advance only after fixed baseline + exact model comparison is mature.

### Contextual Bandit
**DEFERRED**

Missing propensity/randomized-assignment/online reward attribution.

### Active Learning
**DEFERRED**

Missing uncertainty/query-value/question-response telemetry.

No model-shopping escalation is justified yet.

## 15. Current priority order

### Priority A — while the user tests the current Windows/Android acceptance build

- collect real bugs;
- fix regressions without changing the stable recommendation contract unnecessarily;
- keep public v0.4 direct-upgrade work isolated;
- keep Ecosystem Pack work contract/read-only only.

### Priority B — before next stable release

- close or explicitly triage public Issues #9/#28/#11;
- keep #8 open until real large-queue behavior is validated;
- finish Windows one-click full-application upgrade UX;
- run Android signed in-place v42 → >42 acceptance;
- complete the two-client recommendation acceptance checklist;
- verify rollback/data preservation.

### Priority C — after acceptance data matures

- decide V5 serving promotion;
- decide whether Visual deserves broader LIVE activation;
- run a controlled Canonical materialization pilot;
- begin read-only Pack inventory/loader.

### Priority D — only if benchmark evidence demands it

- Learning-to-Rank experiment design;
- later Bandit/Active Learning only with their required telemetry.
