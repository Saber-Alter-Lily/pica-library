# Desktop Active-download Foreground Latency — P2 J8

Status: **SOURCE/HARNESS PASS / PR #186 merge-ready / no latency budget selected**

Accepted source/harness evidence on head `49378566d15e369b8a31ccd9732532b80e6e63a1`:
- Desktop Active Download Latency Harness `36231026283`: PASS;
- P2 Runtime Hardening Promotion Gate `36231026257`: PASS;
- normal CI `36231026271`: PASS;
- Desktop Startup Harness `36231026336`: PASS;
- Desktop Browser Home Harness `36231026254`: PASS;
- Desktop Browser Detail Reader Harness `36231026391`: PASS;
- Desktop Reader Long Session Harness `36231026242`: PASS;
- Desktop Recommendation Benchmark Harness `36231026327`: PASS;
- Android Macrobenchmark Build `36231026302`: PASS;
- Android Worker Force-Stop Recovery `36231026239`: PASS;
- Android Memory and Background Restrictions `36231026291`: PASS;
- Experimental Linux Package `36231026245`: PASS;
- Experimental macOS arm64 Package `36231026292`: PASS;
- Experimental Windows ARM64 Package `36231026265`: PASS;
- Experimental Docker Headless Package `36231026290`: PASS.

These hosted-runner results establish source/harness acceptance only. They do not establish P2-K reference performance budgets.

Parent:
- `DEVELOPMENT_TASK_LOG.md` → P2-J Performance instrumentation;
- J1 local HTTP latency telemetry;
- J2 repeatable idle/load measurement windows;
- P2-K real benchmark matrix and evidence-driven budgets.

## Purpose

P2-J requires explicit evidence for:

**download queue API responsiveness under active transfers**

J1 already measures real loopback request latency and correlates each request with
active runtime task types.

J2 already defines valid idle/load windows, but it deliberately requires a human
to start the measured background workload first.

J8 adds one deterministic load source so the download-active foreground path is
repeatable in CI and on developer machines without Provider credentials or
external network variability.

J8 does not replace J1/J2. It creates the controlled workload and delegates all
latency/window measurement to J2.

## Controlled workload

J8 uses the real production:

- `LibraryDatabase`;
- `LibraryService`;
- `DownloadScheduler`;
- `MediaRequestGate`;
- LOCAL download queue;
- SQLite download-job/progress writes;
- real filesystem output;
- shared `RuntimeResourceCoordinator` lease:
  `local-download-runner`.

The synthetic Provider adapter exists only inside the benchmark harness.

It supplies:
- one fixed synthetic comic;
- one fixed episode;
- a configurable number of synthetic pages;
- deterministic fixed-size chunks.

No Pica account, E-H session, proxy, WebDAV target or external Provider is used.

The fixed page URLs use:

`https://fixture.invalid/...`

and are never fetched. The local adapter handles `downloadToFile()` directly.

## Active-transfer validity

J8 requires **two independent signals** during the measured foreground window.

### 1. Runtime resource coverage

J2 load mode requires:

`local-download-runner`

to cover every foreground sample in every accepted round.

This proves the real production download runner/resource lease remained active.

### 2. Real file writes inside the measurement window

The synthetic `downloadToFile()` writes each page in delayed chunks and records
a timestamp after every actual `appendFile()`.

J8 rejects the run if:

`writesDuringMeasuredWindow === 0`

This prevents a blocked/stale resource lease from being mislabeled as an
active-transfer workload.

## J2 reuse

`scripts/benchmark/http-latency-scenario.ts` now exports:

- `ScenarioOptions`;
- `scenarioOptions(...)`;
- `runHttpLatencyScenario(...)`.

Its command-line behavior remains unchanged.

The module only runs its CLI `main()` when executed directly.

J8 imports `runHttpLatencyScenario()` and never reimplements:

- foreground request selection;
- J1 telemetry reset;
- resource-state wait logic;
- task-coverage validation;
- idle/load validity rules;
- latency profile aggregation.

That keeps one authority for J2 measurement semantics.

## Default J8 fixture

Default controlled load:

- 120 pages;
- 4 chunks per page;
- 32 KiB per chunk;
- 20 ms delay before each chunk write;
- LOCAL job concurrency = 1;
- global media concurrency = 1;
- request interval = 0;
- retry count = 0.

All values can be overridden from the command line.

These defaults are workload-shaping parameters, not performance budgets.

## Command

`pnpm benchmark:desktop-download-load`

Useful overrides:

```bash
pnpm benchmark:desktop-download-load -- \
  --rounds=3 \
  --iterations=10 \
  --warmup=2 \
  --interval-ms=25 \
  --pages=160 \
  --chunks-per-page=4 \
  --chunk-delay-ms=20 \
  --bytes-per-chunk=32768 \
  --output=test-results/j8.json
```

## Machine-readable output

J8 reports:

- environment: Node/platform/arch;
- fixture shape;
- total bytes actually written;
- number of writes occurring during the measured window;
- final download status/progress/bytes/retry count;
- the complete J2 foreground result.

The J2 result still contains the authoritative:

- per-round validity;
- overall/idle/under-load latency profile;
- p50/p95/max;
- route-class breakdown;
- active-task coverage.

No local temporary path, credentials, comic ID from a real user library or
Provider route is emitted.

## CI boundary

Workflow:

`.github/workflows/desktop-download-load-harness.yml`

CI uses a short workload and one measurement round.

The CI run proves:

- J2 remains importable and directly executable;
- real LOCAL DownloadScheduler work starts;
- the load window is accepted by J2;
- real file writes overlap the foreground window;
- the fixture reaches COMPLETED;
- machine-readable JSON is produced.

Hosted-runner latency values are **harness validation only**.

They are not:
- a P2-K Windows reference measurement;
- a Provider throughput claim;
- a release latency threshold.

## Relation to real download evidence

J8 is intentionally a controlled local-load benchmark.

It is useful for:
- deterministic regression comparison;
- detecting gross event-loop/SQLite/filesystem interference;
- validating J1/J2 instrumentation under an actual production download runner.

It cannot represent:
- Pica CDN/network behavior;
- proxy latency;
- Provider rate limits;
- real media-server variability;
- Windows filesystem/AV behavior on a target user machine.

P2-K must still collect representative Windows x64 evidence under a real user
download workload where appropriate.

## J8 acceptance

Source/harness acceptance requires:

1. J2 CLI behavior remains intact;
2. J8 imports J2 rather than cloning its measurement logic;
3. the real production LOCAL download queue is used;
4. external Provider traffic is absent;
5. `local-download-runner` covers every accepted foreground sample;
6. at least one real fixture file write occurs during the measured window;
7. the fixture download completes;
8. JSON is emitted;
9. no latency/resource budget is selected.

## Next

After J8 source/harness acceptance:

1. add a similarly controlled WebDAV foreground-impact harness only if it can
   reuse the existing remote-storage task authority without inventing unsafe
   credentials/network behavior;
2. otherwise move to Visual/analysis foreground-impact instrumentation;
3. keep J2 real-task Windows x64 collection as the P2-K promotion evidence;
4. do not choose P2-C3 enforcement capacities until representative evidence
   justifies them.
