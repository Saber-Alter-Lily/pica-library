# Selection Status Render Authority — P2 F3

Status: **Library / Recommendation / Search selection streams now update only their matching selection bar**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-F Frontend responsiveness and observer discipline.

Dependencies:

- F1 removed redundant Theme idle polling.
- F2 removed the body-wide UX polish observer and split Settings / Downloads ownership.

## Finding

`web/ui-polish-v5.js` owns three independent selection bars:

- Library;
- Recommendation;
- Online Search.

Each bar already has a distinct status source:

- `#library-selection-status`;
- `#recommend-selection-status`;
- `#search-selection-status`.

However, the observer installer previously created one observer per source and gave **every observer the same callback**:

1. update Library selection bar;
2. update Recommendation selection bar;
3. update Search selection bar.

A change to one status stream therefore recalculated two unrelated UI regions.

This did not usually produce visible incorrectness, but it violated the P2-F ownership rule:

> one status update should not rebuild unrelated page sections.

## F3 change

Observer registration is now explicit data:

```js
[
  ['#library-selection-status', updateLibrarySelectionBar],
  ['#recommend-selection-status', updateRecommendationSelectionBar],
  ['#search-selection-status', updateSearchSelectionBar]
]
```

Each source gets one MutationObserver whose callback invokes only its matching render function.

The observed mutation types remain unchanged:

- `childList`;
- `characterData`;
- `subtree`.

The selection-detection logic itself is unchanged.

## Authority model

### Library

Owner:
`#library-selection-status`

Render authority:
`updateLibrarySelectionBar()`

Affected region:
`#ux-library-selection`

### Recommendation

Owner:
`#recommend-selection-status`

Render authority:
`updateRecommendationSelectionBar()`

Affected region:
`#ux-recommend-selection`

### Search

Owner:
`#search-selection-status`

Render authority:
`updateSearchSelectionBar()`

Affected region:
`#ux-search-selection`

No selection stream is allowed to trigger the other two render authorities merely because its text changed.

## Regression contract

The Web UX source contract requires all three selector/render pairs to be present.

It also forbids the former callback sequence that invoked:

- `updateLibrarySelectionBar()`;
- `updateRecommendationSelectionBar()`;
- `updateSearchSelectionBar()`

inside every selection-status observer.

The existing browser smoke continues to validate ordinary selection UI behavior end to end.

## Preserved behavior

F3 does not change:

- selection storage/state;
- selected-card CSS;
- bulk-action behavior;
- add-to-shelf behavior;
- clear-selection behavior;
- selection text wording;
- Library/Recommendation/Search rendering;
- observer mutation types;
- scroll/focus behavior.

## Deliberate non-scope

F3 does not:

- replace MutationObserver with custom events;
- change result-card selection implementation;
- modify Recommendation or Search result observers;
- alter Settings/Downloads scoped observers from F2;
- audit backend polling;
- narrow the remaining body-wide observers.

## Next P2-F work

After F3, the highest-confidence remaining browser observer issue is `v040-parity.js`:

- it observes the complete body subtree;
- it is not coalesced;
- every mutation can synchronously traverse all visible `.tag` and `[data-eh-category]` elements;
- it also checks detail-author enhancement.

The next batch should make that translation/detail augmentation incremental and coalesced without changing translation semantics.
