# E-H Semantic / Favorites / Recommendation Architecture

Status: **development authority for PR #35**

This document freezes the data contract for E-H browse, Chinese tag presentation, filtering, favorites, cross-provider recommendation, and ExH capability handling. UI may evolve; these invariants must not.

## 1. Provider facts, roles, and identity

- Pica and E-H are independent **CORE** retrieval sources.
- ExH is an authenticated **OPTIONAL_CAPABILITY** of the E-H account/session, not a third identity provider and not a prerequisite for E-H support.
- `ALL` is an aggregate view, not a provider.
- E-H comic identity remains `eh:<gid>:<token>`.
- Provider source bindings (`eh`, `exh`) are availability/provenance, not separate works.
- Translation text is never identity.
- ExH entry points and capability monitoring remain present even when the current account/session cannot access ExH.
- Product wording must describe observed state rather than make permanent entitlement claims. Prefer `当前可用`, `当前不可访问`, `暂无法确认`, or `待检查`; do not infer a permanent account restriction from one failed probe.

The product role model is therefore:

```text
Pica        CORE
E-Hentai    CORE
ExHentai    OPTIONAL_CAPABILITY(parent = E-H)
```

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

ExH does not create a separate preference identity or a second favorite profile. The E-H account/favorite profile is shared; ExH only contributes additional retrieval coverage when that surface is currently reachable.

## 5. Unified interest resolution

`MobileTagRegistry` remains the frozen Pica Recommendation V3 authority.

A provider-aware resolver maps inputs to unified interest concepts:

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

## 6. Recommendation evidence and provider roles

Cross-provider recommendation keeps the existing principle:

> preference source != retrieval source

A favorite from E-H may retrieve Pica candidates and vice versa.

Base preference construction uses Pica and E-H evidence. ExH is not a required preference source and must never be a Recommendation readiness dependency.

The intended flow is:

```text
Pica favorites ─┐
                ├─> Unified interests ─> Pica recall
E-H favorites ──┘                     ├─> E-H recall
                                      └─> ExH recall, only when capability is currently available
```

If ExH is unavailable, unknown, or temporarily unreachable:

- recommendation generation continues;
- readiness is unchanged;
- Pica/E-H scoring is unchanged;
- no error is surfaced merely because the optional ExH route was skipped.

Derived evidence should carry at least:

```text
comicId
provider
kind
weight
```

Initial weighting may keep current behavior, but the resolver must expose provenance so weighting can be tuned later without schema migration.

## 7. ExH capability monitoring

ExH state is monitored separately from E-H account validity.

Persisted states:

- `AVAILABLE`
- `CURRENTLY_UNAVAILABLE`
- `NETWORK_ERROR`
- `UNKNOWN`
- `NOT_CONNECTED`

Monitoring rules:

- account/session changes invalidate cached ExH capability state;
- automatic checks are opportunistic and TTL-controlled rather than performed on every request;
- successful or currently-unavailable checks may be cached for several hours;
- network-error checks use a shorter retry interval;
- manual `重新检查 ExH` forces a new probe;
- losing ExH capability must not clear the E-H account or E-H favorites;
- E-H browsing/reading must not depend on ExH state.

ExH-specific browse/read operations may consult this capability cache before accessing the ExH surface.

## 8. Online filtering is provider-aware

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

## 9. Browse surfaces

E-H Online `浏览` may expose native capabilities without pretending they are identical to Pica:

- 最新
- 热门 (Popular)
- 我的收藏
- 关注 (Watched)
- 分类
- 排行榜 (Toplists)

Popular and Toplists are distinct concepts.

ExH retains its own selectable entry point and supported browse/filter actions. The UI may label it as an optional extension and show its latest monitored state. It must not be hidden merely because the current state is unavailable.

`全部来源` treats Pica/E-H failures as core-source degradation. ExH failure alone must not produce a generic `部分来源不可用` warning.

## 10. Migration and compatibility

- Existing `unified-catalog-v1.json` remains readable.
- Existing `eh-favorites-v1.json` migrates idempotently.
- New stores must tolerate missing fields.
- Translation update failure cannot make existing catalog/favorites unreadable.
- Recommendation must continue to work with old flat tags while the semantic store backfills naturally from refreshed E-H metadata.
- Missing ExH capability state defaults to `UNKNOWN`, never to a permanent denial.

## 11. Release gate

This work remains development-only in PR #35 until:

1. schema migration tests pass;
2. E-H favorite category sync is manually verified;
3. Chinese tag display and reverse search are manually verified;
4. cross-source recommendation still produces deterministic/valid output with ExH both available and skipped;
5. ExH capability cache/manual refresh behavior is manually verified;
6. Android unit/lint/release build and side-by-side Dev APK pass;
7. public-release licensing/attribution is reviewed.

No merge or public release is authorized by this document.
