# Scoped UX Polish Observers — P2 F2

Status: **global body-subtree UX polish observer removed / Settings and Downloads ownership separated**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-F Frontend responsiveness and observer discipline.

Dependency: P2-F1 removed the redundant Theme decoration interval while preserving event-driven Theme updates and real backend task polling.

## Finding

`web/ui-polish-v5.js` dynamically arranges several UI surfaces:

- experiment tools inside Settings;
- Download controls;
- Visual settings disclosure;
- Settings utilities;
- update panel;
- E-H account controls;
- remote-storage help;
- dialog backdrop-close behavior.

Before F2, all dynamic follow-up was owned by one observer:

```js
bodyObserver.observe(document.body, {
  childList: true,
  subtree: true
})
```

Every child mutation anywhere in the application therefore scheduled a frame that re-ran the whole dynamic polish bundle.

This included unrelated high-churn areas such as:

- comic result cards;
- Recommendation results;
- Reader content;
- status/progress text implemented through child changes;
- Visual/other feature panels outside the surfaces actually owned by UX polish.

The callback was coalesced with `requestAnimationFrame`, which prevented one callback per mutation, but it did not fix the ownership problem: unrelated DOM activity still caused the full Settings/Downloads installer bundle to run.

## F2 ownership split

### Settings observer

One MutationObserver now watches only:

`#settings`

with `childList + subtree`.

Its animation-frame pass owns only Settings-related installers:

- experiment hub;
- Visual settings disclosure;
- Settings utilities;
- update panel;
- E-H account flow;
- remote-storage flow.

Dynamic panels inserted anywhere under Settings still trigger the required polish pass.

### Downloads observer

One MutationObserver now watches only:

`#downloads`

with `childList + subtree`.

Its frame owns only:

`installDownloadsPage()`.

Recommendation, Library, Reader and unrelated DOM mutations no longer schedule Downloads/Settings polish.

### Dialog backdrop behavior

The previous implementation scanned every `dialog` and attached one click listener to each instance.

That scan had been one reason to keep a body-wide observer: newly inserted dialogs needed another installer pass.

F2 replaces this with one delegated click listener on `document.body`.

A backdrop click targets the `HTMLDialogElement` itself, so the single body handler closes an open dialog only when the event target is the dialog. Clicks on children continue normally.

The body is marked with:

`data-ux-dialog-backdrop-delegation`

so initialization remains idempotent.

Dynamically inserted dialogs therefore need no observer rescan or per-dialog listener.

## Why the roots are stable

Settings and Downloads are product-level view containers present in the base Web shell. Their internal controls/panels may be inserted or rearranged dynamically, but the root ownership does not move to arbitrary result cards or Reader content.

F2 therefore observes the stable owning roots rather than trying to infer relevance from every body mutation after the fact.

If a future architecture replaces those view roots themselves, that change must explicitly re-establish observer ownership rather than relying on a silent global fallback.

## Coalescing remains

Both scoped observers retain one animation-frame guard:

- `settingsPolishQueued`;
- `downloadsPolishQueued`.

Multiple mutations within one frame therefore still collapse into one installer pass per owning view.

## Regression contract

The Web UX contract requires:

- no `bodyObserver.observe(document.body...)`;
- no `document.body` childList+subtree global observer in `ui-polish-v5.js`;
- Settings mutations to schedule `scheduleSettingsPolish`;
- Downloads mutations to schedule `scheduleDownloadsPolish`;
- Settings and Downloads roots to be explicit;
- dialog backdrop behavior to use one body delegated listener;
- no per-dialog click-listener installer.

The existing real-browser smoke remains the end-to-end regression for dynamic Settings/Downloads/dialog behavior.

## Preserved behavior

F2 does not change:

- Settings panel content or labels;
- experiment-tool placement;
- download controls/history behavior;
- update behavior;
- E-H or remote-storage actions;
- dialog markup or `dialog.close()` semantics;
- selection-status observers;
- Recommendation/Visual observers;
- task polling;
- scroll/focus authority.

## Deliberate non-scope

F2 does not yet:

- optimize the three selection-status observers, which currently each update all three selection bars;
- narrow the Visual QC body observer;
- narrow the Settings Hub / Product source-cleanup body observers;
- create a global observer registry;
- replace backend polling with DOM observation;
- define browser CPU budgets.

Those require separate ownership proofs.

## Next P2-F work

After F2:

1. audit the three selection-status observers and give each status stream one matching render authority;
2. audit remaining `document.body` subtree observers (Visual QC, Product cleanup, Settings Hub, onboarding) one by one;
3. inventory persistent backend pollers with owner/start/stop conditions;
4. preserve result-grid-specific observers when their root is already narrow;
5. collect browser performance traces on representative low-end hardware before defining quantitative responsiveness budgets.
