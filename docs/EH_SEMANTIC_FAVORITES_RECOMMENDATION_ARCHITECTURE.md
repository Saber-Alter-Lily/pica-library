# E-H Semantic / Favorites / Recommendation Architecture

Status: **development authority for PR #35**

This document freezes the data contract for E-H browse, Chinese tag presentation, filtering, favorites, and cross-provider recommendation. UI may evolve; these invariants must not.

## 1. Provider facts and identity

- Pica and E-H are independent retrieval providers.
- ExH is an authenticated E-H surface, not a third identity provider.
- E-H comic identity remains `eh:<gid>:<token>`.
- Provider source bindings (`eh`, `exh`) are availability/provenance, not separate works.
- Translation text is never identity.

## 2. Lossless E-H semantics

E-H metadata from gdata contains namespaced tags such as:

- `parody:one punch man`
- `character:tatsumaki`
- `artist:...`
- `group:...`
- `female:...`
- `male:...`
- `mixed:...`
- `language:...`
- `location:...`
- `other:...`
- `reclass:...`

The namespaced representation is authoritative. It must be persisted losslessly.

`UnifiedCatalogStore.Entry.tags` remains the provider-neutral display/search compatibility field. It must not become the sole E-H semantic store.

A separate E-H semantic store persists, per comic:

```text
comicId
rawCategory
surfaceBindings[]
rawTags[]
  namespace
  value
  canonical = namespace:value
updatedAt
```

No Chinese translation is persisted as canonical identity.

## 3. Translation is a presentation/search alias layer

Chinese namespace/category names may be built in because they are stable UI vocabulary.

Full E-H tag translation is an optional/updateable local data layer sourced from EhTagTranslation. Its role is:

- display Chinese label when available;
- Chinese tag suggestion;
- Chinese -> canonical E-H query mapping;
- optional descriptions/help.

It must not:

- replace raw E-H tags;
- determine provider identity;
- silently become the recommendation canonical key.

If translation data is missing, stale, or unavailable, E-H browse/search/recommendation must continue with canonical raw tags.

The translation database has its own license/attribution requirements. Do not silently vendor the full database into a public release. Development builds may download/update it separately with attribution. Public release requires license/notice review and any upstream-use notice requested by the data project.

## 4. Favorite provenance vs preference evidence

Authoritative favorite provenance remains separate:

- Pica cloud favorite;
- E-H cloud favorite;
- E-H local favorite;
- local shelf;
- phone/desktop/cloud download/read evidence.

The E-H cloud favorite model preserves:

- comic id;
- favorite slot `0..9` when known;
- user-defined favorite category names and counts;
- optional note only when explicitly fetched/edited.

Custom favorite category names and notes are organization metadata. They are not semantic preference labels by default.

Recommendation consumes a derived evidence layer. It never rewrites authoritative favorite provenance.

## 5. Unified interest resolution

`MobileTagRegistry` remains the frozen Pica Recommendation V3 authority.

A new provider-aware resolver maps inputs to unified interest concepts:

### Pica

Use `MobileTagRegistry.resolve(rawTag)` unchanged.

### E-H

1. Preserve and inspect namespace.
2. Attempt value-level mapping through the existing Pica registry/aliases where useful.
3. Apply namespace-aware fallback facets when no Pica canonical mapping exists:

- `parody` -> fandom/IP
- `character` -> fandom/character
- `artist`, `group`, `cosplayer` -> creator
- `female`, `male`, `mixed`, `location`, `other` -> semantic traits
- `language` -> filtering/presentation; weak or excluded from preference ranking by default
- `reclass` -> classification; not a primary preference signal

Translation labels may be shown to users but must not be the ranking identity.

## 6. Recommendation evidence

Cross-provider recommendation keeps the existing principle:

> preference source != retrieval source

A favorite from E-H may retrieve Pica candidates and vice versa.

Derived evidence should carry at least:

```text
comicId
provider
kind
weight
```

Initial weighting may keep current behavior, but the resolver must expose provenance so weighting can be tuned later without schema migration.

## 7. Online filtering is provider-aware

Do not overload local `UnifiedLibraryFilter` with E-H server query semantics.

Use a separate online filter model.

For E-H it can express:

- category bitmask;
- include canonical tags;
- exclude canonical tags;
- language;
- minimum rating;
- page-count range;
- advanced search flags;
- browse mode (`latest`, `popular`, `watched`, `toplist`);
- toplist period;
- favorite slot for favorite routes.

Chinese UI chips map back to canonical E-H query syntax before requests are sent.

## 8. E-H browse parity

E-H Online `浏览` may expose native capabilities without pretending they are identical to Pica:

- 最新
- 热门 (Popular)
- 我的收藏
- 关注 (Watched)
- 分类
- 排行榜 (Toplists)

Popular and Toplists are distinct concepts.

## 9. Migration and compatibility

- Existing `unified-catalog-v1.json` remains readable.
- Existing `eh-favorites-v1.json` migrates idempotently.
- New stores must tolerate missing fields.
- Translation update failure cannot make existing catalog/favorites unreadable.
- Recommendation must continue to work with old flat tags while the semantic store backfills naturally from refreshed E-H metadata.

## 10. Release gate

This work remains development-only in PR #35 until:

1. schema migration tests pass;
2. E-H favorite category sync is manually verified;
3. Chinese tag display and reverse search are manually verified;
4. cross-source recommendation still produces deterministic/valid output;
5. Android unit/lint/release build and side-by-side Dev APK pass;
6. public-release licensing/attribution is reviewed.
