# Local comic ingestion — NEXT-48, unpublished

## User workflow

After local-only setup, **Library → Import comic folder / Import CBZ** selects one user-owned comic through the existing native picker. The browser never submits a server path. Preview shows title, counts, bytes, sample names and removed-page count; only explicit confirmation copies pages into Library-owned storage. Cancel does not import. No source account or network is needed. Subfolders form chapters; filenames use numeric-aware ordering.

Supports JPG/JPEG/PNG/GIF/WebP in folders/CBZ, **not CBR/PDF/EPUB** or mass-library watching. NEXT-54 additionally provides [direct Android local import](NATIVE_LOCAL_CONTENT_INGESTION.md) through SAF into a separate phone-owned body store; it is not this Desktop API. This copies into owned storage, not direct archive streaming: `archiveReader` stays false; `localFileImport` is a separate interactive-Desktop capability.

The existing local CLI offers `local-import --path PATH --kind folder|cbz --data-dir ROOT --json` (preview) and the same command with **`--confirm`** (rescan/import). CLI initialization may create the normal empty database/schema; preview does not register comics/copy bodies. HTTP/paired/remote clients cannot provide an equivalent arbitrary server path.

## Identity and state

- Catalog source `local` is distinct from online `ComicProvider` adapters. Local IDs never fall back to Pica/JM/EH authentication or online download/related/favorite calls.
- `local:<sha256>` derives from canonical selected path + import kind. Reimport from that **same path** preserves identity. Cross-path relocation/content deduplication is **not** implemented: moving the original creates a new identity.
- Chapter/page IDs derive from relative names. An earlier inserted page preserves progress by previously read page ID; removed-page progress clamps. Missing chapters retain unavailable zero-page identities/progress, so reappearance retains history.
- Favorites, private tags/policy, shelves, feedback and user-edited title/author are not rewritten on reimport. Counts/local provenance update. CSV now retains source/remote ID/cover/status; it is still metadata, not a body/private-state backup.
- Originals stay untouched. Existing Reader/LAN consume owned copies through realpath checks. Client metadata does not expose original absolute paths. Android reads paired Desktop copies/uses shelves; local favorite mutation on Android is not a newly invented sync protocol and its detail screen tells the user to manage favorites on Desktop instead of offering Pica login.
- Local tag facts/private mappings use `local|` on both clients and can affect local matching; a local mapping never becomes an online provider query. No model/classifier is trained.

## Bounds and failure safety

Reuse the installed AdmZip directory metadata and Node zlib bounded inflation/CRC32; no new dependency, decompressor, reference-APK code or comic payload is imported.

| Boundary | Limit/behavior |
| --- | --- |
| CBZ | 256 MiB; regular single-disk ZIP; ZIP64 unsupported |
| Inventory | 10,000 entries, 2,000 raster pages, depth 8 |
| Actual bytes | 20 MiB/page, 512 MiB total decoded archive bytes |
| Preview | One opaque token; 10-minute expiry; single-use confirm |
| Paths | Traversal/drive/UNC/ADS/control/reserved names/case-folded duplicates reject |
| Links/secrets | Source links/special files, archive links/encryption reject |
| Consistency | Central/local names and directory bounds, compressed length, bounded actual inflation, decoded length and CRC checked |
| Self-ingestion | Library root/ancestors and managed import copies reject |

Raster signatures/extensions are checked, **not a full image decoder or quality classifier**. A corrupt-but-header-valid image can still fail in Reader. This is not an adversarial OS-user filesystem sandbox or untrusted executable extension host.

Confirm rescans/hashes input, writes a fresh UUID generation and atomically switches SQLite inventory using existing synchronous savepoints (schema **14 unchanged**). Input/SQL failure removes only that invocation's new generation and preserves the old committed inventory. After success, only the previous recognized generation for that exact local identity is disposable. Cleanup failure returns `previousGenerationRetained`; it never rolls back a committed healthy library. An OS/process crash before commit may leave unreferenced owned files; automatic crash-orphan collection is not claimed. No original folder is a cleanup target.

Body URLs include committed local revision; the paired bridge preserves it for native disk-cache keys. Cover responses are `private, no-store`, preventing a browser's 24-hour cache from bypassing source checks. Existing backend caching remains. Reimport refreshes catalog timestamps used by native cover identities. Every real-provider native account-switch/cache scenario still needs separate acceptance.

## Upgrade/evidence contract

Library module API **2** declares local catalog/inventory semantics; tag module API **2** declares the added namespace (portable tag JSON schema stays 1). Reader/source APIs unchanged. Legacy module floor stays 1: use the existing **one-click full replacement + rollback**, not an incompatible incremental patch. User data stays separate. Dev code **63** follows the same package/fixed certificate; no uninstall/reset.

Gates: full unit/integration, real Edge/Chromium import/Reader/cache, HTTP + authenticated LAN, native identity tests, **actual Windows ZIP** CLI/Reader/reimport/restart, successful and deliberately failed-health full upgrades. Exact source/logs/counts/signatures/hashes are in the frozen handoff. Native dialog rendering/OEM gestures, real device installation, real source pagination, AI semantic acceptance and published OTA are separate pending gates. No production profile, main merge, tag/Release, stable OTA or deployment is authorized.
