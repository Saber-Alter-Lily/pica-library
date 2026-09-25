# Single Recommendation Status Poll Authority — P2 F10

Status: **Theme progress watcher is the normal recommendation-status poll authority; App completion waits consume its status signal with bounded fallback**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-F Frontend responsiveness and observer/poller discipline.

Dependencies:

- F1 retained Recommendation build polling because it observes real backend task state.
- F9 inventories persistent pollers and requires one owner per recurring state stream.

## Finding

Explicit Recommendation generation had two concurrent consumers of the same endpoint:

`/api/v1/recommendation-sessions/status?mode=final`

### Theme Help

`alpha8-theme-help.js` starts a 500 ms watcher when the user starts/restarts recommendation generation.

It owns:

- phase/progress display;
- elapsed time;
- pause/resume/cancel controls;
- terminal UI state.

### App

`app.js::waitForFinalCycle()` independently queried the same final-cycle endpoint once per second for up to 120 seconds.

It only needed to know:

- build failed;
- a final cycle became active;
- for force-new, the active cycle changed from the previous cycle.

During a normal explicit build both loops therefore queried the same backend task state concurrently.

## F10 authority model

### Poll authority

Theme Help remains the normal recurring poll authority.

After every successful status fetch it calls:

`publishRecommendationStatus(current)`

which publishes one internal document event:

`pica-recommendation-status`

with:

- the already-fetched status object;
- local observed timestamp.

No second backend request is created by publication.

### Completion consumer

App installs one passive listener and stores the latest:

`recommendationStatusSignal`

snapshot.

`waitForFinalCycle()` checks the same completion/failure predicates as before, but consumes this signal first.

It no longer runs a fixed one-second polling loop.

## Explicit handoff after build start

Theme Help already has capture-phase click listeners so it can show immediate “starting” feedback.

There is a startup race in that early UI watcher:

- capture click occurs before App sends the build-start POST;
- an immediate status request can still see the pre-build state.

F10 does not rely on that speculative first watcher.

After App receives the backend response and knows it must wait for a build, it dispatches:

`pica-recommendation-watch`

Theme Help listens for that event and restarts its watcher from the accepted backend state.

This handoff occurs for:

- `resume_or_create` when no active cycle is immediately available;
- `force_new` rebuild.

## Stale snapshot protection

App may have received a recent terminal status from a prior build.

Before each explicit handoff:

`requestRecommendationStatusWatch()`

clears:

- cached status;
- cached observed timestamp.

Therefore a prior active cycle cannot satisfy a new wait merely because its snapshot is still younger than the freshness window.

For force-new, the existing `previousCycleId` check remains in place as an additional identity guard.

## Startup fallback policy

After handoff, App gives Theme up to **750 ms** to publish the first status.

Theme normally polls immediately and then every 500 ms, so the normal path uses only Theme's request.

If no event arrives in that startup window, App performs a direct status query.

## Ongoing fallback policy

A Theme-published status is considered fresh for **1500 ms**.

While fresh:

- App performs no direct status query;
- it waits for the next `pica-recommendation-status` event.

If no status event arrives for the freshness window, App performs one direct fallback query and continues waiting.

This preserves Recommendation completion when:

- Theme Help failed to load;
- Theme watcher encountered an error;
- a future product surface invokes the App flow without the Theme module.

Fallback is therefore a liveness mechanism, not a second recurring authority.

## Completion semantics preserved

`waitForFinalCycle()` still:

- throws on `buildProgress.state === 'failed'`;
- requires an active cycle;
- requires no `buildingCycleId`;
- for force-new, requires a cycle different from `previousCycleId`;
- uses a 120-second overall timeout.

After success, App still requests:

`POST /api/v1/recommendations { action: 'current' }`

and performs the existing managed-batch switch.

## Listener lifecycle

Each wait iteration uses a temporary event listener with a bounded timeout.

The listener removes itself whether:

- a status event arrives; or
- the timeout fires.

No permanent per-build listeners accumulate.

The single passive snapshot listener is installed once with the App module.

## Privacy / data boundary

The internal event carries the same local final-cycle status object already consumed by the two Web modules.

It does not add:

- provider credentials;
- cookies;
- local paths;
- new persistence;
- cross-window broadcasting.

The event remains within the same document runtime.

## Regression contract

F10 source tests require:

- Theme `publishRecommendationStatus(status)`;
- `pica-recommendation-status` publication after a successful poll;
- Theme listener for `pica-recommendation-watch`;
- App status snapshot listener;
- stale-snapshot reset before each explicit watch;
- 750 ms initial signal opportunity;
- 1500 ms signal freshness;
- direct status API retained only as fallback;
- 120-second overall timeout;
- removal of the old `for (attempt < 120) + 1s poll` loop.

Real-browser smoke remains the end-to-end regression for Recommendation start/restart and progress UI.

## Preserved behavior

F10 does not change:

- Recommendation ranking or retrieval;
- cycle creation;
- build pause/resume/cancel;
- Theme progress UI;
- managed recommendation batch switching;
- recommendation timeout duration;
- backend endpoints;
- Android recommendation behavior.

## Deliberate non-scope

F10 does not:

- introduce WebSocket/SSE;
- create a generic global task event bus;
- change Recommendation task persistence;
- tune backend task cadence;
- change hidden-tab behavior of unrelated pollers.

## Next P2-F work

After F10:

1. verify hidden/background-tab behavior of remaining task-owned pollers;
2. audit onboarding welcome readiness retry lifetime;
3. keep single-owner status streams and bounded fallback as the default pattern;
4. collect browser traces before quantitative polling/CPU budgets.
