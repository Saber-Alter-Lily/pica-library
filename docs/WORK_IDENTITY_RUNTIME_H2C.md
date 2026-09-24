# Work Identity background runtime — P2 H2C

Status: **implementation candidate**

## Purpose

The Work Identity audit intentionally scans the complete catalog because correctness cannot be based on an arbitrary first-N list. That makes the evidence refresh a potentially expensive analysis path.

H2C changes the ordinary evidence-refresh workflow from one synchronous request into a cooperative background task without changing Work Identity semantics.

## Preserved scientific/product boundary

H2C does not:

- change the Work Identity resolver;
- change confidence thresholds;
- auto-create Work/Edition/Upload bindings;
- promote probable evidence into authoritative identity;
- remove `KEEP_SEPARATE` authority;
- enable materialization execution;
- change recommendation serving.

The existing synchronous `buildWorkIdentityAuditV5()` remains the deterministic baseline.

## Checkpointable audit

`buildWorkIdentityAuditAsyncV5()` uses the same pair-evaluation helper as the synchronous builder.

It yields/checkpoints during:

1. catalog bucketing;
2. candidate-bucket pair comparison.

The async result is required by tests to be exactly equal to the synchronous result for the same catalog, policy state and limit.

## Background evidence refresh

The ordinary Web refresh path now starts a service-owned task and returns immediately.

Task phases:

- `loading`;
- `bucketing`;
- `comparing`;
- `persisting`;
- terminal complete/failed/cancelled.

Controls:

- pause;
- resume;
- cancel.

The first full-catalog read is detached from the start request by yielding before it begins. The SQLite catalog materialization itself is still synchronous and is tracked for the later P2-D query/runtime audit.

## Commit boundary

The scan may produce provisional candidates in memory, but evidence is written only after:

- async audit completion;
- a final cancellation/pause checkpoint;
- transition into the persisting phase.

A cancelled incomplete scan does not publish a new partial evidence batch.

The existing evidence table remains the authority after persistence.

## API

- `POST /api/v1/recommendation-v5/work-identity/evidence/refresh` — start/reuse task.
- `GET /api/v1/recommendation-v5/work-identity/evidence/refresh/status` — authoritative state.
- `POST /api/v1/recommendation-v5/work-identity/evidence/refresh/control` — pause/resume/cancel.

## Web behavior

The Work Identity review surface:

- starts the background task;
- polls authoritative task state;
- shows phase/progress/candidate and pair-check counts;
- exposes real pause/resume/cancel controls;
- reattaches to an active task after the panel is recreated;
- reloads persisted evidence only after successful completion.

Opening the settings surface does not start a scan. The reattach probe is read-only.

## Remaining Work Identity runtime questions

H2C closes the evidence-refresh foreground path, but later P2 work still needs to measure:

- the synchronous full-catalog SQLite materialization at task start;
- review/materialization-preview latency;
- dry-run plan latency;
- interaction with the future CPU-analysis resource budget.

Those measurements belong to P2-D/P2-C and do not justify changing identity semantics.
