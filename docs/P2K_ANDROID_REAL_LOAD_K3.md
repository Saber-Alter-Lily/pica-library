# P2-K Android Real Download / Reader Evidence — K3

Status: **SOURCE/CONTRACT PASS / merged as PR #192 / physical-device execution required / no budgets selected**

Final pre-merge head `d1b191cd32f72336d0693d2ead93a9b28b3a5afc` passed all 17 triggered workflows; merged commit: `f5517a7c34eec06a6db66a11055ab9aa784316e7`.

Accepted automated source/contract evidence on head `3792d8775d45c645d75a989cdee333283f3ea125`:
- P2-K Android Real Load K3 Contract `36242654203`: PASS;
- P2 Runtime Hardening Promotion Gate `36242654004`: PASS;
- normal CI `36242654001`: PASS;
- Android Macrobenchmark Build `36242654043`: PASS;
- Android Worker Force-Stop Recovery `36242654000`: PASS;
- Android Memory and Background Restrictions `36242654061`: PASS;
- P2-K Android Physical Evidence Kit Contract `36242654080`: PASS;
- P2-K Evidence Kit Contract `36242654015`: PASS;
- Desktop Startup/Home/Detail/Reader/Recommendation/Active-download/WebDAV/Visual/Overlap regressions: PASS.

This acceptance proves K3 collector syntax, privacy/authority contracts and benchmark-variant/Macrobenchmark compilation. It does not claim that representative physical-device real-download/Reader measurements have already been collected.

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
