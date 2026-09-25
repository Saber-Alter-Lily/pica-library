# Work Identity Authoritative Domain Reads — P2 D5A

Status: **authoritative materialization/ownership reads separated from bounded review reads**

Parent: `DEVELOPMENT_TASK_LOG.md` → P1-E bounded-list correctness + P2-D SQLite/query discipline.

## Problem

Work Identity has two distinct read contracts:

1. **review/presentation reads** — intentionally bounded to keep the UI manageable;
2. **authoritative correctness reads** — must consume the complete state when building a materialization plan or deciding Canonical Work ownership.

Before D5A these contracts shared the same bounded methods:

- decisions capped at 5,000;
- bindings capped at 10,000.

That is acceptable for a paged/review surface but not for an authoritative plan. A decision or binding beyond the cap could be silently absent from:

- materialization preview;
- materialization plan/digest;
- Final V3 Canonical Work ownership expansion.

The resulting plan could therefore disagree with the actual stored Work Identity state.

## D5A changes

### Database API split

The existing bounded APIs remain unchanged:

- `listWorkIdentityDecisions(limit)` — maximum 5,000;
- `listWorkIdentityBindings(limit)` — maximum 10,000.

D5A adds explicit authoritative APIs:

- `listAllWorkIdentityDecisions()`;
- `listAllWorkIdentityBindings()`.

Both bounded and full-domain variants share one internal SQL/mapping implementation. The difference is only whether a SQL `LIMIT` is applied.

This makes call-site intent auditable instead of silently passing a very large number and hoping it represents the whole domain.

### Materialization plan

`recommendationV5WorkIdentityMaterializationPlan()` now always uses:

- the complete catalog;
- all Work Identity decisions;
- all existing upload bindings.

The plan digest therefore covers the complete authoritative Work Identity input rather than a bounded prefix.

The existing explicit prepare confirmation, plan-version check, plan-digest check, blocker/warning gates and disabled execution boundary remain unchanged.

### Human-review preview

The ordinary review response still returns the bounded decision list.

However, the materialization preview and decision lookup for the displayed evidence use the complete decision domain when storage contains more decisions than the bounded list returned.

For small/normal databases the already-loaded bounded list is reused, avoiding an unnecessary second query.

### Final V3 Canonical Work ownership

D4 compacted the Final V3 serving catalog but still used the legacy 10,000 binding read for Canonical Work expansion.

D5A changes this to `listAllWorkIdentityBindings()`.

If any upload of a Canonical Work is owned, all locally bound uploads for that work remain eligible to participate in the ownership exclusion regardless of total binding count.

## Boundary regression

D5A creates a real SQLite database with:

- **10,001** Work Identity bindings;
- **5,001** Work Identity decisions.

The regression requires:

- bounded binding API = 10,000;
- authoritative binding API = 10,001;
- bounded decision API = 5,000;
- authoritative decision API = 5,001.

This proves that D5A does not simply raise the UI limit; it creates separate bounded and authoritative contracts.

Source-contract coverage additionally requires:

- materialization plan to call both full-domain APIs;
- review preview to retain the bounded UI read but switch to the full decision domain when required;
- Final V3 canonical ownership to use full-domain bindings.

## Deliberate non-scope

D5A does not yet change `workVariantsForComic()`.

That detail path still has three distinct concerns:

- confirmed binding relationships;
- explicit human decisions;
- probable evidence;
- a full-catalog heuristic candidate funnel.

Removing its caps safely should use targeted current-comic/work queries, not simply load every decision/evidence row.

That work belongs to D5B.

D5A also does not change:

- evidence review page-size limits;
- Work Identity resolver confidence;
- automatic binding authority;
- materialization execution (still disabled);
- Recommendation V3/V5 ranking;
- any performance budget or P2-C3 resource enforcement.

## Next

D5B should add targeted Work Identity queries for one comic/work:

1. current binding + all bindings for the same work;
2. all decisions involving the current comic;
3. high-confidence probable evidence involving the current comic.

Then `workVariantsForComic()` can stop relying on global 10,000/5,000 relationship prefixes while preserving its intentional full-catalog metadata heuristic funnel.
