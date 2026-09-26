# P2-K Android Real Download / Reader Evidence — K3

Status: **physical-device collection tooling candidate / real user-selected inputs required / no budgets selected**

K3 fills the Android evidence gap deliberately left open by K2.

## Open-source / platform reuse

K3 does not introduce a new benchmark framework. It continues to use AndroidX
Macrobenchmark 1.5.0 and UiAutomator 2.4.0 already adopted by G18/G19.

## Real-data policy

K3 explicitly forbids synthetic media as promotion evidence.

The tester must:
- configure a real source;
- start a sufficiently large real download;
- choose a real comic/chapter for Reader evidence.

The benchmark verifies real WorkManager resource ownership:
- `media-network`;
- `filesystem-heavy`.

Both must remain RUNNING before and after the measured interaction.

## Scenarios

### real-download-loaded-navigation

With a real download already running, measure top-level navigation FrameTiming
across Recommendation / Library / Online / Settings while download resources
remain RUNNING.

### real-reader-under-download

A benchmark-only exported bridge Activity receives explicit real comic/chapter
arguments and launches the production non-exported `ReaderActivity` from the
same app package.

While a separate real download remains RUNNING, Macrobenchmark performs repeated
Reader swipes and records FrameTiming/Perfetto evidence.

The collector also stores raw `dumpsys meminfo` snapshots immediately before
and after the Reader run. These are review evidence only, not a memory budget.

## Privacy

Raw comic/chapter IDs are never written into the evidence JSON. Only SHA-256
identities are retained. Credentials are never read/exported.

## Commands

```bash
bash scripts/run-android-real-load-macrobenchmark.sh prepare
bash scripts/run-android-real-load-macrobenchmark.sh download-loaded
bash scripts/run-android-real-load-macrobenchmark.sh reader-loaded \
  --comic-id=<REAL_ID> --episode-id=<REAL_CHAPTER_ID> --source=pica --title="..."
```

## Evidence boundary

K3 remains tooling until executed repeatedly on representative physical hardware.
It does not select:
- frame budgets;
- memory budgets;
- P2-C3 concurrency capacity;
- provider throughput claims.

K2 G18/G19, K3 download/Reader evidence, Windows K1, real Visual/provider evidence
and manual task-control acceptance must be reviewed together before P2 promotion.
