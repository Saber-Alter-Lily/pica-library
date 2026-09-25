# Desktop Cover Cache Source Identity — P2 E1

Status: **source-aware invalidation implemented / cache size and memory policy unchanged**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-E Snapshot/cache discipline.

## Problem

Desktop cover caching previously used:

- disk file identity = SHA-256 of `comicId`;
- metadata = `{ contentType }`.

Once an image and valid MIME type existed, `LibraryService.cover()` returned that disk entry indefinitely.

The authoritative comic row could later change:

- `coverUrl`;
- provider/remote identity;
- provider metadata revision represented by `updatedAt`.

Because none of those values participated in cache validation, the old bitmap could silently remain authoritative forever.

This differs from the existing Android `CoverRepository`, whose established cache version identity already includes comic identity, provider/source locators and a stable catalog timestamp. E1 reuses that proven design principle instead of introducing a separate Desktop cache model.

## E1 cache contract

### File ownership

Desktop continues to own one disk slot per comic under:

`<dataDir>/cover-cache/`

The image and metadata filenames remain derived from:

`SHA-256(comicId)`.

E1 deliberately does **not** place the source version in the filename. A source change atomically replaces the existing slot rather than accumulating historical cover versions on disk.

### Source fingerprint

For each request, Desktop computes:

`SHA-256(comicId + providerId + providerRemoteId + coverUrl + updatedAt)`

with stable newline separators.

The fingerprint captures:

- local comic identity;
- provider identity;
- provider remote identity/locator;
- the current trusted cover URL;
- the provider/catalog source revision exposed as `updatedAt`.

The current cache metadata is:

```json
{
  "contentType": "image/jpeg",
  "sourceFingerprint": "<sha256>"
}
```

The raw cover URL is **not** written to the metadata file.

### Cache hit

A disk entry is reusable only when:

1. cached content type is still a permitted raster MIME type;
2. cached `sourceFingerprint` exactly equals the current comic fingerprint;
3. the image file can be read.

An unchanged comic therefore keeps the existing no-network cache hit.

### Cache miss / stale entry

A missing, invalid, legacy or stale metadata entry follows the existing provider fetch path.

The new image and metadata still publish through `.part` files followed by rename, preserving the current last-known-good/atomic replacement discipline.

## Why include updatedAt when coverUrl is unchanged

Some provider/CDN cover locators can remain stable while the underlying image is replaced.

If the provider reports a newer metadata revision while retaining the same locator, a URL-only cache identity would still keep the old image indefinitely.

E1 therefore includes the source `updatedAt`, matching the Android cache's existing use of stable catalog revision context.

This can cause a refetch when unrelated provider metadata changes. That is a conservative correctness tradeoff: unchanged metadata revisions remain cache hits, while authoritative source changes cannot leave a permanently stale bitmap.

`lastSeenAt` is intentionally not part of the fingerprint because routine sync observation would churn it even when provider metadata did not change.

## Legacy migration

Existing Desktop cache metadata has no `sourceFingerprint`.

E1 treats that entry as stale once:

1. provider fetch refreshes the image;
2. metadata is rewritten with the current fingerprint;
3. subsequent unchanged requests become cache hits again.

No explicit cache migration or destructive directory wipe is required.

## Regression evidence

The E1 unit regression uses a real Library SQLite database and an injected fake Pica provider.

It requires:

1. first cover request → provider fetch, `cached=false`;
2. second unchanged request → disk cache hit, no additional provider fetch;
3. changed `coverUrl` + newer `updatedAt` → provider refetch;
4. unchanged new source → cache hit;
5. same URL + newer provider `updatedAt` → provider refetch;
6. unchanged revision after that → cache hit;
7. metadata contains a 64-character fingerprint and does not contain the raw cover URL;
8. legacy metadata containing only `contentType` → one refresh, then stable hits.

## Deliberate non-scope

E1 does not:

- change Android cover caching;
- add a Desktop memory LRU;
- change cache size/eviction policy;
- create historical cover versions;
- change provider networking, authentication or retry policy;
- add a remote probe when the source identity is unchanged;
- change ordinary cover API responses;
- make cached images authoritative over the Library database.

## Next P2-E work

After E1:

1. inventory other long-lived Desktop/Web caches and record owner/key/invalidation authority;
2. distinguish caches keyed by explicit generation/revision from caches that rely only on path/time;
3. audit portable/catalog/Visual/recommendation caches for cross-user/device identity leakage;
4. avoid generic TTL replacement when an authoritative generation or source revision exists.
