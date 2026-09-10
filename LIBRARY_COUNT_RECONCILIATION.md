# Library Count Reconciliation

Round 2 uses a synthetic database only. No maintainer database, account, export, or real manga file was read.

## Code-path finding

`comics.id` is the provider comic ID and is a primary key. Favorites sync deduplicates the input by this ID before the upsert, resets only the favorite flag for a complete snapshot, and never deletes local comic rows. Search, recommendation recall, download enqueue, and metadata hydration can therefore create valid non-favorite local records. A favorite sync can also insert favorites that were not previously present locally. Neither path creates duplicate rows for the same provider ID.

## Deterministic synthetic reproduction

The fixture starts with 1,504 favorite comics and 268 non-favorite local records. A complete favorites snapshot contains 1,772 unique provider IDs, including 268 IDs not previously present. After sync:

| Metric | Before | After |
| --- | ---: | ---: |
| Total comic records | 1,772 | 2,040 |
| `favorite=true` records | 1,504 | 1,772 |
| `favorite=false` records | 268 | 268 |
| Distinct canonical comic IDs | 1,772 | 2,040 |
| Distinct provider/raw IDs | 1,772 | 2,040 |
| Duplicate canonical IDs | 0 | 0 |
| Duplicate provider/raw IDs | 0 | 0 |
| Favorite IDs missing as comics | 0 | 0 |
| Same manga represented by multiple IDs | 0 | 0 |

The real implementation and the exact 2,040 / 1,772 scale reproduction are exercised by `test/unit/acceptance-round2-contracts.test.ts`; no user data is copied.

## Provenance groups

The audit facility records source rows per comic and groups them as favorites sync, search, recommendation, download enqueue, download completion, manual import, CSV/Bundle import, legacy/migration, or unknown. Existing records receive `legacy/unknown` during migration and are upgraded when a known source touches them. Sources may overlap because one comic can be discovered and later downloaded.

## Classification

`EXPECTED_NON_FAVORITE_LIBRARY_RECORDS`

The 2,040 versus 1,772 difference is 268 valid local non-favorite records. The observed increase after sync is explained by 268 previously absent favorite IDs being inserted, while the existing non-favorite records remain untouched. This is not a duplicate-ID bug and valid local records must not be deleted to force the counters to match.

## Product semantics

- **漫画库**: all unique comic records retained locally, regardless of provenance.
- **收藏**: unique comics currently marked as provider favorites.
- **已下载漫画**: comics with at least one successfully completed picture whose local file still exists.

The sync response now reports favorite count, newly added favorites, removed favorites, library rows inserted, and library rows updated. It also explicitly states that other local records were not deleted.
