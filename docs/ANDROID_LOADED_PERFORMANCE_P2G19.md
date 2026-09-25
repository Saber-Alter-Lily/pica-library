# Android Loaded Foreground Performance — P2 G19

Status: **loaded-scenario harness candidate / real physical-device evidence required**

Parent:
- `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening;
- P2-C Android resource-budget evidence;
- P2-J Android foreground performance instrumentation.

Baseline:
- G17 observe-only resource classification is merged.
- G18 release-like Android Macrobenchmark harness is merged.
- No Android concurrency/resource capacity is enforced.

## Scope

G19 joins the two accepted measurement planes:

1. G17 WorkManager resource observation;
2. G18 foreground FrameTiming Macrobenchmark.

The first loaded scenario is deliberately narrow:

**real Native Recommendation generation × top-level foreground navigation**

G19 does not create a synthetic download or fake Provider load.

## Why recommendation is first

Native Recommendation already has:
- a stable user-visible trigger: `重新生成手机推荐`;
- durable WorkManager lifecycle;
- G17 tags:
  - `provider-network`;
  - `cpu-analysis`;
- a workload whose duration naturally scales with real user data and Provider access.

A download scenario needs a concrete comic/chapter identity. G19 does not invent one just to make automation easier.

## Opt-in rule

`PicaLoadedMacrobenchmark` is skipped unless instrumentation argument:

`picaG19Loaded=true`

is supplied.

The benchmark installation must already have:
- a real configured Pica source; or
- a real synced portable candidate base.

If the trigger does not create a real RUNNING recommendation workload, the scenario fails with an explicit precondition message.

## Benchmark-only resource bridge

`BenchmarkResourceSnapshotReceiver` exists only in the benchmark source set.

An explicit shell broadcast returns current G17 resource occupancy through ordered-broadcast result data.

The bridge:
- does not require the release-like target to be debuggable;
- exposes no credentials or Provider payload;
- reports only coarse RUNNING/waiting resource counts;
- is absent from release/debug manifests.

## Loaded scenario

`recommendationOverlapTopLevelFrameTiming()`:

1. prepares deterministic benchmark UI state;
2. launches the real app;
3. enters Recommendation;
4. clicks the real `重新生成手机推荐` action;
5. waits until both:
   - provider-network RUNNING > 0;
   - cpu-analysis RUNNING > 0;
6. starts FrameTiming measurement with `startupMode=null`;
7. navigates:
   - Recommendation → Library → Online → Settings → Recommendation;
8. requires the same real recommendation resource classes to still be RUNNING at the end.

The end check rejects runs where the heavy task finished before the measured interaction completed.

`startupMode=null` is intentional for a non-startup Macrobenchmark: the measured interaction must preserve the real background task instead of force-stopping the package between blocks.

## Physical-device preparation

`scripts/run-android-loaded-macrobenchmark.sh prepare`:

- installs the release-like benchmark variant;
- opens it;
- stops without reading or exporting credentials.

The tester then manually configures a real source/candidate base.

`scripts/run-android-loaded-macrobenchmark.sh run` executes only the G19 loaded method and archives:
- device model/API/ABI;
- observed refresh-rate field where available;
- benchmarkData JSON;
- Perfetto traces.

## Evidence boundary

G19 source/build acceptance proves only that the loaded scenario is executable and correctly guarded.

A promotion claim still requires representative physical-device output.

Do not:
- use GitHub emulator numbers as a performance baseline;
- infer a resource capacity from one device/run;
- treat ENQUEUED work as active contention;
- replace a failed real Provider precondition with a synthetic workload.

## Required physical scenarios before enforcement

At minimum collect:

1. G18 idle navigation baseline;
2. G19 recommendation-loaded navigation;
3. real download-loaded navigation with a user-selected representative comic;
4. recommendation + download overlap where both are truly RUNNING;
5. Reader interaction under representative background load;
6. long Reader session memory/jank.

Each record should include G17 resource state and G18/G19 performance artifacts.

## Next

After G19 source/build acceptance:
- collect the idle + recommendation-loaded physical evidence;
- add real download/Reader loaded scenarios only with explicit real data inputs;
- compare foreground frame/startup behavior against resource overlap;
- only then decide whether G20 / P2-C3 enforcement is justified.

No resource budget is selected by G19.
