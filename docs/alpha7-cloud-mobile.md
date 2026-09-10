# Alpha7 Cloud + Mobile Architecture

Status: implementation baseline for `alpha7-cloud-mobile`.

## Product goal

Pica Library must no longer require the Windows desktop to be online for every mobile use case. The long-term product has three independent content sources with a deterministic priority order:

1. Desktop LAN bridge — fastest path for comics that already exist on the PC.
2. Remote storage — persistent library available when the PC is off.
3. Pica online provider — search/detail/preview for content that has not been downloaded anywhere.

The desktop remains the preferred download, organization and bulk-management node. Android becomes a real client rather than a thin remote screen.

## Repository discipline

Alpha7 uses one long-lived development branch: `alpha7-cloud-mobile`.

Do not create feature branches or workflows for every sub-feature. Keep one Alpha7 CI workflow and organize code by stable modules:

- `src/remote-storage/*`
- `src/mobile/*`
- `mobile/android-alpha2/*` until the Android directory rename is performed as a single cleanup change
- existing `web/*`

Historical Alpha3/4/5 branches remain frozen and are not development targets.

## Remote storage protocol v1

The default provider is WebDAV, but the on-disk/cloud layout is provider-neutral.

```text
PicaLibrary/
└── v1/
    ├── control/
    │   └── current.json
    ├── index/
    │   └── generations/
    │       └── 20260908T154700Z-<nonce>.json
    ├── comics/
    │   └── {comicId}/
    │       ├── manifest.json
    │       ├── cover.<ext>
    │       └── episodes/
    │           └── {episodeId}/
    │               ├── manifest.json
    │               └── pages/
    │                   ├── 000001.<ext>
    │                   ├── 000002.<ext>
    │                   └── ...
    └── state/
        ├── reading/
        └── recommendations/
```

### Invariants

- Paths use stable `comicId` / `episodeId`, never titles.
- Page files remain individually addressable. Do not make CBZ/ZIP the canonical cloud representation.
- `current.json` is the only mutable catalog pointer. A new generation is fully written and verified before `current.json` is replaced.
- Upload is additive/incremental by default. Remote deletion is a separate explicit mirror mode.
- Credentials never appear in `current.json`, manifests, logs, or the public desktop config.
- A partially failed upload must leave the previous generation readable.

## Desktop web design

Settings gains a new `Remote Storage` panel:

```text
Provider          WebDAV
Server URL        https://...
Username          ...
Password          ********
Root              /PicaLibrary
[Test connection] [Save]
```

Library gains a `Sync to remote storage` action with a dry-run summary before mutation:

```text
Local downloaded comics  137
Remote comics              82
New                         52
Changed                      3
Unchanged                   82
Remote-only                  0
Estimated upload          6.4 GB

[Start incremental sync]
```

The first implementation must expose connection test + sync planning before upload/delete actions are enabled.

## Android information architecture

Bottom-level destinations remain product-level, not transport-level:

- Library
- Discover
- Recommendations
- History
- Sources / Settings

The Library page may filter by availability:

- On this phone / cache
- Desktop LAN
- Remote storage
- Favorites

Do not make users choose a transport every time they open a comic. Reader source resolution is automatic.

### Reader source resolution

For a requested page:

```text
phone cache
  -> Desktop LAN (if reachable and page exists)
  -> Remote storage (if configured and object exists)
  -> Pica online preview (if authenticated and allowed)
```

The reader exposes the active source only as status/debug information.

## Online preview

Android gets a minimal provider client with only the calls required for interactive use:

- authentication/session restore
- search/browse
- comic detail
- chapter list
- picture list
- image fetch

The Android online provider is not a second bulk-download engine. Desktop remains the primary downloader.

## Recommendation architecture

Separate recommendation state into two layers.

### Portable state

Can be synchronized through remote storage:

- favorites/catalog snapshot required by the model
- Tag Registry version
- taste profile version / profile snapshot
- recommendation history and seen IDs
- user behavior events
- graph edges required by the ranker
- active cycle metadata and already materialized batches

### Provider-dependent work

Requires live Pica access:

- keyword recall
- author recall
- related-comic recall
- fetching new candidate metadata

Phase 1 mobile recommendations read/advance persisted batches without generating new candidates.
Phase 2 Android gains the Pica provider and can generate a new cycle locally using the same algorithm contract.

## Alpha7 implementation order

1. Freeze remote-storage protocol and source policy.
2. Desktop WebDAV configuration + connection test.
3. Desktop cloud scan/sync plan.
4. Incremental upload and generation publish.
5. Android WebDAV configuration + remote catalog reader.
6. Android cloud ReaderSource.
7. Android online provider for search/detail/preview.
8. Recommendation current/next batch controls.
9. Portable recommendation state and mobile-native cycle generation.
