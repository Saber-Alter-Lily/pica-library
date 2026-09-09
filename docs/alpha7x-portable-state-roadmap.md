# Alpha7.x → Alpha10 mobile roadmap

This document locks the next implementation order after Alpha7 cloud/mobile convergence.

## Alpha7.x — portable user state and architecture hardening

1. Portable reading state on WebDAV
   - one canonical `v1/state/reading/current.json`
   - merge by `(comicId, episodeId)` and `updatedAt`
   - every write records `deviceId`
   - local bookmark remains first-write authority while offline
2. Portable favorites
   - `v1/state/favorites.json`
   - Android local cache remains available when Desktop is offline
3. Portable shelves
   - `v1/state/shelves.json`
   - metadata is independent from comic content availability
4. Portable history and reader settings
5. Storage manager and explicit cache policies
6. Split Android UI/data/source/background responsibilities before native Pica work expands.

## Alpha8 — native Pica provider

- login/session
- home/categories
- search
- comic detail
- chapter list
- online reader
- favorite/shelf actions
- reuse the existing reader cache and source abstraction

## Alpha9 — unified library

A comic is one logical entity with multiple possible content sources:

`PHONE_CACHE → WEBDAV → DESKTOP_LAN → PICA_ONLINE`

Add global search, advanced filters, smart shelves, updates feed and chapter notifications.

## Alpha10 — mobile Recommendation V3

Move from consuming the Desktop current batch to portable preference state, mobile recall and the shared/frozen ranker.

## v1.0 productization

- reader polish: crop, dual-page, wide-page handling, tap zones
- backup/restore
- update checker
- crash diagnostics
- storage manager
- tablet layout
- migration compatibility

## State invariants

- comic content and user classification/state are separate layers.
- remote comic pages remain individual objects for streaming and incremental sync.
- no client exposes a half-written comic.
- portable-state writes never delete comic content.
- offline local state is preserved and reconciled when connectivity returns.
- credentials are never written into portable state files.
