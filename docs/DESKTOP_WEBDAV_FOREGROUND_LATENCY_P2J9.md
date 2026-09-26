# Desktop WebDAV Foreground Latency — P2 J9

Status: **controlled local WebDAV harness candidate / no latency budget selected**

Parent:
- `DEVELOPMENT_TASK_LOG.md` → P2-J Performance instrumentation;
- J1 local HTTP latency telemetry;
- J2 repeatable idle/load measurement windows;
- I2 authoritative WebDAV task diagnostics;
- P2-K real benchmark matrix and evidence-driven budgets.

## Purpose

P2-J requires explicit evidence for:

**WebDAV scan impact on foreground API latency**

J9 adds one deterministic local WebDAV workload so foreground impact can be
measured repeatably without a user's cloud account, credentials, provider quota,
or internet route.

J9 does not replace real-provider P2-K evidence.

## Open-source fixture choice

The harness follows the same testing pattern used by the open-source
`webdav-client` project: run a real local `webdav-server` during tests.

J9 pins:

`webdav-server@2.6.2`

The package is installed into a temporary tool directory by
`scripts/run-desktop-webdav-load-harness.mjs`.

It is **not** added to Pica Library production or dev dependencies.

## Production path under test

J9 uses the real:

- `RemoteStorageDesktopManager.sync()`;
- `WebDavStorageProvider`;
- `RemoteLibrarySyncService`;
- process-shared `RuntimeResourceCoordinator`;
- `remote-storage-sync` task lease;
- `remote-storage-network`, filesystem and SQLite resource observations;
- local Library database and downloaded-page files;
- J1/J2 foreground HTTP latency measurement.

The only synthetic component is the loopback WebDAV server.

## Validity rule

A run is accepted only when both are true:

1. J2 confirms `remote-storage-sync` covers every foreground sample in every
   measured round.
2. The local WebDAV server records at least one actual WebDAV request between
   the J2 measured-window start and end timestamps.

The second condition prevents a stale or blocked resource lease from being
mislabelled as active WebDAV load.

## Workload shaping

Defaults:

- 320 downloaded pages;
- 16 KiB per page;
- 25 ms deterministic delay before each WebDAV request is dispatched;
- production RemoteLibrarySyncService page concurrency remains unchanged.

These values exist only to keep a real sync active long enough to overlap the
foreground sample window. They are not performance budgets.

## Command

`pnpm benchmark:desktop-webdav-load`

Example:

```bash
pnpm benchmark:desktop-webdav-load -- \
  --rounds=3 \
  --iterations=10 \
  --warmup=2 \
  --interval-ms=25 \
  --pages=320 \
  --bytes-per-page=16384 \
  --request-delay-ms=25 \
  --output=test-results/j9.json
```

## Output

Machine-readable JSON contains:

- Node/platform/architecture;
- fixture shape;
- local WebDAV request count;
- WebDAV methods observed overall and inside the measured window;
- remote sync completion summary;
- the complete J2 foreground latency profile.

It does not emit local temporary paths, credentials, user comic IDs, or real
provider endpoints.

## Evidence boundary

Hosted CI proves harness/source execution only.

It does **not** establish:

- WebDAV cloud-provider throughput;
- internet/proxy latency;
- vendor throttling;
- Windows filesystem/antivirus impact;
- a release latency threshold;
- P2-C3 concurrency enforcement capacity.

P2-K must still collect representative Windows x64 and real-provider evidence
where appropriate.

## J9 acceptance

Source/harness acceptance requires:

1. the temporary server is a pinned open-source package, not a home-grown
   WebDAV implementation;
2. production dependencies remain unchanged;
3. the real RemoteStorageDesktopManager sync path owns the load;
4. J2 remains the only foreground measurement/window authority;
5. every accepted sample is covered by `remote-storage-sync`;
6. real WebDAV traffic overlaps the measured window;
7. the local sync completes;
8. machine-readable JSON is emitted;
9. no latency/resource budget is selected.

## Next

After J9 source/harness acceptance:

1. add Visual-indexing foreground-impact instrumentation;
2. add controlled multi-task overlap scenarios;
3. keep real Windows/Android hardware collection under P2-K;
4. do not enable P2-C3 enforcement until evidence justifies capacities.
