# S3 CORE-SHELF｜正式桌面书架 CRUD、批量筛选与行为事件解耦（2026-10-29）

**分支/PR：** `codex/s3-core-shelf-routes-20261029` / [Draft #233](https://github.com/Saber-Alter-Lily/pica-library/pull/233)，叠加已通过完整 CI 的 [#231](https://github.com/Saber-Alter-Lily/pica-library/pull/231)。正式 main/v0.5.0/Release/OTA、旧用户书库/账户、Android 包名与签名未更改。此任务继续 S3-CORE-LIB-02，不是另造一个小阅读器或宣布生产 G2 已通过。

## 真实生产耦合点和修改

原 `src/library/server.ts` 直接内联 `/api/v1/shelves` GET/POST、`/api/v1/shelves/:id` GET/PATCH/DELETE 和 `/api/v1/shelves/:id/(items|remove|add-filtered)` POST。虽然实际数据操作调用的 `ShelfService` 只依赖原 `LibraryDatabase` 和 `LibraryQueryService`，但原路由及 `recordUserEvents` 被绑在同时初始化 Pica/E-H/JM 的完整 Desktop Server 里。

- 新增 `src/library/core-shelf-routes.ts`：将**相同的原 HTTP 动作及 JSON 结果**抽成只读路由匹配 `coreShelfMatch` 与执行器 `coreShelfExecute`；`ShelfService`、记录类型及用户事件输入仅 type import，唯一运行时导入是上轮来源无关的 `offlineLocalFacetQuery`。没有复制 SQLite、推荐、漫画 Reader 或下载调度。
- 直接修改正式 `src/library/server.ts`：实际将旧书架 HTTP 分支换为共享 matcher/executor，同时保留旧 `body()`、原 Session/context header 语义、`options.database.recordUserEvents(events)` 的单批事务记录。数组/CSV 漫画 ID 的兼容解析、选中的搜索结果 `records` 元数据入库、删除/重命名/按筛选加入等**在完整 Desktop 模式保持原行为**，并保留重复 ID 的事件记录语义。
- 实际 `src/offline-core/qa-http.ts` 复用原 `ShelfService` 与同一个执行器，在已有 127.0.0.1 loopback、一次性 Cookie 和 Origin/CSRF 后开放上述书架接口。`localOnly` 强制 ID 为 `local:<64hex>`，限制批次数量，拒绝书架 `records` 伪造、拒绝 E-H/Pica/JM 入架及非本地筛选，按真正可见本地作品修正旧混合书架的 count 和内容；全程不启动 ProviderService。
- `scripts/build-offline-core-candidate.ts` 的实际 esbuild 输入门禁现在同时要求原 `src/services/shelf-service.ts`、`src/library/core-shelf-routes.ts`，并继续禁止具体在线来源 SDK/Host/旧 Desktop/`LibraryService` 倒灌物理 Core。

## 真实回归及失败记录

- `test/unit/core-shelf-routes.test.ts` 用实际临时 SQLite（包含合成本地导入与 E-H catalogue）验证完整 Desktop 的创建、改名、删除、选中搜索作品元数据补录、加入/移除/批量筛选，以及每个输入作品的 `shelf_add/shelf_remove` 事件顺序、来源、App Session 和 Context。再验证纯 Core 的只本地查询、混合书架过滤、批量越界/额外字段/账号源拒绝、模块导入闭包。
- `test/unit/offline-core-http-ui.test.ts` 在实际 source-free Node 进程/HTTP 会话执行同一书架 URL，检查创建、列表、内容、重命名、加入、拒绝外源、筛选、移除、删除，及无 Cookie、跨 Origin、错误 CSRF 拒绝；旧漫画/图片保持。
- `test/unit/local-library-http.test.ts` 新增**正式 Desktop Server** 的真实 HTTP 端口回归：旧书架路由、数据库保存、事件属性、删除后本地作品仍可阅读，不再只验证共享函数。
- `scripts/verify-windows-offline-portable-qa.ts` 用实际解压的 Windows x64 ZIP、固定 SHA 的 Node 24.15.0、真实 `.cmd` 启动验证旧书架 API 的创建、本地添加、过滤、跨源/CSRF 拒绝；**完整 CMD/Node 进程树关闭并重启后仍保留书架与 Reader 进度**。无真实用户书库，ZIP 仍只在 Actions 临时目录存在，最终仅上传 1 日的非可执行 JSON。
- 第一轮专项 [#40847990701](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40847990701) 因新增 HTTP 测试变量名 `filtered` 重复导致 TypeScript 失败；在 `eec4edab` 修复。其后 [双平台专项 #40848142891](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40848142891) **SUCCESS**，Linux 10 文件/70 项、Windows 10 文件/70 项、两端 TS 与真实 Chromium 测试成功。
- [Windows Portable #40848432952](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40848432952) **SUCCESS**：实际 ZIP 书架 API/CSRF/来源约束、重启保留成员和阅读历史。
- 旧完整 CI [#40848152329](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40848152329) 单项失败原因是 `test/unit/user-event-batch-p2d7b.test.ts` 硬编码要求原来 `server.ts` 的 `shelfItemsRoute` 内联文本；实际代码移动后虽然事件依旧记录，旧静态检查误判。`5211371b` 修订此测试去检查**真实调用链和核心控制器**仍有 `recordUserEvents`、`shelf_add/remove`、每项 metadata 和生产 AppSession/Context；新增生产 HTTP 动态测试不删事务验收。
- 最新代码/门禁 `c5bd6469e25155be613c4002575b25d2ed9fc3f0` 的 [专项 #40849035242](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40849035242) 和 [完整 CI #40849044107](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40849044107) **本文记录时仍待最终判定**；禁止将历史成功认定为最新完整 PASS。

## 后续阶段门禁

| 项目 | 当前状态 |
|---|---|
| CORE-LIB-02a 原 Desktop 书架路由迁入共享 source-free 服务 | Draft，旧书架 API/事件/SQLite 已实施，专项部分验收通过 |
| CORE-LIB-02b 独立 Core 上真实 Windows ZIP 书架管理和重启恢复 | 专项实际 Windows QA PASS；正式签名与用户目录未参与 |
| CORE-LIB-03 现有正式设置/本地选择/文件管理/WebDAV/API 来源无关组合 | **NEXT / NOT_IMPLEMENTED** |
| CORE-LIB-04 整个正式 Windows 首页、书库/书架/阅读/设置 UI 与核心服务的零来源运行 | **NOT_IMPLEMENTED** |
| S3-G2 受保护可信来源发行/更新/卸载、生产 OS 权限与 core 边界 | **NOT_IMPLEMENTED** |
| Android 独立来源 Service/Binder、物理纯 Core APK | **NOT_IMPLEMENTED** |
| v0.5.0 本地数据/账号/下载/记忆与一键升级、回滚 | **NOT_VERIFIED** |
| G1/G2/G3/G4 正式发布关口 | **OPEN** |

下一切口以现有正式模块为准，优先隔离设置/本地文件导入与 WebDAV 的源无关端口（若功能已有则复用），然后在一致的完整 Windows Web UI/正式构建中验收；不能持续以 QA 小型 UI 代替正式产品，亦不能将用户自定义来源视为自动规避版权、站点条款或软件责任的理由。
