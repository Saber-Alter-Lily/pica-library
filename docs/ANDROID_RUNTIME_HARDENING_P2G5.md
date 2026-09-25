# Android Runtime Hardening — P2 G5

Status: **MainActivity Settings/source-summary file, JSON, Keystore and stat work moved off the UI thread**

Parent: `DEVELOPMENT_TASK_LOG.md` → P2-G Android runtime hardening.

Dependencies:

- G1 moved Author Works local Catalog/Semantic/creator reconstruction off the UI thread.
- G2 moved Comic Detail first-frame local state off the UI thread.
- G3 moved Downloads persistent-index parsing, page-size stats and deletion refresh off the UI thread.
- G4 moved MainActivity's default Library local-reference reconciliation off the UI thread.

## Finding

The fourth MainActivity tab is:

`设置`

implemented by:

`sources()`.

Before G5, opening Settings synchronously constructed all cards **and** loaded several persistent/local summaries directly on the UI thread.

The individual calls have different implementations, but the combined page path included multiple real I/O sources.

### Favorite catalog

`FavoriteCacheStore.load(this)`

reads/parses the complete favorite-catalog JSON.

The page also read:

- favorite metadata file size;
- unified cover-cache disk size.

### WebDAV configuration

`RemoteConfigStore.load(this)`

reads the stored multi-target registry from SharedPreferences and may resolve encrypted credentials/state.

This is lighter than full Catalog parsing, but it still belongs with the Settings state snapshot rather than being interleaved with view construction.

### Pica account

`PicaAccountStore.load(this)`

decrypts account/password/token values through Android Keystore.

The old Settings render called it twice.

### Native recommendation summary

`NativeRecommendationStore.load(this)`

reads/parses the complete persisted recommendation-cycle JSON.

### Phone downloads

`PhoneDownloadStore.load(this)`

reads/parses the persistent download index.

The old page then called:

`PhoneDownloadStore.estimatedBytes(this)`

which reloaded the same index and stat-ed every stored page URI.

G5 reuses the G3 overload:

`estimatedBytes(this, downloads)`

so the already parsed Snapshot is used for the size traversal.

### Cache/storage usage

`StoragePolicy.usage(this)`

walks multiple page/cover/metadata cache roots recursively and sums file sizes.

`CoverRepository.diskBytes(this)`

also scans the unified cover cache directory.

These are direct filesystem/stat operations and must not block Settings view construction.

## G5 boundary

G5 does not change Settings actions or page ownership.

It splits the page into:

1. synchronous UI shell construction;
2. one worker-prepared `SettingsSummary`;
3. one lifecycle-guarded UI publication.

## SettingsSummary

The immutable page handoff owns:

- FavoriteCacheStore Snapshot;
- favorite metadata bytes;
- unified cover-cache bytes;
- RemoteConfigStore Config;
- PicaAccountStore Session;
- NativeRecommendationStore Snapshot;
- PhoneDownloadStore Snapshot;
- persistent phone-download bytes;
- StoragePolicy Usage.

`readSettingsSummary()` performs every corresponding Store/file/stat call on MainActivity's existing `requests` executor.

No second executor or global cache is introduced.

## UI-first Settings page

`sources()` now constructs immediately:

- Desktop connection card;
- Favorite import card;
- WebDAV card;
- Pica card;
- persistent-download card;
- storage card;
- updater card;
- existing reading/about notes.

Summary text begins with lightweight loading placeholders such as:

- 正在读取收藏缓存…
- 正在读取 WebDAV 配置…
- 正在读取 Pica 账号…
- 正在统计手机下载…
- 正在统计缓存占用…

Buttons remain usable and retain their existing Activity/WorkManager actions.

## Separate Future ownership

MainActivity already uses:

`pending`

for page-owned work such as the Desktop online probe.

G5 does **not** reuse that Future.

It adds:

`settingsSummaryTask`

so:

- Desktop reachability probing can remain independent;
- summary preparation cannot overwrite/cancel the existing probe authority;
- both remain scoped to the same page generation.

## Lifecycle and tab-switch boundary

Settings summary publication captures:

`final int id = serial`.

The worker publishes only when:

`valid(id)`

remains true.

`settingsSummaryTask` is cancelled:

- by `cancelPageWork()` when switching tabs;
- in `onPause()`;
- in `onDestroy()`.

`cancelPageWork()` also clears the Future reference.

Even if a file/Keystore/stat operation does not respond immediately to interruption, the generation check prevents stale publication.

## Favorite action race guard

Favorite import buttons can change the Favorite status text while summary preparation is still in flight.

G5 therefore updates that status from the summary only if the TextView still contains the original:

`正在读取收藏缓存…`

placeholder.

A user-facing WorkManager enqueue message is not overwritten by an older summary completion.

Other Settings summary fields do not have same-page mutation actions that need an equivalent text guard.

## Preserved behavior

G5 does not change:

- Bridge pairing or Desktop reachability probing;
- FavoriteImportJobs behavior;
- RemoteStorageActivity navigation;
- PicaBrowse/PicaAccount actions;
- Task Center navigation;
- DownloadsActivity behavior;
- StorageSettingsActivity;
- UpdateActivity;
- WebDAV/Pica configuration semantics;
- recommendation cache format;
- persistent download format;
- cache cleanup policy.

The page displays the same authoritative state; only preparation timing changes.

## Regression contract

The Android Library/Author source contract requires:

- `SettingsSummary`;
- `readSettingsSummary()`;
- one `settingsSummaryTask=requests.submit(...)`;
- heavy Store/stat calls inside `readSettingsSummary()`;
- no Favorite/Remote/Pica/Recommendation/PhoneDownload/Storage heavy calls in the synchronous Settings UI prefix;
- reuse of `PhoneDownloadStore.estimatedBytes(this, downloads)`;
- existing Desktop probe `pending=requests.submit(...)` remains separate;
- lifecycle cancellation of `settingsSummaryTask`;
- `valid(id)` before UI publication.

Android compile/test/lint/build remains authoritative for Java/API/lifecycle correctness.

## Deliberate non-scope

G5 does not claim MainActivity is fully free of file-backed UI-thread work.

Separate remaining owners include:

- Bookshelves:
  - ShelfStore load;
  - local Unified Catalog load during shelf rendering;
- Recommendation:
  - Portable recommendation package;
  - Unified Catalog;
  - NativeRecommendationStore;
- direct comic open:
  - Catalog lookup for recommendation evidence metadata;
- other Activities:
  - AuthorDirectory creator concepts;
  - PicaBrowse local snapshots;
  - History local store/catalog rendering.

These remain separate batches to keep regression surfaces reviewable.

## Next P2-G work

After G5:

1. audit/fix AuthorDirectoryActivity creator-concept construction;
2. audit/fix PicaBrowseActivity local Catalog/Semantic/translation preparation;
3. return to MainActivity Bookshelves/Recommendation tab local-state reads as separate owners;
4. audit History/Reader local file calls;
5. then durable Worker process-death/relaunch and Task Center reconstruction.

Representative Android device latency/jank and concurrency budgets remain external evidence gates.
