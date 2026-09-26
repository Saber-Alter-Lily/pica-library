# P2-K Android Physical-device Evidence Kit — K2

Status: **collection tooling candidate / physical-device execution required / no budgets selected**

Parent:
- `DEVELOPMENT_TASK_LOG.md` → P2-K real benchmark matrix;
- G18 Android idle foreground Macrobenchmark;
- G19 real Native Recommendation loaded Macrobenchmark;
- K1 Windows x64 reference evidence kit.

## Purpose

K2 standardizes the first required Android physical evidence pair on the
**same physical device and exact commit**:

1. G18 idle startup/navigation baseline;
2. G19 real Native Recommendation overlap.

K2 does not replace those accepted Macrobenchmark implementations. It provides a
staged evidence session and one hashed manifest.

## Physical-only policy

The collector rejects:
- emulator / generic-device evidence;
- a changed physical device between stages;
- a changed git commit between stages;
- a dirty worktree unless explicitly acknowledged for diagnostic-only output.

The copied evidence stores a SHA-256 of the adb serial rather than retaining the
raw serial in the K2 bundle's `device.json`.

## Staged protocol

### Baseline

```bash
bash scripts/benchmark/run-p2k-android-physical.sh baseline
```

This runs G18 and creates a timestamped evidence root under
`test-results/p2k/android-physical/`.

### Prepare loaded state

```bash
bash scripts/benchmark/run-p2k-android-physical.sh prepare-loaded --root=<evidence-root>
```

The existing G19 prepare flow installs/opens the release-like benchmark app. The
tester then configures a real Pica source or real synced portable candidate base.

K2 never reads or exports those credentials.

### Loaded measurement

```bash
bash scripts/benchmark/run-p2k-android-physical.sh loaded --root=<evidence-root>
```

This executes the real G19 recommendation-overlap Macrobenchmark and copies its
benchmarkData/Perfetto artifacts into the same evidence session.

### Finalize

```bash
bash scripts/benchmark/run-p2k-android-physical.sh finalize --root=<evidence-root>
```

Finalization requires successful G18 and G19 rows and regenerates the SHA-256
manifest.

## Environment record

K2 captures commit/dirty state, manufacturer/model, Android API, ABI, SoC fields
when exposed, observed refresh rate, physical memory, build fingerprint and a
hashed device identity.

No performance or concurrency budget is selected.

## Still external after K2

Even a successful G18/G19 pair does not close Android P2-K. Still required:

- repeated runs on representative mid-range hardware;
- explicit real download-loaded navigation using a user-selected comic;
- recommendation + download overlap where both are genuinely RUNNING;
- Reader interaction under representative background load;
- long Reader session memory/jank;
- manual Android task-control acceptance;
- review together with Windows K1 and real Provider/Visual evidence before any
  P2-C3 enforcement choice.

K2 deliberately does not replace those with synthetic media.

## Acceptance

Tooling acceptance:
- Bash parses;
- K1 default manifest behavior remains unchanged;
- Android evidence type is supported;
- physical/emulator and same-device/same-commit guards exist;
- raw serial is removed from the K2 evidence copy;
- CI runs contract tests only, never physical performance numbers.

Evidence acceptance requires actual physical-device execution outside CI.
