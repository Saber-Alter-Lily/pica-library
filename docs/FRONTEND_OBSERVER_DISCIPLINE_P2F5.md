# Incremental Product Source-Entry Cleanup — P2 F5

Status: **dynamic source-entry cleanup changed from full-document rescans to changed-subtree processing**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-F Frontend responsiveness and observer discipline.

Dependencies:

- F1 removed redundant Theme idle polling.
- F2 scoped UX polish observers.
- F3 separated selection render authorities.
- F4 made v0.4 parity mutation handling incremental/coalesced.

## Finding

`web/alpha8-product.js` intentionally removes ordinary-product links/buttons whose visible text exposes source-code entry points.

The product bootstrap correctly performs one initial cleanup.

However, the dynamic observer previously did:

1. observe the complete body subtree;
2. coalesce mutations with requestAnimationFrame;
3. call `removeSourceEntryPoints()`;
4. scan **every** `a,button` in the document again.

The callback was coalesced, but unrelated DOM activity still caused a full-page query over all links/buttons.

## F5 change

### Scoped cleanup primitive

`removeSourceEntryPoints(root = document)` now accepts a root.

`sourceEntryNodes(root)` returns:

- the root itself when it is an `a` or `button`;
- descendant `a,button` nodes.

The existing initial bootstrap call still uses the default `document` root and therefore preserves the one-time full cleanup.

### Incremental mutation processing

The body observer now processes MutationObserver records.

For each mutation it considers only `addedNodes`.

Added element roots are stored in:

`pendingSourceRoots`.

Text-node additions resolve to their parent element, which preserves detection when an existing link/button receives new text.

One requestAnimationFrame pass drains the root set and calls:

`removeSourceEntryPoints(root)`

for each changed subtree.

### Removed-only mutations

Removing a source entry creates a child-list mutation.

Because F5 ignores `removedNodes` for cleanup scheduling, the cleanup's own removal does not trigger another full or incremental scan.

## Why the body observer remains

Source-code entry points may be inserted by multiple dynamic modules and are not owned by one stable result/settings root.

The body observer therefore remains the correct broad **event source**.

The optimization is to make the **work** incremental rather than to invent a brittle list of allowed insertion roots.

## Regression contract

The existing Web UX Product observer contract now requires:

- `cleanupQueued` animation-frame coalescing;
- `pendingSourceRoots = new Set()`;
- MutationObserver records rather than a direct schedule callback;
- processing of `mutation.addedNodes`;
- scoped `removeSourceEntryPoints(root)`;
- absence of the old `new MutationObserver(scheduleSourceCleanup)` form.

Real-browser smoke remains the end-to-end regression.

## Preserved behavior

F5 does not change:

- which visible source/open-source labels are removed;
- initial page cleanup;
- theme behavior;
- personalization;
- support panel;
- update ownership;
- language behavior;
- Settings Hub behavior.

## Deliberate non-scope

F5 does not:

- remove the Product body observer;
- change source-link product policy;
- alter external links that do not match the existing text rule;
- modify Settings Hub / onboarding / Visual observers;
- alter backend polling;
- add a browser performance threshold.

## Next P2-F work

After F5:

1. scope the Settings Hub observer if all of its movable sources belong to stable Settings/Maintenance roots;
2. audit onboarding's body observer and tour-target scanning;
3. audit Visual QC body observer;
4. inventory remaining persistent backend pollers;
5. collect low-end browser traces before quantitative budgets.
