# Android WorkManager Recovery Integration — P2 G14

Status: **official WorkManager test-harness recovery integration added / real OS force-stop evidence remains open**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening / P2-H crash recovery.

Dependencies:

- G13 added durable task identity and Task Center reconstruction authority.
- WorkManager 2.9.1 remains the only background-work scheduler.

## Why G14 uses WorkManager's official test harness

Recovery correctness depends on real WorkManager concepts:

- unique work;
- WorkRequest UUID;
- WorkInfo state/history;
- replacement/cancellation history;
- persisted query results.

A hand-built fake scheduler would not test those contracts.

G14 therefore adds:

`testImplementation 'androidx.work:work-testing:2.9.1'`

matching the production WorkManager runtime version.

The test initializes WorkManager through:

`WorkManagerTestInitHelper.initializeTestWorkManager(...)`

and creates real delayed OneTimeWorkRequests.

The initial delay keeps requests in a durable ENQUEUED state without executing provider/network logic.

## Evidence level

G14 verifies:

- WorkManager database/query semantics;
- app registry persistence;
- current-work selection;
- Activity/Task Center reconstruction logic after all in-memory references are discarded.

G14 does **not** simulate:

- Android OS force-stop;
- Linux process SIGKILL;
- device reboot;
- OEM background restrictions.

Those remain an explicit device/emulator evidence gate.

## Scenario 1 — REPLACE history does not duplicate a download

The test creates two delayed Pica-download WorkRequests for the same logical:

- comic;
- episode;
- unique-work name.

The second request uses REPLACE and becomes the persisted current UUID.

WorkManager may retain history for the prior request.

The test passes all tag-matched WorkInfo rows into Task Center reconstruction and requires:

- exactly one DownloadView;
- the view to bind the second/current WorkRequest UUID;
- the registry to contain only that current UUID.

This verifies historical attempts do not create duplicate Task Center cards.

## Scenario 2 — stale registry UUID repairs from actual active WorkInfo

The test enqueues one real delayed WorkRequest but deliberately writes a random stale UUID into the registry.

Task Center receives the real WorkInfo from WorkManager.

The recovery algorithm must:

- detect that the registered UUID is absent;
- recognize the same logical active task;
- repair the registry to the actual WorkInfo UUID;
- emit exactly one current card.

This covers:

- old-version migration;
- an ignored KEEP-created UUID;
- stale registry state after abnormal termination.

## Scenario 3 — deliberate PAUSED state survives missing WorkInfo

The test stores:

- durable download identity + prior UUID;
- durable MobileTaskPauseStore marker;

but supplies **no WorkInfo** to reconstruction.

This models a paused task whose old CANCELLED WorkInfo is no longer available/pruned.

Task Center must still reconstruct:

- one download task;
- correct comic/episode identity;
- `info == null`;
- durable prior UUID retained.

The UI can therefore expose Continue/Cancel instead of silently losing the paused task.

## Scenario 4 — missing non-paused download does not resurrect

The registry contains a dynamic download identity but:

- WorkManager supplies no WorkInfo;
- no pause marker exists.

Task Center must:

- emit no card;
- delete the stale registry entry.

A completed/explicitly-cancelled orphan registration therefore cannot resurrect as a phantom task.

## Scenario 5 — singleton current WorkRequest survives REPLACE history

The test creates two delayed WorkRequests under one unique name.

The second UUID is stored as current.

Task Center's singleton selector must return the exact second UUID.

The test then replaces the registry UUID with a random stale value.

The selector must:

- fall back to the actual active WorkInfo;
- return that WorkInfo;
- repair the registry.

The old:

`values.get(values.size() - 1)`

ordering assumption is not involved.

## Test-only Worker

G14 defines one nested:

`RecoveryWorker`

inside the Robolectric test.

It exists only to create real WorkManager WorkInfo rows.

All test requests use a one-day initial delay so the Worker body should not execute.

No production Worker/provider/network path is invoked by these recovery integration tests.

## Test lifecycle

The test class:

- initializes WorkManager once with the official test helper;
- clears task-registry/pause SharedPreferences before each scenario;
- cancels test work between scenarios;
- closes the WorkManager test database after the class.

Task Center Activities are created under Robolectric with a paused main looper so the normal 1200 ms UI poll loop does not compete with the direct recovery-method assertions.

## Production behavior changed by G14

None.

G14 adds only:

- official test dependency;
- recovery integration test;
- documentation/task-log evidence.

G13 production registry/reconstruction behavior remains unchanged.

## P2-H evidence status after G14

With G13 + G14:

- explicit recovery table: PASS;
- current WorkRequest reconstruction from real WorkManager state: PASS;
- REPLACE-history duplicate prevention: PASS;
- durable PAUSED identity with missing old WorkInfo: PASS;
- non-paused orphan non-resurrection: PASS;
- actual Android OS process kill/relaunch: OPEN;
- device reboot / OEM background restriction: OPEN.

## Next recovery evidence

After G14 passes CI:

1. add an emulator/adb force-stop + relaunch smoke for one download and one paused durable task when CI/device infrastructure can support it;
2. verify process restart reconstructs Task Center through the real persisted WorkManager database;
3. verify active partial downloads continue from PhoneDownloadStore checkpoints;
4. verify PAUSED tasks remain paused and are not auto-enqueued;
5. verify completed/explicitly-cancelled registry entries do not reappear;
6. audit low-memory/background restrictions.

G14 intentionally stops short of claiming the OS-level process-death gate is complete.
