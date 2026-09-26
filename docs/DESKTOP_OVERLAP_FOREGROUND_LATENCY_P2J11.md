# Desktop Overlapping-task Foreground Latency — P2 J11

Status: **SOURCE/HARNESS PASS / PR #189 merge-ready / no concurrency budget selected**

Accepted first-head source/harness evidence on `55d62f6edce2fb8780fc8ab4e12968cb1201ab87`:
- Desktop Overlap Foreground Latency Harness `36237597706`: PASS;
- P2 Runtime Hardening Promotion Gate `36237597682`: PASS;
- normal CI `36237597619`: PASS;
- Desktop Visual Index Foreground Harness `36237597698`: PASS;
- Desktop WebDAV Foreground Latency Harness `36237597683`: PASS;
- Desktop Active Download Latency Harness `36237597702`: PASS;
- Desktop Startup/Home/Detail/Reader/Recommendation regressions: PASS;
- Android Macrobenchmark, force-stop and memory/background gates: PASS;
- Linux/macOS/Windows ARM64/Docker experimental package workflows: PASS.

J11 hosted smoke validity evidence:
- `local-download-runner`: 24/24 foreground samples;
- `remote-storage-sync`: 24/24 foreground samples;
- real LOCAL file writes during measured window: 7;
- real WebDAV requests during measured window: 6;
- LOCAL download: 120/120 COMPLETED;
- WebDAV sync: 243 uploaded objects, 0 issues.

Hosted values establish overlap-harness validity only. They do not define P2-K budgets or P2-C3 capacities.

Parent:
- `DEVELOPMENT_TASK_LOG.md` → P2-J Performance instrumentation;
- J2 foreground measurement-window authority;
- J8 controlled LOCAL download workload;
- J9 controlled WebDAV workload;
- P2-C observe-only resource coordinator;
- P2-K real benchmark matrix and evidence-driven budgets.

## Purpose

J11 measures foreground API responsiveness when **two real background task
owners overlap in the same Desktop process**:

1. production LOCAL `DownloadScheduler` / `local-download-runner`;
2. production `RemoteStorageDesktopManager.sync()` /
   `remote-storage-sync`.

It does not create artificial resource leases.

## Reuse

J11 deliberately reuses existing accepted infrastructure:

- J2 `runHttpLatencyScenario(...)`;
- J8 deterministic synthetic Pica media adapter for a real LOCAL download;
- J9 pinned temporary `webdav-server@2.6.2` tool environment;
- one process-shared `RuntimeResourceCoordinator({ mode: 'observe' })`.

The J9 temporary WebDAV runner becomes script-selectable while retaining J9 as
its default behavior.

## Valid window

A foreground round is accepted only when J2 reports **both**:

- `local-download-runner`;
- `remote-storage-sync`;

for every recorded foreground sample.

J11 adds two independent physical-work checks during the measured wall-clock
window:

- at least one real LOCAL `appendFile()`;
- at least one real local WebDAV request.

This rejects a window where one task merely retains a lease while no longer
performing its workload.

## Isolation

All workload inputs are local and deterministic:

- no real Pica/E-H account;
- no external Provider request;
- no real WebDAV cloud;
- no user library IDs;
- no credentials;
- temporary filesystem/database only.

The WebDAV fixture remains an open-source temporary benchmark dependency, not a
production dependency.

## Output

Machine-readable output includes:

- environment;
- required overlapping task types;
- J2 per-round coverage/latency profile;
- LOCAL writes observed during the window;
- WebDAV requests/methods observed during the window;
- terminal LOCAL download status;
- terminal WebDAV sync summary.

## Evidence boundary

Hosted-runner values establish harness validity only.

J11 does not define:

- P2-C3 enforced capacities;
- a foreground latency budget;
- real Pica/WebDAV throughput;
- Windows filesystem/antivirus contention;
- representative user concurrency limits.

Those require P2-K representative hardware evidence.

## Acceptance

1. both production task owners share the same resource coordinator;
2. J2 is the only foreground timing/window authority;
3. both task types cover every accepted sample;
4. real download writes overlap the window;
5. real WebDAV requests overlap the window;
6. both workloads finish successfully;
7. no external Provider/cloud credentials are used;
8. machine-readable JSON is emitted;
9. no concurrency or latency budget is selected.

## Next

After J11 source/harness acceptance, the local automation-friendly P2-J
instrumentation matrix is substantially complete. Remaining promotion work
moves to P2-K representative hardware/real-provider evidence and only then to
P2-C3 enforcement if measured contention justifies it.
