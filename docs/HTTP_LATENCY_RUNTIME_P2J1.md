# Local HTTP Latency Observation — P2 J1

Status: **runtime telemetry implemented / no performance threshold selected**

Parent: DEVELOPMENT_TASK_LOG.md → P2-J Performance instrumentation.

## Goal

Measure the user-facing local API latency that ordinary Desktop/Web interactions actually experience, including while background work is active.

This answers a different question from the existing synthetic download and Visual harnesses:

- synthetic harness: how a bounded piece of code scales under controlled input;
- J1 runtime telemetry: how long real Library/detail/Reader/download/etc. local requests take on the user's machine during normal use.

## Privacy and cardinality boundary

The registry never stores:

- request URL;
- comic ID;
- episode/page ID;
- search query;
- request body;
- cookies/tokens/credentials;
- local filesystem path.

Requests are classified into low-cardinality route classes:

- status;
- library-query;
- comic;
- reader;
- downloads;
- downloaded;
- shelves;
- recommendation;
- recommendation-v5;
- maintenance;
- remote-storage;
- provider;
- desktop-control;
- other-api;
- static.

Active background work is associated only by sanitized internal task type, e.g. `local-download-runner` or `remote-storage-sync`.

## Storage boundary

The registry is:

- process memory only;
- bounded to the most recent 500 requests in the server integration;
- not written to SQLite/files;
- not uploaded;
- lost on process restart.

This is intentional for the first baseline. Persistent long-horizon performance telemetry would require a separate privacy/data-retention decision.

## Measurements

For overall, idle, under-load, each route class, and each observed background task type, the profile reports:

- sample count;
- p50 latency;
- p95 latency;
- maximum latency;
- HTTP >=400 count.

The most recent 100 bounded samples are also visible for debugging. They contain only timestamp, HTTP method, route class, status code, duration and internal active task types.

## Desktop diagnostic

`GET /api/v1/desktop/runtime/http-profile`

The endpoint is Desktop-control-plane only and is not added to W4B/W5 browser-session allowlists.

## Request lifecycle

Timing begins after the local server parses the request URL and before host/origin/CSRF/business routing.

Normal responses are recorded on the response `finish` event.

If a connection closes before the response is fully written, the request is recorded once with synthetic status 499. The one-shot recorder prevents finish/close double counting.

## Relation to P2-C resource observations

At request start, J1 snapshots the currently active internal task types from the process resource coordinator.

Therefore the runtime profile can compare, for example:

- Library query latency when idle;
- Library query latency while downloads run;
- Reader latency while WebDAV sync runs;
- comic/detail latency while Recommendation V3 or Work Identity analysis runs.

This is correlation/diagnostic evidence, not causal proof.

## No threshold yet

J1 does not define a release budget such as 'p95 must be under X ms'.

Thresholds require representative real Windows x64 and Android/device evidence. CI/shared-runner values and synthetic harness values must not be promoted into user-facing performance claims.

## J1 acceptance

Unit coverage requires:

- dynamic API paths map only to low-cardinality route classes;
- idle/under-load/route/task summaries are correct;
- unsafe task labels are sanitized;
- no path/query/ID fields appear in serialized snapshots;
- finish/close double recording is impossible.

## Next

1. collect representative Desktop profiles under idle + downloads + WebDAV + recommendation/analysis workloads;
2. add a repeatable scenario script that drives Library/detail/Reader foreground traffic while selected background tasks run;
3. add Android-specific foreground latency/jank observation rather than copying the Node HTTP mechanism;
4. only then propose P2-K performance budgets and C3 resource enforcement.