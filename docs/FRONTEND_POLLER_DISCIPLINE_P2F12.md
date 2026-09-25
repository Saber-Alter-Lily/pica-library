# Visibility-Aware Analysis Task Polling — P2 F12

Status: **analysis-only task pollers remain foreground-responsive and reduce hidden-tab request frequency**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-F Frontend responsiveness and observer/poller discipline.

Dependencies:
- F9 inventories persistent poller ownership.
- F10 removes duplicate Recommendation status polling.
- F11 removes idle Onboarding readiness retries.

## Scope

F12 changes only two long-running analysis/development task status loops:

- Work Identity evidence refresh;
- Recommendation V5 shadow evaluation.

These tasks continue in the backend regardless of page visibility. Their polling exists to update UI progress and terminal state.

F12 does **not** change:
- E-H login polling;
- updater polling;
- Recommendation build polling;
- WebDAV progress polling;
- download polling.

Those flows have different user-control/recovery constraints.

## Visibility policy

Foreground cadence remains unchanged:

- Work Identity: 500 ms;
- V5 shadow evaluation: 600 ms.

When `document.visibilityState === 'hidden'`, the next status delay becomes 3000 ms.

This reduces background request churn without pausing or cancelling the backend task.

## Immediate restoration

Each visibility-aware delay listens for `visibilitychange`.

If the document becomes visible before the hidden delay expires:

1. the pending timeout is cleared;
2. the visibility listener removes itself;
3. the delay resolves immediately;
4. the task loop performs the next status request.

Therefore the user does not need to wait up to 3 seconds after returning to the page.

## Lifecycle safety

Every delay installs one temporary visibility listener and one timer.

Both are removed by the same `finish()` function whether the delay ends because:

- its timer expires; or
- the page becomes visible.

No persistent listener accumulates across loop iterations.

Existing task-loop ownership remains unchanged:

### Work Identity
`scanPollGeneration` remains the duplicate-watcher guard.

The loop still exits when:
- generation changes;
- status request fails;
- `task.active` becomes false.

### V5 shadow evaluation
`EVAL.runningShadow` remains the watcher authority.

The loop still exits on:
- complete;
- failed;
- cancelled;
- `runningShadow = false`.

## Why only these two pollers

Both flows are developer/analysis surfaces where status updates are presentation-only while hidden.

Other task streams were deliberately excluded:

- managed login may require timely external-window completion;
- updater can replace/restart application files;
- Recommendation build status is also the completion authority consumed by App;
- WebDAV progress participates in task recovery and controls;
- Downloads are already view-owned.

F12 therefore avoids a blanket global hidden-tab throttle.

## Regression contract

Source tests require:

- Work Identity visibility-aware delay helper;
- hidden delay = 3000 ms;
- foreground delay = existing 500 ms;
- visible restoration resolves early;
- removal of the old fixed 500 ms sleep;
- V5 evaluation visibility-aware delay helper;
- existing 600 ms foreground call retained;
- immediate visible restoration retained.

## Preserved behavior

F12 does not change:
- backend task execution;
- pause/resume/cancel semantics;
- task persistence/recovery;
- progress formatting;
- terminal-state handling;
- Work Identity evidence output;
- V5 evaluation output;
- provider requests inside the tasks.

## Next P2-F work

After F12:

1. gather browser traces with visible vs hidden analysis tasks;
2. verify no remaining high-frequency poller runs without clear task/view authority;
3. only then decide whether P2-F is ready to close or needs one final lifecycle batch.
