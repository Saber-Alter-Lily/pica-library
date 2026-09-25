# Incremental Onboarding DOM Mutation Processing — P2 F7

Status: **onboarding target discovery changed from full-document rescans to changed-subtree processing**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-F Frontend responsiveness and observer discipline.

Dependencies:

- F1 removed redundant Theme idle polling.
- F2 scoped UX polish observers.
- F3 separated selection render authorities.
- F4 made parity DOM work incremental.
- F5 made Product source cleanup incremental.
- F6 scoped Settings Hub observation to Settings ownership.

## Finding

`web/onboarding-v1.js` owns two dynamic responsibilities:

1. mark tour targets with `data-tour`;
2. insert the Help & Onboarding panel when the Settings Hub general panel becomes available.

Before F7, one body-wide MutationObserver ran after any child mutation and, on the next animation frame:

- queried the full document for all 12 onboarding target selectors;
- checked whether the onboarding Settings panel existed;
- attempted to create it when missing.

The callback was frame-coalesced, but unrelated Library, Recommendation, Reader, Download and status mutations still repeated all onboarding queries.

## F7 target registry

The tour target definitions are promoted to one stable:

`TOUR_TARGETS`

array.

`markTourTargets(root = document)` now accepts a root.

`targetWithin(root, selector)` checks:

- the root itself;
- then descendants.

This preserves explicit full-document authority calls:

- bootstrap;
- starting/replaying the tour.

Ordinary MutationObserver callbacks no longer call the full-document path.

## F7 mutation queue

The body observer remains the broad insertion event source because tour targets span:

- global navigation;
- Library;
- Recommendation;
- the consolidated Settings Hub;
- connection/mobile panels.

The callback now consumes MutationObserver records and only looks at:

`mutation.addedNodes`.

Added element roots are stored in:

`pendingRoots`.

Text-node additions resolve to their parent element.

One requestAnimationFrame pass:

1. drains the unique pending roots;
2. calls `markTourTargets(root)` only for those subtrees;
3. conditionally ensures the onboarding Settings panel.

## Settings-panel authority

`ensureSettingsPanel()` is needed only after:

`#a87-general-panel`

exists.

F7 marks `settingsPanelDirty` only when an added subtree is or contains that panel.

It does not run the Settings-panel check after arbitrary body mutations.

The existing idempotence of `ensureSettingsPanel()` remains unchanged.

## Why the body observer remains

Tour targets are intentionally cross-surface.

Some are static at bootstrap while others are created later by:

- Settings Hub construction;
- recommendation settings modules;
- mobile/connection settings;
- feature-specific lazy UI.

A fixed single-root observer would either miss targets or require several competing onboarding observers.

F7 therefore keeps one body-wide **event source** but makes the actual work incremental and coalesced.

## Welcome prompt timers

F7 does not change `scheduleWelcome()`.

The 500 ms retry loop has a different authority:

- it waits for app readiness / disclaimer / setup completion;
- it stops once the welcome dialog is shown or auto-prompting is no longer required.

That lifecycle should be audited separately from DOM target discovery.

## Regression contract

The Web UX source contract requires:

- one `TOUR_TARGETS` registry;
- `markTourTargets(root = document)`;
- `targetWithin(root, selector)`;
- `pendingRoots = new Set()`;
- MutationObserver processing of `mutation.addedNodes`;
- animation-frame coalescing;
- scoped `markTourTargets(root)`;
- explicit `#a87-general-panel` relevance.

It forbids the old callback pattern that ran full-document `markTourTargets()` plus unconditional Settings-panel checks after every mutation.

## Preserved behavior

F7 does not change:

- onboarding step order;
- tour copy;
- first-run prompt policy;
- dismiss/completed state;
- skip behavior;
- driver.js integration;
- target selectors;
- Settings replay controls;
- language behavior.

## Deliberate non-scope

F7 does not:

- remove the body observer;
- alter welcome retry timing;
- change Settings Hub;
- alter Visual QC;
- change backend polling;
- define browser performance budgets.

## Next P2-F work

After F7:

1. audit Visual QC's body-wide observer and its three installer passes;
2. inventory persistent backend pollers by owner/start/stop lifecycle;
3. audit onboarding welcome retry lifecycle separately;
4. preserve broad observers only where cross-surface insertion ownership is real and the work is incremental/coalesced.
