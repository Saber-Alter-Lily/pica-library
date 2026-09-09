# Alpha7.x Unified Library

## Product rule

The Android library is organized by comic, not by transport source. A comic appears once even when it is available from Desktop, WebDAV, phone storage, and future Pica Online at the same time.

Source availability is metadata used by the resolver and by filtering; it is not a top-level navigation structure.

## Local catalog

Android persists `unified-catalog-v1.json`, keyed by canonical `comicId`. Source refreshes reconcile availability flags instead of deleting the comic record. Metadata may remain because favorites, shelves, history, or another source still reference the comic.

Initial availability fields:

- `phoneDownloaded`
- `desktopDownloaded`
- `remoteAvailable`
- `picaAvailable` (reserved for Alpha8)

Metadata retained independently of availability:

- title
- author / canonical author / author id
- tags
- categories
- finished status
- favorite state
- shelf membership
- known page count

## Library screen

The source tabs are removed from the library surface. The visible header is intentionally compact:

```text
我的书库
[搜索标题 / 作者 / 标签 / 分类...]
[筛选与排序 (N)] [刷新] [2/3列]
```

Opening the library renders the persisted local catalog first. Desktop and WebDAV are refreshed in the background; failures keep the last usable catalog instead of blanking the screen.

Every comic card can display merged availability such as `电脑 · 云端 · 收藏`, while the comic itself is still represented once.

## Filter UX

`筛选与排序` opens one grouped panel with:

1. **可用位置** — 手机已下载 / 电脑已下载 / WebDAV.
2. **收藏与书架** — 仅收藏 / 仅书架内.
3. **作者** — searchable multi-select.
4. **标签** — searchable multi-select with ANY / ALL semantics.
5. **分类** — searchable multi-select.
6. **连载状态** — 全部 / 连载 / 完结.
7. **排序** — 最近更新 / 标题 / 作者.

Large author/tag/category lists open secondary searchable pickers and only render a bounded number of matches at once.

Selections inside one group are generally OR; distinct groups combine with AND. Tags additionally support an explicit ALL mode.

`N` counts active filter groups rather than every selected chip, so selecting three authors remains one active author filter.

Filter state is persisted separately from source configuration.

## Refresh contract

- Opening the library reads the local catalog first and must not block on Desktop or WebDAV.
- Background/explicit refresh reconciles each reachable source.
- A comic missing from WebDAV after a successful refresh becomes `remoteAvailable=false`; it is not deleted from the unified catalog.
- A comic missing from Desktop after a successful refresh loses Desktop availability; portable metadata remains.
- Failed source refreshes do not overwrite a previously valid source snapshot.
- Favorites and shelves are portable references merged into the same comic records.

## Source resolution

UI asks to open a comic; a resolver supplies ordered candidates. Current target priority is:

```text
PHONE_DOWNLOAD
→ DESKTOP_LAN
→ WEBDAV
→ PICA_ONLINE
```

The opening flow probes Desktop before committing to it, so a previously paired but currently offline PC can fall through to WebDAV.

The user can still filter by availability when they intentionally want a specific storage/network characteristic.
