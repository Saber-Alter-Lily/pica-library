# Android Force-Stop / Relaunch Recovery Evidence — P2 G15

Status: **emulator force-stop/relaunch recovery gate implemented / low-memory, reboot and physical-device background restrictions remain open**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening / P2-H startup and crash recovery.

Prerequisites:

- G13: durable current WorkRequest identity + Task Center reconstruction authority.
- G14: WorkManager database/query integration under the official `androidx.work:work-testing` harness.
- Production WorkManager runtime remains 2.9.1.

## Why G15 exists

G14 intentionally stopped at the WorkManager integration layer.

Its test process and WorkManager test harness can verify:

- unique-work replacement/history semantics;
- WorkInfo query behavior;
- app-registry self-repair;
- PAUSED identity reconstruction.

It cannot prove that the same state remains usable after Android actually stops the application process.

G15 therefore adds a second, independent evidence level:

1. install the real Debug APK and androidTest APK on an API 35 emulator;
2. seed the **production WorkManager database** and app-private recovery stores;
3. exit the first instrumentation invocation;
4. execute `adb shell am force-stop com.picalibrary.android.dev`;
5. verify PackageManager reports `stopped=true`;
6. start a second instrumentation invocation without reinstalling or clearing app data;
7. query the persisted WorkManager database and run the production Task Center reconstruction selectors.

No `WorkManagerTestInitHelper` is used in the G15 instrumentation test.

## Open-source CI reference

The emulator job uses the open-source ReactiveCircus Android Emulator Runner, pinned to the v2.38.0 commit:

`ReactiveCircus/android-emulator-runner@a421e43855164a8197daf9d8d40fe71c6996bb0d`

The pin follows the same pattern used by established Android projects such as AnkiDroid and NativeScript.

The project still owns the recovery protocol itself:

- APK build/install;
- instrumentation stage selection;
- `am force-stop`;
- stopped-state verification;
- second-stage relaunch;
- recovery assertions.

The external action supplies the emulator lifecycle only.

## Production-code boundary

G15 does not introduce a second task scheduler or recovery implementation.

`TaskCenterActivity` keeps the same G13 algorithms but exposes the two selectors as package-visible static methods that take a `Context`:

- `currentWork(Context, ...)`;
- `reconstructDownloads(Context, ...)`.

The Activity itself calls those same methods.

This allows both G14 and G15 to verify the exact production reconstruction logic without:

- duplicating the algorithm in tests;
- launching a polling UI merely to reach a private method;
- using reflection against Activity instance state.

No ranking, download, recommendation or user-facing Task Center behavior changes.

## Stage A — seed durable recovery state

`WorkManagerProcessRecoveryInstrumentedTest#a_seedRecoveryState` starts with a freshly installed Debug package.

It writes five probe states.

### 1. Active dynamic download

A delayed WorkRequest is created with the same identity tags Task Center understands:

- `pica-download`;
- `comic:<id>`;
- `episode:ALL`.

Its UUID is persisted through `MobileTaskRegistryStore.registerDownload`.

Expected before force-stop:

- WorkInfo exists;
- state is unfinished;
- registry contains the exact UUID.

### 2. Deliberately PAUSED download

A second delayed WorkRequest is registered and then paused through the real:

`PicaDownloadJobs.pause(...)`

Expected before force-stop:

- WorkInfo reaches CANCELLED because pause cancels the current unique request;
- `MobileTaskPauseStore` remains true;
- `MobileTaskRegistryStore` intentionally remains present.

This is the durable user-intent boundary.

### 3. Completed stale registration

A harmless `SupporterEntitlementWorker` probe runs to SUCCEEDED while carrying download identity tags.

Its registry row is deliberately retained by the test.

This creates a conservative stale-terminal condition so Task Center must prove that a completed WorkInfo cannot resurrect as an active task.

### 4. Explicitly cancelled download

A delayed probe is cancelled through the real:

`PicaDownloadJobs.cancel(...)`

Expected before force-stop:

- WorkInfo reaches CANCELLED;
- pause marker is false;
- dynamic registry entry is removed immediately.

### 5. Singleton task

A delayed WorkRequest is enqueued under:

`NativeRecommendationJobs.UNIQUE_NAME`

and its exact UUID is stored under the production recommendation registry scope.

This validates current-work reconstruction independent of WorkInfo list order.

## Force-stop boundary

After Stage A exits, the shell executes:

`adb shell am force-stop com.picalibrary.android.dev`

The runner records the package's `dumpsys package` state and requires:

`stopped=true`

The test APK is not reinstalled.

Application data is not cleared.

The second instrumentation invocation is therefore an explicit fresh-process relaunch over the same:

- SharedPreferences recovery state;
- WorkManager database;
- WorkInfo history.

## Stage B — verify persisted recovery

`WorkManagerProcessRecoveryInstrumentedTest#b_verifyRecoveryAfterForceStop` runs in the relaunched target process.

It first reads the UUIDs written by Stage A and requires:

- active download: WorkInfo still present and unfinished;
- PAUSED download: WorkInfo still CANCELLED;
- completed probe: SUCCEEDED;
- explicitly cancelled probe: CANCELLED;
- singleton probe: WorkInfo still present and unfinished.

### PAUSED + pruned-history simulation

Real WorkManager pruning is retention-time dependent and should not be forced merely to make CI convenient.

Therefore Stage B additionally removes the PAUSED WorkInfo from the list supplied to:

`TaskCenterActivity.reconstructDownloads(...)`

This deliberately exercises the stronger G13 invariant:

> durable PAUSED identity must remain reconstructible even when the old CANCELLED WorkInfo is no longer available.

Expected reconstructed set:

- active download — present with its exact WorkInfo;
- PAUSED download — present with `info == null`;
- completed download — absent and stale registry removed;
- explicitly cancelled download — absent.

Exactly two logical download cards remain.

### Singleton reconstruction

Stage B queries WorkManager's persisted unique-work history and passes it to:

`TaskCenterActivity.currentWork(...)`

The result must match the UUID persisted before force-stop.

No WorkInfo-list-position assumption is allowed.

## CI gate

Workflow:

`.github/workflows/android-worker-recovery.yml`

Runner:

`scripts/run-android-worker-recovery.sh`

The gate is path-filtered to Android/recovery-code changes.

Failure diagnostics include:

- Stage A instrumentation output;
- package stopped-state evidence;
- Stage B instrumentation output;
- logcat on failure.

This gate is deliberately separate from the normal Android unit/lint/build job because emulator startup is materially more expensive.

## Evidence matrix after G15

| Recovery claim | Evidence |
| --- | --- |
| Registry survives ordinary Activity recreation | G13 persistence tests |
| WorkManager replacement/history reconstruction | G14 official WorkManager test harness |
| PAUSED identity survives missing historical WorkInfo | G14 + G15 production selector |
| App-private registry survives actual package force-stop | G15 emulator |
| Production WorkManager DB remains queryable after force-stop/relaunch | G15 emulator |
| Active logical task reappears after relaunch | G15 emulator |
| Completed/cancelled logical downloads do not resurrect | G15 emulator |
| Singleton exact UUID survives relaunch | G15 emulator |
| Device reboot reschedule behavior | **OPEN** |
| Android low-memory kill / LMK behavior | **OPEN** |
| Doze / app-standby / OEM background restrictions | **OPEN** |
| Foreground notification reconstruction on physical device | **OPEN** |
| Representative mid-range-device timing/jank | **OPEN** |

## Important interpretation limit

`am force-stop` is a strong package-stop condition, not a perfect model of every Android process-death mechanism.

It is useful because it proves persisted state is not accidentally Activity/process-memory dependent.

It must **not** be used to claim that:

- WorkManager will execute while the package remains force-stopped;
- reboot rescheduling has been tested;
- low-memory-killer behavior has been tested;
- OEM background policies have been tested;
- notification/foreground-service restoration has been tested on physical hardware.

The second instrumentation invocation explicitly relaunches the application before recovery assertions.

## Next P2-G work

After G15 passes:

1. audit low-memory/background restriction behavior for each durable Worker family;
2. add focused reboot/background evidence only where CI/emulator semantics are meaningful;
3. verify foreground-notification reconstruction and long-running work on representative Android hardware;
4. define Android task concurrency/resource classes and budgets;
5. run large-Catalog and long-Reader device evidence;
6. feed those results into the P2-J/P2-K performance and release gates.

G15 closes the **automated emulator force-stop/relaunch evidence gap**. It does not close the physical-device/background-restriction gate.
