# Persistent Poller Lifecycle Audit — P2 F9

Status: **persistent pollers inventoried / WebDAV reload reattachment fixed**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-F Frontend responsiveness and observer/poller discipline.

Dependencies:

- F1–F8 remove redundant idle timers and reduce broad MutationObserver work.
- P2-H requires durable task UI to reconstruct after reload/restart.

## Audit principle

Polling is not inherently wrong.

The relevant questions are:

1. who owns the state stream;
2. what starts polling;
3. what stops polling;
4. what terminal state ends ownership;
5. whether page reload can reattach to a durable background task;
6. whether a second module observes the same stream;
7. whether hidden/unrelated views keep polling unnecessarily.

F9 does not reduce intervals merely to make numbers smaller.

## Current poller inventory

| Stream | Owner | Start condition | Stop / terminal condition | Current assessment |
| --- | --- | --- | --- | --- |
| Download jobs | `web/app.js` | Downloads view + runner active | runner inactive or leave Downloads view | bounded/view-owned |
| Favorites sync progress | `web/app.js` | explicit sync request | request `finally` | request-scoped |
| Browser Lite export progress | `web/app.js` | explicit export request | request `finally` | request-scoped |
| WebDAV sync progress | `web/alpha7-cloud.js` | explicit sync request | request `finally` before F9 | **reload recovery gap; fixed in F9** |
| Software update progress | `web/alpha8-update-ui.js` | update/apply action | status phase becomes non-active | one explicit update authority |
| Recommendation build progress | `web/alpha8-theme-help.js` | build/restart click or active build discovered at bootstrap | building task becomes terminal/non-building | task-owned |
| E-H managed web login | `web/eh-account.js` | explicit managed login start | complete / failed / cancelled / poll error | task-owned |
| Work Identity evidence refresh | `web/work-identity-review.js` | start, resume, or active task reattach | `task.active === false`; generation invalidates prior watcher | task-owned / single generation |
| V5 shadow evaluation | `web/recommendation-v5-evaluation.js` | explicit run or active task restore | complete / failed / cancelled / `runningShadow=false` | task-owned |
| Onboarding welcome readiness retry | `web/onboarding-v1.js` | initial onboarding bootstrap | prompt shown or onboarding no longer needed | separate short readiness loop; not changed in F9 |

## F9 finding: WebDAV reload gap

WebDAV synchronization is a durable Desktop background task.

During a sync started from the current page, `alpha7-cloud.js` did:

1. start a 700 ms poller;
2. await the long-running sync request;
3. stop the poller in `finally`.

This works only while the same browser script instance owns the request.

After a page reload or script reload:

- the backend task may still be scanning/uploading/publishing/paused/cancelling;
- `load()` reads `desktop.remoteStorage.syncProgress`;
- the UI renders that snapshot once;
- no poller is reattached.

The visible progress therefore freezes even while the durable task continues.

## F9 active-state authority

`remoteProgressActive(progress)` defines whether the backend progress snapshot still represents an active/recoverable task.

It returns true when either:

- the backend exposes `canPause`, `canResume`, or `canCancel`; or
- phase is one of:
  - scanning;
  - uploading;
  - publishing;
  - pausing;
  - paused;
  - cancelling.

Terminal states such as complete/failed/cancelled do not keep polling alive.

## Reload reattachment

After `load()` reads Desktop status and renders `remoteState.syncProgress`:

- active progress → `startProgressPolling()`;
- inactive/terminal progress → `stopProgressPolling()`.

This reconstructs progress ownership after a page/script reload.

## Self-terminating restored poller

Before F9, `pollProgress()` only rendered status.

A restored poller would therefore have no request `finally` to stop it.

F9 makes `pollProgress()` stop its timer when:

- no local sync request is currently being initiated; and
- backend progress is no longer active.

Therefore reload-restored polling ends at backend terminal state.

## Startup race guard

An explicit local sync currently starts polling **before** awaiting the long-running sync POST so progress remains live while the request is in flight.

The first status read can briefly still report idle before the backend task publishes its active phase.

F9 adds:

`remoteSyncRequestPending`

The flag is true while the initiating request owns the operation.

During that window, an idle snapshot cannot auto-stop the timer.

The flag is cleared in the request `finally`.

## Control actions

Pause/resume/cancel responses can also return an active progress state.

After rendering a control response, F9 ensures polling is running whenever `remoteProgressActive(result.syncProgress)` is true.

This covers a recovered paused task whose UI control is used after reload.

## Page lifecycle

`pagehide` calls `stopProgressPolling`.

A normal page unload therefore does not leave an interval alive during teardown.

Backend task durability is unaffected; a subsequent page instance reattaches from status.

## Regression contract

The long-task stability contract requires:

- `remoteSyncRequestPending`;
- `remoteProgressActive(progress)`;
- auto-stop when terminal and no local start request is pending;
- `load()` reattachment for active `remoteState.syncProgress`;
- local-start pending guard;
- pagehide cleanup.

Existing pause/resume/cancel and checkpoint tests remain unchanged.

## Preserved behavior

F9 does not change:

- WebDAV sync engine;
- upload/hash/checkpoint semantics;
- pause/resume/cancel backend behavior;
- 700 ms active polling cadence;
- remote storage configuration;
- progress rendering fields;
- durable sync state.

## Deliberate non-scope

F9 does not:

- convert polling to WebSocket/SSE;
- add global hidden-tab throttling;
- change update/recommendation/E-H/Work Identity/V5 pollers;
- change onboarding retry timing;
- define a browser/network request budget.

## Next P2-F work

After F9:

1. audit hidden-tab/background behavior for task pollers;
2. audit onboarding welcome retry lifecycle separately;
3. verify no active-task reattach path can start duplicate watchers;
4. add only evidence-backed lifecycle changes, not blanket interval tuning.
