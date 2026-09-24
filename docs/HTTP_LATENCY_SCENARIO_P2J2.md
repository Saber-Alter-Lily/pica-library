# Desktop HTTP Latency Scenario Harness — P2 J2

Status: **repeatable Desktop measurement windows implemented / no latency budget selected**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-J Performance instrumentation.

## Purpose

J1 added real local HTTP latency telemetry. J2 makes that telemetry repeatable enough to collect comparable Desktop evidence without turning the application into a synthetic throughput benchmark.

The harness deliberately models **sequential foreground interaction** rather than saturating the local server with concurrent requests. The question is whether ordinary Library/detail/Reader interactions stay responsive while real background work is active.

The implementation follows the project's existing benchmark convention: machine-readable JSON, explicit environment metadata and a warning that the output is evidence rather than an approved performance threshold.

## Command

An already-running Desktop engine is required.

Default loopback URL:

```text
http://127.0.0.1:4789
```

If Desktop had to fall back to another local port, pass the actual loopback URL with `--base-url` or `PICA_BASE_URL`.

### Idle reference

```bash
pnpm benchmark:http-latency-scenario -- --mode=idle
```

The harness waits until the shared resource coordinator has no active observed task, warms the foreground paths, resets the J1 telemetry window, then records three measurement rounds by default.

### One background workload

Start the real task from Pica Library first, then run for example:

```bash
pnpm benchmark:http-latency-scenario -- --mode=load --task=local-download-runner
```

The harness waits for the requested task type to become active before each round and rejects a measurement window if that task does not cover every recorded foreground sample.

Examples of current Desktop task types:

- `local-download-runner`
- `github-download-runner`
- `remote-storage-sync`
- `recommendation-v3-build`
- `favorites-sync`
- `recommendation-v5-shadow`
- `work-identity-evidence-refresh`
- `maintenance-update-scan`
- `maintenance-repair-scan`
- `library-organize`

Multiple required tasks may be supplied by repeating `--task` or using a comma-separated value. This is useful for observing real overlap, but it does not authorize C3 enforcement.

## Default foreground request set

Each iteration drives read-only or query-only normal application paths:

1. local status;
2. Library facet query;
3. shelves;
4. downloaded-library listing;
5. Reader progress;
6. one comic detail when the local catalog is non-empty;
7. that comic's Reader chapter list when available;
8. one local chapter detail when available.

The harness discovers the optional comic/chapter target before the measured window and does not emit those IDs in its JSON result. J1 itself continues to retain only low-cardinality route classes, status, duration and internal task types.

## Measurement protocol

Defaults:

- 3 rounds;
- 10 foreground iterations per round;
- 2 warm-up request sets before measured rounds;
- 25 ms gap between foreground iterations;
- 30 second wait for the required idle/load state.

Overrides:

```bash
pnpm benchmark:http-latency-scenario -- \
  --mode=load \
  --task=remote-storage-sync \
  --rounds=3 \
  --iterations=20 \
  --warmup=2 \
  --interval-ms=25 \
  --wait-timeout-ms=60000 \
  --base-url=http://127.0.0.1:4789
```

Only local loopback HTTP URLs are accepted. Credentials embedded in the URL are rejected.

## Output and validity

Each JSON round includes:

- wall time for the foreground request sequence;
- request-set size and iteration count;
- expected and observed task types;
- task coverage for load scenarios;
- the complete bounded J1 profile for that clean window.

A window is structurally valid when:

- idle mode records every foreground sample with no active observed background task; or
- load mode records every foreground sample while every requested task type is active.

This is only a **measurement-window validity rule**. It is not a latency budget and does not say whether the measured performance is acceptable.

Unexpected additional task types remain visible in the profile so mixed-load evidence is not mistaken for isolated-load evidence.

## What J2 does not do

J2 does not:

- start, stop, pause or resume the background task being measured;
- change download, WebDAV, recommendation or Provider schedulers;
- create a global throughput benchmark;
- generate remote Provider traffic by itself;
- select p50/p95 thresholds;
- persist or upload telemetry;
- enable P2-C3 resource enforcement.

## Next evidence

Use J2 on a representative Windows x64 machine to collect, at minimum:

1. idle;
2. local downloads active;
3. WebDAV sync active;
4. Recommendation V3 active where a long enough run can be captured;
5. maintenance/analysis overlap when representative data is available.

Record hardware, library size, network/proxy state and the actual task combination with the result. Repeat comparable scenarios rather than comparing one-off runs.

Android still needs its own startup/frame-jank/foreground latency instrumentation because WorkManager/DownloadManager and Android UI scheduling cannot be inferred from the Desktop Node HTTP path.

Only after real Desktop + Android evidence exists should P2-K define budgets or P2-C3 consider enforced capacities.
