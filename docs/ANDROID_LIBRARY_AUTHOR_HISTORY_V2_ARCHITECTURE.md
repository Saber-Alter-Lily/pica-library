# Android Library / Author / Reading History V2 Architecture

Status: **development authority for PR #35**

This document freezes the Android data/navigation contract for the next PR #35 product pass. UI may be refined after device QA; the data invariants below must not be reversed to satisfy layout convenience.

## 1. Library Filter V2: orthogonal dimensions

The legacy Android library filter mixes replica location with provider identity (`PHONE`, `DESKTOP`, `WEBDAV`, `PICA`). That model is no longer valid after E-H integration.

V2 separates:

### Readable location

- `PHONE`
- `DESKTOP`
- `WEBDAV`
- `ONLINE`

### Online provider

- `PICA`
- `EH`
- `EXH`

Provider selection is meaningful only for online-capable records. ExH remains an optional E-H capability and is never treated as a required core provider.

Other independent dimensions remain:

- shelf membership;
- creator/author concepts;
- tags;
- categories;
- completion state;
- tag match mode.

Sorting is not a filter dimension. It is rendered outside the filter dialog.

### Migration

Legacy persisted source values migrate idempotently:

- `PHONE` -> location `PHONE`
- `DESKTOP` -> location `DESKTOP`
- `WEBDAV` -> location `WEBDAV`
- `PICA` -> location `ONLINE` + provider `PICA`

The V1 preference keys remain readable for migration but V2 becomes the write authority.

## 2. Creator identity: concept first, provider binding second

A creator shown in UI is not a provider-specific search string.

Use a source-neutral creator concept derived from the strongest available identity evidence:

```text
CreatorConcept
  conceptId
  canonicalName
  aliases[]
  circles[]
  roles[]
  confidence
  workIds[]

CreatorBinding
  conceptId
  providerId       // pica | eh
  rawName
  providerCanonical
  role             // author | artist | group
  workIds[]
```

Authority order:

1. existing `authorId` + `canonicalAuthor` from the unified catalog / Desktop author normalization;
2. exact normalized match to a known canonical name or alias;
3. Pica `Circle (Creator)` parsing when unambiguous;
4. E-H `artist:` binding;
5. E-H `group:` binding only as a group/circle creator concept when no artist identity is available.

`artist:` and `group:` must not be silently collapsed into the same person identity.

A concept may have both Pica and E-H bindings. Provider-specific retrieval always uses its own binding:

- Pica -> Pica author/text query;
- E-H -> exact `artist:"name$"` where an artist binding exists;
- ExH -> same E-H canonical binding, but only when the optional ExH capability is currently available.

## 3. Creator navigation

Comic detail creator text is actionable.

Navigation is deliberately two-stage:

```text
Comic Detail
  -> Creator Directory (selected/matching concept highlighted)
      -> Creator Works
```

Do not skip Creator Directory even for an exact match. The directory is the auditable place where aliases and source bindings are exposed.

Creator Works defaults to `ALL CORE SOURCES` and supports source filtering. ExH appears only as an optional extension when currently available.

Known local/catalog works and online-retrieved works are deduplicated by comic id. Cross-provider work equivalence remains a future Work/Edition concern; do not invent cross-provider work identity here.

## 4. Reading history is not bookmark state

`ReaderProgress` remains the latest-position/bookmark authority. It must not become the historical event store.

Create a separate reading history ledger:

```text
ReadingSession
  sessionId
  comicId
  chapterId
  titleSnapshot
  authorSnapshot
  chapterTitleSnapshot
  providerId
  sourceKind
  firstPage
  lastPage
  startedAt
  lastReadAt
  deviceId
  legacySnapshot
```

One reader session updates one ledger record while the reader remains active. It does not append one record per page.

If a reader session crosses a local calendar date, a new history session is started for the new day.

New mobile reading writes history regardless of whether portable progress sync succeeds.

## 5. Legacy history import

Existing latest-position sources may be imported once as `legacySnapshot=true`:

- Android `ReaderProgress` bookmarks;
- Desktop recent records when reachable;
- WebDAV reading entries when reachable.

Because historical timestamps have already been overwritten in these stores, migration must not fabricate a full timeline. Each surviving latest-position item yields at most one legacy history record.

## 6. History UI

History is not a bottom navigation destination.

Primary entry: compact history action in the Library title row.

The history page supports:

- Today;
- last 7 days;
- last 30 days;
- all;
- direct date selection;
- grouping by local calendar date;
- jump/scroll to the selected date;
- open comic detail;
- continue reading from the recorded chapter/page when a compatible source remains available.

## 7. Library / online layout rules

Library normal state should show only:

- title + secondary actions;
- search;
- Filter button with active count;
- Sort button;
- result count;
- collection.

Advanced location/provider/tag matching options live behind progressive disclosure.

Online E-H compact actions must remain single-line on narrow phones and with increased font scale. Search receives flexible width; Browse and Filter use compact single-line actions. Active filter count is a compact badge/short label, not a reason to wrap the toolbar.

## 8. Detail page hierarchy

Detail page visual hierarchy:

1. cover + title;
2. actionable creator identity;
3. compact provider/rating/status metadata;
4. translated tags;
5. primary actions (favorite / shelf);
6. source/replica disclosure;
7. chapters and reading/download actions.

Provider provenance is informative metadata; it must not dominate the hero area.

## 9. Release gate

This pass remains development-only until all are true:

1. V1 -> V2 filter migration tests pass;
2. creator concept/binding tests cover Pica canonical aliases and E-H artist/group distinctions;
3. creator directory -> works navigation is device-tested;
4. reading history ledger, legacy import, range filtering and date jump tests pass;
5. Pica and E-H reader regressions pass;
6. narrow-screen online toolbar does not wrap in normal device QA;
7. Android unit/lint/release build and isolated Dev APK pass;
8. no merge, public release or formal OTA occurs without explicit authorization.
