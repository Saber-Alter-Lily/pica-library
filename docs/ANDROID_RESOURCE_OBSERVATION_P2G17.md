# Android Cross-task Resource Observation — P2 G17

Status: **observe-only implementation candidate / no production throttling**

Parent:
- `DEVELOPMENT_TASK_LOG.md` → P2-C Runtime resource classes and concurrency budgets;
- P2-G Android runtime hardening;
- `docs/RUNTIME_INVENTORY_P2.md` finding F-08 / H5.

Baseline:
- G16 is merged as PR #170.
- G16 closed generic Bitmap trim-memory and API-35 Doze defer/resume evidence.
- WorkManager 2.12.0 remains the durable Android scheduler.

## Why G17 is observation, not enforcement

The repository's P2-C design explicitly requires measurement before choosing capacities.

Android already has mature per-task lifecycle semantics:
- Native Recommendation V3;
- Pica/E-H downloads;
- Desktop favorites/covers import;
- Pica favorites/bootstrap.

The remaining risk is cross-task contention. WorkManager uniqueness prevents duplicate copies of one logical task but does not stop different heavy task families from overlapping.

G17 therefore makes overlap auditable without:
- changing WorkManager execution order;
- limiting parallelism;
- cancelling or delaying work;
- changing pause/resume/cancel semantics;
- changing provider retry budgets;
- changing recommendation semantics.

## Resource classes

`AndroidTaskResources` defines coarse tags:

| Resource | Current heavy Android owners |
| --- | --- |
| `provider-network` | Native Recommendation, Pica bootstrap |
| `media-network` | Pica download, E-H download |
| `bridge-network` | Desktop favorites/covers import |
| `cpu-analysis` | Native Recommendation |
| `filesystem-heavy` | Pica/E-H downloads, Pica bootstrap, Desktop favorites/covers import |

Tags use the prefix:

`pica-resource:`

These are diagnostic classes, not rates or capacities.

## WorkRequest tagging

Existing WorkRequest builders retain their current:
- unique-work names;
- WorkManager policies;
- network constraints;
- backoff;
- provider/comic/episode tags;
- durable recovery IDs.

G17 only adds resource tags.

A single work item may occupy several classes. For example, Native Recommendation is tagged:
- provider-network;
- cpu-analysis.

## Snapshot semantics

`AndroidTaskResources.snapshot(Context)` queries WorkManager by each resource tag.

It reports:
- running count per resource;
- waiting count per resource;
- de-duplicated running WorkRequest IDs;
- de-duplicated waiting WorkRequest IDs;
- resource classes per WorkRequest ID.

States are interpreted as:
- RUNNING → current resource use;
- ENQUEUED/BLOCKED → waiting work;
- terminal states → not active resource demand.

If one WorkRequest carries two resource tags, it increments both resource counters but only one de-duplicated work-total entry.

The snapshot does not persist historical peaks. That is deliberate: G17 provides the common observation primitive; representative-device sampling can compute peak/overlap externally without turning diagnostics into a second task authority.

## Test evidence

`AndroidTaskResourcesTest` uses the official WorkManager test harness.

A single delayed WorkRequest is tagged with:
- provider-network;
- cpu-analysis.

The test requires:
- both tags are present in real WorkInfo;
- waiting(provider-network) = 1;
- waiting(cpu-analysis) = 1;
- waitingTotal() = 1, proving the multi-resource task is not double-counted.

## Debug-only real-device collector

`AndroidResourceObservationActivity` exists only under `src/debug`.

It writes:

`files/p2-g17-resource-snapshot.json`

with:
- capture timestamp;
- running/waiting totals;
- per-resource running/waiting counts;
- running/waiting WorkRequest IDs;
- resource classes by WorkRequest ID.

It is intentionally absent from the release manifest and ordinary UI.

A QA/device session can capture a snapshot with ADB while workloads are active:

1. start the desired task combination normally;
2. invoke the debug observation Activity;
3. read the app-private JSON with `run-as`;
4. repeat across the workload window to derive overlap/peak evidence.

This is an instrumentation surface, not an end-user feature.

## What G17 can answer

After merge, device evidence can directly answer:
- are recommendation and downloads actually RUNNING together?
- are provider-network tasks overlapping?
- are media-network and filesystem-heavy tasks stacking?
- how many distinct heavy WorkRequests are RUNNING vs merely waiting?
- which task combinations should be used in P2-J Android latency tests?

## What G17 cannot answer by itself

G17 does not measure:
- CPU percentage;
- RSS/PSS;
- bytes/sec;
- frame jank;
- foreground latency;
- provider QPS;
- filesystem throughput.

It also does not prove that a given overlap is harmful.

Those measurements belong to P2-J/P2-K representative scenarios.

## Promotion rule for budgets

No Android capacity should be enforced solely because two resources can overlap.

Before G18/P2-C3 enforcement, collect at minimum:
- idle baseline;
- download-only;
- recommendation-only;
- import/bootstrap-only where representative;
- download + recommendation;
- download + import/bootstrap;
- Reader foreground use while heavy background work exists.

For each scenario record:
- resource snapshot samples;
- foreground Library/detail/Reader latency;
- memory where practical;
- hardware/API level;
- network state.

Only then choose:
- allowed combinations;
- serialized combinations;
- background deprioritization;
- user-visible task priority;
- any WorkManager constraint or executor change.

## Next

After G17 source/test acceptance:
1. capture representative Android resource-overlap + foreground latency evidence;
2. decide whether a conservative Android enforcement policy is justified;
3. if justified, implement G18/P2-C3 budgets centrally and test competing workloads;
4. continue large-Catalog and long-Reader timing/jank/memory evidence.

OEM battery-manager and foreground-notification behavior remain physical-device evidence gates and are not closed by G17.
