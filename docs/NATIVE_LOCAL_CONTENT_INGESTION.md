# Android local comic ingestion — NEXT-54, unpublished

## Ordinary workflow and reuse

**Library → Import local comics → choose one image folder or CBZ/ZIP → preview → confirm → read offline.** No Desktop pairing, source account or enabled external provider is required. CBR/PDF/EPUB, background folder watching and mass-library discovery are not implemented. The application ships no comic bodies.

Reuse [Android Storage Access Framework](https://developer.android.com/training/data-storage/shared/documents-files), the already-pinned AndroidX DocumentFile and [Java ZipFile](https://developer.android.com/reference/java/util/zip/ZipFile); no new dependency, decompressor, touch stack or reference-APK implementation. The picker requests selected **read** access and local-only content, not write access, broad storage permission or a new persistent grant. A chosen document provider still owns its own I/O behavior; native picker/provider/OEM acceptance is pending.

The importer copies pages into owned staging before showing counts. This is not zero-copy archive streaming. Preview/cancel does not register a comic. Explicit confirmation switches one AtomicFile manifest only after all copied pages pass bounds/signatures and Android image-dimension checks. Originals remain untouched. UI, SAF and storage/Reader adapters are separate from `local/LocalComicImporter.java`, which compiles with an empty classpath and has no Android/network/catalog/sync imports.

## Identity, Reader and state

- `local:<sha256>` uses the existing app-local DeviceIdentity, import kind and normalized selected document URI. Same device + same selection preserves ID across application updates. Same name/URI on another device, another import kind or a moved/renamed original is not silently merged. Cross-path/device content deduplication remains open.
- Only the opaque identity hash and relative original page names are persisted, never the selected `content://` URI, provider authority or absolute source path. Reader gets private owned-file URIs in memory; those are not added to portable catalog/shelves/history payloads.
- Subfolders form chapters and numeric filenames sort naturally. The existing ReaderActivity/ReaderImages decode owned copies directly; provider clients and disposable page cache are bypassed. The existing history/bookmark ledger is retained. Optional source position hooks additionally preserve the original relative page ID across insertion; a removed page clamps to the existing numerical fallback. Renamed pages/chapters are new identities. Removed chapters retain existing history but cannot be read until reimported.
- Reconciliation adds an independent `localImported` availability fact to the existing additive mobile catalog JSON. It does not pretend imports are provider downloads, retune recommendations, migrate SQLite or rewrite private tags/shelves/favorites. Covers and phone-location filtering use the owned copy. A synced metadata row on another device does not make that device's path readable.
- Bodies/manifests are pinned to internal app files `local-comics-v1/`. Cache clearing and catalog/cache storage preferences cannot remove or strand them. Application replacement keeps them; **uninstall/app-data clearing does not**. NEXT-63 adds explicit [pages-only CBZ export](NATIVE_LOCAL_CONTENT_EXPORT.md), not complete personal-state backup/restore. Reimport of the exported selection creates a new identity rather than restoring old progress/tags. Do not uninstall Dev to update.

## Bounds and failure semantics

| Boundary | Contract |
| --- | --- |
| Input | 1–2000 JPG/JPEG/PNG/GIF/WebP pages; 10,000 inventory entries; folder depth 8 |
| Archive | 256 MiB compressed copy; standard Java ZIP support, not CBR or an executable archive host |
| Decoded bytes | 20 MiB/page; 512 MiB copied pages/operation, checked on actual stream bytes |
| Images | Extension/signature, known decoded length and ZIP CRC; Android bounds >0, dimensions ≤60,000 and ≤100 million pixels. Bounds validation is not full pixel decoding or a quality classifier. |
| Names | Normalized NFC, traversal/absolute/backslash/control/drive/ADS/reserved names and case-fold duplicates reject. Original names are metadata, never extraction destinations. |
| Commit | Fresh UUID generation, private hashed page filenames, file fsync and AtomicFile manifest; cancellation/copy/validation/pre-commit failure preserves previous committed generation. |
| Cleanup | Only exact app-owned staging or identified comic roots; canonical containment/no link following. Originals are never cleanup targets. |

Previous committed generations are intentionally retained during reimport so an already-open Reader does not lose its files. They consume additional storage. **Remove imported copy** explicitly removes that comic's app-owned generations with confirmation, not original/Desktop/WebDAV copies, metadata, shelves, private tags or history. It refuses while that comic is actively exporting; a retained export lease protects the chosen generation through destination copy. An OS/process crash can leave an unreferenced staging/generation directory; automatic crash-orphan/retired-generation collection is not claimed. Cancellation cannot undo a commit that already completed. Storage exhaustion fails the pending import rather than replacing a healthy pointer.

## Compatibility and validation boundary

Desktop library/tag APIs remain 2 and Reader public module API remains 1: this adds a phone-local storage adapter and default optional position hooks, not a changed cross-client DTO, provider/portable protocol or required library format. No database schema/migration, recommendation algorithm, Visual setting, source credential or production profile changes. The introducing NEXT-54 candidate was Dev69; the current version is the single candidate workflow authority, not this historical number. Package/certificate continuity must permit ordinary overwrite installation. Actual OS installation and physical SAF/SD-card behavior are deferred, not inferred from CI signing or Robolectric.

Synthetic gates must cover plain-Java byte/path/CRC/cancellation bounds, SDK28/35 DocumentsProvider copy/preview/cancel/commit, corrupt or cancelled update, page-ID progress, original/privacy protection, storage preference/cache changes, removal scope, existing Reader/catalog/cover integration, explicit picker flags and existing regressions. Windows full-application replacement/rollback remains the existing one-click upgrade path; a native feature is not permission to distribute an unsafe incremental patch. Exact source/test counts/installable hashes are recorded in the new immutable handoff, not borrowed from NEXT-53.

Authority remains the existing isolated candidate/Draft/CI grant and failed-DPAPI coordination exception. No main merge, tag/Release, stable OTA change, private-key download, real-provider call, production-data access, install or deployment. The complete modular-reader objective (build-pipeline decomposition, optional runtime/trusted-extension decisions and concentrated physical/provider QA) remains open.
