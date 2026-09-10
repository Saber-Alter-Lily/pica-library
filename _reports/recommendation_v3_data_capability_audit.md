# Recommendation V3 Data Capability Audit

Audit date: 2026-08-22  
Repository: `Saber-Alter-Lily/pica-library`  
Baseline: `main` at `2236981f1c1a52181571797a0184cae81f9061ff`  
Mode: read-only capability audit; no V3 implementation or remote mutation

## 1 Executive Summary

Recommendation V3 is **not data-ready**. The provider can bootstrap a useful current-state profile from the full favorites collection and item metadata, and it exposes large paginated catalog pools plus item-to-item related results. It does not expose a confirmed account-wide reading, browsing, search, download, like, follow, or recommendation history. Favorite pages are ordered, but the meaning of that ordering is not proven to be favorite time and the response contains no favorite timestamp.

**What can a first installation know about the user's past?** It can know the complete current favorite set, its current item metadata, and a provider route for authored comments; it cannot reconstruct when favorites happened or recover the user's prior reading, search, browse, download, like, follow, or recommendation-exposure timeline.

**What first-party behavior system can be built after installation?** Pica Library can build a local, append-only event store spanning exposure, opens, previews, confirmed favorite transitions, shelves, downloads, and reading, but the current release persists only selected states and operational records and therefore needs explicit instrumentation before behavioral learning is valid.

The application already persists useful current states and operational records, but it lacks an append-only first-party behavior model. Most important, `recommendation_seen` currently means **allocated to a generated recommendation session**, not shown to the user. Treating it as an impression would train on false negatives.

V3 should therefore use:

1. favorites and item metadata as `BOOTSTRAP_DATA`;
2. newly instrumented local interactions as `FIRST_PARTY_EVENTS`;
3. versioned aggregates as `DERIVED_PROFILE_DATA`;
4. provider-related and metadata similarities as `ITEM_GRAPH_DATA`.

Provider data is sufficient for a cold-start recommender, but not for a behavioral recommender. A production V3 gate should remain blocked until exposure semantics and the minimum first-party event contract are implemented and validated.

## 2 Repository Baseline

| Check | Result |
|---|---|
| Branch | `main` |
| HEAD / tracked remote main | `2236981f1c1a52181571797a0184cae81f9061ff` |
| Package version | `0.2.0` |
| Node | `v24.15.0` |
| Latest schema migration | `7` |
| Git status at audit start | `## main...github/main`; no changed paths (clean) |
| Git status after report creation | `?? _reports/`; only this authorized report is untracked |
| Unit and integration tests | PASS: 41 files, 292 tests |
| TypeScript `type:check` | PASS |

Recent five commits:

| SHA | Date | Subject |
|---|---|---|
| `2236981f1c1a52181571797a0184cae81f9061ff` | 2026-08-14 21:25:28 +08:00 | `docs: mark v0.2.0 as released` |
| `c61bc07e08f7c5b531b609e56a12a0487a8fbc74` | 2026-08-14 20:28:58 +08:00 | `fix: localize update package picker` |
| `e2eba4c3a857ab7563bda256d2c07b3b95f030b8` | 2026-08-14 20:16:43 +08:00 | `fix: harden v0.2.0 release candidate` |
| `4da501d4abdea976a7ec973420cc549008bb454b` | 2026-08-14 18:52:11 +08:00 | `release: prepare Pica Library v0.2.0` |
| `98f245552c6a0c26b62565a5f005c97db74f310c` | 2026-08-14 17:57:36 +08:00 | `fix(update): accept local test baseline packages` |

The first sandboxed test launch was blocked by an operating-system directory access denial in esbuild. The same repository test command passed outside that filesystem sandbox. This was an environment failure, not a test failure.

Primary repository evidence:

- Provider calls: `src/sdk.ts:27`, `src/sdk.ts:133`, `src/sdk.ts:160`, `src/sdk.ts:183`, `src/sdk.ts:196`, `src/sdk.ts:205`, `src/sdk.ts:233`, `src/sdk.ts:374`, `src/sdk.ts:409`, `src/sdk.ts:433`.
- Provider synchronization and recall: `src/services/provider-service.ts:69`, `src/library/service.ts:315`.
- Session generation and batch state: `src/services/recommendation-service.ts:102`, `src/services/recommendation-service.ts:138`, `src/services/recommendation-service.ts:211`.
- Persisted recommendation allocation: `src/library/database.ts:1218`, `src/library/database.ts:1243`.
- Schema: `src/storage/sqlite/migrations.ts:109`, `src/storage/sqlite/migrations.ts:136`, `src/storage/sqlite/migrations.ts:143`, `src/storage/sqlite/migrations.ts:219`, `src/storage/sqlite/migrations.ts:260`, `src/storage/sqlite/migrations.ts:267`, `src/storage/sqlite/migrations.ts:283`.

## 3 Provider Capability Matrix

`Auth` describes the project's actual connection path: it logs in, stores the token in memory, and then calls content routes. The bounded live check used this same SDK path through the configured local proxy. It logged only field names/types/counts and timing; it did not log credentials, token, headers, signatures, cookies, request bodies, full user content, or sensitive response bodies.

### 3.1 Complete current SDK endpoint inventory

| Endpoint | Method | Current call location | Auth in current path | Inputs | Returned data | User-related? | Recommendation value | Evidence |
|---|---|---|---|---|---|---|---|---|
| `auth/sign-in` | POST | `Pica.login`; provider connector | No prior token | `email`, `password` | token, retained only in memory | Yes | None beyond enabling calls | `src/sdk.ts:133-148` |
| `comics?c=&t=&s=&page=` | GET | `Pica.comicsPage/comicsAll`; V3 precursor recall uses page 1 | Yes | category, tag, sort, page | `comics: Page<Comic>` | No, catalog | High recall and item features | `src/sdk.ts:150-177`; `src/library/service.ts:341-361` |
| `comics/leaderboard?tt=H24&ct=VC` | GET | `Pica.leaderboard`; legacy CLI `src/index.ts` | Yes | fixed 24-hour/view configuration | comic array | No, global | Exploration/popularity route | `src/sdk.ts:183-190`; `src/index.ts:76` |
| `comics/{id}` | GET | `ProviderService.getComicDetails`, favorite verification, download/update metadata | Yes | comic ID | detailed comic, current favorite/like flags | Per requested item | High item features; current state only | `src/sdk.ts:196-200`; `src/services/provider-service.ts:221-228,246-256` |
| `comics/{id}/eps?page=` | GET | `Pica.episodesAll`; ProviderService, reader/download/update | Yes | comic ID, page | `eps: Page<Episode>` | No, content | Completion/update features | `src/sdk.ts:205-228`; `src/services/provider-service.ts:231-233` |
| `comics/{id}/order/{order}/pages?page=` | GET | `Pica.picturesAll`; ProviderService and downloader | Yes | comic ID, episode order, page | `pages: Page<Picture>` | No, content | Local consumption/completion support | `src/sdk.ts:233-265`; `src/services/provider-service.ts:235-240` |
| trusted media URL from page/cover metadata | GET | `Pica.fetchImage/mediaRequest`; ProviderService fetch | No Pica API route; SDK-controlled headers and trusted URL | media URL, byte cap | binary bytes/stream metadata | No | No historical signal; enables preview/download | `src/services/provider-service.ts:242-244`; `src/sdk.ts:268-371` |
| `comics/advanced-search?page=` | POST | `Pica.search/searchAll`; ProviderService search; author/circle recall | Yes | keyword, sort, categories, page | `comics: Page<Comic>` | Query-scoped, not account history | High recall | `src/sdk.ts:374-401`; `src/services/provider-service.ts:213-218`; `src/library/service.ts:369-383` |
| `categories` | GET | SDK method only; no current LibraryService consumer found | Yes in current connection path | none | category objects | No, taxonomy | High vocabulary value | `src/sdk.ts:404-407` |
| `keywords` | GET | SDK method only; no current LibraryService consumer found | Yes in current connection path | none | string array | No, global | Low/medium discovery value | `src/sdk.ts:409-412` |
| `comics/{id}/recommendation` | GET | `Pica.related`; Recommendation recall | Yes | seed comic ID; no page parameter | related comic array | Seed-related, not proven personalized | High item-graph value; sparse | `src/sdk.ts:414-420`; `src/library/service.ts:334` |
| `comics/{id}/favourite` | POST | `ProviderService.setFavorite` after before-state check | Yes | comic ID; toggle semantics | mutation result; verified by detail re-read | Yes | Strong conversion only if event is logged | `src/sdk.ts:425-428`; `src/services/provider-service.ts:246-256` |
| `users/favourite?page=&s=` | GET | `Pica.favorites/favoritesAll`; full/quick sync | Yes | page, sort (`dd` default) | `comics: Page<Comic>` | Yes, current collection | Highest cold-start value | `src/sdk.ts:433-480`; `src/services/provider-service.ts:69-210` |
| `users/punch-in` | POST | SDK method only; no current LibraryService consumer found | Yes | none | provider operation result | Yes | None for recommendation | `src/sdk.ts:483-488` |

The account routes below are **not** in the current SDK and therefore are not part of the inventory above. They are audited separately in Section 3.3.

### 3.2 Bounded real response-shape audit

`Nullable/optional` is an observation from this bounded sample plus cross-route absence, not a provider schema guarantee. Examples are synthetic redactions or type-preserving truncations, never copied private values.

| Response | Field | Observed type | Nullable / optional evidence | Redacted or truncated example | TypeScript contract status |
|---|---|---|---|---|---|
| Page wrapper | `docs` | array | Present | `[...]` | Declared |
| Page wrapper | `total` | number | Present | `1786` (favorite total) | Declared |
| Page wrapper | `limit` | number | Present | `20` | Declared |
| Page wrapper | `page` | number | Present | `1` | Declared |
| Page wrapper | `pages` | number | Present | `90` | Declared |
| Favorite comic | `_id` | string | Present | `[redacted-id]` | Declared |
| Favorite comic | `title` | string | Present | `[title...]` | Declared |
| Favorite comic | `author` | string | Present | `[author...]` | Declared |
| Favorite comic | `categories` | string[] | Present; may be empty | `["[category]"]` | Declared |
| Favorite comic | `tags` | string[] | Present; may be empty | `["[tag]"]` | Declared |
| Favorite comic | `finished` | boolean | Present | `true` | Declared |
| Favorite comic | `epsCount` | number | Present | `1` | Declared optional |
| Favorite comic | `pagesCount` | number | Present | `24` | Declared optional |
| Favorite comic | `likesCount` | number | Present | `100+` | Declared optional |
| Favorite comic | `totalLikes` | number | Present | `100+` | Declared required |
| Favorite comic | `totalViews` | number | Present | `1000+` | Declared required |
| Favorite comic | `thumb` | object | Present in sample | `{originalName,path,fileServer}` | Declared optional |
| Favorite comic | `created_at` | absent | Missing from list sample | `<absent>` | **Incorrectly required** by `Comic` |
| Favorite comic | `updated_at` | absent | Missing from list sample | `<absent>` | **Incorrectly required** by `Comic` |
| Favorite comic | `description` | absent | Missing from list sample | `<absent>` | **Incorrectly required** by `Comic` |
| Favorite comic | `chineseTeam` | absent | Missing from list sample | `<absent>` | **Incorrectly required** by `Comic` |
| Detail comic | `_creator` | object | Present in sampled detail; shape may vary | `{_id,name,level,verified,...}` with values redacted | **Undeclared** |
| Detail comic | `_id` | string | Present | `[redacted-id]` | Declared |
| Detail comic | `author` | string | Present | `[author...]` | Declared |
| Detail comic | `title` | string | Present | `[title...]` | Declared |
| Detail comic | `description` | string | Present; may be empty | `[description...]` | Declared |
| Detail comic | `chineseTeam` | string | Present; may be empty | `[team...]` | Declared |
| Detail comic | `categories` | string[] | Present | `[...]` | Declared |
| Detail comic | `tags` | string[] | Present | `[...]` | Declared |
| Detail comic | `created_at` | string timestamp | Present | `20xx-...Z` | Declared |
| Detail comic | `updated_at` | string timestamp | Present | `20xx-...Z` | Declared |
| Detail comic | `finished` | boolean | Present | `false` | Declared |
| Detail comic | `allowComment` | boolean | Present | `true` | Declared optional |
| Detail comic | `allowDownload` | boolean | Present | `true` | Declared optional |
| Detail comic | `isFavourite` | boolean | Present | `true` | Declared optional |
| Detail comic | `isLiked` | boolean | Present | `false` | Declared optional |
| Detail comic | `epsCount` / `pagesCount` | number | Present | `1` / `24` | Declared optional |
| Detail comic | `likesCount` / `totalLikes` | number | Present | `100+` | Declared optional / required |
| Detail comic | `viewsCount` / `totalViews` | number | Present | `1000+` | Declared optional / required |
| Detail comic | `commentsCount` / `totalComments` | number | Present | `10+` | Declared optional |
| Detail comic | `thumb` | object | Present in sample | `{originalName,path,fileServer}` | Declared optional |
| Episode | `_id` | string | Present | `[redacted-episode-id]` | Declared optional |
| Episode | `id` | string | Present after response normalization/sample | `[redacted-episode-id]` | Declared |
| Episode | `title` | string | Present | `[episode-title...]` | Declared |
| Episode | `order` | number | Present | `1` | Declared |
| Episode | `updated_at` | string timestamp | Present | `20xx-...Z` | Declared |
| Picture | `_id` | string | Present | `[redacted-picture-id]` | **Undeclared** |
| Picture | `id` | string | Present after response normalization/sample | `[redacted-picture-id]` | Declared |
| Picture | `media` | object | Present | `{originalName,path,fileServer}` | Declared |
| Picture | `originalName` | string | Present after media spread | `[page].jpg` | **Undeclared** |
| Picture | `name` | string | Present after SDK mapping | `01.jpg` | Declared |
| Picture | `path` | string | Present after media spread | `[redacted-path].jpg` | Declared |
| Picture | `fileServer` | string URL | Present after media spread | `https://[host]` | Declared |
| Picture | `url` | string URL | Present after SDK mapping | `https://[host]/static/[path]` | Declared |
| Picture | `epTitle` | string | Absent from raw page; added by `picturesAll` | `[episode-title...]` | Declared but only post-aggregation |
| Leaderboard comic | `leaderboardCount` | number | Present in sample | `1+` | **Undeclared** |
| Categories | `categories` | object[] | Present; 47 sampled entries | `[{...}]` | No dedicated type |
| Keywords | `keywords` | string[] | Present; 15 sampled entries | `["[keyword]"]` | Request generic only |
| Related | `comics` | Comic[] | Present; empty or 10 in sampled seeds | `[]` / `[{...}]` | Cast as `Comic[]` |

`PageFavorites` and `PageSearch` are both aliases of `Page<Comic>` (`src/types.ts:46-47`). The live search/catalog samples had the same summary-style field family as favorite results, so the same required-versus-absent risk applies; there is no distinct `Favorite` record type that captures favorite-specific chronology.

Consequences: `Comic` is used for list summaries, favorites, searches, leaderboard entries, related entries, and details, but four currently required fields were absent from the favorite-list response. `_creator`, `leaderboardCount`, picture `_id`, and flattened `originalName` are real fields not represented by the current declarations. The audit does not modify types because this round is read-only.

### 3.3 Existing-but-unintegrated account capability audit

Only repository history, dependency/source review, documented client implementations, and safe known routes were used. No endpoint-name fuzzing was performed.

`package.json` contains no third-party Pica API SDK dependency; the provider implementation is local in `src/sdk.ts`. Consequently there was no dependency-owned hidden account-history surface to enumerate.

Classification rule: `CONFIRMED` requires repository/live evidence or a concrete known-client route; `LIKELY` requires multiple indirect Pica-specific signals but no concrete route; `UNVERIFIED` means a concrete historical/client contract exists but current live compatibility or response shape was not checked; `NOT_FOUND` means no Pica-specific evidence was found in the allowed sources. No candidate is classified `LIKELY` in this audit: the evidence was either concrete enough to confirm a route, limited to an unverified current contract aspect, or absent. Endpoint names alone were never promoted to `LIKELY`.

| Candidate capability | Status | Evidence | Strict conclusion |
|---|---|---|---|
| `users/profile` | CONFIRMED | `tonquer/picacg-qt` GET request definition; older independent client documents returned profile fields | Current account profile snapshot exists; not history and not live-shape tested here |
| `users/my-comments?page=` | CONFIRMED | Public client request and parser use `data.comments.docs/page/pages/limit/total` | Authored comment pages are available; exact current field/retention contract needs dedicated validation |
| Current live `users/profile` response contract | UNVERIFIED | Known-client route was not called in this bounded live audit | Do not depend on exact current fields until a separate read-only check |
| Current live `users/my-comments` response contract | UNVERIFIED | Known-client route/parser exists, but no live call was made | Route capability is confirmed by client evidence; current shape/retention remains unverified |
| Current favorites | CONFIRMED | Current SDK and live read-only call | Current collection, not transition history |
| Per-comic current like flag | CONFIRMED | Live detail field `isLiked` | Current state only for fetched comics |
| Account-wide liked-comic collection/history | NOT_FOUND | No route in repository/history/dependencies or inspected clients | Must be treated unavailable, not inferred from detail calls |
| Reading/watch/viewed history | NOT_FOUND | No provider route found; public client's history UI writes local `history.db` | Client-local history is not provider history |
| Recent reading / progress | NOT_FOUND | Same evidence | No provider bootstrap capability found |
| Search history | NOT_FOUND | No provider route found | Only future local first-party events are possible |
| Browse/detail-open history | NOT_FOUND | No provider route found | Only future local first-party events are possible |
| Provider download history | NOT_FOUND | No provider route found | Only local jobs after installation are available |
| Notifications | NOT_FOUND | No Pica-specific route in inspected sources | Do not guess `users/notifications` from unrelated APIs |
| Followed authors/tags/collections other than favorites | NOT_FOUND | No route/model found | Current favorites are the only confirmed account collection |
| Favorite/unfavorite event history | NOT_FOUND | Favorite endpoint returns current ordered set only | No transition/timestamp bootstrap |
| Personalized recommendation history | NOT_FOUND | Related route is item-seeded; leaderboard is global | Neither proves prior personalized exposure |
| Ratings / nominations performed by account | NOT_FOUND | `vd` is a catalog sort code, not an account activity feed | Global score ordering is not personal behavior |

Public-source confirmation is from [tonquer/picacg-qt request definitions](https://github.com/tonquer/picacg-qt/blob/main/src/server/req.py) and the older [2024baibai/PicaComic-Api documentation](https://github.com/2024baibai/PicaComic-Api). These are client implementations, not an official provider schema, so they establish observed route use rather than a compatibility guarantee. The public client's `src/view/user/history_view.py` stores history in a local SQLite database and therefore directly contradicts interpreting that screen as server history.

## 4 First-Launch Historical Data Matrix

| Signal | Available | Source | Historical depth | Timestamp | Reliability | Recommendation value | Status |
|---|---|---|---|---|---|---|---|
| 1. Current favorite set | Yes | `users/favourite`, all pages | Current snapshot of all members | Observation/sync time only | High | Very high cold-start | CONFIRMED |
| 2. Favorite total | Yes | Favorite page wrapper `total` | Current scalar | Observation time only | High; live value 1,786 | Validation/profile size | CONFIRMED |
| 3. Favorite list order | Yes, ordered pages | `s=dd` and `s=da` | Current ordered snapshot | No per-item order timestamp | High that order exists; low semantic certainty | Potential recency only if proven | UNKNOWN (`ORDER_AVAILABLE`, `SEMANTICS_UNKNOWN`) |
| 4. Favorite time | No | No field/route found | None | None | High-confidence absence in sampled list contract | Would be high | UNAVAILABLE |
| 5. Recently favorited | No reliable derivation | Favorite order, comic dates, and local first-seen are insufficient | None | None | Low if inferred | Would be high | UNAVAILABLE |
| 6. Cancel/unfavorite history | No | Current favorite membership only | None | None | High-confidence absence | Strong negative transition if it existed | UNAVAILABLE |
| 7. Reading history | No | No provider route found | None | None | High after source audit | Very high | UNAVAILABLE |
| 8. Recent reading | No | No provider route found | None | None | High after source audit | Very high | UNAVAILABLE |
| 9. Read count | No | No provider route found | None | None | High after source audit | High | UNAVAILABLE |
| 10. Reading progress | No at provider bootstrap | No provider route found | None | None | High after source audit | High | UNAVAILABLE |
| 11. Search history | No | No provider route found | None | None | High after source audit | Medium/high | UNAVAILABLE |
| 12. Browse/detail-open history | No | No provider route found | None | None | High after source audit | Medium/high | UNAVAILABLE |
| 13. Download history | No | No provider route found | None | None | High after source audit | High | UNAVAILABLE |
| 14. Like history | No account-wide history; per-item current state available on detail | `comics/{id}.isLiked` | One current bit for individually fetched items | Observation time only | High for fetched current state; no population coverage | Medium | UNAVAILABLE for history; INFERABLE current snapshot only |
| 15. Comment history | Yes as a route capability | `users/my-comments?page=` | Paginated authored comments; retention depth not validated | Parser implies comment records, exact timestamp fields unvalidated | Medium until live shape check | Medium, sparse, privacy-sensitive | CONFIRMED capability |
| 16. Account ratings/nominations | No | `vd` catalog sort is not user activity | None | None | High after semantic review | Medium if it existed | UNAVAILABLE |
| 17. Followed authors/tags | No | No provider route/model found | None | None | High after source audit | High if it existed | UNAVAILABLE |
| 18. Provider personalized recommendation history | No | Related is item-seeded; leaderboard is global | None | None | High for current inspected routes | Exposure history would be high | UNAVAILABLE |
| Favorite item metadata | Yes, partial by route | Favorite summaries plus optional detail calls | Current content snapshot | Comic creation/update dates, not favorite dates | High for observed fields | Very high | CONFIRMED |
| Preference affinity from favorites | Derivable | Normalize authors/circles/tags/categories across current set | Lifetime-like current-state aggregate, not chronological history | No interaction time | Medium/high; biased by removed favorites | Very high cold-start | INFERABLE |

Strict conclusion: first launch can build a **favorite-content profile**, not a user-behavior timeline.

## 5 First-party Behavior Matrix

| Event | UI knows? | Server knows? | Currently persisted? | Source/context preserved? | Can add low-cost event log? |
|---|---:|---:|---|---|---|
| Search submit | Yes: keyword/tags/sort | Yes: `/api/v1/search` request | No query/event; returned comics enter catalog cache | Catalog source becomes `pica:discover`; query/rank not preserved | Yes: one event per submit with query ID and privacy policy |
| Search result detail open | Yes: comic ID, `search` context, result order available in state | No; dialog is client-only | No | No | Yes: one POST/beacon with query ID, comic ID, rank |
| Recommendation candidates generated | Not directly | Yes | Yes: `recommendation_sessions` and allocated IDs | cycle/session preserved; route-level provenance exists on candidates only in immediate response | Already recorded, but rename semantics to allocation |
| Recommendation batch display | Yes: exactly the 12-item slice rendered | Only after explicit next-batch action; initial render is not reported | `app_state.currentBatchIndex` snapshot only | cycle/session/batch partly available; item exposure absent | Yes: one ordered batch event after visible render |
| Recommendation card rendered | Yes | No | No | No rank/item render record | Yes, but batch event is cheaper and usually sufficient |
| Recommendation viewport impression | Browser could know; no observer exists | No | No | No | Yes with `IntersectionObserver`, but higher cost/noise than batch display |
| Recommendation detail open | Yes: comic ID and recommendation context | No | No | No cycle/session/batch/rank join | Yes: one event on dialog open |
| Preview open | Yes | Yes: `/api/v1/previews/prepare` | No durable event; only temporary cache | Comic ID/offset reach server; recommendation/search context does not | Yes: add source context and append event |
| Preview more | Yes: offset | Yes: same route with offset | No durable event | Comic/offset only | Yes: one event per explicit “more” action |
| Favorite | Yes | Yes; ProviderService verifies remote before/after | Current `comics.is_favorite` and membership only | Comic ID retained; originating surface/rank lost | Yes: append only after provider-confirmed success |
| Unfavorite | Yes wherever removal control exists | Yes; same verified provider path | Current state only; membership deleted | Origin and transition history lost | Yes: append confirmed transition before/with state update |
| Add shelf | Yes | Yes | Current `shelf_items` row with `added_at` | Shelf/comic retained; recommendation/search source not stored | Yes: add source and append event |
| Remove shelf | Yes | Yes | No history; row is deleted | Shelf/comic known during request but discarded | Yes: append removal before delete |
| Download enqueue | Yes | Yes | Yes: one `download_jobs` row | Source is preserved (`library`, `recommendation`, `search`, `shelf`, or manual); rank/session absent | Existing record is usable; append event improves uniformity |
| Download start/pause/resume/retry/fail/cancel/complete | UI observes current status | Yes | Current job row only; transitions overwrite status | Job/comic/source retained; prior transition timestamps mostly lost | Yes: append within state-machine transition |
| Reader open | Yes | Server serves chapters | No | Comic and originating view known in UI; not persisted | Yes: one event after readable content opens |
| Chapter open | Yes | Server serves chapter/pages | No | Comic/episode known, origin lost | Yes: one event per explicit chapter switch/open |
| Reader progress | Yes | Yes: `/api/v1/reader/progress` | Last page snapshot per comic/episode | Comic/episode/page retained; mode/origin/session absent | Yes: checkpoints can be throttled and deduplicated |
| Reading completion | UI can compare visible page to known local page count | Not explicitly | No explicit completion event | Can be derived only for locally complete chapters | Yes: emit once at a documented threshold |
| Next batch | Yes | Yes for connected mode | Only current batch index snapshot | No ordered item exposure | Yes: batch-shown event should accompany state update |
| Restart recommendation | Yes | Yes | New cycle/session and app state indirectly persist it | Prior/new cycle inferable; explicit reason/action absent | Yes: one restart event |

Relevant evidence: card generation and 12-item slicing at `web/app.js:847-915`; preview/detail at `web/app.js:1290-1385`; reader progress at `web/app.js:1388-1550`; next/restart at `web/app.js:1799-1844,2164-2176`; result actions at `web/app.js:2181-2211`; state persistence at `src/services/recommendation-service.ts:211-229`.

## 6 Existing-but-unused Signals

1. **Download source and lifecycle.** `download_jobs.source`, timestamps, status, progress and bytes provide strong local intent/conversion evidence. They are not used by recommendation ranking.
2. **Current reading progress.** `reading_progress` is a useful current-state feature, but must not be presented as a historical event stream.
3. **Shelf membership and `added_at`.** A current shelf addition can be a preference signal. Source and removal history are missing.
4. **Recommendation session allocation.** Session/cycle structure can support training joins, but only as generated/allocated data, not exposure.
5. **Provider-related edges.** Related results can populate an item graph. Repeated live calls for one non-empty seed returned the same 10 IDs in the same order, while several other seeds returned zero.
6. **Item popularity and freshness.** Detail/list fields include likes/views/comments and comic `created_at`/`updated_at`; current V2 intentionally weakens popularity but V3 can use calibrated, time-aware features.
7. **Uploader account metadata.** Detail includes undeclared `_creator` metadata. This is uploader identity, not necessarily work author identity, and should not be used as an author preference without a separate semantic decision.
8. **Leaderboard.** The SDK exposes 40 global items, but current recommendation recall does not use it.
9. **`favorite_snapshots`, `recommendation_profiles`, `recommendation_results`, `download_items`.** Tables exist, but no current write path was found. In the audited live DB all four were empty.
10. **Comic provenance.** Useful for data lineage and cache freshness, not direct user intent.

### 6.1 Complete SQLite semantic audit

| Table | Knowledge and grain | Time fields | Source/context | Update behavior and historical depth | Counts/completion | Recommendation reliability |
|---|---|---|---|---|---|---|
| `schema_migrations` | Applied schema versions | `applied_at` | migration name | Append once per migration | Counts migrations | Operational only |
| `authors` | One canonical author cluster | created/updated | confidence, evidence, review status | Upserted current canonical state; no version history | Current work grouping | High after normalization/review |
| `author_aliases` | One normalized alias mapping | `created_at` | source, evidence, confidence | Conflict updates mapping/evidence; old mapping not versioned | Alias frequency can be joined | High/medium depending confidence |
| `comics` | One current comic metadata row | provider created/updated plus local first/last seen | Current favorite bit; detailed source is separate | Upsert overwrites mutable metadata/current favorite; first/last observation only | No interaction count; content totals current | High item features; not event history |
| `comic_authors` | Comic-author/raw-value relationship | None | role, circle, confidence, evidence, review flag | Upserted current relationship; no version history | Work counts derivable | High after review |
| `episodes` | One current episode | provider update plus local first/last seen | Comic relation | Upsert overwrites title/order/update; no versions | Episode count/current update signals | Medium/high item freshness |
| `pictures` | One page plus current local download state | local first/last seen | Comic/episode/position and media location | Status/path/bytes/hash/error/retry count overwrite current row | Picture completion and current retry count; no transition count | Strong local completion state, not full history |
| `sync_runs` | One import/sync execution | start/finish | `source`, status, error, item count | Append per run | Run and item counts reliable | Operational quality/provenance, not preference |
| `favorite_snapshots` | Intended full favorite-ID snapshot | `captured_at` | source | **No write path found; live count 0** | None in practice | Unusable until implemented |
| `download_jobs` | One job per comic/request | create/start/finish/progress update | Explicit source, runner, selected episodes | Status/progress/retry/error overwrite same row; terminal timestamps retained | Jobs countable; terminal `COMPLETED/FAILED/CANCELLED`; intermediate transitions lost | Strong intent/conversion with source caveats |
| `download_items` | Intended per-job episode/picture work item | create/start/finish | Job/comic/episode/picture | **No write path found; live count 0** | None in practice | Unusable in current release |
| `update_findings` | Update-scan finding per generated ID | `checked_at` | Comic, old/new episode counts, changed metadata | Finding rows can persist; status is mutable; not user behavior | Update occurrence/count | Content freshness only |
| `recommendation_profiles` | Intended serialized profile | `generated_at` | Favorite count/profile JSON | **No current write path; live count 0** | None | Unusable current table |
| `recommendation_results` | Intended ranked result per profile/comic | None | rank, score, reasons | **No current write path; live count 0** | None | Unusable current table |
| `comic_provenance` | One current observation interval per comic/source | first/last seen | Explicit source | Upsert retains earliest row and latest observation; intermediate observations lost | Source coverage | High lineage, low preference value |
| `shelves` | Current named shelf | create/update | Shelf ID/name/sort | Rename overwrites; delete cascades all state | Current shelf counts | Shelf identity only |
| `shelf_items` | Current shelf-comic membership | `added_at` | Shelf and position; **no originating surface** | Insert-once current membership; remove deletes row; re-add gets new time | Current membership count; no add count | Positive state signal; removal/re-add history unavailable |
| `reading_progress` | Last page for one comic/episode | `updated_at` | Comic/episode only | Primary-key upsert overwrites page and time | No opens, duration, visit/read count or max-ever page | Useful current snapshot; unsafe as event history |
| `recommendation_sessions` | One allocated ID list per cycle/session | `generated_at` | cycle/session, exhausted | Append per session; IDs immutable in current path | Session/allocation count | Valid generated/allocated history only |
| `recommendation_seen` | First allocation of comic within cycle | `first_seen_at` | cycle/comic | `INSERT OR IGNORE`; one row per cycle/comic | Allocation count | **Not an impression** |
| `app_state` | Current JSON state by key | `updated_at` | Key-specific JSON | Upsert overwrites previous value | No transition count | Current navigation/session pointer only |
| `library_membership` | Current reason a comic belongs locally | create/update | reason: favorite/shelf/download/import | Upsert current reason; deletes when reason disappears; full favorite reconcile can recreate rows | Current membership/reason count | Useful state; timestamps not remote event times |
| `favorites_sync_state` | Singleton fast-sync checkpoint | full/quick timestamps | Head IDs/fingerprint, counts/page size | Singleton overwrite | Current remote count/reconcile diagnostics | Operational only; not favorite chronology |

### 6.2 Required focused answers

`reading_progress`:

- Saves only the latest `page_index` per `(comic_id, episode_id)` and overwrites `updated_at`.
- Does not store max-ever page separately; moving backward replaces the later page.
- Does not store reader open, reading count, visit sequence, or duration.
- Chapter completion is only **inferable** when the current page can be compared with the complete locally known page list. It is not persisted as completion and can be invalidated by moving backward.
- Comic completion is not reliably inferable without complete episode/page knowledge and an explicit policy for every episode; no comic-completed field/event exists.

`download_jobs`:

- Preserves the enqueue source. The browser supplies `library`, `recommendation`, `search`, or `shelf`; CLI/manual paths may supply `library`/`manual`.
- Preserves create/start/terminal times, current status, selected episodes, runner, progress, bytes, current retry count, latest error, and progress-update time.
- Distinguishes terminal complete/fail/cancel and current pause/retry states, but overwrites transitions and clears/reuses some terminal fields on later transitions.
- Can support a recommendation conversion when `source=recommendation`, but lacks cycle/session/batch/rank and therefore cannot attribute the exact exposure without new context.

`shelf_items`:

- Has `added_at` and a stable current position.
- Removal history is not retained; the row is deleted. Shelf deletion cascades items.
- Originating source/surface is not retained.

### 6.3 Live database occupancy (read-only)

The existing packaged v0.2.0 database was reopened with `DatabaseSync(..., {readOnly:true})`. Counts are evidence of actual use, not a claim that empty schemas are broken.

| Table | Rows | Table | Rows |
|---|---:|---|---:|
| `app_state` | 1 | `author_aliases` | 949 |
| `authors` | 949 | `comic_authors` | 2,050 |
| `comic_provenance` | 2,110 | `comics` | 2,051 |
| `download_items` | 0 | `download_jobs` | 0 |
| `episodes` | 0 | `favorite_snapshots` | 0 |
| `favorites_sync_state` | 1 | `library_membership` | 1,786 |
| `pictures` | 0 | `reading_progress` | 0 |
| `recommendation_profiles` | 0 | `recommendation_results` | 0 |
| `recommendation_seen` | 221 | `recommendation_sessions` | 5 |
| `schema_migrations` | 7 | `shelf_items` | 0 |
| `shelves` | 0 | `sync_runs` | 7 |
| `update_findings` | 0 | | |

## 7 Missing Instrumentation

Minimum append-only events required before V3 behavioral learning:

| Event | Minimum payload beyond common envelope | Why |
|---|---|---|
| `search_submitted` | query ID, privacy-safe query representation, filters/sort | Explicit exploration intent |
| `search_result_opened` | query ID, comic ID, rank | Search conversion |
| `recommend_batch_shown` | cycle/session/batch, ordered comic IDs | Minimum defensible exposure |
| `recommend_card_impression` | comic ID, rank, visibility threshold/duration | Optional higher-quality exposure |
| `recommend_detail_opened` | comic ID, cycle/session/batch/rank | Stronger interest |
| `preview_started` / `preview_more` | comic/episode, source surface | Medium/strong interest |
| `favorite_confirmed` | comic ID, desired state, provider confirmation | Strong conversion and negative transition |
| `shelf_added` / `shelf_removed` | comic/shelf/source surface | Curated intent |
| `download_enqueued` / terminal events | job/comic/source/status | Strong intent and completion |
| `reader_opened` / `chapter_opened` | comic/episode/source | Consumption start |
| `reading_checkpoint` / `reading_completed` | page/count/ratio | Consumption depth |
| `recommend_cycle_restarted` | old/new cycle and reason | Dissatisfaction/exploration context |

Common envelope: `event_id`, `occurred_at`, `event_type`, `schema_version`, `surface`, optional `comic_id`, `session_id`, `batch_index`, `position`, `source_context`, and an idempotency key. Event payloads must not contain credentials, tokens, image content, or raw provider responses. Raw search text needs an explicit local privacy/retention policy.

## 8 `recommendation_seen` Semantic Audit

Current behavior:

1. `generateSession` ranks up to 500 candidates and takes up to 60 after exclusions.
2. `saveRecommendationSession` persists the session.
3. The same transaction immediately inserts every session comic ID into `recommendation_seen` with the session generation timestamp.
4. Server startup calls `ensureInitialPrepared()` before the user necessarily opens the recommendation view.
5. The browser later slices the prepared session into 12-item batches.

Live DB validation found 5 sessions and 221 `recommendation_seen` rows. Session sizes were `0, 60, 60, 41, 60`; every non-empty session had exactly the same number of `recommendation_seen` rows at its exact generation timestamp.

| Stage | Current meaning | Current durable evidence | Safe to call an impression? |
|---|---|---|---:|
| `generated` | Up to 500 ranked candidates returned by the generator | Not stored as a complete candidate set by the active session path | No |
| `allocated` | First up to 60 unique, non-favorite, cycle-unseen items selected for a session | Session JSON plus all IDs inserted into `recommendation_seen` | No |
| `batch_shown` | One 12-item slice inserted into the active recommendation results container | No item list/event; only current batch index may later be stored | **Yes, as the minimum batch-level impression definition** |
| `card_rendered` | Card HTML exists in the DOM | No | Not by itself if page/view is hidden; usable only with visibility guard |
| `viewport_impression` | Card actually crosses a documented visibility/time threshold | Not measured | Yes, highest-precision exposure |
| `detail_open` | User opens recommendation detail | Browser only, no event | No; this is a stronger engagement event |
| `preview` | User requests preview pages/more | Server request but no durable event/context | No; this is an engagement event |
| `conversion` | Confirmed favorite, shelf add, download, or consumption after exposure | Partial current state/jobs, no exposure join | No; this is an outcome event |

Therefore:

`recommendation_seen` = **allocated to a generated session/cycle exclusion set**.

It does **not** mean:

- batch shown;
- card rendered;
- card entered viewport;
- user noticed the card;
- detail or preview opened.

Required remediation for V3 semantics:

- retain or rename current meaning to `recommendation_allocated`;
- add `recommend_batch_shown` as the minimum exposure event;
- optionally add viewport impressions with a documented threshold and deduplication rule;
- never train non-click negatives from current `recommendation_seen`.

Recommended minimum V3 definition: `recommend_impression` means the ordered 12-item batch was inserted into an active recommendation view while the document was visible, recorded once per `(cycle_id, session_id, batch_index)`. It is a batch-level exposure and must carry all ordered comic IDs/ranks. Optional stricter `recommend_viewport_impression` means at least 50% of one card was visible for 1 second, deduplicated by `(session_id, comic_id)`. Viewport events improve negative-label precision but add browser observer complexity, dwell-threshold policy, scroll noise, and more writes. Start with guarded batch exposure; add viewport events only if ranking evaluation requires item-level negatives.

## 9 Favorite Ordering Audit

The provider accepts `s=dd` and `s=da`; both returned valid 20-item pages in the live read-only check. Current SDK comments label these as newest-to-oldest and oldest-to-newest. However:

- favorite list items expose no favorite timestamp;
- list items do not expose a timestamp that can distinguish comic chronology from favorite chronology;
- no authoritative provider contract was found;
- local `first_seen_at`, provenance timestamps, sync timestamps, and membership `created_at` are observation/import times, not remote favorite times;
- full synchronization can reset membership rows, further weakening local timestamps.

Verdict: **ORDER_AVAILABLE / SEMANTICS_UNKNOWN**.

V3 must not name `dd` results “recently favorited” or use their positions as favorite recency until a controlled mutation test proves the server semantics.

## 10 Provider Recall Capability

Current online generation requests at most 16 related seeds plus two routes for each of tag, category, author, and circle. Concurrency is bounded at 3. Every route is caught independently and becomes an empty candidate list on failure; the current audit object does not retain a route error/latency counter.

Live timings below were approximately 0.8-1.15 seconds per read-only provider call through the configured proxy. They are a small environmental sample, not an SLA. The bounded run observed no transport or HTTP/API failures; an empty related array is a successful but zero-yield response, not a network failure.

| Route | Current requests / generation | Observed candidates | Pagination depth | Duplicate evidence | Request cost | Failure evidence | Stability evidence | Fit for 500-1,500 pool |
|---|---:|---:|---|---|---|---|---|---|
| Related | Up to 16, one/seed | Several sampled seeds returned 0; one returned 10 | None exposed by SDK/route | No duplicate in the 10-item repeat sample; cross-seed overlap not quantified | High: one call per seed, ~0.84s repeat sample | 0 request failures in small sample; variable zero yield | Same non-empty seed repeated immediately: identical 10 IDs and exact order; long-term/account stability unknown | Useful high-precision graph route, insufficient and too sparse alone |
| Author search | 2 page-one calls | 8 total, 8 exact author matches in sample | 1 page for sampled author; query-dependent generally | No within-sample issue; cross-route overlap unknown | One search request per author, ~0.8-1.15s | 0 in sample | Only one sample; UNKNOWN over time | Good precision for strong authors; limited for sparse/common names |
| Circle search | 2 page-one calls | 9 total, all contained normalized circle in sample | 1 page for sample; query-dependent generally | Cross-route overlap unknown | One search request per circle, ~0.8-1.15s | 0 in sample | Only one sample; UNKNOWN | Useful but circle is inferred from author strings and needs filtering |
| Tag catalog | 2 page-one calls | 20/page; sampled total 50,178 over 2,509 pages; 20/20 exact tag | Very deep | Cross-tag/category overlap likely but not measured; downstream dedup required | One GET/page, ~0.8-1.15s | 0 in sample | One sample; catalog order can change | Best scalable route with bounded deeper pages |
| Category catalog | 2 page-one calls | 20/page; sampled total 26,403 over 1,321 pages; 20/20 exact category | Very deep | Cross-category/tag overlap unknown | One GET/page, ~0.8-1.15s | 0 in sample | One sample; catalog order can change | Strong scalable route with bounded deeper pages |
| Generic search | Not a separate V2 route beyond author/circle; ProviderService can call all pages | 20/page in observed search responses; total query-dependent | Paginated; `searchAll` walks every page | Query overlap unmeasured | Potentially unbounded with `searchAll` | 0 in bounded page samples; no aggregate telemetry | UNKNOWN | Suitable only with explicit page/request budgets, not current `searchAll` |
| Leaderboard | 0 in current recommendation generation | 40 in live sample | No pagination in current SDK method | Overlap with affinity routes unmeasured | One request, ~0.8-1.15s | 0 in sample | One sample; global rankings expected to change | Good bounded exploration/popularity supplement, not personalization |

The measured duplicate rate is therefore **UNKNOWN at the full multi-route pool level**. The current ranker deduplicates by comic ID, and a prior audited run produced 236 unique candidates from 12 seeds, but that aggregate does not identify per-route overlap. V3 telemetry must record raw count, unique count, cross-route overlap, latency, HTTP/result status, and zero-yield rate per route.

The present route budget cannot reliably produce a 500-1,500 candidate pool. Even a generous 10 related items for all 16 seeds plus all current page-one routes yields roughly 320 before deduplication and exact-match filtering. A previous audited run yielded 236 deduplicated candidates from 12 seeds.

The provider itself has enough recall depth: tag/category/search responses are paginated into thousands of pages in broad cases. V3 can reach the target with bounded deeper pagination, more diverse seeds, graph caching, and optionally leaderboard exploration. It must impose per-route budgets, global request budgets, deduplication, timeout/failure telemetry, and freshness rules. Existing `*All` helpers are unbounded and should not be used as an online recall strategy.

## 11 Legacy Backfill Policy

Backfill must preserve semantic honesty.

### A. Can become historical events with explicit legacy labels

- `download_jobs`: derive enqueue/start/terminal events from known timestamps and state; do not invent missing transitions.
- current `shelf_items`: emit one `legacy_shelf_membership_observed` or `legacy_shelf_added` only where `added_at` is trustworthy; removals are unavailable.
- `reading_progress`: emit `legacy_progress_snapshot_observed`, never `reader_opened` or a sequence of checkpoints.
- recommendation sessions: emit `recommend_session_allocated`, never impressions.
- `sync_runs`: operational sync events only, not user preference events.
- provenance: catalog observation events only, not intent.

### B. State snapshots, not events

- current favorite membership;
- current shelf membership;
- current reading position;
- current library membership and favorite sync state;
- current per-item `isLiked` only when a detail response was actually observed.

### C. Inferred features, clearly marked

- probable download completion from terminal job state and local picture state;
- current completion ratio from one progress snapshot and known local page count;
- affinity dimensions from current favorites;
- item-item similarity from shared metadata.

### D. Impossible to reconstruct

- favorite timestamps and favorite/unfavorite history;
- prior reading opens, read count, dwell time, or page sequence;
- provider search/browse history;
- provider download history;
- prior likes/unlikes and follows;
- removed shelf history;
- actual recommendation exposure, viewport impressions, or ignored cards;
- recommendation detail/preview opens before instrumentation.

Backfilled rows require `origin=legacy_backfill`, `confidence`, `source_table`, `backfilled_at`, and a contract version. They must be queryable separately from native V3 events.

## 12 Proposed V3 Data Contract

This is a logical schema draft, not an implementation or migration. Raw facts are immutable/versioned and remain independently queryable; derived scores never overwrite or masquerade as facts.

### `BOOTSTRAP_DATA`

Purpose: what is knowable at enrollment, without pretending it is a timeline.

| Entity | Key | Required fields | Semantics / constraints |
|---|---|---|---|
| `bootstrap_runs` | `run_id` | provider, started/completed time, status, contract version, favorite total, provider sort code, `ordering_semantics`, response fingerprint | One read-only enrollment/snapshot run; `ordering_semantics` defaults `UNKNOWN` |
| `bootstrap_favorite_items` | `(run_id, comic_id)` | provider page/index/rank, observed time, current favorite=true, item snapshot ID | Ordered current membership, never a favorite event/time |
| `bootstrap_item_snapshots` | `snapshot_id` | comic ID, raw provider fields, observed time, response-shape version | Immutable allowlisted provider observation; raw response envelope/secrets excluded |
| `bootstrap_account_snapshot` (optional) | `(run_id, observed_at)` | privacy-approved profile subset and source contract | Exclude email, credentials, token, avatar bytes, and unnecessary identity by default |

### `FIRST_PARTY_EVENTS`

Purpose: append-only user and system-observed interactions after enrollment.

| Field | Type / rule | Meaning |
|---|---|---|
| `event_id` | UUID/ULID primary key | Immutable event identity |
| `occurred_at`, `ingested_at` | UTC timestamps | Client-observed time and durable-write time |
| `event_type`, `schema_version` | controlled strings | Versioned semantics from Section 7 |
| `account_scope_id` | local pseudonymous key | Separates provider/local users without storing login identifiers |
| `comic_id`, `episode_id` | nullable IDs | Subject, when applicable |
| `cycle_id`, `session_id`, `batch_index`, `position` | nullable recommendation context | Exact exposure/action attribution |
| `surface`, `source_context`, `query_id`, `shelf_id`, `download_job_id` | nullable context IDs | Originating workflow without inferred preference score |
| `payload_json` | allowlisted type-specific facts | Page/checkpoint, desired favorite state, ordered batch IDs, etc. |
| `origin` | `native` or `legacy_backfill` | Prevents legacy snapshots from mixing with native events |
| `confidence`, `source_table` | required for legacy only | Backfill uncertainty and lineage |
| `idempotency_key` | unique within event type/source | Deduplicates retries |

The store is append-only except for an explicit privacy deletion/tombstone process. It does not contain model weights such as `favorite = +10`. Raw search text requires a retention/consent decision; a query ID plus normalized/hashed features may be preferable.

### `DERIVED_PROFILE_DATA`

Purpose: reproducible model inputs, never the sole copy of raw facts.

| Entity | Key | Required fields | Semantics |
|---|---|---|---|
| `taste_profile_runs` | `profile_id` | account scope, `as_of`, model version, feature version, bootstrap run, source-event watermark | Reproducible materialization boundary |
| `taste_profile_features` | `(profile_id, window, dimension, feature_key)` | window=`historical/lifetime/recent/session`, value, support count, confidence, first/last evidence time | Derived author/tag/category/circle/novelty features |
| `user_item_state` | `(profile_id, comic_id)` | exposure/open/preview/conversion/consumption aggregates and last times | Derived join for ranking/exclusion; rebuildable from facts |
| `route_priors` | `(profile_id, route)` | yield, engagement, diversity, uncertainty | Learned routing policy, not provider fact |

Positive, negative, exposure, popularity, freshness, and uncertainty components remain separate so a later model can recombine them without rewriting history.

### `ITEM_FEATURES`

Purpose: versioned comic metadata.

| Entity | Key | Required fields | Semantics |
|---|---|---|---|
| `item_feature_snapshots` | `(comic_id, observed_at, source)` | title, raw/normalized author IDs, circle, tags, categories, finished, episode/page counts, provider created/updated times, popularity counters, schema version | Immutable/versioned item observation |
| `item_author_edges` | `(snapshot_id, author_id, role)` | raw value, normalized author, confidence, evidence, review status | Author normalization stays evidence-backed |
| `item_creator_accounts` (optional) | `(snapshot_id, creator_account_id)` | minimal uploader fields and semantic label=`uploader` | Never silently merged with work author |

Popularity counters always carry `observed_at`; a counter delta is derived, not stored as an interaction fact.

### `ITEM_GRAPH_DATA`

Purpose: cached recall relationships.

| Entity | Key | Required fields | Semantics |
|---|---|---|---|
| `item_graph_edges` | `(source_comic_id, target_comic_id, edge_type, observed_at)` | route/seed, provider rank, weight/confidence, source contract, expiry, retrieval run ID | Versioned provider/metadata/behavior-derived edge |
| `recall_route_runs` | `route_run_id` | route, seed/feature, start/end, page/request budget, raw count, unique count, overlap count, status/error class | Yield/cost/failure observability without sensitive bodies |
| `recall_route_items` | `(route_run_id, comic_id)` | raw rank, page, matched feature | Reproducible dedup and ranking input |

Allowed initial edge types are `provider_related`, `same_author`, `same_circle`, `shared_tag`, and `shared_category`. A later `co_consumed` edge is derived from first-party events and must carry model/version provenance. No graph edge implies that the user saw either item.

## 13 Open Questions

1. Does provider favorite `dd`/`da` sort by favorite-add time, comic creation time, comic update time, or another score?
2. What is the exact live schema, retention, and pagination stability of `users/my-comments`?
3. Is there any current provider account endpoint for liked comics that inspected clients do not expose?
4. What are the rate limits and stability guarantees for deeper tag/category/search pagination?
5. Is the related endpoint deterministic over longer periods, personalized, region/account-dependent, or purely item-to-item?
6. What should count as an exposure: batch insertion, card render, or viewport threshold?
7. What local retention/deletion controls are required for raw search text and reading events?
8. Should recommendation learning be per local Windows profile, per provider account, or both?
9. How should offline events be ordered and deduplicated after clock changes or retries?
10. Should comment history be excluded by default because it contains user-authored text and stronger privacy risk?

## 14 Mutation Tests Requiring User Approval

These tests were not run.

1. **MUTATION_TEST_REQUIRED — Favorite ordering semantics:** snapshot page-one IDs for `dd` and `da`, favorite one preselected non-favorite test comic, observe its position once, then restore by unfavoriting. This performs two provider mutations and requires explicit approval plus a restoration plan.
2. **MUTATION_TEST_REQUIRED — Like-history discoverability:** toggle a preselected test comic only if an account-wide liked endpoint is first found; verify inclusion/removal and restore. Requires explicit approval.
3. **MUTATION_TEST_REQUIRED — Comment-history schema only if read-only evidence is insufficient:** a new test comment is not necessary for initial read-only shape validation. Posting/deleting a controlled comment would require separate explicit approval and should only be considered if timestamps or linkage cannot otherwise be established.
4. **Provider related personalization:** comparing two accounts could reveal whether results are personalized, but requires a second authorized account and privacy review. It is not a mutation, yet exceeds this audit's account scope.

## 15 Recommendation V3 Readiness

| Gate | Result |
|---|---|
| Current favorites bootstrap | PASS |
| Item metadata/taxonomy | PASS |
| Candidate recall feasibility | CONDITIONAL PASS; provider depth exists, current implementation is too shallow |
| Favorite recency/history | FAIL / unavailable |
| Provider behavioral history | FAIL / mostly unavailable |
| First-party append-only events | FAIL |
| Exposure semantics | FAIL; current `recommendation_seen` is allocation |
| Legacy backfill honesty | DESIGN READY |
| V3 data contract | PROPOSED, not implemented |
| Overall | **BLOCKED** |

**Blocking gaps:**

1. No append-only first-party event store or versioned event contract exists.
2. There is no defensible exposure event; `recommendation_seen` is allocation and cannot supply impression negatives.
3. Search, recommendation open/preview, shelf removal, and reader-open/completion context is lost.
4. Download state is useful but lacks append-only transitions and exact recommendation session/batch/rank attribution.
5. Current recall budgets cannot reliably supply 500-1,500 unique candidates, and per-route yield/overlap/failure telemetry is absent.
6. Raw facts, item observations, event facts, and derived profiles are not yet separated in a frozen implemented contract.

**Non-blocking gaps (must be documented or feature-gated):**

1. Favorite chronology is unavailable; V3 can proceed without it if `dd`/`da` is never labeled or weighted as favorite recency.
2. `users/my-comments` live shape/retention remains unvalidated and should be opt-in or excluded initially.
3. `_creator` and other undeclared response fields need type hardening, but uploader identity is not required for first V3.
4. Existing empty lifecycle/profile tables can remain unused until an explicit migration plan exists.
5. Related stability and deeper-pagination rate limits need telemetry, not a blocking mutation test.

Recommended next gate: approve and implement the minimum event contract, beginning with `recommend_batch_shown`, recommendation opens/previews, search-to-open, confirmed favorite transitions, download lifecycle, and reader open/progress/completion. In parallel, perform a separate read-only validation of `users/my-comments`. Do not block cold-start work on mutation tests, but do block all “favorite recency” claims until ordering semantics are proven.

## Audit Environment Snapshot

The existing local validation database was opened read-only. It contained 2,051 comics, 1,786 current favorites, 7 sync runs, 5 recommendation sessions, and 221 allocated recommendation IDs. It contained no shelf items, reading progress, or download jobs, so those schema capabilities were verified statically and by tests rather than by claiming actual user activity.

Provider validation used authenticated read-only GET/search calls through the project's SDK. It made no favorite, like, comment, profile update, punch-in, download, commit, push, or release mutation.
