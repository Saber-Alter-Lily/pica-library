# Event-Driven Onboarding Readiness — P2 F11

Status: **500 ms readiness retry loop removed / onboarding readiness is now event-driven**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-F Frontend responsiveness and observer/poller discipline.

Dependencies:

- F7 made onboarding target discovery incremental.
- F9/F10 audit recurring poller ownership and prefer one explicit authority per state stream.

## Finding

The first-run onboarding welcome dialog should appear only when:

- the user still needs onboarding;
- the legal disclaimer is not blocking the page;
- Setup is no longer the active view;
- the main application shell is available.

Before F11, `scheduleWelcome()` used:

- an initial 650 ms delay;
- then a recursive 500 ms `setTimeout` retry until the app became ready or onboarding no longer needed prompting.

If a user remained on Setup or left the disclaimer open for a long time, the page continued waking every 500 ms even though the readiness state had not changed.

## Readiness authorities

F11 identifies the actual readiness transitions.

### Setup

`#setup` is a stable base-page element.

Readiness can change when its:

- `class`;
- `hidden`;
- `style`

attributes change.

F11 installs one MutationObserver on that element only.

### Disclaimer

`#pica-disclaimer-gate` is dynamically mounted by `alpha8-disclaimer.js` and removed after acceptance.

The F7 onboarding body observer already receives child-list records.

F11 reuses that event source and marks onboarding readiness dirty only when:

- an added subtree is/contains the disclaimer gate; or
- a removed subtree is/contains the disclaimer gate.

It does not add a second body observer.

### Visibility restoration

When the document becomes visible again, F11 performs one readiness check.

This handles a user returning after setup/disclaimer state changed while the tab was backgrounded.

### Initial load

The existing 650 ms initial delay is retained as a single one-shot readiness check.

There is no recurring 500 ms retry.

## Watch lifecycle

F11 adds:

- `welcomeCheckTimer`;
- `welcomeReadinessObserver`;
- `queueWelcomeReadinessCheck()`;
- `runWelcomeReadinessCheck()`;
- `stopWelcomeReadinessWatch()`.

At most one readiness timeout is scheduled.

A new readiness signal replaces the pending timeout rather than adding another.

Once:

- the welcome dialog is shown; or
- `shouldPrompt()` becomes false,

F11:

- clears the pending timeout;
- disconnects the Setup observer;
- removes the visibility listener.

`writeState()` also stops readiness watching immediately when a user choice makes prompting unnecessary.

## F7 body observer integration

The existing onboarding body observer remains responsible for:

- incremental tour target marking;
- creating the Settings onboarding panel when `#a87-general-panel` appears.

F11 adds one additional relevance bit:

`welcomeReadinessDirty`.

The next coalesced animation-frame pass calls `queueWelcomeReadinessCheck()` only when disclaimer mount/unmount is observed.

This preserves one broad onboarding mutation authority rather than introducing a parallel observer.

## Preserved prompt semantics

F11 does not change:

- `shouldPrompt()`;
- completed/dismissed version logic;
- session dismissal;
- auto-show setting;
- disclaimer requirement;
- Setup gating;
- welcome copy;
- tour steps;
- driver.js behavior;
- replay controls.

The same conditions decide whether the dialog may appear.

Only the readiness trigger mechanism changes.

## Regression contract

Web UX source coverage requires:

- a bounded `welcomeCheckTimer`;
- a Setup-only `welcomeReadinessObserver`;
- Setup attribute filtering for class/hidden/style;
- disclaimer added/removed detection in the existing body observer;
- visibility restoration check;
- one 650 ms initial readiness check;
- watcher cleanup;
- absence of the old recursive `setTimeout(tryPrompt, 500)` loop.

Real-browser onboarding smoke remains the end-to-end behavior regression.

## Deliberate non-scope

F11 does not:

- change disclaimer behavior;
- change Setup flow;
- remove onboarding's incremental body observer;
- alter Recommendation/WebDAV/update task polling;
- add background-tab task throttling;
- define a browser CPU threshold.

## Next P2-F work

After F11:

1. review hidden-tab behavior for task-owned pollers;
2. retain continuous polling only where task visibility/control requires it;
3. pause or defer purely presentational status work when hidden, with immediate refresh on visibility restoration;
4. close P2-F only after browser performance evidence shows no persistent high-frequency idle work from the app itself.
