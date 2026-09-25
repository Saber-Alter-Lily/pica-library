# Frontend Observer / Poller Discipline — P2 F1

Status: **redundant Theme decoration interval removed / task-status polling preserved**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-F Frontend responsiveness and observer discipline.

Dependencies:

- P2-E1/E2 establish explicit cache ownership and invalidation boundaries.
- Existing Web UX work already coalesces several MutationObserver callbacks through `requestAnimationFrame` or microtasks.

## Design reference

F1 follows the same event-driven observer pattern used in mature open-source browser UIs: observe the narrow DOM/source that owns the change, filter irrelevant mutations, then coalesce UI work instead of periodically rescanning the document.

The local codebase already contains the same good pattern in:

- Recommendation V5 result/library observers;
- Visual QC observer scheduling;
- Settings Hub observer scheduling;
- theme-root MutationObservers.

F1 therefore removes a redundant fallback rather than introducing a new observer framework.

## Finding

`web/alpha8-theme-help.js` had two mechanisms for the same decoration state.

### Event-driven authority

Theme decoration is already scheduled by:

- theme attribute changes on `document.documentElement`;
- relevant mutations under:
  - Recommendation;
  - Downloads;
  - Library;
  - Downloaded;
- viewport resize;
- document visibility restoration;
- explicit `applyDescriptor()` when a theme is loaded/applied.

All mutation-driven passes are coalesced through one `requestAnimationFrame` guard.

### Redundant periodic fallback

In addition, the module ran:

```js
setInterval(scheduleThemeDecoration, 2500)
```

for the entire page lifetime.

When a theme was active and the page visible, every tick scheduled:

- `decorateProgress()`;
- `renderEmptyArt()`.

Those functions query progress elements, measure progress geometry and scan empty-state targets even when nothing changed.

The interval therefore created persistent idle DOM work despite the event-driven authority already covering the relevant changes.

## F1 change

The 2.5 second Theme decoration interval is removed.

`scheduleThemeDecoration()` remains unchanged and is still called by:

1. relevant root MutationObservers;
2. theme attribute observer;
3. resize;
4. visibility restoration;
5. initial runtime-observer setup;
6. explicit theme application through `applyDescriptor()`.

The pagehide handler no longer needs to clear a Theme decoration interval.

## What is intentionally retained

### Recommendation build polling

`recommendationTimer = setInterval(pollRecommendationProgress, 500)`

is retained.

This timer is different:

- it exists only while a recommendation build is actively watched;
- it reads authoritative server task state;
- it updates phase/progress/pause/resume/cancel controls;
- it stops when the task reaches a terminal/non-building state.

F1 does not replace a real backend task-status stream with a DOM observer.

### Other feature-specific polling

WebDAV sync, downloads, updater, E-H login and other pollers are not changed in F1. Each needs a separate authority/lifecycle audit because they observe backend state, not Theme DOM decoration.

## Regression contract

The existing Web UX contract is updated to require:

- no Theme `progressTimer`;
- no `setInterval(scheduleThemeDecoration...)`;
- scoped mutation attribute filtering remains present;
- resize scheduling remains present;
- visibility restoration scheduling remains present;
- active recommendation task polling remains present.

The normal real-browser smoke remains the end-to-end UI regression.

## Deliberate non-scope

F1 does not:

- remove Recommendation build polling;
- change WebDAV/download/update/E-H login polling cadence;
- refactor all MutationObservers;
- change theme visuals or Theme Studio behavior;
- change scroll restoration;
- introduce a global observer bus;
- set a browser CPU performance threshold.

## Next P2-F work

After F1:

1. inventory every persistent Web poller with owner/start/stop condition and authoritative data source;
2. remove duplicate authorities, not merely reduce polling frequency;
3. audit broad `document.body` subtree observers and narrow them where concrete mutation ownership is known;
4. ensure status updates rebuild only the affected page region;
5. use browser performance traces on representative low-end hardware before setting responsiveness budgets.
