# Android Force-Stop Worker Recovery — P2 G15

Status: **PASS — merged as PR #169; API 35 emulator force-stop/relaunch recovery accepted**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening / P2-H crash recovery. G15 builds directly on merged G14 (`docs/ANDROID_WORKMANAGER_RECOVERY_TEST_P2G14.md`) and adds the OS-level emulator force-stop gate that G14 intentionally left open.

Final accepted evidence:

- PR #169 final head: `d0a2e74b6f2fc86ea70233a216f8d35367670ca1`;
- normal CI: run 36141430122 PASS;
- v0.4 Direct Upgrade Acceptance: run 36141430431 PASS;
- Android Worker Force-Stop Recovery: run 36141430171 PASS;
- probe runCount after normal launcher re-entry: 2;
- seed PID 3741 → relaunch PID 3872;
- verification instrumentation: `OK (1 test)`;
- diagnostic artifact: 10866498681.


## Purpose

G13 gave Task Center a durable current-work identity. G15 adds the missing process-death evidence and fixes one terminal-state leak found while building that evidence.

The target invariant is narrower than "all Android background behavior is solved":

- an actually RUNNING WorkManager process can be force-stopped and reconstructed after relaunch;
- current task identity survives process death;
- deliberate PAUSED state survives;
- explicit cancel and successful completion do not leave a recovery identity that can resurrect historical WorkInfo;
- Task Center reconstructs one logical card per durable download identity.

Low-memory/background-restriction behavior and physical-device resource budgets remain separate later gates.

## Upstream/open-source design references

G15 intentionally reuses established Android infrastructure rather than introducing another scheduler or process supervisor.

### AndroidX WorkManager

AndroidX WorkManager's own `ForceStopRunnable` documents and implements the force-stop recovery model: force-stopped jobs/alarms are detected during WorkManager initialization and eligible work is rescheduled.

Reference:

- `androidx/androidx/work/work-runtime/.../ForceStopRunnable.java`

The production scheduler remains WorkManager. G15 adds only recovery identity, terminal cleanup and test evidence around that scheduler.

### AndroidX Test

The instrumentation layer uses the normal AndroidX Test runner and `ActivityScenario`. The test does not replace WorkManager with a synchronous fake.

### ReactiveCircus/android-emulator-runner

The GitHub Actions gate uses the maintained open-source emulator runner rather than a custom emulator boot script. KVM setup follows the runner's documented GitHub Actions pattern.

## Finding — singleton terminal recovery IDs were not retired

G13 already retired dynamic download registry entries on:

- successful durable completion;
- explicit user cancel.

The singleton families did not yet have the equivalent terminal cleanup:

- Favorite import;
- Pica bootstrap;
- Native Recommendation.

Their persisted WorkRequest UUID could therefore continue pointing at historical `SUCCEEDED` or explicitly `CANCELLED` WorkInfo after Activity/process reconstruction.

That is not a scheduler correctness error, but it violates the Task Center recovery contract because terminal historical work can be presented as if it is still the current logical task.

## Production correction

G15 adds terminal identity cleanup for the three singleton families.

### Explicit cancel

Each explicit cancel path now clears its current recovery UUID before cancelling unique work.

Pause is deliberately different:

- Favorite import pause keeps the UUID;
- Pica bootstrap pause keeps the UUID;
- Native Recommendation pause keeps the UUID.

A PAUSED job must remain reconstructible.

### Successful completion

Each Worker clears the recovery UUID only after the existing durable success boundary has completed:

- Favorite import: after Favorite cache work + Catalog reconciliation;
- Pica bootstrap: after favorite/catalog merge, cache save, Catalog reconciliation and recommendation invalidation;
- Native Recommendation: after the accepted recommendation snapshot has been built/published.

Failure/retry does not clear the UUID, so diagnostic/retry state remains reconstructible.

## Debug-only running probe

`WorkerRecoveryProbeWorker` lives under:

`app/src/debug/java/...`

It is excluded from release builds.

The probe:

1. increments a durable run counter;
2. remains RUNNING until the process is externally stopped;
3. never exposes a production entry point;
4. exists only to prove WorkManager process-death reconstruction on the debug acceptance artifact.

This avoids modifying real provider/network Workers purely to create a deterministic kill point.

## Normal-process seed + force-stop + verification harness

The seed phase deliberately does **not** run under instrumentation. Android itself force-stops the target package when an instrumentation session starts/finishes, which would add unrelated process-death events to the evidence window.

Instead, `WorkerForceStopSeedActivity` exists only in the debug source set and is started as a normal app Activity through an explicit ADB component launch.

### Normal app seed Activity

`WorkerForceStopSeedActivity`:

- clears prior harness state;
- creates real WorkManager rows using the actual production Worker classes;
- leaves Pica bootstrap and Native Recommendation ENQUEUED with durable singleton IDs;
- pauses Favorite import, leaving its CANCELLED WorkInfo + durable pause/current identity;
- leaves one Pica download ENQUEUED;
- pauses one E-H download, leaving CANCELLED WorkInfo + durable pause/download identity;
- explicitly cancels another Pica download and verifies its registry identity is removed;
- starts the debug-only recovery probe and waits for `RUNNING`;
- commits the seed PID, UUIDs and preference state to disk;
- writes an app-private READY marker;
- stays alive as the ordinary foreground app process until the host force-stops it.

The debug manifest alone exposes this seed Activity to ADB. The release manifest never contains it.

### Host boundary — real ADB force-stop

The host script waits for the READY marker and confirms the target process is alive, then runs:

`adb shell am force-stop com.picalibrary.android.dev`

The first instrumentation process is expected to die because of that command. The harness does not treat its abrupt termination as a test failure.

A force-stopped Android package is intentionally not allowed to restart background work by itself. The host therefore verifies the target PID is gone, then performs a normal launcher re-entry:

`adb shell monkey -p com.picalibrary.android.dev -c android.intent.category.LAUNCHER 1`

The debug probe also writes an app-private plain-text run-count marker. After launcher re-entry, the host requires that marker to reach at least 2 and requires a new target PID before starting the verification instrumentation. This proves recovery occurs after legitimate app re-entry/WorkManager initialization rather than by bypassing force-stop semantics.

### Verification instrumentation

Only after the host has independently observed the probe execute again does it start `verifyDurableRecoveryStateAfterForceStop()`.

Instrumentation is verification-only. Any force-stop lifecycle that Android applies while starting the verifier occurs **after** the OS-level recovery evidence has already been captured.

It verifies:

- the current PID differs from the persisted seed PID;
- the debug probe run counter is at least 2, independently confirmed by the host after normal launcher re-entry, proving a fresh Worker instance was reconstructed after force-stop recovery;
- the force-stopped probe remains unfinished rather than becoming a false success;
- singleton current UUIDs persist for active/paused work;
- paused Favorite import remains paused;
- active Pica download remains registered and ENQUEUED;
- paused E-H download keeps its durable identity even though its historical WorkInfo is CANCELLED;
- explicitly cancelled Pica download history remains CANCELLED in WorkManager but is absent from the recovery registry;
- Task Center renders the active Pica logical download exactly once;
- Task Center renders the paused E-H logical download exactly once;
- Task Center does not resurrect the explicitly cancelled Pica download.

The probe is explicitly cancelled at the end of the verification invocation.

## CI gate

Workflow:

`.github/workflows/android-worker-force-stop-recovery.yml`

Runner:

`scripts/run-android-worker-force-stop-recovery.sh`

The workflow:

- builds the normal debug app + androidTest APK;
- installs both on an API 35 x86_64 Google APIs emulator;
- uses KVM hardware acceleration on GitHub's Ubuntu runner;
- starts the debug seed Activity in a normal app process;
- performs force-stop → confirmed process death → normal launcher re-entry → WorkManager probe recovery;
- only then starts fresh verification instrumentation;
- uploads the short recovery diagnostics artifact.

This is additive to the normal Android unit/lint/release-build CI gate.

## Recovery matrix covered by G15

| Family | Seed state before force-stop | Expected after relaunch |
| --- | --- | --- |
| Debug WorkManager probe | RUNNING | fresh execution occurs; run count >= 2; never false-success |
| Favorite import | PAUSED + CANCELLED WorkInfo + durable UUID | pause + UUID survive |
| Pica bootstrap | ENQUEUED + durable UUID | ENQUEUED + UUID survive |
| Native Recommendation | ENQUEUED + durable UUID | ENQUEUED + UUID survive |
| Pica download | ENQUEUED + durable registry identity | one Task Center logical card |
| E-H download | PAUSED + CANCELLED WorkInfo + durable registry identity | one paused Task Center logical card |
| Explicitly cancelled Pica download | CANCELLED WorkInfo, registry removed | does not re-register or reappear |

## Source-contract protection

`test/unit/long-task-stability-v047.test.ts` locks:

- singleton `clearWorkId(...)` terminal cleanup;
- Worker success calls to the corresponding `complete(...)` boundary;
- the debug-only running probe;
- the two instrumentation invocations;
- the fresh-PID assertion;
- the probe second-run assertion;
- Task Center non-resurrection assertion;
- the host `adb shell am force-stop` command;
- the emulator-runner workflow.

## Deliberate non-claims

G15 is real process-death evidence, but it is not the final Android runtime gate.

It does **not** yet prove:

- OEM-specific background restriction behavior;
- low-memory killer behavior on representative physical hardware;
- notification/foreground-service recovery across every vendor;
- long-session memory stability;
- concurrency/resource budgets under simultaneous download/recommendation/scan work;
- provider-network partial-transfer behavior at every possible kill point.

The debug probe establishes the WorkManager process-death scheduler boundary. Existing family-specific durable-store/checkpoint contracts continue to govern partial user data.

## Next P2-G work

After G15 acceptance:

1. exercise low-memory/background restriction scenarios;
2. validate notification/foreground-service behavior on representative Android hardware;
3. define Android task concurrency/resource budgets from measured evidence;
4. capture large-Catalog + long-Reader timing/jank/memory evidence;
5. then close the remaining P2-G acceptance items or explicitly transfer them into P2-J/P2-K.
