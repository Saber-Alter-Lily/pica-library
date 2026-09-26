# P2-K Reference Evidence Collection — K1

Status: **collection-tooling candidate / no performance budgets selected**

## Purpose

K1 turns the completed P2-J instrumentation into a reproducible
**Windows x64 reference-machine evidence bundle**.

It does not create performance thresholds. It standardizes how raw evidence is
collected, labeled and hashed so later budget decisions can be based on
comparable runs rather than anecdotal timings.

## Default safe matrix

`scripts/benchmark/run-p2k-windows-reference.ps1` runs:

- J3 Desktop process startup/shutdown;
- J4 browser Home/Library;
- J5 Detail/Shelf/Reader;
- J6 Reader long session;
- J7A deterministic managed-V3 batch switching;
- J8 controlled active LOCAL download;
- J9 controlled local WebDAV;
- J11 controlled LOCAL-download + WebDAV overlap.

These paths are isolated/local and do not require real Provider credentials.

## Explicit opt-in evidence

### J10 real Visual model

Add:

`-IncludeVisual`

The runner then passes `--allow-model-network` to the real J10 harness. This
may download Transformers.js/DINOv2 model artifacts and must be recorded as
cold/warm cache context.

### J7B real Recommendation generation

J7B is **not** called by K1. It intentionally mutates the current managed
recommendation cycle and requires a configured real Provider plus explicit:

`--confirm-regeneration=YES`

Collect it separately under the documented J7B protocol and attach the approved
low-cardinality provider/network/proxy context to the P2-K evidence review.

## Working-tree authority

By default K1 refuses a dirty git worktree.

`-AllowDirty` exists only for diagnostic collection. A dirty evidence bundle
is marked `dirty=true` and must not silently become the reference baseline.

## Environment capture

K1 records:

- exact git commit;
- dirty state;
- Windows caption/version/build;
- machine manufacturer/model;
- physical RAM;
- CPU model/core/logical-processor/clock metadata;
- GPU/driver/current refresh-rate metadata where Windows exposes it;
- active Windows power plan;
- Node and pnpm versions.

No account credentials or Provider secrets are collected.

## Evidence bundle

Default path:

`test-results/p2k/windows-x64/<timestamp>/`

The directory contains:

- `environment.json`;
- `run-status.json`;
- raw benchmark JSON outputs;
- `p2k-evidence-manifest.json`.

The manifest records SHA-256 and byte size for every evidence file, run exit
states, commit identity and whether the expected matrix completed.

It explicitly keeps:

- `budgetSelected=false`;
- `concurrencyCapacitySelected=false`.

## Example

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/benchmark/run-p2k-windows-reference.ps1
```

With real Visual model evidence:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/benchmark/run-p2k-windows-reference.ps1 -IncludeVisual
```

## Still external after K1

K1 alone does not close P2-K. Remaining evidence includes:

- J7B real Provider regeneration;
- repeated J10 cold-cache and warm-cache real-model runs;
- representative physical Android G18/G19 runs;
- explicit real Android download and Reader loaded scenarios;
- manual Windows and Android task-control acceptance;
- later Linux/macOS/ARM64 reference hardware when those previews mature.

## Budget gate

Do not select release budgets or P2-C3 enforcement from a single K1 bundle.

First collect repeated representative runs, review variance and workload
validity, and only then propose thresholds in a separate decision change.
