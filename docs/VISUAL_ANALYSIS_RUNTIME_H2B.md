# Visual analysis runtime instrumentation — P2 H2B

Status: **measurement active / no foreground threshold selected**

## Purpose

H2B covers the read-only Visual analysis paths:

- Representation QC;
- Author Atlas;
- provisional Style Families.

These paths are manually triggered and do not change recommendation serving, but they can load the Visual embedding set and a large catalog, and the graph calculations can grow materially with the number of authors/prototypes.

The runtime plan is deliberately measurement-first:

1. record real invocation latency and input size;
2. collect synthetic scaling evidence for regression comparison;
3. collect normal Windows x64 usage evidence;
4. only then decide which calculations must become detached background tasks.

## Runtime telemetry

The Desktop service now keeps a bounded in-memory timing registry.

Each completed/failed run records:

- analysis kind;
- duration;
- catalog count;
- embedding count;
- relevant analysis parameters;
- outcome/error.

The diagnostic endpoint is:

`GET /api/v1/desktop/visual/runtime-profile`

It is Desktop-control-plane only. It does not trigger analysis.

The profile deliberately reports:

- `mode=OBSERVE_ONLY`;
- `foregroundThresholdMs=null`;
- `disposition=MEASURE_BEFORE_THRESHOLD`.

This prevents instrumentation from being mistaken for a performance claim or an automatic backgrounding policy.

## Synthetic scaling benchmark

Run:

`pnpm benchmark:visual-analysis`

Optional explicit sizes:

`pnpm benchmark:visual-analysis -- 500 2000 5000`

The harness uses deterministic synthetic comics and Visual vectors. It records the runtime of:

- Representation QC;
- Author Atlas;
- Style Families.

The output is useful for relative scaling/regression comparisons only. CI/shared-runner wall time is **not** accepted as the product foreground threshold.

## Promotion decision

A calculation may stay synchronous only if real usage shows that it remains short enough not to create a noticeable UI/API stall at representative library sizes.

A calculation should move to a detached controllable task when real evidence shows material foreground blocking. Backgrounding must preserve:

- read-only Visual evidence semantics;
- `servingImpact=false`;
- no Visual embedding rebuild;
- no automatic activation/promotion;
- no hidden execution on ordinary page open.

H2B is not complete merely because telemetry exists. The next decision requires collected timings.
