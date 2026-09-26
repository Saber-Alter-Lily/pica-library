# P2-K Manual Task-control / OEM Acceptance — K4

Status: **manual-evidence tooling candidate / representative human execution required / no budgets selected**

Parent:
- P2-L Windows manual task-control external blocker;
- P2-L Android physical Task Center / foreground-notification / OEM blocker;
- P2-K evidence bundle authority from K1/K2/K3.

## Open-source-first structure

K4 does not add a manual-test framework dependency.

Its scenario wording follows the open-source Cucumber/Gherkin model:
**Given → When → Then**. This keeps each human acceptance claim tied to an
explicit precondition, action and observable outcome.

Machine evidence still uses the repository's existing SHA-256 P2-K manifest;
K4 does not introduce a fourth reporting format.

## Why this stays human

The remaining blockers are perceptual/system-integration questions that CI
cannot truthfully answer:

- does long work remain visible?
- do pause/resume/cancel controls feel and behave coherently?
- does ordinary Library/Detail/Reader usage stay usable?
- does Android Task Center agree with foreground notification state?
- under representative OEM background restrictions, does the app recover an
  honest durable state rather than silently claiming success?

K4 records those observations; it does not synthesize a PASS.

## Evidence policy

A PASS requires at least one attached screenshot, screen recording or log.

The recorder:
- binds evidence to the exact git commit;
- rejects dirty-tree promotion by default;
- requires native Windows for Windows acceptance;
- requires one physical non-emulator Android device for Android acceptance;
- stores Android device identity only as SHA-256;
- copies attachments into the evidence bundle and hashes them;
- writes one scenario JSON per acceptance row;
- reuses `p2k-evidence-manifest.json`;
- never selects a performance budget or concurrency capacity.

Do not place credentials, cookies, tokens or raw adb serials in notes/artifacts.

## Windows required scenarios

- `WINDOWS_LONG_TASK_VISIBLE`
- `WINDOWS_PAUSE_RESUME`
- `WINDOWS_CANCEL`
- `WINDOWS_FOREGROUND_USABILITY`

These directly cover the P2-L Windows external blocker.

## Android required scenarios

- `ANDROID_TASK_CENTER_VISIBILITY`
- `ANDROID_FOREGROUND_NOTIFICATION`
- `ANDROID_PAUSE_RESUME_CANCEL`
- `ANDROID_BACKGROUND_OEM`
- `ANDROID_FOREGROUND_USABILITY`

The Android initializer records physical device/build context plus current app
standby/device-idle observations when adb exposes them.

K4 does **not** require a task to continue running through every OEM policy.
A valid observation may be queued/paused/interrupted/recoverable. The required
property is honest, durable state and coherent user-visible controls.

## Commands

Initialize:

```bash
node scripts/benchmark/p2k-manual-acceptance.mjs init --platform=android
```

or on Windows:

```powershell
node scripts/benchmark/p2k-manual-acceptance.mjs init --platform=windows
```

Record one scenario:

```bash
node scripts/benchmark/p2k-manual-acceptance.mjs record \
  --root=<EVIDENCE_ROOT> \
  --scenario=ANDROID_TASK_CENTER_VISIBILITY \
  --result=pass \
  --artifact=<SCREENSHOT_OR_LOG> \
  --notes="Observed durable running state after relaunch"
```

Multiple `--artifact` arguments are allowed.

Finalize only after all required rows are recorded:

```bash
node scripts/benchmark/p2k-manual-acceptance.mjs finalize --root=<EVIDENCE_ROOT>
```

A recorded FAIL remains valid evidence but finalization exits non-zero and the
manifest remains incomplete for promotion.

## Evidence boundary

K4 tooling does not close P2 by itself. Still required:
- actual K1 Windows reference runs;
- physical K2 G18/G19 runs;
- physical K3 real download/Reader runs;
- real J10 Visual cold/warm evidence;
- J7B real Provider evidence;
- review of repeated variance before any performance budget;
- low-end Windows/browser trace where required by P2-F.

Only after those results exist should P2-C3 capacities or release thresholds be
proposed.
