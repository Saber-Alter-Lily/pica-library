# S3 Android source-free local QA (2026-10-30)

## What is reused
- Original Pica Library `LocalComicImporter` + Android `LocalComicStore` folder/CBZ SAF pipeline and atomic manifest/generation commit.
- Original `LocalComicReaderPort` identity/pages/page-ID bookmarks.
- Original v1 `ReadingHistoryStore` session ledger now has a single physical implementation `:local-storage/ReaderHistoryLedger`; the installed app keeps its original `MobileStoragePaths` and legacy-bookmark conversion adapter.
- Original `ReaderScreenActivity`, `ReaderImageLoader`, `ReaderProgressLedger`, gestures, continuous and paged UI (moved in #256–#266).
- Standard Android Gradle, SAF, RecyclerView/ViewPager2. Mihon Apache-2.0 is an architectural reference only. Kotatsu GPL source is not copied.

## What the independent QA APK does
The new `:local-app` installs as `com.picalibrary.android.localcore.qa` and runs without provider SDKs or network access. Use system picker to import a folder or CBZ; confirm the staged comic; list imported titles; tap to read with the original Reader; save/reopen the same chapter/page; long-press to remove a local copy. Reading now writes original-format sessions to the isolated local-app directory; the History entry lists actual sessions by today/7/30/all dates and resumes a selected chapter/page.

This is deliberately an **engineering QA product slice**, not a signed/public end-user release. No source marketplace, Pica/E-H/JM login, cloud, recommendation, full production HistoryActivity/catalog/cover/grouped UI, or complete three-language Viewer UI is claimed. Its package/data directory is isolated from v0.5.0 and earlier dev APKs.

## Actual build gate
Existing CI Android job builds `:local-app:assembleDebug`, inspects package/launcher and missing network/camera/install/broad-storage permissions with `aapt`, then inspects every compiled classes*.dex for concrete source SDK/Host/Bridge descriptors. It uploads a **two-day unsigned/debug QA artifact only when the job succeeds**. The APK must **not** be promoted to a stable Release or installed over the official app.

## Remaining acceptance
- G1: actual phone (layout, font, gestures, background/resume), not merely Gradle PASS.
- G2: source-free DEX/manifest, physical folder/CBZ import, chapter/page/resume and restart; then trusted opt-in provider boundary with two real providers.
- G3: old v0.5.0 actual user-data-preserving upgrade and rollback with explicit opt-in.
- G4: one signed, versioned, integrated release candidate with full previous functionality and user confirmation.

Record exact head SHA, Actions results, device observations separately. Never interpret a synthetic fixture or an unsigned QA APK as production migration approval.

## Original local shelf storage physical reuse — CORE-ANDROID-14
- `:local-storage/ShelfLedger.java` is the **single** portable-shelves-v1.json schema-2 model, serialization, shelf create/rename/delete tombstones and add/remove member implementation, physically lifted from the installed `ShelfStore`.
- Installed `app/ShelfStore` keeps the old Context APIs, original `MobileStoragePaths`, `UnifiedCatalogStore` enrichment, and Desktop bridge merge/sync. It delegates all local membership changes to the one ledger. No implicit cloud calls or migration.
- Independent `:local-app/LocalShelvesActivity` uses the *same* ledger with its own `files/portable-shelves-v1.json` and existing `LocalComicReaderPort`. Create/rename/delete shelves, add/imported titles, remove membership without deleting any original comic files, and open the original reader. The local library now shows two secondary choices: Shelves and History.
- Existing Android CI includes one focused original-schema/tombstone/metadata/isolation integration regression in `LocalComicImportTest`; original version code, package signing, source closure and legacy migration stay untouched. Exact new-source build/DEX results and real device acceptance must be recorded separately.
- This engineering QA slice is not complete production UI parity, signed distribution or v0.5.0 account/profile migration. G1–G4 remain OPEN.
