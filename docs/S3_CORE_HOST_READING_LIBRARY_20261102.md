# S3 CORE-HOST-24 — original unified reading library in source-free and optional User Host Windows core

**2026-11-02 | Draft PR #282 | no publication, no production migration.**

## Why this is a product batch

The source-free Desktop and optional user-owned Suwayomi Host from #281 both opened the shared Reader successfully, but users returning to the original **Library → Continue reading and selected books** panel hit the missing read projection route. The original full Web was already importing `reading-library.js`; no additional UI should be built.

This batch **physically connects** the existing projection to that original screen for both source-free only and optional explicitly selected user-Host modes:

1. Local files/CBZ are imported through the existing LocalLibraryIngestion and read with original ReaderService/LibraryDatabase.
2. Their genuine reader positions are drawn from `recentReadingProgress(100)` via the existing `catalogueReadingPort('local')`. Nothing online is looked up.
3. If the separate user-Host runtime was explicitly launched and a valid 15-minute Host session is provided, its **already selected books** and stored progress are read via existing `HostedLibraryReader.readingLibraryRows`; that method is passive, not an upstream GraphQL action.
4. The existing `ReadingLibrary` handles identity, source grouping, progress, query/filter/pagination and incomplete port handling. The existing original `reading-library.js` renders buttons for local/Host routes. No duplicate catalogue, per-source schema, Reader or index.
5. When a Host is revoked, its old session is not revived, and the reading-library projection retains the local records. A normal zero-Host executable never instantiates a Host controller.

## Reuse decisions

| Project/repository | Used | Not adopted |
| --- | --- | --- |
| [Suwayomi Server](https://github.com/Suwayomi/Suwayomi-Server) | Existing self-managed, user-consented GraphQL Host interface | No mandatory Host, extension installation or hosted catalogue service |
| [Mihon](https://github.com/mihonapp/mihon) | Reader/source separation pattern | No Android extension executable ABI copied |
| Original Pica Library | `ReadingLibrary`, `catalogueReadingPort`, `LibraryDatabase`, `HostedLibraryReader`, `ReaderService`, original full Web `reading-library.js` | No second Reader, database, source SDK, network proxy or UI framework |

## Security and exact acceptance

- Every query is authenticated with the **existing** owned loopback cookie + exact Origin + CSRF; no GET-based passive authorization is introduced. Body accepts only `query` and, for an explicitly injected Host-capable runtime, a UUID-form user-session ID. Invalid/expired sessions never grant reading rights.
- Reading-library query itself does not start, connect, scan, fetch metadata or remotely request content. It does not mutate local history, favourites, accounts, shelves or user metadata.
- Full local-only Web UI, old `ReaderService`, SQLite and native picker continue to work. Normal core's esbuild dependency closure remains physically Host/provider-free, verified by existing `offline-user-host-http` suite.
- Test the **original** HTTP with deterministic fake Suwayomi upstream and actual current Reader/local SQLite: saved local and Host item visible, no added remote calls for projection, local preserved when Host disabled, invalid scope/CSRF denied. Test original Chromium UI with the existing Playwright harness, not a new UI or framework.
- **No claim of real Suwayomi online interoperability on this particular branch, physical Windows/Android acceptance or old-profile migration.** G1–G4 OPEN. Keep main, official v0.5.0, signed packages, updater/OTA and all real user files untouched.

Current classification until exact HEAD workflow completion: `IMPLEMENTED_IN_DRAFT / CI_PENDING / USER_ACCEPTANCE_OPEN / RELEASE_NOT_AUTHORIZED`.
