# Runtime Resource Coordinator — P2 C1

Status: **foundation implemented / production enforcement disabled**

Parent task: DEVELOPMENT_TASK_LOG.md → P2-C Runtime resource classes and concurrency budgets.

## Why C1 exists

P2-0 found that Pica Library already has several mature task executors: Desktop download scheduler/media gate, Recommendation V3 cooperative control, favorites sync, WebDAV sync, background maintenance, V5 Shadow, Work Identity evidence, Android WorkManager, and Android DownloadManager.

The missing layer is a process-wide language for resource pressure. C1 therefore adds a small coordination primitive, not a replacement executor.

## Resource classes

- provider-network
- media-network
- remote-storage-network
- cpu-model
- cpu-analysis
- filesystem-heavy
- sqlite-read-heavy
- sqlite-write-heavy

A task may request several classes atomically. Exact production declarations belong to later C2 integration and may vary by phase.

## Observe before enforce

The default coordinator mode is **observe**. In observe mode requests never wait, no production capacity is invented, overlapping leases are recorded, and current/peak usage plus bounded recent lifecycle events are available for diagnostics.

This follows the same measurement-first rule already adopted for Visual H2B: thresholds and limits must come from evidence rather than arbitrary constants.

The coordinator also implements an **enforce** mode so admission semantics can be tested before later use, but C1 does not enable enforcement in the application.

## Enforcement semantics

When an explicitly approved budget is eventually enforced:

- multi-resource acquisition is atomic;
- a task never reserves only part of its request while waiting for the rest;
- active work is not preempted;
- queued work is ordered by priority, then FIFO inside the same priority;
- foreground work may pass older background waiters once capacity is available;
- queued requests can be cancelled with AbortSignal;
- release is idempotent;
- unspecified resource capacities remain unbounded;
- requests larger than an explicit capacity fail instead of waiting forever.

Priority order is foreground → user → background. This is admission priority only; it does not terminate or suspend already-running work.

## Snapshot contract

The snapshot contains only operational metadata: mode, enforcement state, capacities or null, current usage, observed peak usage, active leases, waiting requests, and bounded recent start/release/cancel events.

It must never contain Provider credentials, cookies, bearer tokens, comic content, or user preference payloads.

## C1 acceptance

Unit tests cover:

- overlapping observe-only leases;
- atomic multi-resource acquisition;
- priority ordering;
- cancellation of queued work;
- idempotent release;
- bounded event history;
- invalid/impossible request rejection.

## C1 non-goals

C1 does not select Desktop or Android production capacities, change download concurrency, change Provider retry/rate-limit behavior, block existing tasks, change Recommendation serving, alter Visual science/activation, alter Work Identity semantics, or persist resource history across restart.

## Next — C2 observation integration

After C1 acceptance, existing heavy tasks should declare resource leases in observe-only mode. Initial order:

1. maintenance update / repair / organize;
2. Recommendation V5 Shadow;
3. Work Identity evidence refresh;
4. Recommendation V3 / favorites sync;
5. WebDAV;
6. local download runner;
7. synchronous Visual analysis timing paths where practical.

The purpose of C2 is to capture actual overlap. Only after overlap and latency evidence exists should C3 propose enforceable capacities.