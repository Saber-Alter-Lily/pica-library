# Pica Library Android original-app local browsing integration | 2026-11-01

**Scope:** Draft PR #279 stacked on #278; engineering work only. The official v0.5.0 Android package, production profile, main branch and OTA are untouched.

## Functional outcome

The original installed Android application already had a real SAF local folder/CBZ importer, `LocalComicStore`, the unified catalogue, shelf CRUD, history, Reader and CBZ exporter. Its import screen was limited to the **first 100 unfiltered records** and offered no search, reading-state filter or fast continue. The independent source-free QA app had those functions in #278, but that did not help official users. This batch corrects that product gap without creating another library.

- `local-storage/LocalLibraryBrowse.java` owns only read-only transformation of `LocalComicReaderPort.Book` plus `ReaderHistoryLedger.Snapshot`: latest valid local sessions, title search, three deterministic sorts, read/unread/all, latest eligible resume identity.
- Both app compositions invoke the same helper. The original app loads history via `ReadingHistoryStore.load(context)` and shelf mutations through `ShelfStore`; the independent QA app loads its own `ReaderHistoryLedger.localFile` and writes only its private `ShelfLedger.localFile`. The helper does not read files, open provider sockets, mutate schemas or reconcile external accounts.
- Original `LocalComicImportActivity` adds native search, sort, reading-status selector, latest Continue Reading and contextual per-book resume. Existing `ReaderActivity` and `ReaderProgressLedger` perform real reading.
- Long-press the imported comic card to select an existing shelf or create a shelf and add. Uses original `ShelfStore.setMembership` with unified catalogue metadata, and does not delete local media or override source ownership.
- Folder/CBZ import, preview/confirm, progress/cancel, manifest data, export to user-selected SAF destination, deletion confirmation and local-only isolation remain the existing implementations. UI uses the original theme tokens and Chinese/English/Japanese localizations. No new dependency or framework.
- The filter labels **Read** and **Unread** mean a corresponding persisted local reader session exists or does not exist; they do not assert chapter/series completion. Deleted works are not eligible for resume. The library searches all imported books before rendering the first 100 matching results.

## Source reuse

| Reference | Pattern | Integration |
| --- | --- | --- |
| [Mihon](https://github.com/mihonapp/mihon) | Native browsing, sorting, read-status filtering and categories | Architectural UX only; no forked UI or source/plugin binaries |
| [Kavita](https://github.com/Kareadita/Kavita) | Search, sort and filtering in a personal library | UX reference only; no .NET, Angular or server |
| Existing Pica Library | `LocalComicReaderPort`, `LocalComicStore`, `ReaderHistoryLedger`, `ReadingHistoryStore`, `ShelfStore`, `UnifiedCatalogStore`, `ReaderActivity`, `Ui` | Direct production code reuse |

## Acceptance and explicit limitations

1. Final exact-head Android Robolectric tests, lint/release and source-free QA APK package/Manifest/all DEX closure must pass. Web/Desktop/Chromium and existing runtime gates need their own exact-head outcome.
2. Existing Android35 emulator executes real system SAF, Reader, history, restart, shelf tombstone, filter, export + CBZ re-import with raster-byte check. The production app page is **not** exercised by that isolated QA workflow; the added Robolectric import/history case is not a real-device layout certificate.
3. The prior #278 failure was an **automation wrong-target** failure: the full-screen Reader appeared after long-pressing the latest Continue Reading button because both that button and the book row contained the comic title. The fixture and data had not failed. The existing native UI script was corrected to select the original four-page book row before long press. Parent #278 workflows eventually passed 21/21 after correction; this does not qualify #279.
4. Physical Android device, zh/en/ja long-title/narrow-screen manual review, 1500-book performance, actual old v0.5.0 data migration/rollback, signed optional-source publisher, Android Binder/service and second real source remain **OPEN**. No G1–G4 release authorization.
5. No merge main, stable Release, OTA, real account access, unattended user-data modification or permission expansion.

The next batch should address source integration and genuine original full-product parity rather than adding another isolated QA shell.
