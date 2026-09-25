# Visual Favorite Target Domain — P2 D6A

Status: **complete favorite-ID target reads implemented / Visual coverage analyses intentionally unchanged**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-D SQLite/query discipline.

Dependencies:

- D3 established repeatable Library-query scaling evidence.
- D4/D5 reduced unrelated catalog/relationship materialization while preserving recommendation and Work Identity semantics.
- D6A audits the remaining Visual `listComics({ limit: 10000 })` uses by semantic purpose instead of removing them mechanically.

## Finding

Two Visual paths used a 10,000-row catalog read only to recover favorite comic IDs:

1. `visualPreferenceProfile()`;
2. `visualIndexStatus()`.

The database already has a dedicated complete-domain query:

`favoriteIds()`

Using a catalog prefix for this purpose created both unnecessary row materialization and a correctness boundary: a favorite outside the first 10,000 catalog rows could be omitted from Visual profile evidence or indexing targets.

## D6A change

### Visual preference profile

`visualPreferenceProfile()` now builds its favorite set from `database.favoriteIds()`, then applies the existing `tasteExcludedComicIds` filter.

Everything after favorite-ID selection is unchanged:

- preferred embedding selection;
- explicit like/dislike evidence;
- prototype construction;
- favorite embedding counts;
- profile coverage calculation.

### Visual index status

`visualIndexStatus()` now builds target IDs from:

- the complete `favoriteIds()` result;
- recommendation feedback comic IDs.

Embedding/model/sampling-policy checks, indexed/pending counts and profile generation are unchanged.

## Why Author Atlas / Representation QC are not compacted here

D6A deliberately leaves the 10,000-row catalog reads in:

- `visualAuthorAtlas()`;
- `visualStyleFamilies()` through its Author Atlas input;
- `visualRepresentationQc()`.

Those analyses use the wider catalog as a meaningful denominator or comparison domain.

Author Atlas reports, among other values:

- total catalog works per author;
- indexed coverage per author;
- multi-provider structure.

Representation QC reports:

- catalog count;
- favorite count;
- catalog coverage;
- favorite coverage;
- per-provider indexed/total coverage;
- orphan embedding count.

Replacing their catalog with only embedding-bearing or favorite comics would change the diagnostic/scientific meaning of those outputs. Any future optimization must preserve the intended denominator, potentially through targeted aggregate metadata queries rather than simply narrowing the row set.

## Boundary regression

D6A creates a real SQLite database with **10,001 favorites**.

The fixture deliberately gives the first 10,000 records a newer source timestamp and the last favorite an older timestamp, so the last record is outside the legacy:

`listComics({ limit: 10000 })`

prefix.

Only that tail favorite receives a current Visual embedding.

The regression requires:

- `favoriteIds()` = 10,001;
- the legacy 10,000-row catalog prefix does not contain the tail favorite;
- `visualPreferenceProfile()` still sees its embedding as favorite evidence;
- `visualIndexStatus().targetCount` = 10,001;
- one indexed target and 10,000 pending targets.

Source-contract coverage additionally requires the two target/profile methods to use `favoriteIds()`, while Author Atlas/QC retain their full-catalog reads.

## Deliberate non-scope

D6A does not:

- alter Visual embeddings;
- rebuild Visual indexes;
- change Visual recommendation serving or reranking;
- change Author Atlas/QC/style-family mathematics;
- change coverage denominators;
- choose a foreground/background threshold;
- define a latency budget;
- enable P2-C3 resource enforcement.

## Next P2-D work

After D6A, the remaining query/write audit should focus on evidence rather than numeric-cap removal:

1. inspect the `comicSelect` correlated episode/picture aggregate subqueries under large-library reads;
2. identify whether Visual/Work Identity analyses can use aggregate/count projections without changing their semantic denominators;
3. audit download-progress and recommendation/user-event write cadence versus foreground reads;
4. combine J1/J2 real runtime evidence with query-shape evidence before selecting any further optimization or resource budget.
