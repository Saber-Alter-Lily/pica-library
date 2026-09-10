# Library Query and Facets v1

`LibraryQueryService` 是显示、总数、facet、全选和批量书架操作的共同契约。

- scope：全部本地漫画、Pica 收藏、已下载。
- text：标题、原作者、canonical 作者及作者别名，NFKC/大小写归一后包含匹配。
- author：canonical author ID 多选基础。
- tags：自动发现并计数；`all` 要求全部标签，`any` 要求任一标签。
- status：完结/非完结；download：未下载、部分、完整或任意已下载。
- sort：最近、最早、标题、爱心、浏览。
- pagination：最大返回 5000，但 UI 只渲染 bounded page。

返回值包含规范化 query、`total`、paged `items`、作者和标签 facet。UI 使用 datalist 做即时搜索建议，并用 chips 展示 scope/作者/标签与清除操作。

`ShelfService.addFiltered` 调用同一服务的 `allIds`，因此确认数、筛选数和实际新增集合一致，不以当前 DOM 为准。5,000 漫画和 10,000 memberships 的合成测试作为当前规模门槛；更大规模再考虑 SQL FTS/materialized facet，而不是在前端重复重算。
