# Incremental Parity DOM Mutation Processing — P2 F4

Status: **v0.4 parity observer coalesced and changed from full-document rescans to changed-subtree processing**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-F Frontend responsiveness and observer discipline.

Dependencies:

- F1 removed redundant Theme idle polling.
- F2 scoped UX polish observers to Settings / Downloads ownership.
- F3 gave each selection-status stream one matching render authority.

## Open-source reference pattern

F4 follows a pattern used in mature browser applications such as VS Code:

- inspect MutationObserver records rather than assuming every mutation invalidates the entire document;
- process only relevant added/removed nodes;
- skip unrelated high-frequency mutations;
- coalesce DOM work at the next animation frame.

This is preferable to replacing a broad observer with an arbitrary timer or a second parallel authority.

## Finding

`web/v040-parity.js` owns several presentation-only compatibility features:

- Chinese E-H tag/category aliases;
- author-link enhancement inside comic detail;
- E-H browse/filter parity;
- history/author navigation.

Its observer previously did:

```js
new MutationObserver(() => {
  translateVisibleTags()
  enhanceDetailAuthor()
})
```

on the complete `document.body` subtree.

### Cost of the old callback

Every child mutation caused:

1. a full query for every `.tag` in the document;
2. a full query for every `[data-eh-category]`;
3. a detail-author lookup/check.

That includes mutations unrelated to parity:

- Library selection/status changes;
- recommendation feedback;
- download progress;
- Settings UI;
- Reader changes;
- Visual/Work Identity dialogs;
- other extension layers.

The callback was not coalesced.

### Self-generated mutations

The translation pass wrote `textContent` for translated tags/categories.

Because the same body observer watches child-list changes, those writes can themselves create additional mutation notifications.

The previous implementation also rewrote category text even when the desired label had not changed.

## F4 translation scope

`translateVisibleTags(root = document)` now accepts a root.

`elementsWithin(root, selector)` returns:

- the root itself when it matches;
- matching descendants.

Full-document translation remains available for explicit authority events:

- translation database load;
- language change.

Ordinary DOM mutations do not call the full-document path.

## F4 mutation queue

The body MutationObserver remains as the single compatibility-layer entry point because parity tags can appear across several dynamically created surfaces.

However, its callback now:

1. reads the MutationObserver records;
2. collects only added/changed element subtrees into `pendingRoots`;
3. marks detail-author work only when the mutation touches `#recommend-detail-content`;
4. schedules at most one `requestAnimationFrame`;
5. translates only the collected roots;
6. runs `enhanceDetailAuthor()` only when detail content was touched.

Removed-only unrelated mutations create no parity work.

## Self-mutation guard

Tag/category text is written only when the current text differs from the desired translated value:

```js
if (tag.textContent !== translated) ...
if (node.textContent !== translated) ...
```

Therefore a translation-generated child mutation is harmless on the next coalesced pass: the translated node is checked but not written again.

The existing raw-value preservation through `data-raw-value` remains unchanged.

## Detail-author boundary

F4 does not run author enhancement after every body mutation.

It marks `detailDirty` only when:

- the mutation target is/inside `#recommend-detail-content`; or
- an added subtree is/contains that detail root.

The existing `data-v040-author` idempotence guard remains authoritative.

## Regression contract

The v0.4 Web parity source contract now requires:

- `translateVisibleTags(root = document)`;
- `elementsWithin(root, selector)`;
- `pendingRoots = new Set()`;
- MutationObserver processing of `mutation.addedNodes`;
- animation-frame coalescing;
- scoped `translateVisibleTags(root)`;
- detail-root relevance checks;
- text-write equality guards.

It explicitly forbids the old direct callback:

`new MutationObserver(()=>{translateVisibleTags();enhanceDetailAuthor()})`.

The ordinary Web real-browser smoke remains the end-to-end regression.

## Preserved behavior

F4 does not change:

- canonical tag values;
- E-H translation database source;
- search aliases;
- language selection;
- author identity;
- author refresh API;
- detail markup;
- history;
- E-H browse modes;
- provider behavior.

## Deliberate non-scope

F4 does not:

- remove the body observer entirely;
- translate only a fixed set of view roots;
- alter Visual/Work Identity dialog generation;
- change Product/Settings Hub/Onboarding/Visual observers;
- alter backend polling;
- define a browser CPU budget.

A broad mutation entry point is acceptable here because the work performed for each mutation is now incremental and coalesced rather than full-document.

## Next P2-F work

After F4:

1. audit Product source-entry cleanup, which still scans all links/buttons from a body observer;
2. audit Settings Hub and onboarding body observers;
3. audit Visual QC body observer and determine whether its dynamic buttons can be bound to narrower roots;
4. inventory backend pollers with explicit owner/start/stop lifecycle;
5. collect low-end browser traces before quantitative budgets.
