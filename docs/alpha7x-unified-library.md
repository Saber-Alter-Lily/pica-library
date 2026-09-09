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

## Filter UX

Do not place source/status/tag/author switches as a row of permanent controls.

The library header should converge to:

```text
我的书库
[搜索标题 / 作者 / 标签...]
[筛选与排序 (N)] [刷新] [2/3列]
```

`筛选与排序` opens one grouped panel with:

1. **可用位置** — 手机已下载 / 电脑已下载 / WebDAV / Pica 在线.
2. **收藏与阅读** — 收藏 / 在书架 / unread-reading-finished when portable read-state classification is ready.
3. **作者** — searchable multi-select.
4. **标签** — searchable multi-select with ANY / ALL semantics.
5. **分类** — searchable multi-select.
6. **连载状态** — 连载 / 完结.
7. **排序** — 最近更新 / 标题 / 作者 initially; later 最近阅读 / 加入时间.

Selections inside one group are generally OR; distinct groups combine with AND. Tags additionally support an explicit ALL mode.

`N` counts active filter groups rather than every selected chip, so selecting three authors remains one active author filter.

## Refresh contract

- Opening the library reads the local catalog first and must not block on Desktop or WebDAV.
- Explicit/background refresh reconciles each reachable source.
- A comic missing from WebDAV after refresh becomes `remoteAvailable=false`; it is not deleted from the unified catalog.
- A comic missing from Desktop becomes `desktopDownloaded=false`; portable metadata remains.
- WebDAV refresh will later compare the cached generation id with `control/current.json` before fetching a new generation catalog.

## Source resolution

UI asks to open a comic; a resolver chooses the best readable source. Target priority:

```text
PHONE_DOWNLOAD
→ PHONE_CACHE
→ DESKTOP_LAN
→ WEBDAV
→ PICA_ONLINE
```

The user can still filter by availability when they intentionally want a specific storage/network characteristic.
