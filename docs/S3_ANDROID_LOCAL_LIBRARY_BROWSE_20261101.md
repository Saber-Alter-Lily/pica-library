# S3 Android local library browse and resume | 2026-11-01

**Classification:** stacked Draft engineering work; not released, not merged into main, not production migration.

## User-visible scope (one functional batch)

- Search imported comic titles while keeping the original local inventory untouched.
- Sort recently imported first (default), title A–Z or page count descending; stable local IDs are used for all subsequent actions.
- Switch between All, Unread, Read using original on-disk `reading-history-v1.json` sessions, not an invented reading-state flag.
- Open any book at its most recently recorded chapter/page, plus a one-tap Continue Reading button for the latest eligible local session.
- Long-press an imported book to directly add it to an existing shelf, resume if available, export CBZ or remove the local copy. The shelf mutation reuses original `portable-shelves-v1.json` schema 2 and `ShelfLedger.setMembership`; re-add after removal revives the previous tombstone without deleting local files.

## Open-source review and reuse decision

| Product/pattern | What was reviewed | Decision |
| --- | --- | --- |
| [Mihon](https://github.com/mihonapp/mihon) / [library guidance](https://mihon.app/docs/faq/library) | User-owned local library, categories, status filters | UI/interaction reference only; keep original Android local manifests and ledger |
| [Kavita](https://wiki.kavitareader.com/guides/features/filtering/) | Search/filter/sort as library browsing operations | Conceptual reference only; do not bring in Angular, .NET, or new indexing service |
| Pica Library original code | `LocalComicReaderPort`, `ReaderHistoryLedger`, `ReaderProgressLedger`, `ShelfLedger`, `ReaderScreenActivity` | **Direct functional reuse**, no new database, network SDK, image renderer, compression engine or runtime |

No third-party source code is copied or relicensed in this batch. Native Android controls are used instead of importing an extra UI framework.

## Boundaries and acceptance

- The independent `com.picalibrary.android.localcore.qa` app has its own local data root and **must not** touch the installed production v0.5.0 app, source accounts, storage or update feed.
- A completed local session is **only** a history signal. No session means Unread in this QA view; it does not assert genuine chapter completion. Expired/deleted local works are excluded from quick resume when loading inventory.
- Search/sort/status are **view-only**; they never modify the original manifest, history, shelves, tags, recommendations, progress schema or source ownership.
- New focused device evidence uses the **existing** Android35 emulator flow and its native system file picker, saved local JSON and original Reader; verify the current exact head. Android original build/CI and physical source-free APK DEX/permission check must also pass.
- The expanded emulator tests the shelf tombstone re-add, page resume and status-filter empty result; it does **not** certify every sort mode, Chinese/Japanese narrow layouts or a physical handset. No separate test runner or redundant defensive implementation.
- G1 (real-phone visual/interaction), G2 (two actual external sources and Android plugin/service lifecycle), G3 (old v0.5.0 profile migration/rollback), and G4 (signed release/user authorization) all remain **OPEN**.
- Subsequent larger work should prioritize integrating the full original product and genuine external source capability, rather than growing a separate QA-only product.

**Real evidence:** link the exact new branch commit and Actions workflows in the PR after completion, keeping historical failures visible.
