# Android Foreground Performance Macrobenchmark — P2 G18

Status: **measurement harness candidate / no performance budget selected**

Parent:
- `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening;
- P2-J Android startup / foreground latency / jank instrumentation;
- P2-C precondition for Android resource-budget enforcement.

Baseline:
- G17 resource observation is merged as PR #171.
- Android WorkManager resource overlap is now observable without throttling.
- Generic force-stop, trim-memory and Doze recovery gates are already automated.

## Purpose

G18 adds the missing Android foreground performance measurement plane.

It does **not**:
- optimize UI code;
- alter recommendation or download semantics;
- add concurrency limits;
- choose a p50/p95 budget;
- treat emulator numbers as representative performance.

The first G18 batch measures:

1. cold app startup to the local Library becoming usable;
2. top-level Library → Recommendation → Online → Settings → Library frame timing.

Loaded overlap scenarios are deferred to G19 after this baseline harness is stable.

## Why Macrobenchmark

AndroidX Macrobenchmark is the platform-supported tool for end-user performance journeys.

The G18 harness uses:
- `StartupTimingMetric`;
- `FrameTimingMetric`;
- `CompilationMode.Partial`;
- `StartupMode.COLD` for startup;
- `StartupMode.WARM` for repeated top-level navigation;
- UiAutomator for external user-style interaction.

Current pinned versions:
- `androidx.benchmark:benchmark-macro-junit4:1.5.0`;
- `androidx.test.uiautomator:uiautomator:2.4.0`.

No custom frame timer or home-grown jank counter is introduced.

## Release-like benchmark target

The app gains a dedicated `benchmark` build type:

- initialized from `release`;
- debuggable = false;
- signed with the local debug key for installability;
- same application ID as the formal app;
- matching fallback = release.

This avoids measuring the side-by-side debug build.

The benchmark source set adds:
- `<profileable android:shell="true" />`;
- one exported `BenchmarkSetupActivity`.

Neither appears in the normal release/debug manifests.

## Deterministic setup

Macrobenchmark must not spend measured time on one-time gates unrelated to steady product performance.

`BenchmarkSetupActivity` runs outside the measured block and:

- fixes the benchmark UI language to Simplified Chinese;
- accepts the versioned disclaimer;
- disables automatic onboarding;
- suppresses the foreground auto-update check during the benchmark window.

The measured block still launches and operates the real benchmark app from outside the process.

The setup Activity exists only in the benchmark source set.

## Startup measurement

`coldStartupToUsableLibrary()`:

- performs five iterations;
- uses `CompilationMode.Partial`;
- uses `StartupMode.COLD`;
- launches the normal launcher Activity;
- waits for the visible local Library;
- records `StartupTimingMetric`.

### Full-display boundary

G18 adds one semantics-neutral instrumentation point in `HomeActivity`:

`reportUsableLibraryOnce()`

It calls platform `reportFullyDrawn()` once after:

- the local Unified Catalog has been read;
- the visible filtered Library list is built;
- the RecyclerView adapter is attached;
- the initial list-position restore is scheduled.

The signal does not wait for optional provider refreshes.

Therefore:
- time to initial display represents first rendered UI;
- time to full display represents the local Library becoming usable.

The signal does not change rendering or background refresh behavior.

## Frame timing measurement

`topLevelTabSwitchFrameTiming()`:

- performs five iterations;
- uses warm startup;
- opens the real Home shell;
- measures `FrameTimingMetric` while switching:

`书库 → 推荐 → 在线 → 设置 → 书库`

UiAutomator finds and clicks the actual navigation buttons.

The scenario intentionally does not require a populated Library or provider credentials. It is a baseline shell/navigation measurement.

On Android 12+ the benchmark can report frame-overrun percentiles in addition to CPU frame-duration percentiles.

## Build-only CI

Workflow:

`.github/workflows/android-macrobenchmark-build.yml`

CI runs:

`gradle :app:assembleBenchmark :macrobenchmark:assembleBenchmark`

This proves:
- the release-like benchmark target builds;
- the test APK compiles;
- pinned AndroidX APIs remain compatible.

CI does **not** run Macrobenchmark numbers on the GitHub emulator.

This is deliberate. Emulator timings share host resources and are not accepted as representative performance evidence.

## Physical-device runner

Script:

`scripts/run-android-macrobenchmark.sh`

It requires a connected Android device and records:
- device serial;
- model;
- API level;
- ABI;
- Macrobenchmark benchmarkData JSON;
- Perfetto traces when emitted.

It runs:

`gradle :macrobenchmark:connectedBenchmarkAndroidTest`

The runner explicitly states that physical-device results are required before selecting promotion budgets.

## Evidence protocol

Before any Android performance budget is proposed, repeat comparable runs on at least one representative mid-range device.

Record:
- device model / SoC where known;
- Android API level;
- refresh rate;
- build commit;
- Library size;
- connection/provider state;
- idle vs background-work scenario;
- benchmarkData JSON;
- relevant Perfetto traces.

Do not compare a physical-device baseline directly to CI emulator output.

## G18 acceptance

Source/build acceptance:
- benchmark build type is release-like;
- profileable exists only in the benchmark source set;
- setup Activity exists only in the benchmark source set;
- Macrobenchmark module compiles;
- startup scenario uses StartupTimingMetric;
- navigation scenario uses FrameTimingMetric;
- HomeActivity reports fully drawn only after local Library usability;
- CI does not assign performance thresholds;
- physical-device script archives benchmark output.

Scientific/product acceptance:
- none; G18 is engineering instrumentation.

## Deliberate non-claims

G18 does not close:
- large-Library performance;
- long Reader memory/jank;
- recommendation/download/import contention;
- OEM background behavior;
- foreground notification reconstruction;
- Android concurrency budgets.

It does not establish:
- startup p50/p95 limits;
- frame-overrun thresholds;
- acceptable CPU frame-duration percentiles.

Those remain evidence-driven.

## Next — G19 loaded Android scenarios

After G18 source/build acceptance:

1. run the idle baseline on representative hardware;
2. add loaded scenarios that pair G17 resource observation with G18 foreground performance:
   - download + Library navigation;
   - recommendation + Library/detail navigation;
   - download + recommendation;
   - import/bootstrap + foreground navigation where representative;
3. add Reader open / Reader interaction / long-session memory measurement;
4. only then decide whether G20 / P2-C3 enforcement is justified.

The rule remains: measure first, then budget.
