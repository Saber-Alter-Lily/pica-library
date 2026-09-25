# Android Durable Worker Recovery — P2 G13

Status: **durable current-work identity + Task Center reconstruction implemented / true kill-restart instrumentation remains open**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening and P2-H crash recovery.

## Design reference

Pica Library uses Android WorkManager 2.9.1 for user-visible durable background work.

The recovery model follows the normal WorkManager contract:

- execution/state authority remains WorkManager;
- logically singular jobs use unique work names;
- WorkInfo is queried by persistent name/id/tag rather than Activity memory;
- user-requested pause intent is stored separately from WorkManager's transient process state;
- partial user data is committed only through the task's existing durable stores/checkpoints.

G13 does not introduce a second scheduler.

## Finding 1 — Task Center depended on WorkInfo list position

For singleton jobs the Task Center previously used:

`values.get(values.size() - 1)`

as “latest”.

For downloads it queried all historical work by tag and rendered each WorkInfo directly.

That is not a safe recovery authority:

- WorkManager queries return all matching work/history for a name or tag;
- REPLACE/resume can leave older CANCELLED/FAILED WorkInfo beside the new current request;
- Task Center can therefore render duplicate cards or bind controls to a historical attempt;
- list position is not the task identity.

## Finding 2 — paused dynamic downloads were not independently enumerable

Download pause intent was already durable in:

`MobileTaskPauseStore`.

However, the pause key is hashed and not an enumerable task catalog.

The comic/episode identity used to reconstruct a paused card came only from WorkManager tags.

If an old cancelled WorkInfo is eventually pruned, the pause marker can still exist while Task Center no longer knows which comic/episode it belongs to.

## G13 durable registry

G13 adds:

`MobileTaskRegistryStore`

using app-private SharedPreferences.

It stores only recovery identity, not task payload/output.

### Singleton current WorkRequest IDs

For:

- Favorite import;
- Pica bootstrap;
- Native Recommendation;

the registry stores:

- logical scope/id;
- current WorkRequest UUID.

Each new REPLACE request updates the UUID.

KEEP requests may be rejected because an existing unique request is already active. Task Center therefore treats the registry UUID as a hint that must exist in WorkManager; if not, the actual active WorkInfo repairs the registry.

### Dynamic download registry

Each Pica/E-H download entry stores:

- provider family: `pica` or `eh`;
- comic ID;
- episode ID when applicable;
- current WorkRequest UUID.

The logical task key is provider + comic + episode, not WorkInfo list position.

No credentials, media URLs, file paths or tokens are stored.

## Download registry lifecycle

### Enqueue / resume

Creating a Pica/E-H WorkRequest registers its UUID for that logical download.

Resume uses REPLACE and therefore replaces the registry's current UUID.

### Pause

Pause does **not** remove the registry entry.

It:

- persists the existing MobileTaskPauseStore marker;
- cancels the current unique WorkManager request for Pica/E-H downloads;
- retains provider/comic/episode identity for Task Center reconstruction.

### Explicit cancel

Explicit cancel clears the pause marker and unregisters the dynamic download identity before cancelling the unique work.

The task should no longer appear as resumable.

### Success

PicaDownloadWorker / EhDownloadWorker unregister the logical download only after:

- all expected pages are complete;
- PhoneDownloadStore is updated;
- Catalog reconciliation succeeds;
- the Worker is ready to return Result.success.

Completed content remains visible through DownloadsActivity/PhoneDownloadStore rather than as an active Task Center job.

### Retry / failure

Retry and terminal failure keep the registry entry.

Task Center can continue to show the current failed WorkInfo and expose retry.

## Task Center reconstruction algorithm

Task Center still queries WorkManager because WorkManager remains the state authority.

### Singleton work

`currentWork(values, scope, id)`:

1. reads the persisted expected WorkRequest UUID;
2. returns the exact WorkInfo when present;
3. if the UUID is absent/stale, prefers an actually active WorkInfo;
4. stores that active UUID as a compatibility migration.

It does not use WorkInfo list position.

### Dynamic downloads

`reconstructDownloads(infos)`:

1. maps queried WorkInfo by UUID;
2. loads durable download registry entries;
3. parses legacy/current WorkInfo tags into logical provider/comic/episode identities;
4. when a registered UUID is missing, an actual active WorkInfo of the same identity may repair the registry;
5. pre-G13 active/paused tasks are migrated into the registry;
6. one DownloadView is emitted per logical registry task.

Cleanup rules:

- SUCCEEDED → unregister and omit from Task Center;
- missing WorkInfo + not paused → unregister stale registry;
- CANCELLED + not paused → unregister;
- paused → retain/show even if the historical WorkInfo was pruned;
- active/failed current WorkInfo → show one card.

This removes duplicate historical cards after resume/replace.

## Recovery matrix

| Task | WorkManager identity | Partial durable state | Pause authority | Process/restart expectation | Task Center recovery |
| --- | --- | --- | --- | --- | --- |
| Pica download | unique name per comic+episode; tags | PhoneDownloadStore indexed complete pages | MobileTaskPauseStore + download registry | WorkManager reruns current request; indexed pages are reused/validated | exact registry UUID; paused card survives missing old WorkInfo |
| E-H download | unique name per comic; tags | PhoneDownloadStore indexed complete pages | MobileTaskPauseStore + download registry | WorkManager reruns request; indexed pages are reused | exact registry UUID; paused card survives missing old WorkInfo |
| Favorite import | `portable-favorite-import` | Favorite/cover files already committed remain reusable | pause marker; cancel current work | WorkManager reruns/retries; resume may redo incomplete sync while reusing committed artifacts | current UUID registry, or active compatibility migration |
| Pica bootstrap | `pica-account-bootstrap` | merged local favorite/catalog data remains valid | pause marker; pause cancels current request | resume starts a replacement import; previous local cache remains usable | current UUID registry, or active compatibility migration |
| Native Recommendation | `native-recommendation-v3` | previous accepted recommendation snapshot remains intact | durable pause marker checked at engine checkpoints | WorkManager may recreate Worker; paused worker blocks at checkpoint; new snapshot is saved only after final checkpoint | current UUID registry, or active compatibility migration |
| Update check | unique one-shot + periodic work | updater SharedPreferences metadata | none | metadata-only/idempotent recheck | not shown as user long task |
| Supporter entitlement refresh | unique replacement work | validated local entitlement/theme state | none | safe best-effort rerun | not shown in Task Center |

## False-completion boundary

G13 preserves the existing completion rules.

### Downloads

A Worker cannot report success until page persistence and Catalog reconciliation have completed.

Partial pages remain partial PhoneDownloadStore state, not a completed Worker.

### Native Recommendation

The engine constructs the new Snapshot in memory.

It calls the pause/control checkpoint immediately before:

`NativeRecommendationStore.save(app, snapshot)`.

The store publishes through a temp-file replacement.

Therefore a killed/paused incomplete generation does not overwrite the prior accepted recommendation snapshot merely because computation started.

### Favorite/bootstrap

Both return Result.success only after their durable local merge/reconciliation path completes.

A process interruption causes WorkManager retry/re-execution rather than a synthetic completed Task Center state.

## Registry self-repair / KEEP race

A KEEP enqueue may construct a new WorkRequest that WorkManager ignores because a current unique request already exists.

G13 deliberately does not trust registry UUID alone.

If the stored UUID is absent from queried WorkInfo:

- singleton recovery falls back to the actual active WorkInfo;
- dynamic recovery allows the same logical active download WorkInfo to replace the stale UUID.

The registry therefore converges back to WorkManager authority.

## Tests added in G13

### Robolectric persistence

`MobileTaskRegistryStoreTest` verifies:

- dynamic download identity survives a fresh store read;
- replacement changes the current UUID without duplicating logical task identity;
- unregister removes the task;
- singleton WorkRequest ID persists and clears;
- Pica/E-H identities remain distinct even with the same comic ID string.

### Source/recovery contract

The long-task stability contract requires:

- registry UUID persistence in Jobs;
- download register/unregister/complete semantics;
- Task Center exact UUID selection;
- active compatibility migration;
- registry-based download reconstruction;
- absence of `values.get(values.size()-1)` / old `latest()` authority.

Android compile/test/lint/build remains the API/runtime gate.

## Deliberate non-scope

G13 does not yet provide an instrumentation-level OS process kill test.

Still open:

- automated force-stop/process-kill + relaunch scenarios with real WorkManager database;
- low-memory/background restriction scenarios;
- notification/foreground-service reconstruction on physical devices;
- WorkManager database pruning over long retention windows;
- process-death tests for UpdateActivity's DownloadManager flow;
- cross-version migration of the new registry if its schema evolves.

## Next P2-G / P2-H work

After G13:

1. add automated kill/restart tests for the critical durable task families;
2. verify deliberate PAUSED tasks remain paused after process recreation;
3. verify active WorkManager tasks reappear in Task Center after Activity/process recreation;
4. verify completed/explicitly cancelled downloads do not resurrect;
5. audit low-memory/background restriction behavior;
6. then define Android concurrency/resource budgets.

G13 closes the **reconstruction-authority implementation gap**; it does not claim the external process-kill evidence gate is complete.
