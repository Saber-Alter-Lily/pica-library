# Transactional Recommendation Impression Batching — P2 D7C

Status: **Web impression bursts micro-batched / other recommendation events remain single-event**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-D SQLite/query/write discipline.

Dependencies:

- D7A reduced download-progress read amplification without changing its 250 ms persistence cadence.
- D7B added `recordUserEvents()`, a short synchronous SQLite transaction for naturally grouped event arrays.
- D8A independently adds the missing comic-first picture-count index.

## Finding

Recommendation telemetry does not have one uniform write shape.

### Not a burst

`recommend_batch_presented` is emitted once when a recommendation batch is rendered. It is a single evidence event and does not benefit from batching.

Feedback/detail events are also independent user actions:

- `recommend_like`;
- `recommend_dislike`;
- `recommend_feedback_reason`;
- `recommend_detail_open`.

Combining those across requests would blur action boundaries and is outside D7C.

### Actual burst

Web recommendation impressions use an `IntersectionObserver`.

For each visible recommendation card:

1. the card must be at least 50% visible;
2. it must remain visible for 800 ms;
3. then one `recommend_impression` is emitted.

A recommendation batch commonly contains 12 cards. Multiple cards can cross the 800 ms threshold at nearly the same time, producing several independent POST requests and several independent SQLite commits even though they belong to one natural UI burst.

## D7C change

### Client micro-batch

After an impression passes the existing 800 ms visibility gate, the event is queued for a **25 ms** micro-batch window.

Each queued event freezes its own:

- client observed timestamp;
- app session ID;
- recommendation cycle ID;
- context ID;
- batch index;
- comic ID;
- zero-based rank position;
- dedupe key.

The batch therefore does not depend on whatever recommendation state happens to be current when the HTTP request is eventually sent.

A batch is capped at **24 events**. The current UI normally produces at most one 12-card recommendation burst, so the cap is a safety boundary rather than an expected operating size.

The request uses `keepalive: true`, and a pending batch is flushed when the document becomes hidden.

### Dedicated batch endpoint

`POST /api/v1/recommendation-events/batch`

is intentionally narrow.

It accepts only:

`recommend_impression`

events.

It rejects:

- empty batches;
- more than 24 events;
- non-object entries;
- any other recommendation event type;
- missing cycle/comic/dedupe context;
- invalid batch index;
- invalid zero-based rank position.

The existing single-event endpoint is unchanged.

### Transactional persistence

The batch endpoint calls:

`LibraryService.recordRecommendationEvents()`

which delegates to the D7B `LibraryDatabase.recordUserEvents()` transaction.

The existing single-event recorder remains the only event serialization/validation implementation inside that transaction.

Therefore each impression preserves the same:

- generated event ID;
- server observed time;
- client observed time metadata;
- private metadata guard;
- dedupe semantics;
- recommendation context fields.

If any event fails storage validation, the whole impression batch rolls back.

## Zero-based rank compatibility

The Web result cards use:

`data-result-rank="${rank}"`

where Array.map rank starts at **0**.

The existing single-event route already accepts rank 0.

D7C explicitly preserves that contract. The batch endpoint accepts integer ranks `>= 0`, and regression coverage requires the first batched impression to retain rank 0.

## Reliability boundary

D7C does not promise durable offline telemetry delivery.

The previous implementation also sent impressions fire-and-forget and ignored network failure. D7C preserves that product boundary while reducing request/transaction fan-out. `keepalive` and hidden-document flushing reduce avoidable loss during page transitions but do not create an offline queue.

Dedupe keys remain per impression, so repeated delivery remains idempotent at the event store.

## Regression coverage

The D7C server regression starts a real local Library server and SQLite database and requires:

1. three impressions submitted in one batch persist as three separate events;
2. rank positions remain `0, 1, 2`;
3. one metadata-unsafe event causes the entire transaction to roll back;
4. non-impression event types are rejected by the batch endpoint;
5. batches above 24 events are rejected.

Source-contract coverage requires:

- the Web observer to call `queueRecommendationImpression()`;
- the batch endpoint to be used for the micro-batch;
- `recommend_batch_presented` to remain on the ordinary single-event path;
- ordinary feedback POSTs to remain on the existing single-event endpoint;
- `keepalive: true` on the impression batch request.

## Deliberate non-scope

D7C does not change:

- the 50% visibility threshold;
- the 800 ms dwell threshold;
- recommendation ranking or serving;
- event dedupe keys;
- event evidence granularity;
- batch-presented semantics;
- like/dislike/detail event delivery;
- Android telemetry;
- download progress cadence;
- SQLite journal mode;
- any performance budget;
- P2-C3 resource enforcement.

## Next P2-D evidence

After D7C and D8A:

1. compare Library/detail scaling after the picture-count index before considering aggregate CTE/join rewrites;
2. use J1/J2 foreground latency under real download/WebDAV/recommendation load before changing any remaining write cadence;
3. inspect other event bursts only when multiple writes are naturally part of one authoritative user operation;
4. avoid generic asynchronous event buffering until persistence/recovery semantics are explicitly designed.
