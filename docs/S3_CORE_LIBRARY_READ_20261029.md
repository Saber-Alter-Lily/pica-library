# S3 CORE-LIB-01｜正式 Desktop Catalogue API 与零来源核心共用（2026-10-29）

**交付线**：[Draft PR #231](https://github.com/Saber-Alter-Lily/pica-library/pull/231)，叠加 #230；正式 main/v0.5.0/Release/OTA/Windows Launcher/Android 签名和用户数据库均未更改。

## 实际生产耦合点

以往 `src/library/server.ts` 在同一个启动单元中创建 `LibraryService/ProviderService`，同时自己解析 `GET /api/v1/comics`、`GET /api/v1/comics/:id`、`GET /api/v1/downloaded` 和 `POST /api/v1/library/query`。后四项本质上只用已有 `LibraryDatabase` 与 `LibraryQueryService`，不需要具体 Pica/E-H/JM 协议或网络。之前 #226–230 证明无来源本地 Reader 可以构建 ZIP、启动 Node/HTTP 和 Chromium，但完整书库查询仍与原 Server 绑定，妨碍 S3-04。

## 修改记录

- 新增 `src/library/core-catalog-read.ts`，以 `LibraryDatabase` 与 `LibraryQueryService` 的 type-only ports 直接运行**旧的**以上 4 个 API 语义。无任何运行时 import（包含 SDK、ProviderService、LibraryService、HTTP/网络）。原有 GET 查询仍保留旧 q/author/tags/categories/finished/sort/limit/offset 的解析，作品详情和 downloaded 的原 HTTP JSON 状态不变。
- **实际修改原 Desktop Server**：`src/library/server.ts` 直接引入并调用共享 coreCatalogueGet/coreCatalogueQuery，删除旧内联的漫画列表、详情、下载列表和分面查询逻辑。正式 Desktop 仍能读取已保存的 Pica/E-H/JM/Local 数据，未改变既有 SQLite schema、现有工作会话的来源启停或浏览器资源路由。
- 纯 Core `src/offline-core/qa-http.ts` 使用**同一 `LibraryQueryService` 运行时对象**和共享模块，在 loopback/session/Origin+CSRF 内提供原 `/api/v1/comics`, `/api/v1/comics/:id`, `/api/v1/downloaded`, `POST /api/v1/library/query`。通过 `localOnly` 严格只查询 `providerId='local'` 且 `comicId=local:<64hex>`；全部分页在本地筛选之后应用，对未授权来源 query 拒绝。所有用户输入由限定大小 JSON parser 和 offlineLocalFacetQuery 严格校验，不允许任意 Provider/Host。
- 独立 Reader QA 浏览器选书增加真正的本地关键词搜索，查询同一 `/api/v1/library/query`，仅允许 local、完整搜索/无匹配/恢复，再调用已复用的 Reader；**没有自己维护第二套搜索索引或排序**。正式 `web/app.js` 仍保持原版，不会把 QA 页面错误标记为完整正式 UI。
- `scripts/build-offline-core-candidate.ts` 的真实 esbuild metafile 强制包括 `src/library/core-catalog-read.ts` 和原 `src/services/library-query-service.ts`，仍禁止 `src/providers`/`src/sdk`/`LibraryService`/Host/desktop 等进入 QA 二进制。`scripts/verify-windows-offline-portable-qa.ts` 在实际 ZIP 解压后启动官方 Node/CMD，通过原书库 API 查询、CSRF/源过滤，再读章节图片和进度，继续检查许可证/清单/原文件。

## 实际验证

- 单测 `test/unit/core-catalog-read.test.ts` 使用同一临时 SQLite 中真实 Local 导入与已保存的合成 E-H catalogue 行，验证原 Desktop 全量查询返回与旧 Database/LibraryQueryService 完全相同、纯 Core 不能查询外源或用参数跨越 source boundary、分面筛选按原语义处理，以及 TypeScript AST 双调用方向与零具体来源依赖。
- 原 `test/unit/offline-core-http-ui.test.ts` 扩展真实本地服务 HTTP：原 comics/详情/分面 API 及 Session+Origin+CSRF、不可查询 E-H、未知目录拒绝。Chromium 继续验证本地搜索、无结果、恢复、实际翻页/保存与重载；Windows ZIP 在解压运行自带 Node 后核查原 API。
- **精确代码 `e698f66a4648cda1954c7c1293a4812749301fa5`**： [S3 Linux/Windows + Chromium #40842187533](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40842187533) **SUCCESS**，Linux 8文件/51项 PASS，Windows 8文件/51项 PASS，浏览器 Chromium 1/1 PASS，两平台 TypeScript 检查通过。
- [Windows Portable ZIP #40842196837](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40842196837) **SUCCESS**：真实官方 Node 24.15.0 归档核查、实际 ZIP 打包/解压及原 catalogue/reader API/进度恢复。仍只上传短期 JSON 元数据，不上传可执行候选。
- [Android+Web/Desktop 全项目 CI #40842243847](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40842243847) 记录时仍运行中 / NOT_VERIFIED，不能仅凭专项通过宣称完整端侧验收完成。

## 下一个真实阻断，不是美化 QA

| 阶段事项 | 状态 |
|---|---|
| S3-CORE-LIB-01 正式 Desktop 原 catalogue GET/查询与纯 Core 共用 | **Draft / 专项跨平台 PASS** |
| S3-CORE-LIB-02 真实正式书架 CRUD / 添加移除/批量筛选服务脱离全量 ProviderService 并保持行为事件 | **PLANNED** |
| S3-CORE-LIB-03 现有正式设置、本地导入/网盘 WebDAV/API 及核心状态管理脱离 ProviderService 的启动依赖 | **PLANNED** |
| S3-CORE-LIB-04 完整 Windows 正式首页/书库/阅读/设置 UI 对零来源核心运行的对等性 | **NOT_IMPLEMENTED** |
| S3-WIN-PKG-04 旧版目录、数据库、更新助手/回滚的一键升级 | **NOT_VERIFIED** |
| Android 物理来源剥离、Service/Binder、真机 UI | **NOT_IMPLEMENTED** |
| G1/G2/G3/G4 正式版关口 | **全部 OPEN** |

**下一切口**：优先抽出现有 `ShelfService` 的 HTTP 读写控制及行为事件，确保真正的书架管理脱离旧服务；随后逐步迁移无源设置、本地导入和 WebDAV 访问端口，不复制第二套页面或数据库，也不绕过旧用户数据保护。线上来源组件的生产签名、OS 权限/信任根和安装/升级/撤销另立审核，暂不得进入正式 Release。
