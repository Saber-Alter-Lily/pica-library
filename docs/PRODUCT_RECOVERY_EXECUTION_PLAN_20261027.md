# Pica Library 产品恢复与架构主线｜执行计划 V1.0

## 2026-10-29 S3 CORE-LIB-04b-02/03｜原完整网页 + Windows x64 实体无源 QA

- [Draft PR #239](https://github.com/Saber-Alter-Lily/pica-library/pull/239)：真实旧 `web/index.html`、`app.js`、样式/翻译/Reader 通过 TS AST 真实资源闭包装配，排除独立在线来源登录启动与非必要 AI 模型；仍复用同一 SQLite/书架/Reader/HTTP，并对全部文件做来源白名单/SHA。原 Web 的 `post()` 仅在拥有测试核心随机同源 token 时送 `x-pica-qa-csrf`，不改变旧 Desktop。解决无源核心真实网页所需的原书库最多5000项查询，不能读取任意外源 ID。
- 实际 [Linux/Windows + 真正 Chromium 原首页 #40869551499](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40869551499) **3/3 SUCCESS**，测试原完整首页/书库筛选/书架创建/Reader/设置及无外网请求；完整 Android/Web/Desktop [#40869749947](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40869749947) SUCCESS。
- 旧 Windows x64 官方 Node 24.15.0 SHA 固定 ZIP 构建器/真实 CMD/Node 启动器新增 Full-Web **可选** `--full-web`，Reader-only 原路线依旧测试。[两种真实 Windows Portable ZIP 解压/进程/SQLite重启 #40870550859](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40870550859) **2/2 SUCCESS**。均是 OS Temp disposable QA，不上传任何可执行包、不签名、不装入真实用户目录；最新源码全量 CI 仍按 [#40870561582](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40870561582) 单独核验。技术审计见 [S3_FULL_WEB_WINDOWS_PORTABLE_QA_20261029.md](S3_FULL_WEB_WINDOWS_PORTABLE_QA_20261029.md)。
- **下一个硬阻断 CORE-LIB-04c**：从真实正式 `src/desktop/main.ts` / `src/library/server.ts` 解除 `LibraryService/ProviderService` 的强制初始化，用同一个完整正式 UI/数据库、模块化来源工厂实现无源启动。然后可信来源签名安装/更新/撤销、Android 纯核心 Service/Binder/APK、既有 v0.5.0 的书库/账号/下载/偏好无痛升级与回滚及用户真机验收。G1/G2/G3/G4 均未完成，原 42+新增12 验收项仍适用；#232/#233 书架方案需选版。

---

### CORE-LIB-04b-01 完整回归纠正（2026-10-29）

- 旧完整 CI [#40860576867](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40860576867) 暴露原 `reading-library-shell` 失败：有 Desktop status，但 caps 失败时不应通过第二次请求尝试取得权限。精确 `a40d8e82` 修复状态区分，无源 Core 缺失 Desktop host 仍可恢复正确 caps。专项加入该历史安全回归，不削弱原有限制。
- 新精确代码/门禁 `94a4221aecf01ce7ac1656db2a7e6a055b219dac`，新 [S3 双平台 #40861065013](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40861065013)、[全 Android/Web/Desktop CI #40861072267](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40861072267) 本段撰写时 **QUEUED，尚未验收**。当前计划不推进 main、Release/OTA。
- 后续继续 CORE-LIB-04b-02 原完整 `web/index.html` / 全资源 / 真 Chromium 无源启用，而后 CORE-LIB-04c 生产服务强制 Provider 构造拆分。G1–G4 全部 OPEN。


## 2026-10-29 CORE-LIB-04b-01｜原正式 Web app 在纯 Core 能力下安全初始化

- [Draft #238](https://github.com/Saber-Alter-Lily/pica-library/pull/238) 真正修原 `web/app.js` `loadDesktop/detect`：无 `desktop/status` 时仍可读已有 source-free `/capabilities`；明确禁用 `recommendationSessions` 的后端，保留原本地漫画列表/作者/分面与 `renderAll`，不再主动获取在线推荐反馈、session 或发起构建；旧有正常 Desktop 不受影响。中英日翻译完善。未创建另一套前端。
- 实际 AST 提取的**生产函数**正负模式单元运行测试，Linux/Windows 专项首轮 TS2502 测试类型失败已修复，修后 [#40860567748](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40860567748) **SUCCESS**；全 Android/Web/Desktop [#40860576867](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40860576867) 仍待确认。
- 进入 **CORE-LIB-04b-02**：原正式 `index.html/app.js` 全量资源/import 图核查并受控装配，实际 Core-only 本机 HTTP 加载**完整旧首页**，真实 Chromium/Windows Portable 进行书库、书架、Reader、设置和 WebDAV 适配测试；不可用在线源/推荐 UI 必须显式禁用并保留数据。04c 再从正式 `desktop/main.ts`/server 移除 `LibraryService/ProviderService` 强制构造，后续 Android 纯核心、可信来源签名与升级撤销、v0.5.0 真实迁移和 G1–G4 最终用户验收依旧 OPEN。详见 [完整审计](S3_FULL_WEB_SOURCE_FREE_BOOTSTRAP_20261029.md)。

---

## 2026-10-29 S3 CORE-LIB-04a｜旧正式 Windows UI 启动基础接口开始迁入无源核心

- 新 [Draft #237](https://github.com/Saber-Alter-Lily/pica-library/pull/237)：真实旧 `src/library/server.ts` 的 `GET /status`、`GET /authors`、`GET /capabilities` 三项 API 改为来源无关 `coreBootstrapRead`，**旧生产 Provider 完整状态/历史字段保持不变**；独立无源实体 Core 使用同一 API，但明确关闭根本不存在的站点来源/收藏修改/在线推荐能力，仍需持有本机随机 QA 会话 Cookie 才可访问。
- 现有 esbuild 的严格无源包实际包含原版本号、appCapabilities、模块契约与该端口，原 `src/version.ts` 的 `package.json` 引用触发首轮严谨门禁 FAIL；修复后仅允许项目根版本元数据，不放宽任意 npm 依赖。Windows 官方 Node x64 实体 ZIP [#40859105359](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40859105359) 修后 **SUCCESS**；Linux/Windows/Chromium [#40859128504](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40859128504) 与全 Android/Web/Desktop [#40859135753](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40859135753) 本条写入时尚未完成，不提前认定。
- **下一目标 CORE-LIB-04b**：原 Windows **完整 Web 首页+JS 资源**真正接无源 core-only 后端，在缺失具体来源时 UI 提供明确功能不可用状态，不要造第二套迷你 UI，也不能用假接口掩盖缺失。随后 CORE-LIB-04c 才能拆原 Server/Desktop `LibraryService/ProviderService` 强制构造，完成实体无 SDK Windows 应用，再到 Android 服务/Binder、插件可信发行与撤销、老 v0.5.0 无痛升级/回滚和所有实机用户验收。G1–G4 OPEN。[本轮审计](S3_CORE_BOOTSTRAP_20261029.md)。

---

## 2026-10-29 S3 CORE-LIB-03c｜旧 Windows 本地配置及平台目录能力提取

- [Draft #236](https://github.com/Saber-Alter-Lily/pica-library/pull/236) 完成**正式** `src/desktop/config.ts` 的本地目录/profile/Reader 设置/配置原子保存和敏感字段保护抽离，源策略兼容仍由 Desktop 主组合注入；`src/library/server.ts` 的原 `choose-folder/open-directory` 与 `src/desktop/main.ts` 使用来源中立 OS 能力用途接口。只允许旧五种本地目录用途，阻止网页路径/命令注入，沿用原原生选择器、系统打开函数、CSRF 与旧配置文件。
- Linux/Windows 专项 [#40857679928](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40857679928) **SUCCESS**；包含真实 Desktop HTTP、多种旧配置保存/机密与平台/Reader 测试。全量 [CI #40857731995](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40857731995) 在文档提交时单独待核，不挪用专项结果。
- 下一目标 **CORE-LIB-04a**：拆分旧 Windows HTTP 启动及完整用户网页的核心服务 composition，而不是继续创造独立小型 QA Reader。须证明不创建 `LibraryService/ProviderService` 时书库/书架/Reader/设置/WebDAV 真实可用；随后做 Windows 实体 SDK 无源、Android Service/Binder 与核心 APK、可信来源生命周期、老 v0.5.0 一键升级/回滚、物理用户验收。#232/#233 实现分叉仍须消解。G1–G4 不豁免。详见 [技术审计](S3_CORE_LOCAL_PLATFORM_20261029.md)。

---

## 2026-10-29 S3 CORE-LIB-03b｜生产 WebDAV 状态和命令使用来源无关端口

- 新增 [Draft PR #235](https://github.com/Saber-Alter-Lily/pica-library/pull/235)：不重新发明 WebDAV，而是将旧正式 Windows `desktop.save` 的网盘设置/同步/暂停恢复取消/远端删除委托到仅 type-import 原 `RemoteStorageDesktopManager` 的 `coreRemoteStorageDispatch`；旧 status 同样委托，网络和密钥操作只有原业务实现负责，未自动启动在线动作。
- 真实 Linux/Windows [S3 专项 #40853863903](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40853863903) 各29项和类型检查 SUCCESS；最初 TS2322 失败已保留并修复于 `ab4137b4`；完整 Android/Web/Desktop [#40853872527](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40853872527) 仍需核对最终状态。
- 下一优先任务 CORE-LIB-03c 本机设置与原生文件夹/打开目录受控能力 → CORE-LIB-04 完整正式 Windows UI/core-only 进程组合 → 正式 Android Source Service/Binder、插件可信分发/升级撤销 → 真正 v0.5.0 无损升级/回滚与双端用户验收。不可继续用小型 QA 界面冒充 Windows 正式版。G1–G4 继续 OPEN。[审计](S3_CORE_REMOTE_STORAGE_20261029.md)。

---

## 2026-10-29 S3 CORE-LIB-03a｜复用原正式本地文件导入与纯核心

- 在 [Draft PR #234](https://github.com/Saber-Alter-Lily/pica-library/pull/234) 真实抽离原 Desktop `/api/v1/desktop/local-import` 的受信任文件选择器/预览/确认/取消逻辑为来源中立控制器，保留旧文件夹/CBZ `LocalLibraryIngestion`、原 SQLite 和进度，不重造功能。独立无源 CLI 也调用同一端口；物理 QA Core 的源码闭包门禁必须包含它。
- 新增真实 SQLite、路径注入/来源字段/无原生文件选择器/headless/取消/token 单次/并发测试，连同已有生产 HTTP/CSRF/Reader 回归。Linux/Windows S3、Windows Portable、Android/Web/Desktop CI 均按新的精确 SHA 单独验收；**当前 CI 待检，不宣称全部通过**。
- 下一段 CORE-LIB-03b：正式 Desktop `choose-folder/open-directory`、无源设置和 WebDAV 能力端口；CORE-LIB-04：完整旧首页/书库/书架/Reader/设置在不启动 `ProviderService/LibraryService` 的 Windows 核心上运行。随后才可能认定实际来源外置和旧 v0.5.0 安全迁移。Android 源服务/Binder、签名可信发布、G1–G4 保持 OPEN。[详细审计](S3_CORE_LOCAL_IMPORT_20261029.md)。

---

## 2026-10-29 S3 续进｜生产书架 API/事件从含源 Server 剥离

- 叠加上一轮完成原 Catalogue API 的 #231，新增 [Draft PR #233](https://github.com/Saber-Alter-Lily/pica-library/pull/233)：生产正式 `src/library/server.ts` 的所有书架 HTTP 动作迁入源中立 `coreShelfRoutes`，继续复用原 `ShelfService`、SQLite 和分面筛选及书架事件事务；不重写书库或推荐。仅在沙箱 QA 子入口运行本地 `local:<id>` 的同一路由，不允许跨源项目、records 或不受控筛选。
- 实际 [S3 双系统 70/70 #40848142891](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40848142891) 与 [Windows x64 解压包＋.cmd 重启验收 #40848432952](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40848432952) 专项 SUCCESS。旧完整 CI 的事件检查静态定位失效已按新调用路径修订，原事件批量事务保证和生产 HTTP 行为测试未删除；最新完整 CI 需按当前 SHA 重新判定。
- 下一阶段 **不要继续堆独立 QA 小 UI**：以原 Windows 完整首页/设置/书库/书架/本地文件/WebDAV 为目标逐步解耦其初始化依赖，达到不启动 `LibraryService/ProviderService` 也能完整管理本地作品。仍需发布可信签名插件/受保护 OS 安装根、Android 纯核心 APK + Service/Binder、v0.5.0 无痛升级/回滚和真机验收。G1–G4 均 OPEN。
- [本轮 CORE-SHELF 技术及验收文档](S3_CORE_SHELF_20261029.md)。

---
## 2026-10-29 S3 推进｜从独立 QA 小阅读器进入正式 Desktop 书库 API 抽离

- [Draft PR #231](https://github.com/Saber-Alter-Lily/pica-library/pull/231) 首次把**真实正式 Windows/Desktop HTTP 服务中的书库主路径**抽成共用的来源无关业务端口：漫画列表、单本详情、下载列表与原 `LibraryQueryService` 分面查询。同时让既有已验证纯核心/Windows Portable QA 复用它，仅施加 local-only 保护，绝不重复实现 SQLite、书库筛选或 Reader。
- 精确源码 `e698f66a` 的 [S3 Linux/Windows+Chromium #40842187533](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40842187533) **51/51 + 51/51 + Chromium 1/1 SUCCESS**；[Windows Portable 官方 Node ZIP #40842196837](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40842196837) **SUCCESS**，严格拒绝非本地 Provider 访问。全量 CI 结果单独以实际作业状态为准。
- 下一切口固定为**旧 ShelfService CRUD/批量操作与行为事件解耦**、无源设置/本地导入/WebDAV 端口、完整 Web UI 接线，之后才是 Windows/Android 真正主程序 SDK 剥离与生产信任根、v0.5.0 数据保护升级。纯 Core QA 已能从 ZIP 启动，不能再重复做小型演示当作 G2 完成。详见 [本轮端口审计](S3_CORE_LIBRARY_READ_20261029.md)。
- G1（Android UX/引导）、G2（真实来源外置）、G3（正式无痛升级/回滚）、G4（发布）全部 OPEN，原42+新增12个用例不豁免。

---
## 2026-10-29 S3 续进｜Windows x64 官方 Node＋纯核心 ZIP 实体打包验收

- [Draft PR #230](https://github.com/Saber-Alter-Lily/pica-library/pull/230)：首次把独立 `core.mjs` + 10 Reader 资源和 **Node 24.15.0 Windows x64 官方运行时**组装成临时完整 Portable ZIP，附 Node/AdmZip/project 许可证、21 条目闭包、逐文件 SHA-256 和明确的 QA 启动器；真实下载运行时 ZIP 并按官方 SHASUMS256 + 额外固定 SHA256 `cc5149...` 双重确认。
- 精确源码 `0ca6f6e8` 的 [Windows 实际 ZIP＋CMD 启动 #40838638638](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40838638638) **SUCCESS**：从 ZIP 解压包启动随包 Node/`.cmd`，HTTP 会话与 CSRF、图片读取、本地导入、进度在临时子进程树退出后重启恢复；完整 ZIP 在 CI 删除，只上传 1 天元数据，非正式用户安装包。
- **G2/G3/G4 仍 OPEN**：QA 包只含本地阅读，而不是完整版 Windows 首页、推荐、书库管理和升级器；旧正式 Windows/Android 主程序仍含来源 SDK。生产签名/OS 保护目录、真实旧 v0.5.0 数据迁移、Android Binder、终端 UI/升级全验收均未做。下一阶段必须围绕**正式完整 Web/Windows UI 与来源业务服务解耦**，不能继续以 QA 小功能包代替正式主线。见 [完整 Windows Portable 审计](S3_WINDOWS_OFFLINE_PORTABLE_QA_20261029.md)。

---
## 2026-10-28 S3 续进｜QA Reader 资产不再依赖 Git 工作目录

- [Draft PR #229](https://github.com/Saber-Alter-Lily/pica-library/pull/229) 实现从现有正式 Web DOM 提取原 Reader 片段、9 个已审计 JS/CSS/图片资源的独立临时装配，拒绝复制整个首页、账号/来源和推荐脚本，计算 SHA-256 并可回读；纯 Core HTTP 和 Chromium 改从 `core.mjs` 旁的资源运行，不再要求源码仓库作为运行 CWD。
- 精确源码 `8ed7d80c` 的 [S3 Linux/Windows+Chromium #40827250488](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40827250488) **SUCCESS：33/33 + 33/33 + 真浏览器 1/1**，涵盖一次性数据库隔离、源代码禁入、目录覆盖拒绝及翻页/进度/刷新。第一轮 Windows Temp realpath 失败已修复，记录保留。
- **G2 仍 OPEN**：当前仅测试目录内 Node ESM+Reader 静态资源，正式 Windows 主程序/完整 Web UI 及 Android APK 依旧编入旧来源 SDK；没有可信独立来源签名/安装根/正式 Launcher、老版本用户数据迁移/无痛升级与回滚。下一切口优先构建**不发布**的 Windows x64 Portable 安装候选并核对 Node 许可证、文件闭包和启动器，再改造完整桌面 UI 及 Android 服务隔离。
- 详细记录见 [Reader 资源装配证据](S3_OFFLINE_READER_ASSET_STAGE_20261028.md)。既定 S0–S6 和原42+新12验收不变；完整 CI 精确源码最终结果需另外核查。

---
## 2026-10-28 S3 新进展｜纯核心独立 HTTP + 原 Reader Chromium 真实操作

- 在 [Draft PR #228](https://github.com/Saber-Alter-Lily/pica-library/pull/228) 中，已将纯本地 Node Core QA 候选提供为受控 `127.0.0.1` HTTP 服务，仍通过同一 `localReaderGet`/`ReaderService` 读取原 `/api/v1/reader` API。直接复用旧 Reader DOM、CSS、翻页/视口/进度和设置模块，不载入具体站点 SDK。
- [S3 Linux/Windows + Chromium #40826346306](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40826346306) 对精确代码 `87f142b3` **SUCCESS：31/31 + 31/31 + 真实 Chromium 1/1**。实际展示合成本地 PNG、翻页、保存/刷新后恢复，验证跨站请求与 Host/CSRF 拒绝，无 user data。
- **严格限定**：这只是专用 QA 浏览器入口，不是完整 Windows GUI。主要 G2 阻断已经从“能否无来源读取漫画”收敛到“如何让完整多功能 Windows HTTP/Web UI 真正脱离 `LibraryService/ProviderService`，且不破坏旧书库”。完整 Windows 发行 ZIP 与 Android APK 仍含来源代码，不能说已完成 G2 或可以发布。
- 下一切口：沿新 `localReaderGet` 和隔离 core 启动根继续去耦合真正的 Desktop Web 组合与生产安装/更新，再做 Android 对等机制和老用户无痛迁移。详细核查见 [S3 实际浏览器验收](S3_OFFLINE_CORE_HTTP_UI_20261028.md)。

---
## 2026-10-28 S3 新进展｜Windows/Linux 无来源独立本地阅读核心 QA

- **不覆盖既定发布关口**：新增 Draft [PR #226](https://github.com/Saber-Alter-Lily/pica-library/pull/226)，以 v0.5.0 现有 Reader/导入/数据库为原件，实际 esbuild 构建一个独立本地 Node ESM QA 候选，所有具体来源 SDK 不在这个打包图中。
- [S3 Linux/Windows 专项 #40821030082](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40821030082) 对精确源码 bc153951 **26/26 + 26/26 SUCCESS**，实际独立进程操作文件夹和 CBZ、保存和重启恢复阅读进度；用户旧目录完全拒绝访问。仅输出可读源码依赖/哈希 JSON，不上传可执行件。
- **G2 仍 OPEN**：现有 Desktop main/HTTP Server、Windows 正式发行包和 Android APK 仍依赖旧 Pica/E-H/JM 代码；尚未抽出同一 Web Reader 的零来源 HTTP 组合，未做 Windows/Android 物理主程序替换或生产信任根。下一任务是共享本地 Reader HTTP 路由的受控提取与跨包可用性测试，不造第二套 Reader。
- 详细进度和边界：[S3 离线核心实体 QA](S3_OFFLINE_CORE_PHYSICAL_QA_20261028.md)。完整 CI 以精确结果为准，所有原42+新增12案例与 G1–G4 不豁免。

---
## 2026-10-28 S3 阶段关口｜真实 Windows/Linux 进程原型

- 开发分支：[S2 Draft PR #219](https://github.com/Saber-Alter-Lily/pica-library/pull/219) → [S3 Draft PR #220](https://github.com/Saber-Alter-Lily/pica-library/pull/220)。基于 v0.5.0 正式版继续做未发布隔离开发，不触碰 main、签名包、OTA 或用户数据。
- **S2 代码边界**已经完成本轮完整 [CI #40689775058](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40689775058) SUCCESS；S2 不是全项目模块化完成声明，历史 G1 和其余 G2–G4 保持 OPEN。
- **S3 原型里程碑**：固定 SHA-256 的 Node 受控工作进程、随机会话握手、受限协议/DTO、及时撤销/超时处理、媒体大小约束和环境隔离。使用真实 `fork` 和 synthetic worker，无来源帐号或联网。
- **精确系统测试**：[Linux + Windows 双平台 S3 CI #40690767200](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40690767200) 对代码 `a785af6f` SUCCESS：Windows 8/8、Linux 31/31 分别执行，并非同一个平台的模拟。后续增补 Reader 闭包防倒灌门禁为更新代码，**其自己的完整 CI 尚需独立核查**。
- **S3 余下工作按阻断顺序**：真实受信任发布清单及完整可执行依赖链、Windows 私有安装目录与签名/原子更新/撤销和完整包对照；Android Service/Binder 和权限隔离；迁移 Pica/E-H/JM 的实际来源协议，保证来源可以真正独立启停/升级；最后纯核心 Windows/APK 无在线源 SDK 的实体证明与 v0.5.0 老库回滚。
- **禁止错误验收**：独立测试进程不等于 OS 沙箱，签名固定测试工件不等于用户可安装任意插件，核心仍编译具体平台来源 SDK，不可提前将 NEW-SRC-01、G2/G3/G4 标为 PASS。S3 详细证据与边界：`docs/S3_TRUSTED_PROCESS_PROTOTYPE_20261028.md`。

---


## 2026-10-28 开发优先级调整（用户已授权；S1 验收不豁免）

- 本轮停止围绕模拟器截图测试反复优化；已通过自动视觉矩阵不等于 G1 用户/设备验收。S1 残余问题继续登记为发布阻断，但**不再阻断独立 Draft 中 S2/S3 的受控架构研发**。
- 新增 [Draft PR #219](https://github.com/Saber-Alter-Lily/pica-library/pull/219)，从 PR #218 冻结头 `6e5c1a4a` 分支，仅从 Android/UI 主线隔离来源依赖研发；当前正式 `v0.5.0`、`main`、OTA 与真实用户数据不变。
- S2-01 开始使用已有 TypeScript AST 来导出项目真实 import 图及 runtime SCC，CI 阻止核心 Reader 反向依赖具体 SDK；S2-02 使用原有 `OnlineReaderService` 插入可撤销的来源中立 transport，先以 synthetic Reader 实际章节/媒体/进度链作为原型。
- 以上只是 **IMPLEMENTED_IN_DRAFT / CI_PENDING**。核心 Android/Windows 安装包仍包含具体来源 SDK，S3 来源签名/安装/撤销/运行隔离尚未完成；无源安装和正式迁移未验证，G2/G3/G4 仍 OPEN。
- 执行和验收资料：`docs/S2_SOURCE_BOUNDARY_20261028.md`、现有 `docs/PRODUCT_RECOVERY_S2_S3_SOURCE_DEPENDENCY_AUDIT_20261027.md`、旧42+新增12 验收表。接续先核 CI，后推 composition root 与真正 IPC，不改变用户书库/模型/身份语义。

---


日期：2026-10-27。**最新执行状态：S0 IN_PROGRESS；S1 IN_PROGRESS；S2 IN_PROGRESS（有限来源归属端口）；S3–S6 PLANNED。G1/G2/G3/G4 尚未验收。** 本文件是工作计划，实际完成证据以当前分支日志与精确 Actions 结果为准。

## 2026-10-27 执行检查点（以后续成功/失败证据为准）

- **正式版与边界**：对照仍为 v0.5.0，生产 main `095d6910c34e00824e03b08a30af0ce4e708137e`。主开发 Draft [PR #218](https://github.com/Saber-Alter-Lily/pica-library/pull/218) 从冻结 Dev89 #217 继承，不合并正式分支、不触碰 Release/OTA/用户数据。
- **S1-04 有效实证**：Android 35 模拟器 [#40620663666](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40620663666) 源码 `cab5067c` **SUCCESS**，10 次独立 Instrumentation PASS；100% 和 150% 字体各 9 张 PNG，共 18 张；已验证章节 0 来源、3 配对、5 下载、7 更新的真实 VSpot 与跳过不记已读。更新章保持只读预览。原始截图/日志 [#12787147081](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40620663666/artifacts/12787147081) 短期保存。不能据此认定另外四章、多语言/深色/实体手机或用户满意。
- **S1-03 已提交候选**：设置行窄宽度、选中栏两行、标签标题、下载界面中英日资源与有界按钮、账户来源三语、指南默认聚光优先。回归中保留曾经失败的第0章旧截图测试；新 UI 仍需完整真机交互和正式版功能对照。
- **CI**：`079b9e37` Web/Desktop 曾 2638PASS/3FAIL/14SKIP；修复 `34ffaa1` 保留原 Host 冻结哈希、动态 QA 后缀与本地化断言，`34ffaa1` 与 `cab5067` Web/Desktop 作业经 GitHub 重新核实 SUCCESS，但不等于两作业组成的整套 CI PASS。Android 全量作业仍在运行；为区别卡住与真实失败添加限时定向 [S1 Robolectric workflow](https://github.com/Saber-Alter-Lily/pica-library/actions/workflows/s1-android-focused-unit.yml)，源码 `b44b9f97`，最新运行结论需回查，不提前填 PASS。
- **S0 风险**：`PhoneDownloadStore.load()` 读错返回空索引、`save()` 删除旧文件再替换，存在**潜在**索引持久性问题，需隔离错误注入与 AtomicFile/回滚兼容设计；不是实测用户数据丢失，也未修改真实索引。
- **S2/S3 状态**：已添加来源身份绑定的图片路由并要求 cache hit 前校验归属；Pica/E-H/JM SDK/协议尚未从全部核心发行物真正外置，G2 不通过。
- **下一步**：先看新 Android 全量与定向测试结果，纠正真实失败；继续 S1-04 章节 1/2/4/6 实控件聚光，补 360/393/480dp × 字体100/130/150% × 中英日 × 浅深代表性截图，再执行真实手机/Windows 功能对照。之后以 S2→S3 主线拆来源，S4 标签/推荐/同步，S5 升级/数据回滚，S6 集中验收为序。旧 42 + 新 12 案例全保留；未经逐项执行不重判。

## S1 追加执行检查点（2026-10-27）

- 当前已获得 `eea0db58` 的7/8章真实 VSpot 验收：[#40621769915](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40621769915) 16/16 Instrumentation 成功、30张真实 PNG，仅限 Android35/中文/浅色/360dp/100-150%字号；用户 G1 不通过。
- 大字号窄屏和画像技术卡片的实际截图问题已按 `ff37b77` / `116244b` 做有限源码修复；第2章五步画风 `b5e134f` 已提交但需要对应源码的模拟器运行确认。总八章不得提前写为 PASS。
- Android Robolectric 单次聚焦运行 #40621041603 在测试阶段超时取消，`8efe395` 改为五类单独有界诊断；需看原始运行与 XML 结果，不把取消当软件失败或完成。
- 正式 v0.5.0、main、OTA、生产数据与旧42 + 新12项验收不变；继续 S1 后才可转向来源真实外置和数据升级。

## 新增执行回执：八章聚光完成 / 原子索引候选（2026-10-27）

- 真实 [Android35 #40622970105](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40622970105) 源码 `b5e134f` 已通过八章18/18 Instrumentation，生成40张实际截图；范围仍只中文浅色360dp、字体100/150%，并未涵盖全语言、字号、主题及真实手机。G1=NOT_ACCEPTED。
- `7b5cbcc` 解决了聚光动画与 Robolectric 生命周期测试混用造成的测试停滞；[#40629290421](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40629290421) 5/5定向测试 SUCCESS；完整 Android CI 仍有单独门禁。
- `a0f2d9a`+`061b2c1` 新建九个语言×宽度×主题×字体代表性组合的六页真模拟器截图门禁，预计54张；`8e581ea` 修复下载索引写入前删除旧文件的潜在 P0 持久性风险并添加合成回归，仍待新源码测试与 v0.5.0 迁移保护验收。
- 进入 S3 前必须证明纯核心无来源SDK；进入 S5/G3 前必须完成真实旧库/失败注入、签名迁移回滚，均不能由此次提交替代。旧42+新12案例保留。

## 最新 S1 G1 状态校准：自动测试与视觉质量分开（2026-10-27）

- `d8b7f4c` 的 Android35 九组七页模拟器9/9自动 PASS、63张截图，但人工检查确认多张空白转场图、WebDAV 深色下拉对比度和英日中文残留、标签页加载态，因此 S1视觉质量继续 **FAIL/OPEN**，不能当用户 G1 验收。
- `8eb0c11`~`e44de731` 的 UI-only 三语与主题下拉修复、新截图必须完成真实绘制的门禁已提交 Draft，精确 HEAD 测试与再审阅 **NOT_VERIFIED**；即使取得自动绿灯仍需逐图审阅和 Android 实机验收。
- `8e581ea` 的下载索引 AtomicFile/失效闭锁只通过合成 Robolectric；S5 真正老库、可回滚升级、失效注入不因此解除。S2/S3 纯 Reader 移走全部来源 SDK 也未完成。
- 历史42项和新增12条继续保留，正式 main/Release/OTA 不变。

## 权威基线与产品定位

- **正式产品和功能/视觉对照**：v0.5.0。**未发布工程候选**：PR #217 源码 `af42b4d3ecafd1d51b3c2ef8aee7339c56c75921`。**生产 main**：`095d6910c34e00824e03b08a30af0ce4e708137e`。本工作独立分支 `codex/product-recovery-s0-s1-20261027`，不修改历史 Draft/正式 Release/OTA。
- Pica Library 是**本地优先的漫画阅读器与个人书库**，不经营漫画平台或托管漫画正文、官方内容目录。无需账号/Host/网络即可导入、浏览、阅读本地文件和管理个人书库。
- 来源是用户显式选用的外部能力：本地/文件夹/CBZ、WebDAV 及有实际适配的网盘、Pica、E-H/ExH、JM，以及用户选择的兼容 Host。**Suwayomi 不能变成强制依赖**。
- 核心与具体来源**真正分离**是目标：最终纯核心包不内置 Pica/E-H/JM 可执行协议、账号 SDK、专属运行时或漫画正文；禁用开关、不带 JVM、抽出 TypeScript 文件不等于完成。历史身份映射和旧资料读取仍须兼容。
- 版权合规是设计、分发和运营审查问题；来源外置与用户自行接入不能提供自动法律豁免。
- 保留 v0.5.0 用户可见功能和已验证的 Dev89 纯模块/数据隔离成果；不因为重构减少导航、阅读、收藏、推荐、Visual、下载、配对或同步能力。
- 自动化与真实设备、用户验收分开；用户已报告 Dev89 Android 多处排版缺陷和高级引导仅为文字目录：**当前 USER_ACCEPTANCE=NOT_ACCEPTED**，不得被 CI 通过覆盖。
- 未获单独授权不得触及生产账号/资料、正式安装、merge main、Release/tag、稳定 OTA、下载私钥或自动部署。所有测试数据隔离并最小化敏感输出。

## 状态与任务约定

每项工作记录：S-ID、依赖、平台、源 SHA、实施文件、故障风险、测试执行范围、失败历史、证据、下一动作。字段：
- implementation: PLANNED / IN_PROGRESS / IMPLEMENTED / BLOCKED
- ci: NOT_RUN / FAIL / PASS（精确源码）
- package: NOT_RUN / FAIL / PASS
- device: NOT_RUN / FAIL / PASS / N_A_WITH_REASON
- user_acceptance: PENDING / NOT_ACCEPTED / ACCEPTED
- release: UNPUBLISHED / RELEASED

严格区分：源码完成、单元测试、实际编译签名、真实模拟器/Chromium、真实手机、用户验收与正式发布。**跳过、未执行、失败不得计入通过**。阻断缺陷：P0 数据/凭据/身份越权或无法回退；P1 常用流程不可用、严重排版、卡死或升级失败。发布前 P0/P1 均为零。

原 P0–P6/42 验收案例保留原编号、描述和历史证据，新 S0–S6 仅重新排列顺序；精确逐项映射在 [验收映射与新标准](PRODUCT_RECOVERY_ACCEPTANCE_MAP_20261027.md)。详细旧记录仍见 `docs/LOCAL_READER_DELIVERY_LEDGER.zh-CN.md` 和 `DEVELOPMENT_TASK_LOG.md`，不能删掉。

## S0｜基线冻结、事实核对与风险登记（优先进行）

| 工作单 | 内容 | 交付/硬验收 |
|---|---|---|
| S0-01 | 固定正式 v0.5.0 Windows/Android、main、Dev89 SHA、PR203/205–217 和来源成品真实性 | 每条版本有可读源/Release/证据；不把草稿或旧 CI 认作正式版本 |
| S0-02 | 清点正式版 Windows/Android 所有页面及能力：书库、书架、在线、详情、阅读、下载、历史、推荐/Visual、标签、同步、设置、更新、语言和引导 | 对每项标“新版保留/变更/缺失/证据不足”；实际安装才能标设备已验证 |
| S0-03 | 识别核心模块和来源依赖；检查 Android APK/Desktop 核心产物是否仍包含来源 SDK、默认自动请求、专属 UI 与共享状态 | 明确每条残余耦合的文件、入口、迁移前置和风险 |
| S0-04 | 登记用户已报告的 Android 排版问题、文字型高级指南；创建逐页测试矩阵，不推断没有给出的具体页面缺陷 | 可复现的静态问题有源文件定位；其他标 DEVICE_PENDING |
| S0-05 | 设计隔离合成测试库（小型漫画/CBZ、约 1500 部、长下载队列、离线/跨端冲突/故障注入） | 样本与预期可复核，不用真实个人数据做自动突变 |
| S0-06 | 完整映射原 42 案例至 S 阶段；补新增 UI/模块隔离/源外置验收且不偷偷缩小原范围 | 数量精确 42；原状态和历史失败不被改写 |

**出口**：功能差异表、依赖清单、42 案例映射、阻断风险清单。S0 核查不足不得宣称“无回退”。

## S1｜Android 优先 UI 与交互恢复（G1）

| 工作单 | 内容 | 硬验收 |
|---|---|---|
| S1-01 | 统一现有 UI 规范：标题栏/设置行/折叠层级/按钮/底部操作栏/安全确认/状态反馈 | 采用 v0.5.0 视觉身份，常用动作层级无恶化 |
| S1-02 | Android 页面级测试：360/393/480dp，字体 100/130/150%，中英日，深/浅主题，键盘/insets/返回 | 核心页面 0 关键遮挡、越界、重叠和错误截断；附实际渲染证据 |
| S1-03 | 优先修复来源/设置通用行的长文字、状态区拥挤以及已报告界面异常；桌面端对应回归 | 缺陷复现→有限修复→设备/真实渲染复验；不用源码测试冒充视觉结果 |
| S1-04 | Android 高级引导改为**真实页面内的聚光控件引导**，复用现有 VSpotView/AndroidOnboarding；文字说明只作手册 | 8 章全部定位真实控件；无目标则说明真实原因，绝不假完成；跳过/返回/恢复/重看可用且不触发业务行为 |
| S1-05 | Web/Desktop Driver.js 的高级引导三语言真实页面定位与状态还原 | 浏览器真实步骤和截图复验 |
| S1-06 | 导航/推荐/书库/下载/同步/画风任务的双端体验回归 | 无黑屏、无限等待、业务控制假状态；真实手机确认 |

**G1 规则**：当前 Dev89 不具备 G1。完成源码和 CI 只是 ENGINEERING_VERIFIED；必须有真实手机/视觉验收和用户确认才可 ACCEPTED。后续新 UI 也需持续回归。

## S2｜核心维护隔离

| 工作单 | 内容 | 验收 |
|---|---|---|
| S2-01 | 核心模块依赖/所有权/API、导入方向、循环依赖守卫及真实调用图 | 违规跨层引用在 CI 失败 |
| S2-02 | Reader/Library/进度/缓存与 Pica/EH/JM 认证和 SDK 脱钩，复用已有代码 | 无任何来源的实际离线 Reader 完整闭环；mock 源替换不更改核心 Reader |
| S2-03 | 下载任务管理、取消/暂停/恢复和 last-known-good 统一事务 | 长任务不阻塞导航；取消/错误不发布假完成 |
| S2-04 | Tags/WorkIdentity/Recommendation/Visual 以端口连接，保持旧算法/权重/数据语义 | 冻结 oracle 和 golden case 证明未暗改模型/同一作品规则 |
| S2-05 | Sync/Update 边界、版本化模块 API、schema 兼容规则 | 不同模块更新的影响清楚，不创建多套不兼容 updater |

**出口**：更换一个来源不修改 Reader 核心，调整标签规则不更改认证、下载或个人数据持有者。

## S3｜来源可选接入、可维护、真正外置（G2）

| 工作单 | 内容 | 验收 |
|---|---|---|
| S3-01 | 优先复用/评估 Mihon、Suwayomi、JM SDK/现有 ProviderRegistry 与许可；验证 Android 受控服务/IPC、Windows 独立适配器或非执行连接器的安全/维护代价 | 原型有具体性能、权限、升级兼容与信任成本；不照搬任意第三方扩展代码 |
| S3-02 | 统一 SourceAdapter：ID 命名空间、能力、搜索/详情/章节/页媒体/收藏/下载/错误/取消及版本 | 一个真实来源经同一接口在对应双端验证；未知 ID 不转译成 Pica |
| S3-03 | 安装/启用/禁用/撤销/卸载/回滚独立组件；来源私密数据与缓存有界，任何默认网络探测需明确授权 | 一个来源失败、过期或被移除不破坏本地资料、其他源或核心 |
| S3-04 | 从纯核心发行包移除历史 Pica/EH/ExH/JM 可执行协议、凭据 SDK 和运行环境，保留老数据的显式兼容迁移 | 核心 APK/Windows 清单、依赖闭包和离线运行均通过，关开关不算剥离 |
| S3-05 | 既有 Pica/EH/ExH/JM 的实际能力回归；Suwayomi 为可选用户 Host、非唯一必经服务器 | 每个受支持适配方式有来源/双端真链路，第二真实提供者不以模拟 ID 代替 |
| S3-06 | 许可证、权限、品牌、来源信誉、信任/撤销与法律边界审查 | 未满足信任前不引入任意可执行来源市场；不能宣传为免责保证 |

**G2 规则**：纯核心无源也可读；接入/退出来源不更改核心；本地下载不丢；用户不必自行部署 Host。

## S4｜完整用户业务流程与既有 Issue 回归

| 工作单 | 内容 | 验收 |
|---|---|---|
| S4-01 | 本地、WebDAV、可选 Host/来源 → 搜索/导入 → 详情/章节 → 同一个 Reader → 进度 | 身份、页数、返回位置、章节状态准确 |
| S4-02 | 下载、缓存、Host 书目引用、持久离线正文区分 | 前台保存不冒充后台任务；中止、重启、失败不污染有效内容 |
| S4-03 | Canonical Work Identity / Work/Edition/Upload，保持 KEEP_SEPARATE | 未确认的重复内容不自动归并 |
| S4-04 | Issue #199 BLOCK/LESS 只影响客观显示；#200 搜索低频、私人标签、原始键、解释与调整负担 | 真正复现 Issue 场景，原始收藏和偏好不被视图修改 |
| S4-05 | 推荐批次、显式控制、Visual 独立开关、已收藏排除/作者多样性、离线缓存重排 | 与冻结推荐 oracle 一致；旧推荐不冒充新规则生效 |
| S4-06 | LAN、WebDAV、手机离线、规则冲突/双向同步 | 断网仅影响需要网络能力；不复制不相关来源秘密，旧 ACK 不覆盖新状态 |

## S5｜安全升级与性能（G3）

| 工作单 | 内容 | 验收 |
|---|---|---|
| S5-01 | Windows 旧 v0.5.0 走用户同意的独立首次过渡；Android 使用合法相同签名/递增版本覆盖 | 未授权不动生产；迁移前后数据库/收藏/阅读进度/下载/偏好逐项对照 |
| S5-02 | 兼容增量 / 不兼容整体替换 / 可选来源运行时切换复用一个现有事务引擎 | 选择正确、来源/数据/程序隔离、状态与错误有真实反馈 |
| S5-03 | 哈希错、磁盘满、取消、网络断开、升级启动失败、健康失败、占用/并发/断电模拟 | 旧应用可启动并恢复旧状态；旧失败保留为失败，不能用合成结果声称实体断电通过 |
| S5-04 | 代表性 1500 部书库、重任务并行、多端离线/重连、启动/页面切换/滚动与内存 | 先做 v0.5.0 同设备基线；拟定常用操作 p95 不劣于基线 >10%，任务反馈 250ms 内可见；基于实际硬件调整最终阈值 |

## S6｜统一候选的真实安装与发布前核验（G4）

| 工作单 | 内容 | 验收 |
|---|---|---|
| S6-01 | 同源码 Windows/APK 可安装产物：SHA/签名/许可/版本/隔离数据根 | 确切产物与 CI 对齐，原候选不替换正式安装 |
| S6-02 | 核心日常使用（首次安装、无源导入、阅读、导航、保存、恢复、引导） | 真实手机 + Windows 可用，无高优先级阻断 |
| S6-03 | 来源/下载/标签/推荐/同步/升级完整场景及新 UI 矩阵 | 旧 42 案例与新增案例逐条有 PASS/FAIL/NOT_RUN 等独立记录 |
| S6-04 | 隐私、许可证、真实合规边界、发布公告、简易用户说明和更新路线 | 未决范围如实列明，P0/P1=0；用户**另行明确批准**后才发布 |

## 执行顺序与并行许可

1. **现在**：S0 静态核对 + S1 可复现布局缺陷与互动引导首个薄片。S2 允许仅作依赖盘点。
2. S1 通过 G1 后，可在不破坏核心交互前提下推进 S2 真实拆分。
3. S2 接口固定后，S3 双端适配原型与 S4 独立标签回归可以并行；不能对同一数据库语义分叉开发。
4. S3 的 G2 结束后 S4 统一端到端；S5 可提前做旧版只读差异预检，实际迁移须候选冻结。
5. S6 停止新功能，集中验证，阻断缺陷需修复后整体相关回归。

**下一次更新规则**：每次 PR 修改本计划对应任务状态、实际证据和风险；正式版产品线不随本任务自动发布。只报告真实执行，不用大规模测试通过掩盖手机版 UI 的明显缺陷。
