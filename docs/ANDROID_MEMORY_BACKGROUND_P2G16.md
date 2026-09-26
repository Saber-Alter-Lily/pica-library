# Android Memory Pressure and Background Restrictions — P2 G16

Status: **PASS / merged as PR #170**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening.

Accepted evidence before merge:
- normal CI run `36147604842`: PASS;
- v0.4 Direct Upgrade Acceptance run `36147604826`: PASS;
- G15 force-stop regression run `36147604861`: PASS on WorkManager 2.12.0;
- Android Memory and Background Restrictions run `36147604843`: PASS;
- merged commit: `bf0e5e8853e715909aa63cff5ef31934cd2f2c5f`.

Baseline:

- G15 real ADB force-stop/relaunch recovery is merged as PR #169.
- Android app targets API 35 and minSdk 28.
- Durable background work remains owned by AndroidX WorkManager.

## Scope

G16 addresses two remaining Android runtime gaps:

1. low-memory / background memory pressure;
2. system background scheduling restrictions.

It does not introduce a second scheduler or an app-specific "keep alive" mechanism.

## Upstream / open-source references

G16 follows Android platform and AndroidX behavior rather than inventing a custom policy.

### Android memory callbacks

Current Android guidance focuses cache eviction on:

- `TRIM_MEMORY_UI_HIDDEN`;
- `TRIM_MEMORY_BACKGROUND`.

Since Android 14, the older running/moderate/complete pressure callbacks are no longer delivered in the same way, and Android 15 formally deprecated several legacy levels.

Large reconstructible Bitmap allocations should be dropped when the UI becomes hidden or the process moves to background pressure.

### WorkManager

The repository was still using WorkManager 2.9.1.

That version predates several Android 15 compatibility fixes that are directly relevant to P2-G:

- WorkManager 2.10 added SDK 35 compatibility and fixed foreground `dataSync` / short-service timeout handling that could otherwise leave the foreground service running into an ANR;
- WorkManager 2.11.1 fixed Android 15+ network-constraint handling when connectivity is blocked;
- WorkManager 2.11.2 fixed additional background network-call failures even when network constraints were satisfied;
- WorkManager 2.12.0 is the current stable release at this G16 baseline and keeps minSdk below this app's minSdk 28.

G16 therefore moves both production and test harness dependencies to:

- `androidx.work:work-runtime:2.12.0`;
- `androidx.work:work-testing:2.12.0`.

G14 recovery semantics remain unchanged; only the underlying current WorkManager implementation is upgraded.

## Finding 1 — no process-wide trim-memory handling

Before G16, `PicaLibraryApp` had no `onTrimMemory(...)` override.

Two global decoded-Bitmap LRUs could therefore remain resident while the app was hidden/backgrounded:

- `CoverRepository`: 72 MiB maximum;
- `ImageRepository`: 72 MiB maximum.

Together they could retain about 144 MiB of reconstructible decoded image data, excluding:

- Bitmaps currently held by visible ImageViews;
- Reader page Bitmaps;
- Activity-local remote grid caches;
- executor/task objects.

This is not a claim that the process always uses 144 MiB. It is the configured maximum retained by these two static LRUs.

## G16 memory-pressure behavior

### Application callback

`PicaLibraryApp.onTrimMemory(int)` now evicts both global Bitmap LRUs when:

- level >= `TRIM_MEMORY_UI_HIDDEN`;
- or on pre-Android-14 devices, a legacy running-low-or-worse level is delivered.

The callback does not:

- delete encoded disk caches;
- cancel durable WorkManager jobs;
- recycle Bitmaps still referenced by active views;
- clear user data;
- force GC.

### Cache APIs

`CoverRepository` and `ImageRepository` now expose package-private:

- `memoryBytes()`;
- `trimMemory()`.

Their full user-triggered clear operations still remove disk data where previously expected, but process memory pressure calls only `trimMemory()`.

## Unit/Robolectric evidence

`AndroidMemoryPressureTest` verifies:

- `TRIM_MEMORY_UI_HIDDEN` evicts both global Bitmap LRUs;
- `TRIM_MEMORY_BACKGROUND` evicts both global Bitmap LRUs;
- a non-trim modern hint does not purge them;
- tests run against the real `PicaLibraryApp` application class.

## Finding 2 — background scheduler library was below the Android 15 compatibility line

All audited durable network work already uses WorkManager constraints rather than raw app-owned services:

- Favorite import;
- Pica bootstrap;
- Native Recommendation;
- Pica downloads;
- E-H downloads;
- update checks;
- supporter entitlement refresh.

Pica/E-H downloads preserve the user's Wi-Fi-only preference through `NetworkType.UNMETERED`; other network jobs require `NetworkType.CONNECTED`.

The app does not directly call `startForegroundService()` or `startService()` for these durable jobs.

Long-running foreground Workers continue to use WorkManager's `SystemForegroundService` with `dataSync` service type.

G16 upgrades WorkManager instead of replacing this architecture.

## Real-process memory acceptance

Debug-only `MemoryPressureProbeActivity` primes both global Bitmap LRUs with synthetic Bitmaps and records:

- process PID;
- cover-cache bytes;
- image-cache bytes.

The emulator host then sends:

`adb shell am send-trim-memory <process> HIDDEN`

and launches the report mode in the same process.

Acceptance requires:

- same PID before and after;
- both caches > 0 before;
- both caches == 0 after.

This distinguishes actual callback-driven eviction from a process restart.

The probe exists only in the debug source set.

## Real Doze/background acceptance

Debug-only `BackgroundRestrictionSeedActivity` enqueues one WorkManager request with:

- `NetworkType.CONNECTED`;
- 15-second initial delay;
- unique work identity.

Debug-only `BackgroundRestrictionProbeWorker` writes a durable run-count marker only when it actually executes.

The emulator host:

1. seeds the WorkRequest;
2. confirms it has not executed;
3. forces device idle / Doze before the initial delay expires;
4. remains in forced Doze past the 15-second eligibility boundary;
5. requires run count to remain zero;
6. exits Doze and restores battery state;
7. briefly observes natural background JobScheduler dispatch;
8. if the OS has not dispatched the job yet, performs a normal launcher re-entry;
9. requires the same durable WorkRequest to execute after that legitimate app re-entry.

This tests the intended contract:

- system restriction delays WorkManager;
- the app does not bypass Doze with a private service;
- delayed work remains durable;
- leaving Doze does not lose the WorkRequest;
- recovery occurs either through OS-controlled background dispatch or through normal app re-entry/WorkManager initialization.

G16 deliberately does **not** define a fixed post-Doze background dispatch SLA. JobScheduler timing after restriction removal is OS-controlled and can vary across emulator/system-image releases. The acceptance gate therefore distinguishes durable recovery from scheduler latency rather than treating “must run within N seconds in the background” as an application guarantee.

## CI gate

Workflow:

`.github/workflows/android-memory-background.yml`

Runner:

`scripts/run-android-memory-background.sh`

The workflow uses the existing open-source `ReactiveCircus/android-emulator-runner@v2` setup on API 35 x86_64 with KVM.

Diagnostics are uploaded only for public-repository runs under the repository's existing workflow artifact policy.

## Static contract

`test/unit/android-memory-background-p2g16.test.ts` locks:

- trim-memory APIs and Application callback;
- no disk-cache deletion from the memory-pressure callback;
- WorkManager 2.12.0 runtime/testing alignment;
- WorkManager + network constraints for durable network families;
- no raw `startForegroundService` / `startService` in those job owners;
- debug-only probe isolation from the release manifest;
- real `am send-trim-memory ... HIDDEN` acceptance;
- real forced-Doze defer + durable post-restriction recovery acceptance;
- emulator workflow presence.

The older G14 source contract is updated to verify the recovery harness against WorkManager 2.12.0 rather than freezing 2.9.1 forever.

## Deliberate non-claims

G16 does not claim all Android memory/performance work is complete.

Still open:

- OEM-specific battery/background restriction behavior;
- Android 16+ long-running Worker job-quota behavior on representative devices;
- app standby `restricted` bucket behavior across vendors;
- foreground notification reconstruction on physical hardware;
- Reader long-session decoded-Bitmap/RSS behavior;
- large Catalog memory/jank on mid-range hardware;
- enforceable cross-task concurrency/resource budgets.

G16 also does not add an arbitrary heap-size budget. Android resource budgets remain evidence-gated under the later P2-G/P2-K work.

## Next after G16

If the unit, normal CI and emulator gates pass:

1. close the generic low-memory + Doze validation gap;
2. move Android foreground-notification/device recovery into the representative-hardware evidence lane;
3. define Android concurrency/resource budgets from measured overlap;
4. run large-Catalog + long-Reader timing/jank/memory evidence;
5. then close or explicitly transfer remaining P2-G evidence to P2-J/P2-K.
