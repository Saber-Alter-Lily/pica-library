# S3 CORE-LIB-02｜正式 ShelfService HTTP 与用户行为证据独立（2026-10-29）

**工作线**：[Draft PR #232](https://github.com/Saber-Alter-Lily/pica-library/pull/232)，叠加 #231；正式 main、v0.5.0、用户资料、OTA/Release/Android 正式 APK 均未触碰。

## 实际生产变更

- 原 `src/library/server.ts` 的书架操作（`GET/POST /api/v1/shelves`、`GET/PATCH/DELETE /api/v1/shelves/:id`、`POST /api/v1/shelves/:id/items|remove|add-filtered`）内联了大量请求路由逻辑和用户行为事件记录，虽已持有 `ShelfService`，但旧 Server 仍与 `LibraryService/ProviderService` 的启动关系交织。
- 新增 `src/library/core-shelf-routes.ts`，以 `ShelfService` 的 type-only port 和 `core-catalog-read.ts` 现有 local-only 分面校验完成**同一套**已有书架 CRUD/收藏加入、移除、过滤加入命令。没有引入新数据库、另一套书架实现或具体漫画源 SDK，仍使用原 `ShelfService` + `LibraryQueryService`。
- 生产 `src/library/server.ts` 直接改为调用共享路由，旧请求路径、HTTP 200 结果、ShelfService 的 `importCatalog(records,'shelf:selection')` 语义保持。关键 `recordUserEvents` 仍在可信生产服务调用方执行：对 `shelf_add/shelf_remove` 保留全部漫画 ID、`source:'shelf'`、`x-pica-app-session`、`x-pica-context-id` 和 `metadata:{shelfId}`，没有丢掉推荐系统的行为证据。
- 已有隔离纯核心 `src/offline-core/qa-http.ts` 使用同一运行时 ShelfService 和共用路由；继续要求 loopback 256-bit Cookie/session、Origin+CSRF 与 bounded JSON，且只可添加/移除 `local:<64hex>`。禁止从请求提交未知来源 `records`、无关请求字段、非 local comicId、非 UUID shelfId；`add-filtered` 强制本地 source 条件；即使历史书架中出现 E-H 等行，离线核心的 contents 和 count 也不泄漏其身份或计数。此规则**只适用于 QA local-only 组合**，正式现有 Desktop 的历史多源书架仍保持可用。
- `scripts/build-offline-core-candidate.ts` 真实 esbuild metafile 门禁新增 `ShelfService` 和共享路由作为强制依赖，继续拒绝 SDK、ProviderService、Host 等模块进入无源 ESM。Windows x64 Portable QA 实际解压官方 Node + 本地 Core，并增加真正 HTTP 书架创建、追加本地作品、拒绝 E-H 作品、读取书架内容。

## 验收与失败反馈

- 新增 `test/unit/core-shelf-routes.test.ts`：原 SQLite `ShelfService` 的创建/改名/读列表/批量添加和移除、删除后漫画仍保存；add/remove 返回与生产事件等价的 change 负载；有合成 E-H 项目的数据库仍实施 local-only 过滤且只显示本地 count；只允许明确受支持的书架 HTTP 操作；AST 导入图验证唯一 SDK-free 端口被旧正式 Server 和独立 QA Core 双方引用。
- 进一步补充**真实旧桌面 HTTP 端到端**：`startLibraryServer` + 旧 `LibraryService`（来源全部禁用），调用原 `/api/v1/shelves` 创建、加入、移除并通过 `recordUserEvents` spy 验证完整 `shelfId` / Session / Context 行为属性；不是只有假 Controller 的单元测试。
- 扩充 `test/unit/offline-core-http-ui.test.ts` 的真实 Node/HTTP：在 cookie/Origin+CSRF 保护内执行书架创建、加入/拒绝远程来源、内容/计数、筛选加入拒绝、重命名、移除、删除、单本仍存在。Windows Portable ZIP 解包运行同样的书架端点。
- **精确最新可执行代码 SHA `d0af6d1dec1d3a7f5a50c6360d5ca65a1944c473`**：[S3 Linux/Windows #40843746890](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40843746890) **双端各 9 文件 / 56 项 PASS**，TypeScript 检查通过；[Windows x64 Portable QA #40843746744](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40843746744) **SUCCESS**，含自带官方 Node/真实 ZIP 解压后书架 HTTP。
- 专项 Chromium 的当前 CI 工作流 #40843746890、完整 Android/Web/Desktop #40843755448 在写入时尚未全部结束，标记 **NOT_VERIFIED**。不可把专项子作业通过冒充全项目验收；其余实际完成后再更新 PR 证据。

## 未完成与下一阶段

| 门禁 | 当前状态 |
|---|---|
| 旧正式 Desktop 书库查询 + ShelfService CRUD/行为事件移出原超大型 Server 内联逻辑 | **Draft / Linux+Windows 专项 PASS** |
| 离线核心/Windows QA ZIP 复用真实 ShelfService 和原目录索引 | **QA PASS** |
| 生产 `LibraryService/ProviderService` 从完整 Desktop 启动中剥离并由独立可信来源组件取代 | **NOT_IMPLEMENTED** |
| WebDAV/本地导入/设置以及完整 Web UI 无源运行的真实端到端迁移 | **NOT_IMPLEMENTED** |
| Android 无源 APK / 来源 Service-Binder 与真机 UI | **NOT_IMPLEMENTED** |
| v0.5.0 实际用户账号/记忆书库/下载/进度无痛升级、回滚 | **NOT_VERIFIED** |
| G1/G2/G3/G4 正式关口 | **全部 OPEN** |

**下一主线切口**：继续直接抽离当前正式 Server 的本地导入、设备设置、WebDAV 与安全配置相关核心 HTTP 端口，减少 `LibraryService` 对完整浏览器 UI 的启动依赖。不要制作第二套数据库、Reader 或仅用于展示的新 QA 页面。可信来源生产签名、OS 保护根、Android 对等机制和老用户升级需独立逐项验收，不能依赖单机同用户 Node 子进程冒充沙箱。
