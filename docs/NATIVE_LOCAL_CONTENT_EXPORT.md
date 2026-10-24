# Native local-comic body export (NEXT-63, unpublished)

## Product scope

A content-free local reader must let a user take their own imported pages out again. Android now offers **Export pages as CBZ** on an imported-comic card and in **comic detail → Sources and copies**. The latter is not limited to the import screen's first 100 cards. Only this device's owned imports qualify: synced metadata, Desktop/LAN rows, provider downloads and disposable caches are not silently exported.

This is a standard image-body CBZ, **not a complete profile backup or personal-state restore**. It contains original relative image filenames and image bytes, preserving subfolder chapters and natural order. It does not contain the app manifest/DeviceIdentity, original document URI, accounts, credentials, catalog, shelves, private tags, favorites, bookmarks, history, recommendation state or vectors. Filenames, suggested title and the pages themselves can still be private; there is no encryption or automatic sharing.

Reimport uses the existing explicit preview/confirm path. A newly selected exported CBZ has a **new local identity**: it does not recover or merge the old comic ID, annotations or reading state. Keep original copies and do not uninstall to update. Whole-state backup/restore, identity-preserving relocation, retired-generation retention and crash-orphan collection remain open work, not completed by this slice.

## Actual module ownership and reuse

| Owner | Responsibility | Not authorized |
| --- | --- | --- |
| `local/LocalComicExporter.java` | Bounded stream inputs → standard ZIP + page/chapter/byte/SHA-256 receipt | Android, file paths, account/provider/catalog/sync access |
| `LocalComicExports.java` | Read an owned generation, build/sync a private stage, copy to an explicitly chosen SAF destination, clean only the owned work directory | External-document deletion, private-state archive, broad filesystem/network host |
| `LocalComicStore.ExportLease` | Pin the read snapshot through compression **and destination copy**; one active export; block removal of that comic | Persistent schema changes, source file deletion, auto-generation collection |
| `LocalComicExportActivity` | Internal opt-in picker, worker/cancellation, retained rotation state, localized result | Startup export, provider login, sync, background scheduling or automatic retry |

Reuse the existing importer for safe NFC names, raster signatures, natural comparison and limits. Its implementation is unchanged except two package-private helper visibilities, verified by reconstructing the exact frozen source hash. Standard Java `ZipOutputStream` supplies ZIP compression/headers/central directory; Android SAF supplies document creation and URI-scoped write access. No new dependency, decompressor, archive framework, source protocol or reference-APK code is introduced. The existing empty-classpath `local/` compile gate covers both import and export in CI.

## Flow and failure boundary

1. Read the current owned manifest for display; no body work until the user chooses a destination.
2. Request `ACTION_CREATE_DOCUMENT`, openable `application/vnd.comicbook+zip`, a sanitized `.cbz` suggestion, local-only hint and **write only**. No persistent grant, broad storage permission or added Android permission. Cancelling the chooser does not start export. Unsolicited/replayed picker results are ignored.
3. Acquire a lease and copy this snapshot's body streams into a fresh UUID directory under internal `local-comic-export-staging-v1`. Finish the complete archive and sync the private file before opening the destination. Failure, cancellation or storage exhaustion does not switch a comic pointer or delete a source.
4. Accept only an external `content://` destination, rejecting the app's own FileProvider (including a numeric-user prefix). Open explicitly as `wt`, stream bounded chunks and compare copied byte count/SHA-256 to the complete stage. The app does not fall back to ambiguous `w` or a direct path/HTTP uploader.
5. Close streams and release the lease; remove only this operation's internal staging directory. Successful export reports count, size and archive digest. The caller, not the ZIP module, owns the output stream.

SAF may create an empty document before compression. Cancellation/write failure can leave an **empty or partial external document**; the UI warns about this, does not claim completion, and never deletes that user-selected document. Android document providers can block, reject `wt`, delay persistence or use remote storage despite the local-only hint. Cancellation is cooperative between I/O calls, not a guaranteed interrupt of any OEM/provider. SHA validates bytes read from the stage and accepted by the stream, **not independent destination readback or crash durability**. A completed close cannot be atomically rolled back by the app.

Rotation retains the single task and its snapshot. Finishing cancels owned work, not user content. Process death does not auto-resume an export or apply a delayed picker result; it can leave an unreferenced private stage. Cleanup/retention after process death, SAF/OEM/SD-card behavior and physical interruption recovery require separate acceptance. The export lease is in-process, not a multi-process file lock. Reimport may commit another generation during export; the old generation is deliberately retained, so the export stays on its original snapshot.

## Bounds

- 1–2000 JPG/JPEG/PNG/GIF/WebP entries; safe names and case/NFC duplicate checks reuse the importer.
- Actual stream limits: 20 MiB per page, 512 MiB total body; **complete compressed archive including ZIP metadata ≤256 MiB**. The export can reject an otherwise valid large folder import; it does not drop pages to fit.
- Known lengths and optional CRC are checked along with raster signatures. Imports already underwent Android image-bound validation; export does not newly decode every pixel or claim to detect all same-length body tampering.
- 32 KiB streaming buffers, not a whole-comic memory array. The stage needs additional private disk space up to the archive limit. Synthetic CI stress streams exercise byte limits without storing real comics or allocating a 256 MiB heap buffer.

## Guides and upgrade boundary

The daily guide now covers Desktop **and Android** local import, correcting its stale “phone import not yet available” statement. Android's existing daily library spotlight and advanced data-safety chapter explain the local path and pages-only export in en/zh-CN/ja without adding a new mandatory tutorial or running a task when a chapter opens. The existing eight advanced chapter destinations remain unchanged.

No SQLite schema/migration, library/tag/Reader public module version, sync DTO, catalog format, recommendation behavior or Visual state changes. Application replacement retains `files/local-comics-v1`; uninstall/data clearing does not. The unpublished candidate increments the single Android version authority to **Dev78**, retaining the existing Dev application ID/certificate. Windows still requires the existing same-source full/incremental/deep-recovery gates for one-action upgrades; this feature does not permit unsafe incremental patches or stable OTA edits.

## Evidence and open acceptance

Source contracts are not native execution proof. Current-source plain-Java streaming/ZIP tests and SDK28/35 synthetic DocumentsProvider/real-store/Reader tests cover body roundtrip/new identity, no private-state mutation, damaged input, refusal/cancellation, lease/removal/reimport, private FileProvider rejection, write-only chooser, replay/rotation/finish behavior, real import-card/detail navigation and filename safety. Existing localized layout checks include the new screen. Full native compile, lint, R8, fixed signing and regression execution run only in the authorized isolated **Draft CI**, never by launching Java/Gradle/apps on the user's PC. Final counts/hashes/results belong to the immutable exact-source handoff; pending gates must not be called PASS here.

Physical SAF/provider/OEM/SD-card, large real libraries, process-kill durability, whole-state restore, source-host/trust, gestures/tags/AI/offline/sync and broader objective acceptance stay open. No production data access, real provider retrieval, main merge, tag/Release, stable OTA, key download, install or deployment.

Official implementation references: [SAF documents and files](https://developer.android.com/training/data-storage/shared/documents-files), [ContentResolver output modes](https://developer.android.com/reference/android/content/ContentResolver), [ZipOutputStream](https://developer.android.com/reference/java/util/zip/ZipOutputStream). Provider-dependent stream semantics do not imply an atomic backup service.
