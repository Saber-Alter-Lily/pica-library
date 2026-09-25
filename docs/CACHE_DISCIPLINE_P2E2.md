# Cache Ownership and Provider-Scope Discipline — P2 E2

Status: **critical cache inventory documented / provider-backed Preview and Online Reader caches partitioned by source identity**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-E Snapshot/cache discipline.

Dependency: P2-E1 made the Desktop cover cache source-version aware.

## Design references

E2 follows two established cache-design principles rather than inventing a Pica-specific invalidation model:

- image pipelines such as Coil allow request/source identity to participate in memory and disk cache keys instead of assuming the visible resource ID is sufficient;
- browser/network stacks such as Chromium partition shared caches by request context so one security/account context cannot silently reuse another context's cached representation.

The project-level rule is therefore:

> A cache entry may be reused only when the identity that made the representation authoritative is still the identity requesting it.

TTL and LRU remain eviction mechanisms. They are not substitutes for source/account/generation identity.

## Critical cache inventory

| Cache / snapshot | Owner | Key / identity | Authoritative invalidation | Scope | E2 status |
| --- | --- | --- | --- | --- | --- |
| Desktop cover disk cache | `LibraryService.cover()` | one slot per comic + E1 source fingerprint | comic/provider/remote ID + cover URL + provider `updatedAt` | local Desktop library | E1 complete |
| Provider Preview disk cache | `PreviewService` + `PreviewCacheManager` | logical comic/episode/page slot + source fingerprint | provider/account/surface/revision scope + actual page locator | current connected provider context | **E2 hardened** |
| Provider Preview route authorization | `PreviewService` | logical comic/episode/page | page must have been prepared under current provider scope | current server process/provider scope | **E2 hardened** |
| Online Reader album metadata | `OnlineReaderService` | provider scope + comic ID | provider/account/surface/revision scope change | current server process/provider scope | **E2 hardened** |
| Online Reader chapter/page metadata | `OnlineReaderService` | provider scope + comic ID + episode ID | provider/account/surface/revision scope change | current server process/provider scope | **E2 hardened** |
| Online Reader page disk cache | `OnlineReaderService` + `PreviewCacheManager` | logical comic/episode/index + source fingerprint | provider scope + actual page locator | current connected provider context | **E2 hardened** |
| Online Reader in-flight image dedupe | `OnlineReaderService` | logical page + source fingerprint | source/account change creates a distinct pending key | current process | **E2 hardened** |
| Visual remote sample cache | `VisualStyleService` | random `visual:<uuid>` token | new sampling run gets new tokens; TTL/size removes old samples | one explicit analysis sampling run | acceptable; no cross-run reuse |
| Final V3 frozen serving snapshot | `CycleCoordinatorV3` | cycle ID → pool ID + ownership key | pool change or ownership key change | one recommendation cycle | existing explicit generation/ownership invalidation |
| Web Visual similar-result memoization | `web/visual-qc.js` | current UI analysis state + comic lookup map | state reload/re-analysis clears process-memory state | one browser page lifetime | process-local only; continue P2-F audit |
| Android unified catalog | `UnifiedCatalogStore` | persistent catalog schema + comic identity | Desktop refresh timestamp / remote generation / local reference reconciliation | app data profile | existing generation-aware source merge |
| Android portable recommendation package | `PortableRecommendationPackageStore` | package generations (policy/visual/canonical/reservoir) | newly synchronized generation replaces prior package | app data profile/device | existing generation-aware |
| Android recommendation policy | `RecommendationPolicyStore` | remote revision + synced base + local mutation journal | explicit sync/merge; dirty mutations remain separate | app data profile/device | existing revision/base authority |
| Android native recommendation snapshot | `NativeRecommendationStore` | cycle + favorite fingerprint + registry fingerprint/readiness | favorite fingerprint changes or explicit cycle replacement | app data profile/device | existing fingerprint invalidation |
| Android cover memory/disk cache | `CoverRepository` | comic + source locators + catalog `updatedAt` | key changes with source/version identity | app data profile/device | existing source-aware reference design |

This inventory is intentionally limited to caches and snapshots that can outlive one local function call or materially affect visible state. Temporary Maps used only during a single computation are not promoted to cache-governance objects.

## E2 problem

Before E2, Preview and Online Reader provider-backed entries used keys based only on visible content identity:

- Preview: `comicId:episodeId:pageIndex`;
- Online Reader albums: `comicId`;
- Online Reader chapter metadata: `comicId:episodeId`;
- Online Reader page cache: `comicId:episodeId:pageIndex`.

The provider authority can change while the Desktop engine remains alive:

- Pica credentials can be replaced in Settings;
- E-H session can be saved, replaced, or cleared;
- E-H content may switch between E-H and ExH surfaces;
- provider metadata may expose a newer comic revision;
- a page locator may change while the logical page index is stable.

The old key space could therefore outlive the authority that generated it.

## Provider cache scope

`ProviderService.cacheScope(comicId)` now supplies the request partition.

### Pica

The scope contains:

- provider = Pica;
- SHA-256 of the configured account identifier;
- current stored provider comic `updatedAt`.

The raw account is not returned.

The password is not part of the persisted/cache-visible key. A password/account change also resets the cached authenticated Pica SDK instance so subsequent requests authenticate with the newly saved credentials.

### E-H / ExH

The scope contains:

- provider = E-H;
- selected surface (`eh` or `exh`);
- SHA-256 of the current normalized E-H session identity;
- current stored provider comic `updatedAt`.

The session hash is derived from member ID/pass hash/igneous/CF clearance, but none of those raw values are returned or persisted in cache metadata.

Changing or clearing the session therefore changes the partition even when the comic ID is unchanged.

## Source fingerprint

Provider-backed page caches keep the existing logical disk slot, but cache validation adds:

`SHA-256(providerScope + "\n" + pageLocator)`

Only the digest is written to Preview cache metadata.

The raw:

- account;
- password;
- E-H cookies/session values;
- provider scope string;
- page locator URL

are not written to that metadata.

A source change replaces the same logical slot after the next prepare/read, so E2 does not accumulate historical account/source versions.

## Preview route discipline

A subtle problem remains if a browser already knows:

`/api/v1/previews/<comic>/<episode>/<index>`

and the provider account changes before another `prepare()`.

For that reason `PreviewService` now keeps a bounded process-memory map of pages successfully prepared under the current provider scope.

`page()` serves the disk entry only when:

1. that logical page was prepared during the current process;
2. the prepared provider scope still equals the current provider scope;
3. the stored source fingerprint still matches.

A scope change makes the old route unavailable until a fresh prepare resolves the current page locator and refreshes/revalidates the cache.

This map is bounded to 128 logical pages and is cleared with the Preview cache.

## Online Reader discipline

### Album/chapter metadata

Album and chapter Maps are now keyed by provider scope as well as comic/episode identity.

Changing account, E-H session/surface, or stored provider revision creates a fresh metadata namespace rather than returning old episode/page metadata.

### Page data

The disk page slot remains logically stable, but validation requires the provider-scope + page-locator fingerprint.

### In-flight requests

Pending image requests are keyed by logical page **and** source fingerprint.

A source/account switch therefore cannot attach a new request to an old-scope promise that is still in flight.

## Pica authenticated SDK lifetime

Desktop Settings can update Pica account/password without changing the library directory.

Before E2, `LibraryService.connect()` could keep the already authenticated `Pica` object in `this.pica`, meaning environment/config credentials changed while the live request authority did not.

E2 adds `LibraryService.resetPicaSession()`.

Desktop detects a saved Pica account/password change, applies the new credentials, then clears the cached SDK session. The next connected request creates/login a fresh Pica client from the new credentials.

This keeps provider requests and cache scope aligned.

## Regression requirements

E2 tests require:

1. Pica cache scope changes when account changes and does not reveal the account;
2. E-H cache scope changes between anonymous/session A/session B and does not reveal raw session fields;
3. ExH-capable session context is distinct from anonymous E-H context;
4. provider comic revision changes the cache scope;
5. Preview repeated unchanged prepare hits cache;
6. provider scope change makes the previously prepared Preview route unavailable before re-prepare;
7. re-prepare under the new scope refetches;
8. page locator change under the same scope refetches;
9. Preview cache metadata contains a fingerprint but no raw locator/scope;
10. Online Reader album/chapter/page data is independently loaded after scope change;
11. concurrent same-scope page requests remain deduplicated;
12. Desktop source contract resets the cached Pica SDK when persisted Pica credentials change.

## Deliberate non-scope

E2 does not:

- create a durable offline Online Reader cache contract;
- change Preview/Online Reader TTL or size limits;
- persist raw provider account/session identity in cache metadata;
- add generic periodic cache probes;
- wipe all caches on every settings save;
- change provider authentication/retry/rate-limit behavior;
- change Android cache formats;
- change recommendation snapshot semantics;
- add cache sharing across different local user profiles.

## Next P2-E work

After E2:

1. verify the remaining browser/process-memory caches have explicit page/session ownership and cannot survive an authority switch;
2. audit Android persistent stores for explicit account/profile namespace if multiple provider accounts are ever supported concurrently;
3. audit cache cleanup/size observability separately from correctness invalidation;
4. move to P2-F observer/poller discipline once no critical long-lived cache lacks an explicit owner/key/invalidation authority.
