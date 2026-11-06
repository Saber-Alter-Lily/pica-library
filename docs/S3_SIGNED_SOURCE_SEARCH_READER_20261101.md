# S3 SIGNED-SRC-10 | Real opt-in source search to original Reader | 2026-11-01

**State:** Draft engineering work, stacked on #279, no main/release/OTA/migration. This is a **trusted-app-injected optional capability**, not an installable public extension market or an official signed source release.

## Gap closed

Prior S3 slices had source-neutral Reader, pinned Ed25519 worker, native ZIP install and explicit connection management. But a connected source still required a comic ID known in advance; the existing settings UI had no ordinary "find a book and read" path. This batch completes the user-driven path:

1. User explicitly connects a pinned, previously verified source.
2. User submits one 2–120-character search query in the original Desktop settings. No query runs on page load/connection/status.
3. The original CSRF-protected loopback HTTP signed controller binds the request to an existing live session. A worker receives only the query over existing Node IPC; no URL, script, key, login or arbitrary content path.
4. The first-party anonymous E-H worker **reuses the existing `EhProvider.search`**; no new scraping/parser. It returns at most 25 source-owned opaque IDs and bounded titles. Only trusted application identity code may convert the worker alias to preexisting legacy `eh:<gid>:<token>` catalogue identities.
5. The user clicks a result in original Web Settings and reuses the original `openReaderComic` flow and signed Reader HTTP pages, chapter navigation and source-isolated progress.
6. Disable, uninstall, revision change or disconnect revokes the session and invalidates visible selections. Local CBZ, WebDAV, shelves and saved history are not removed.

## OSS-first design

| Reference | Useful existing pattern | Decision |
| --- | --- | --- |
| [Mihon](https://github.com/mihonapp/mihon) | Separate reading UI from optional sources and require deliberate extension control | Architectural/UX reference, no third-party executable format copied |
| [Suwayomi](https://github.com/Suwayomi/Suwayomi-Server) | User-selected extension/source followed by browsing/search | Explicit selection/search flow only; Suwayomi remains an optional user Host, never mandatory |
| Existing Pica Library | `EhProvider`, `TrustedSourceProcess`, `SignedWorkerStore`, `SignedSourceDesktopReader`, `OnlineReaderService`, original Web Reader | Direct reuse; no additional dependencies, database, source SDK or Reader |

## Tests and evidence

Focused existing suites cover synthetic signed worker and actual Node IPC, the real E-H Provider parser against **locally generated simulated upstream HTTP responses** (not live E-H traffic), real loopback signed HTTP with CSRF, source owner rejection and query limits, original web click-to-Reader entrypoint, no auto activation and revocation with preserved progress. The full CI and physical package gates must run against the current exact PR SHA and be recorded truthfully.

**Not proven by these tests:** real E-H availability or terms, real user E-H accounts, official pinned publisher key distribution, protected system installation ACL/AppContainer, true OS sandbox, Android Service/Binder, cross-provider search, production source marketplace, Android/Windows physical UI, legacy v0.5.0 data migration/rollback and G1–G4 acceptance.

Current source-free QA packages remain separate from original production app. No main merge, tag, Release, OTA, production user profile reads or genuine external content requests are authorized in this batch.
