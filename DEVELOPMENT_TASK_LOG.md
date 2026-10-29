# Pica Library Development Task Log

## S3 PR #234｜正式 Desktop 本地文件导入抽离（CORE-LIB-03a，2026-10-29）

- 基于源无关书架 Draft #233 新建 [Draft PR #234](https://github.com/Saber-Alter-Lily/pica-library/pull/234)，**实际修改生产** `src/library/server.ts` 的 `POST /api/v1/desktop/local-import/preview|confirm|cancel`，提取 `CoreLocalImportController` 为不含来源/Host/旧业务服务运行时 import 的共用控制器。复用原 `LocalLibraryIngestion`，没有再做一套 CBZ/SQLite/Reader。
- 保留受信任原生文件选择器、未配置/Headless/并发拒绝及 HTTP 路径、source 元数据输入拒绝；旧的二阶段 token、取消与临时库存未修改。真正的无源离线 CLI 亦改为调用**相同** `previewChosen/confirm`，esbuild 物理闭包必须包含新控制器。
- 新增真实 SQLite 确认/取消/单次 token、路径注入、虚拟源字段、并发选取、headless 及路由回归。S3 Linux/Windows+Chromium、Windows 官方 Node x64 Portable、全项目 Android+Web/Desktop CI 需按**精确 SHA**核查，首次提交时仍在运行，不预设 SUCCESS。
- 计划继续 CORE-LIB-03b（原正式 Windows 设置、本地文件夹/打开目录与已有 WebDAV 能力端口）→ CORE-LIB-04（完整 Windows UI/core-only 启动）；不能无限堆 QA mini UI。旧主程序仍依赖 `LibraryService/ProviderService`，Android core-only APK、可信外置来源、升级回滚、G1–G4 用户验收全部 OPEN。见 [本轮审计](docs/S3_CORE_LOCAL_IMPORT_20261029.md)。


## S3 PR #233｜正式桌面书架路由与纯 Core 共用（2026-10-29）

- 在 [Draft PR #233](https://github.com/Saber-Alter-Lily/pica-library/pull/233) 抽出原 `src/library/server.ts` 书架 GET/POST/PATCH/DELETE 及 add/remove/add-filtered 路由为 `coreShelfMatch/coreShelfExecute`，直接沿用旧 `ShelfService/LibraryDatabase/LibraryQueryService`；正式 Desktop 的 HTTP 端点和 shelf_add/shelf_remove **逐作品事件批量事务、会话/上下文、搜索记录导入**均保留。实体纯 Core esbuild 必含新的共享 ShelfService，不允许旧 Pica/E-H/JM 源 SDK 导入。
- QA Core 仅在一次性本机授权会话/CSRF 后允许 `local:<64hex>` 书架加入/移除，远端 `records`/来源扩大/未授权筛选一律拒绝，混合历史书架只显示本地作品。真实 SQLite 单测、正式 `startLibraryServer` HTTP 读写/事件，以及 Linux/Windows 独立 HTTP 回归已增加。
- 真实 [Linux/Windows 专项 #40848142891](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40848142891) **各70/70 SUCCESS**， [Windows Portable ZIP #40848432952](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40848432952) **SUCCESS**，实际 CMD/Node 关闭并重启可恢复书架与阅读进度。首轮专项目视为 TS 变量同名失败已修。旧完整 CI 因曾在 `server.ts` 静态寻找内联书架事件而失败（原事件其实已经迁入共用控制器），已修订静态检查和增加正式 HTTP 动态回归，没有删除事务性测试。
- **最新精确源码 c5bd6469** 的 [S3 全专项 #40849035242](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40849035242) 与 [全项目 CI #40849044107](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40849044107) 文件登记时仍待最终判定。G1–G4 依旧 OPEN，未合并 main、发布、触碰 OTA/用户资料。详见 [CORE-SHELF 审计文档](docs/S3_CORE_SHELF_20261029.md)。

## S3 PR #231｜正式 Desktop 书库查询接口与纯 Core 共用（2026-10-29）

- 新建 [Draft PR #231](https://github.com/Saber-Alter-Lily/pica-library/pull/231)。不再做重复的 QA Reader：实际修改生产 `src/library/server.ts`，原 `GET /comics`/作品详情/下载列表/`POST /library/query` 统一调用 `src/library/core-catalog-read.ts`。后者只引用已有 LibraryDatabase、LibraryQueryService 的 type-only ports，不依赖 Pica/E-H/JM SDK、Host、账号、来源激活，也不自写第二套搜索或缓存。原 Desktop 历史多来源数据完整保留，API 合约不改。
- 纯 Core 的 loopback HTTP 调用相同目录和分面查询服务，对 `localOnly` 请求强制 providerIds local 和 local:<64hex> 身份；Session/Origin/CSRF/类型及 4KiB 请求上限保持。新增本地作品搜索网页（沿用既有 Reader 页面）；源闭包强制包含原 LibraryQueryService，仍禁止 SDK。实际 ZIP 解压后的 Windows 自带 Node 测试增加旧 catalogue/分面 API 验证。
- 精确源码 **e698f66a4648cda1954c7c1293a4812749301fa5** 的 [Linux/Windows/Chromium #40842187533](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40842187533) **SUCCESS：51/51 + 51/51 + 1/1**；[Windows Portable ZIP #40842196837](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40842196837) **SUCCESS**。完整 Android+Web/Desktop [CI #40842243847](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40842243847) 登记时在运行中，不能先行判定全绿。
- 下一阶段抽真实 ShelfService HTTP、行为事件，再处理无源设置、本地导入与 WebDAV 的正式启动组合；**生产 Desktop 仍依赖 LibraryService/ProviderService，正式 Windows/Android 还未完成物理 SDK 剥离**。G1-G4 OPEN。详细见 [S3 CORE-LIB-01 审计](docs/S3_CORE_LIBRARY_READ_20261029.md)。

## S3 PR #230｜Windows x64 纯 Core Portable QA 真实 ZIP 与启动器（2026-10-29）

- 叠加 #229 创建 [Draft PR #230](https://github.com/Saber-Alter-Lily/pica-library/pull/230)。沿用现有 source-free `core.mjs`、Reader DOM+9资源，不造第二数据库/Reader；新建**只在 CI OS Temp 内**组装 ZIP（20 文件 + 清单）、官方 Node 24.15.0 x64 运行时和 LICENSE、AdmZip MIT 许可证、项目 MIT/NOTICES、只可启动 sentinel QA 目录的 `.cmd`。不上传可执行 ZIP，仅保留短期 SHA/源闭包/许可证/真实启动验收 JSON。
- [官方 Node 归档 SHA256](https://nodejs.org/dist/v24.15.0/SHASUMS256.txt) 验证通过，附加固定归档 hash `cc5149eabd53779ce1e7bdc5401643622d0c7e6800ade18928a767e940bb0e62`，防止运行时静默替换；实际解压后用随包 `runtime/node.exe` 运行旧 Reader、Local PNG 章节/媒体、Cookie/CSRF/Host 边界及 SQLite 进度重启恢复。后来把启动脚本 `.cmd` 本身加入正向运行测试并负责清理整个临时进程树。
- 失败记录保留：初版 [#40837813326](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40837813326) 因 pnpm 管理的 AdmZip LICENSE 硬链接被拒绝；仅许可证做严格例外后 [#40838038263](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40838038263) **PASS**；新增正向 CMD 测试首次 [#40838531135](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40838531135) 因测试类型函数未改全失败，修后精确源码 **0ca6f6e8** 的 [Windows #40838638638](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40838638638) **SUCCESS**。本轮 [Android/Web 完整 CI #40838644597](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40838644597) 登记时尚未结束。
- 重要：**该 ZIP 没有提供给用户、没有签名和 Release，正式 Windows UI/Android APK 的 Pica/EH/JM 仍未物理脱离**，不声明 G1–G4 或 NEW-SRC-01 通过；老用户 v0.5.0 原账号、记忆书库、下载和一键更新/回滚亦未真正验收。详情 [S3 Windows Portable QA](docs/S3_WINDOWS_OFFLINE_PORTABLE_QA_20261029.md)。

## S3 PR #229｜Reader 静态资源从源码仓库真正拆出（2026-10-28）

- 在 [Draft PR #229](https://github.com/Saber-Alter-Lily/pica-library/pull/229) 中，新增严格白名单资源装配器：只复制**当前原始 Reader section DOM** 和 9 项已有 Reader JS/CSS/图标，带 SHA-256/大小回读；不复制完整 `index.html`、`web/app.js`、Pica/E-H/JM 账号、来源 Host 或推荐脚本。只能装配到不存在的 OS Temp 子目录，不覆盖其他目录，不上传/发布任何可执行候选。
- QA HTTP 优先从实体 `core.mjs` 旁 `web/reader-fragment.html` 读取已有 Reader 片段，真实子进程/Chromium 从非 Git cwd 启动，依旧复用同一 ReaderService/SQLite/CBZ 和 `/api/v1/reader` 及安全会话，避免复制第二 Reader。
- 首轮 [S3 #40827089058](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40827089058) Linux 33/33 成功但 Windows 路径规范化失败；按 Windows native realpath 修正父目录包含关系且继续拒绝非临时路径/覆盖，旧失败如实保留。精确源码 **8ed7d80cf0cdb79a3571c13bc62d20fbc5269197** 的 [S3 #40827250488](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40827250488) **SUCCESS**：Linux33/33、Windows33/33、TS 双平台通过、真实 Chromium1/1；浏览器读回进度测试不依赖 Git 源码目录。
- 对应 [完整 CI #40827256178](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40827256178) 记录时仍运行中，不预判。未完成生产签名 Windows 程序、正式 Node runtime/ZIP、全功能 Windows Web UI 纯 Core、Android、用户 v0.5.0 无痛升级/回滚，G1–G4 保持 OPEN。详细证据见 [`docs/S3_OFFLINE_READER_ASSET_STAGE_20261028.md`](docs/S3_OFFLINE_READER_ASSET_STAGE_20261028.md)。

## S3 PR #228｜无来源核心真实 HTTP＋Chromium 阅读界面（2026-10-28）

- 新建 [Draft PR #228](https://github.com/Saber-Alter-Lily/pica-library/pull/228)，叠加 #227。在已具备真实源码无源 ESM 文件、旧 Reader GET 端口的基础上，新增只允许 disposable QA sentinel 目录的 `serve`，启动固定 127.0.0.1 随机端口 HTTP；复用原 Reader GET 路由、数据库、图片/进度逻辑。额外保护 256-bit 一次性入口、HttpOnly/SameSite Cookie、实际 Host/loopback、Origin+CSRF、CSP、静态资源白名单、no-store，拒绝其它来源和在线路由。
- **现有界面复用而非复制**：取原 `web/index.html` 的 `section#reader` DOM，沿用原样式、`reader-input/viewport/progress/settings` 模块；QA 浏览器适配层负责将保存在测试目录内的本地漫画与原 `/api/v1/reader/...` URL 接通。没有搬入旧 Desktop 的在线 SDK/ProviderService，也不涉及正式用户账号/资料。
- 精确代码 `87f142b305fd051f8006d94ad23e46f44c49e794` 的 [S3 双平台及浏览器 #40826346306](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40826346306) **SUCCESS**：Linux 31/31、Windows 31/31、真实 Chromium 1/1、TS 双端通过。浏览器实际翻到第二页并保存，在刷新后恢复；HTTP 测试完成跨站与源路径拒绝。
- 本轮 [全项目 CI #40826350952](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40826350952) 记录时仍待最终状态，不以专项通过代替全项目验收。详见 [`docs/S3_OFFLINE_CORE_HTTP_UI_20261028.md`](docs/S3_OFFLINE_CORE_HTTP_UI_20261028.md)。
- 纯核心仅为隔离 QA 阅读入口；**生产 Windows 启动器、完整多功能 Web UI、Android 纯 Core、可验证来源签名安装和 v0.5.0 一键升级仍未完成**。保留 G1–G4 OPEN，不合并或发布。

## S3 PR #227｜统一本地 Reader 的 HTTP GET 路由（2026-10-28）

- 在 #226 已验证的来源中立本地 CLI 上创建 [Draft PR #227](https://github.com/Saber-Alter-Lily/pica-library/pull/227)，从**实际旧** src/library/server.ts 抽出本地 Reader 的章节/单章/页图片/进度 GET 分派到 src/reader/local-http-read.ts。旧 Desktop Server 保留原 HTTP 安全校验/headers/输出以及 POST 保存进度、用户事件、导出和外部文件打开；同时让零来源实体 QA 候选调用同一 GET 路由，不造第二个 Reader。
- 新增 URL/百分号解码、缓存头、本地与旧下载图片、未知 Host/在线来源不误接管、依赖图双调用方门禁；源闭包验证要求这个共享文件进入 source-free CLI 打包。
- **精确源码 34b5705030d69e3b13db483ba2c3654bd1ea1d95** 的 [S3 双系统 #40821561989](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40821561989) **SUCCESS**：Linux 30/30、Windows 30/30，两端 TypeScript PASS，仍保留前轮的本地 folder+CBZ 跨进程物理验证。新代码 [完整 CI #40821583070](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40821583070) 当时仍在运行，未先行判 PASS。
- 详见 [S3 CORE-HTTP 验收边界](docs/S3_SHARED_LOCAL_READER_HTTP_20261028.md)。现有 Desktop Server、Windows 正式发行物仍携带 Pica/E-H/JM，Android/旧版升级/真机验收未解决，G1–G4 持续 OPEN。

## S3 PR #226｜本地纯核心真实独立进程候选（2026-10-28）

- 从已确认 #225 完整 CI SUCCESS 的开发线新建 [Draft PR #226](https://github.com/Saber-Alter-Lily/pica-library/pull/226)，仅加入 src/offline-core/qa-cli.ts、build-offline-core-candidate.ts、专项回归与 CI。直接复用旧 LibraryDatabase、LocalLibraryIngestion、ReaderService，真实 esbuild ESM 物理打包并检查站点 SDK 不在单文件依赖闭包；临时 QA root 与用户 v0.5.0 数据隔离。
- 已测试真实不同 OS Node 进程的**文件夹与 CBZ 导入→章节与媒体摘要→显示/保存阅读进度→重启恢复**、无确认拒绝、旧数据库不写入，且 CI Artifact 只留 SHA/依赖 JSON，不传可执行文件或用户资料。AdmZip 的 Electron 可选 original-fs 引起旧 CI 失败，修复为在 Node-only QA 显式 alias 到 node:fs，正式 Rollup/包不改。旧失败不删除。
- **精确源码 bc1539515aa0f5b41dfbedb0b3b0a47df3744609** 的 [双系统 S3 专项 #40821030082](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40821030082) **SUCCESS**：Linux 26/26、Windows 26/26、两端 TS 检查通过。[全项目 CI #40821035105](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40821035105) 登记时仍运行中，不能冒充完整 PASS。
- **核心重要限制**：这不是用户可用 Windows 浏览器 UI/启动器，也不是正式源外置版本。旧 src/library/server.ts/LibraryService 仍捆绑具体 Pica/E-H/JM，Android 核心仍含来源代码；G1–G4、NEW-SRC-01、旧版无痛升级和物理回滚全部仍 OPEN。
- 详见 [S3 离线核心证据及后续抽路由计划](docs/S3_OFFLINE_CORE_PHYSICAL_QA_20261028.md)。

## S3 PR #225｜修复 E-H 旧 ID 点击签名来源无反应（2026-10-28）

- 实际发现 Web 入口 openReaderComic 的单冒号限制与已有 EhPublicIdentityBridge 保持旧 eh:gid:token 的计划矛盾：统一书库会显示已连接的签名阅读按钮，但点击旧作品 ID 静默返回。新增来源中立 Web signed-route 语法校验（两段/三段标识，无 URL、路径和 local/hosted），并将无效会话改为显式错误反馈。沿用唯一 Reader、既有 SignedSourceDesktopReader、独立 CSRF、同一数据库作品身份与保存进度。
- 新增实际 AST 提取的 Web Reader 函数调用测试、已有 ReadingLibrary 真 DOM 模拟按钮点击回归和 Linux/Windows S3 CI 门禁。旧源码 1043285 的 [专项 #40811134919](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40811134919) 因新测试 TS18048 失败（两系统）；在 066f105f 修复。新源码 [专项 #40811216292](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40811216292) **SUCCESS**：Linux 125/125、Windows 99/99 和两系统类型检查通过；[完整 CI #40811220694](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40811220694) 尚待最终判定。
- 详见 [签名旧 ID Web Reader 修复审计](docs/S3_SIGNED_LEGACY_WEB_ROUTE_20261028.md)；不合并 main/发布，G1–G4 保持开放，Android 纯核心、OS 隔离、真实来源签名分发与 v0.5.0 无痛升级尚未完成。

## S3 PR #224｜E-H worker 独立可重复构建与待签名清单（2026-10-28）

- 基于 #223 新建 [Draft PR #224](https://github.com/Saber-Alter-Lily/pica-library/pull/224)，未发布、未合并 main。用项目已有 esbuild 构建真实 EhProvider 的可选 worker，内存生成固定入口、固定单文件、上限 1MiB 的未签名候选，CLI 只输出 SHA/大小/真实依赖清单，不发布 worker 或私钥。
- 严格 9 文件源码 allowlist 与 Node 内置依赖约束，阻止未经审计的具体 SDK/第三方代码被悄悄带入。回归实际做两次字节确定性检查、临时 Ed25519 验签安装前拒绝、签名后默认禁用、字节变更拒绝；模块 DAG 明确证明可选 worker 没有进入默认 Desktop/Reader，同时旧 Desktop 仍然含 EhProvider（NEW-SRC-01/G2 未通过）。
- 精确代码 70521297 的 [S3 双平台专项 #40810352619](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40810352619) **SUCCESS**：Linux 98/98、Windows 72/72，双系统 TypeScript PASS。完整 [CI #40810412798](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40810412798) 记录时尚未结束，不可提前认定全绿。
- 不含可安装签名来源包、真实站点联网、账号/下载、Android Binder、Windows OS 沙箱/生产信任根、纯 Core 物理拆包、v0.5.0 原地升级/回滚和真机验收。G1–G4 均继续开放。详细审计见 [S3-EH-PKG 说明](docs/S3_EH_UNSIGNED_CANDIDATE_20261028.md)。

## S3 PR #223｜E-H 真实来源协议独立进程首片（2026-10-28）

- 新建 [Draft PR #223](https://github.com/Saber-Alter-Lily/pica-library/pull/223)，叠加 #222 而不合并正式 main。复用原有 EhProvider，抽出匿名公开的真实来源解析，在可选工作进程执行，旧 eh:gid:token 身份和旧书库记录不改，原 Reader 复用而非复制。新增可选 identity bridge、HMAC 页面 token、受限 IPC 和签名 CJS worker。
- 真实源读取由带固定无账号 HTTP fixture 的旧 EhProvider 执行：单元/类型与真实 OS child-process IPC、签名安装、禁用撤销、进度/书库合并在 Linux 和 Windows 运行。旧源码 21831684 的 [专项 #40732088085](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40732088085) SUCCESS（Linux91/91，Windows65/65）。此后补充 token 资源边界/安全刷新和实际 worker import 图，必须由新 HEAD 重测，不继承旧通过。
- 未测试真实站点和用户账号；不含 ExH、登录/收藏/搜索/下载，不是可安装正式来源，更不是两个 Core 包真实去 SDK。发行者公钥、OS 保护根、Android Binder/Service、完整 v0.5.0 兼容/回滚、G1–G4 均 OPEN。无 Release、OTA、用户数据、main 更改。
- 详细方案、适用边界、S3-EH-01～06 与后续计划：[S3 E-H 来源交付与风险](docs/S3_EH_PUBLIC_WORKER_20261028.md)。

## S3 安全及 CI 续接｜2026-10-28（HEAD 2e3bcf3）

- **实际基线**：当前开发树的最后一项运行代码提交为 `2e3bcf32fba43c041009099afa3d7de6f2296c91`，位于未合并 Draft [PR #222](https://github.com/Saber-Alter-Lily/pica-library/pull/222)，继承 #221 → #220 → #219 → #218；正式 main 与 v0.5.0、用户数据/账号、签名 APK、OTA、安装包未修改。此日志更新是文档提交，不可把旧源码测试伪装成文档 HEAD 的独立通过。
- **首轮真实失败（已诊断）**：[完整 CI #40715568582](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40715568582) 对 `4a13b65d` 实际 **FAIL**，其中 Android PASS，Web/Desktop 的 340 个测试文件中 2 文件失败，4 项失败/2684 项通过/14 跳过。根因为两份旧契约测试仍逐字检查 `api(`${root}/progress`)`，新共用 Reader 实际使用 `api(`${root}/progress`, signedReadOptions)`（带签名源会话/CSRF 参数）；不能仅凭此断言推出实际阅读流程损坏。
- **修复且保留回归门禁**：`8f743563` 修复 `test/unit/dev2-web-contract.test.ts` 三个用例共用的过时字符串检查；`debeebe3` 修复 `test/unit/v020-product-contracts.test.ts` 的另一个相同断言。新断言必须维持旧本地/online URL、signed-session 读参数和 scoped CSRF，而非简单删测；现有 `web-reader-progress.test.ts` 继续覆盖本地、Host、signed 实际保存/ACK 调用。
- **新增真实安全缺口与阻断**：签名图片的原生 `<img>` 无法附加 CSRF，之前在 loopback TCP + 无 CSRF 图片例外里依据客户端自报 HTTP Host 构造允许的 Origin/Referer，可能对 DNS rebinding 的攻击者同源网址形成许可混淆。`38a6a8c` 要求 Host 为 `127.0.0.1` / `localhost` / `[::1]` 并匹配 HTTP Server **实际 socket 监听端口**；所有 signed API 受此门禁；`2e3bcf3` 对伪造外域 Host + 同源 Referer 与错误本机端口增加真实 Node HTTP 负向测试，仍应允许有效同源原生图片、拒绝无 CSRF 的 JSON/进度请求。
- **精确新代码验证**：[S3 双系统专项 #40728398018](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40728398018)、[全项目 CI #40728408056](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40728408056) 在本次日志写入时尚在队列/进行中，结果 **NOT_VERIFIED**；旧 #40715552549 Linux87/87、Windows61/61 是安全补丁之前的专项通过，不得继承为新 HEAD 通过。如新 CI 失败，应按真实日志修复并再次以新 SHA 判定。
- **当前尚未实现**：真正 Pica/E-H/JM 源协议在隔离进程/Android Binder 内运行、发行者公钥与受保护安装根、多进程安全与官方签名/安装、两端纯 Core 安装包物理无源 SDK、账号/收藏/下载/历史进度兼容、旧 v0.5.0 原地升级/回滚。下一切口应选一个真实 Provider 逐项梳理旧 ID、凭据作用域、实际请求和书库/Reader 对应，避免重复制造仅会返回合成图片的 worker。G1–G4 仍 OPEN。
- **待核查**：本提交之后分别检查专项 CI 和完整 CI 的精确源 SHA，真实 Android/Windows 设备与用户视觉验收不得以 CI 全绿代替；继续保留旧 42 + 新 12 案例的各项阻断记录。

## S3 PR #222 接续验收｜2026-10-28：安全隔离与真正阅读 UI 路由

- **历史基线已经精确核实**：旧源码 `dd03822e` 的 [签名来源双平台专项 #40712630322](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40712630322) 和 [完整 CI #40712643773](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40712643773) 均 SUCCESS；这两项不能直接覆盖后续 UI 修改。
- **本轮最主要的产品错误已实际解决**：之前统一书库的签名来源被标记成 legacy `online` 通道，点击会误跳旧 Provider 而非签名源。新的 `ReadingLibrary` 使用 `signed` 独立 channel、严格 UUID 会话归属；`web/reading-library.js` 中英日按钮走 `openSigned`；`web/app.js` 的唯一 Reader UI 复用导航/分页/纵向滚动、调用 `/desktop/signed-reader/<session>` 的真实章/页/进度接口，进度写入用独立有 CSRF 的 signed session 而不是覆盖现有 `online-reader-progress-v1`。
- **安全与默认禁用**：`signed-reader-errors.ts` 零依赖合同阻止普通 HTTP server 为错误处理而传递加载签名来源执行器；TypeScript 真正的 runtime import DAG/负向注入测试检测整个默认 `src/library/server.ts` 的依赖闭包，禁止隐式加载进程管理器与签名安装器。默认无受控组件的 HTTP 服务必须返回 403。子进程崩溃后回收 session 但永不悄悄重连；同版本 no-op 激活不会误断线。
- **原生图片受限同源读取**：浏览器 `<img>` 不能加自定义 CSRF 头，签名来源图片仅在准确的会话作品图片 URL 且有匹配同源 Referrer、`Sec-Fetch-Site:same-origin`、`Sec-Fetch-Dest:image`、无外来 Origin 时接受无 CSRF 的 GET，普通 JSON/状态/进度/修改均继续强制原有 Local Desktop origin+CSRF；跨站 GET、错误 Fetch Dest 与裸来源 URL 拒绝，安全包头保留。
- **新源码精确专项 CI**：[Linux + Windows #40715552549](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40715552549) **SUCCESS**，代码 `4a13b65d`，Linux **87/87** + Windows **61/61**。覆盖原有真实进程 IPC、Ed25519 签名 lifecycle、实际 HTTP、书库页面按钮与进度、跨站媒体权限、会话崩溃撤销和来源 DTO。对应 [完整 CI #40715568582](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40715568582) 登记时仍为 **QUEUED / NOT_VERIFIED**，不得把专项通过冒充正式全绿。
- **余下 G2/G3 关键点**：生产 `src/desktop/main.ts` **没有注入**签名组件，因为未有已审核的真实发行者公钥与可信不可改写安装目录；Pica/E-H/JM 核心 SDK 仍在正式两个安装包中、Android Binder/AIDL 没有、真实来源迁移/旧账号及数据升级/一键安装回滚没有。S1 真机用户交互 G1 也尚未签收。全部 Draft、未合并/未发布。
- 当前技术与验收记录：`docs/S3_SIGNED_DESKTOP_READER_20261028.md`；开发 PR [#222](https://github.com/Saber-Alter-Lily/pica-library/pull/222)。

---


## 2026-10-28｜S3 受控签名源 → 桌面实际 UI/Reader 接续（Draft PR #222）

**这次不再继续做纯隔离 mock 原型，而是把已通过真实 IPC / Ed25519 的组件接入现有 Desktop 服务和统一书库，保障用户点击能打开**。来源执行/管理必须来自应用显式可信组合入口，尚不能让第三方普通资源包/来源清单自行执行代码。全部仍为 Draft，不修改 main、正式 v0.5.0、Release、OTA、个人收藏/凭证/下载。

- **上轮真实通过**：[Linux + Windows 签名源 HTTP 专项 #40712630322](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40712630322) SUCCESS；[完整 CI #40712643773](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40712643773) SUCCESS，均对应 `dd03822e` 的前一批业务代码。
- **修复默认应用的特权导入倒灌**：`SignedReaderInputError` 从特权签名来源控制器独立为零依赖模块，默认 `src/library/server.ts` 只引用类型签名控制器 + 纯错误类，不允许默认 HTTP 服务器传递导入 `TrustedSourceProcess` / `SignedWorkerStore`。真实 TypeScript 依赖图/传递闭包测试检测其新增运行时导入并拒绝 CI。
- **管理/会话安全**：崩溃/超时工作进程的 signed session 能被清理，旧链接失效；查状态不自动启动，连接须明确用户授权。对同一个已签名版本进行 no-op 激活不触发无意义断开。原有修订号 CAS、来源撤销和无安装/公钥/代码注入的 HTTP 接口不变。
- **禁止来源身份误路由**：原来签名来源投影曾使用通用 `online`，会导致统一书库按钮错误调用旧 `ProviderService`。现改为带可验证易失 sessionId 的独立 `signed` channel，`reading-library.js` 使用 `openSigned` 专属 callback（中/英/日），`web/app.js` 把它接到现有 Reader UI 的章节/图片/进度和导航；不重新发明 Reader、不覆盖旧进度。停用来源后仍保留独立 `signed-source-progress-v1:<id>`，已失效链接不可访问。
- **浏览器图片权限细化**：自有 `<img>` 不可发送 CSRF，仅对准确 `/desktop/signed-reader/<uuid>/.../pages/<n>` 路径开放严格的同源 Referrer + Fetch Metadata image 限定 GET；所有管理、进度与元数据仍使用 loopback + Origin/CSRF，跨域与错误 Fetch Dest 失败闭锁。
- **真实测试补充**：默认无 SignedSourceDesktopReader 的 Desktop HTTP 拒绝访问；真实子进程 crash 后新连接必须显式执行、旧图片 URL 409；完整 HTTP → 阅读页 → 统一进度投影；阅读书库 route `signed` 不得假装普通 online；用户页面点击应携带源 sessionId；进度写入沿用旧 Reader 纪律。新的 `S3` 工作流纳入 Linux/Windows 平台测试及 UI/进度回归，结果必须以该批代码精确 SHA 的 Actions 状态判定。
- **没有通过的产品关口**：正式应用未提供生产级固定公钥与不可被同用户进程篡改的安装根；工作进程仍不是 OS 沙箱；Pica/E-H/JM SDK 仍物理捆绑，Android Service/Binder 尚未实现；没有真实源的独立安装、升级与兼容、旧 v0.5.0 数据无损迁移或实体双端发布，G1–G4 继续 OPEN。

详细技术/验收表：`docs/S3_SIGNED_DESKTOP_READER_20261028.md`；[PR #222](https://github.com/Saber-Alter-Lily/pica-library/pull/222) 保留 Draft，禁止因自动化测试变绿而直接合并/发布。

---


## 2026-10-28｜S3 受控签名组件生命周期：实际安装/启停/回滚工程薄片（Draft PR #221）

**授权与分支边界**：用户要求按计划继续将来源从漫画阅读器本体解耦。项目依赖链保持 [S1 #218](https://github.com/Saber-Alter-Lily/pica-library/pull/218) → [S2 #219](https://github.com/Saber-Alter-Lily/pica-library/pull/219) → [S3 进程 #220](https://github.com/Saber-Alter-Lily/pica-library/pull/220) → [S3 签名生命周期 #221](https://github.com/Saber-Alter-Lily/pica-library/pull/221)。全部 Draft、未合并，生产 `main`/Release/OTA/用户账号与库数据未修改。S1 真机 G1、核心源外置 G2、迁移 G3、发布 G4 均未验收。

- **前置真实工程基线**：[S3 真实 IPC 专项 #40691301737](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40691301737) 与 [完整 CI #40691317341](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40691317341) 在旧代码 `e52bf61a` SUCCESS。已具备 Linux/Windows 真实来源进程、随机握手、无网络 QA worker、撤销/超时等验证。
- **本批实际代码**：新增 `src/source-extensions/signed-worker-store.ts`，在已有 `TrustedSourceProcess` 上方提供带固定 schema v1 的 Ed25519 发布者验签、应用代码外给定的**受信任公钥**、canonical message、SHA256/大小双校验、固定单文件 `worker.cjs`、同目录分代 staging + 重命名。安装**不启用/不执行**；旧版本目录不可覆盖；每次显式激活和打开前复验源 ID、版本、签名、文件清单与实体 hash；拒绝 symlink/hardlink 和悬空激活指针。
- **生命周期和恢复**：`activate/disable/rollback` 显式带存储 `revision` CAS，切换前先停止旧会话及挂起 IPC，持久化 `active.json` 使用临时文件 + 原子替换；旧签名版本留存供手动回滚，进程 crash/重启不自动激活未选组件，其他已运行进程不获额外权限。单一 Node 写入者，不宣称跨进程并发和断电事务已证明。
- **真实测试**：`test/unit/signed-worker-lifecycle.test.ts` 运行时生成临时 Ed25519 keypair（私钥不提交），受控 QA worker 实际 fork → S2 Reader → 章节/图片/进度，覆盖伪签名、篡改、跨源目录、非法版本、悬空链接、不可覆盖、过时 revision、激活后撤销、旧版本回滚、模拟原子写入失败、Windows 只读 worker 文件清理。原 `scripts/audit-modules.ts` + `test/unit/module-dag-policy.test.ts` 继续阻断签名安装器/进程执行器反向污染 Reader 核心；没有绕过现有代码安全门禁。
- **已经完成的验证**：[S3 新源码 Linux/Windows 双平台专项 #40695633671](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40695633671)，精确代码 `8a476400` **SUCCESS：Linux 43/43，Windows 18/18**。Windows 曾因测试清理只读文件/已退出 worker 的文件句柄报 `EPERM`；只调整测试清理的只读属性恢复和重试，不降低签名或权限要求。最新同源 [完整 CI #40695640938](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40695640938) 登记时仍在运行，未将单项成功填写为正式 G2。
- **重要产品差距**：目前 `SignedWorkerStore` **只在隔离测试组合入口使用**；不允许用户通过普通资源包下载安装可执行源，没有真实生产用发布者公钥/Windows 安装器私有根权限和可执行文件签名链，没有真实漫画源迁移、Android Binder Service，也没有 Windows/Android 纯 Core 包去 SDK、1,500 作品库/旧 v0.5.0 一键升级回滚和设备验收。因此 `S3-LIFECYCLE_DRAFT_TESTED`，`S3_PRODUCT_INTEGRATION_NOT_DONE`，`G2/G3/G4_OPEN`。
- **接续**：先看精确完整 CI；再以稳定官方签名包内置且不可由用户覆盖的公钥、受限源码与可信安装根、可观测安装失败/回滚状态，组织一条实际来源的业务连接及账号凭据 broker；随后 Android 受控/独立进程、删除原核心源 SDK 和实体升级验收。不得用仅合成 source 的通过替代真实使用。

完整基线和验收表：[签名组件设计](docs/S3_SIGNED_WORKER_LIFECYCLE_20261028.md)、[此前 IPC 执行](docs/S3_TRUSTED_PROCESS_PROTOTYPE_20261028.md)、[S2 依赖图](docs/S2_SOURCE_BOUNDARY_20261028.md)。

---


## S3 独立来源运行时｜2026-10-28 · Linux/Windows 受控 IPC 原型与安全门禁

**用户授权推进 S2/S3，正式 `v0.5.0`、main、Release/OTA 和个人账号/书库保持不动。** 从 [S2 Draft PR #219](https://github.com/Saber-Alter-Lily/pica-library/pull/219) 分出独立 [S3 Draft PR #220](https://github.com/Saber-Alter-Lily/pica-library/pull/220)，确保架构实验不夹带生产发布。

- **基线 S2**：完整 [CI #40689775058](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40689775058) 在 `3c544bd8` SUCCESS，先前因新架构工件保留7天而违反原仓保留1天安全约束，已按原门禁修复，不放松安全测试。
- **S3 新代码**：`src/source-extensions/trusted-process.ts` 采用 Node 原生 `child_process.fork` 复用 IPC，不开发任意插件加载器；只接受显式可信根目录下固定 SHA-256 的入口，握手校验来源和随机会话、4路并发上限、媒体大小/安全 MIME 与请求超时边界；父进程不传 `PICA_*` 和 `NODE_OPTIONS` 环境变量。中止、故障、超时都关闭并拒绝挂起请求，原 Reader 内缓存命中前再次校验权限。
- **实际进程测试**：`test/fixtures/s3-trusted-worker.cjs` 无真实漫画源、账号、网络；`test/unit/trusted-source-process.test.ts` 启动独立 worker，经原 `OnlineReaderService` 实际完成章/页/媒体/进度与缓存；错误哈希/路径/握手、跨作品归属、超限/非法媒体、敏感环境隔离、迟到请求撤销/超时/崩溃均有自动化断言。
- **实证**：[S3 Linux + Windows 双系统专项 #40690767200](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40690767200)，精确代码 `a785af6f` **SUCCESS，2/2 独立 jobs**。Windows 是 Actions Windows 系统实际运行测试，而非仅在 Linux 上做平台模拟。完整项目 CI 与正式安装包认证另行检查；不能把专项绿灯当 G2 PASS。
- **未完成关键出口**：真实 Pica/E-H/JM 协议仍在旧正式安装包；本次受控工作进程不是沙箱、没有真实签名/应用私有不可修改目录、没有跨进程凭据 broker、没有 Android 独立 Service/Binder、没有单源安装/撤销/回滚/版本管理、没有 v0.5.0 无损升级及双端纯 Core 证明。G1 用户真机与 G2/G3/G4 全保持 OPEN。
- **下一步**：验证最新完整 CI，按 `docs/S3_TRUSTED_PROCESS_PROTOTYPE_20261028.md` 推进 Windows QA 签名/真实打包与 Android 受控 Service 原型；实际一项来源接入前先评估信任模型和许可，不直接借用 Mihon 具有全应用权限的第三方插件机制；Suwayomi 保持用户自选可选 Host。

---


## S2-01/S2-02 续修回执｜2026-10-28 · 已验证依赖图与内置来源构造入口抽离

- **首轮独立架构 CI 实证**：[S2 run #40677952242](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40677952242) 于 `383c89e5` SUCCESS，生成并下载 `module-graph.json`：实际分析 **239 个 TypeScript 源文件、1,079 条静态依赖边、0 个 TypeScript runtime SCC 循环、0 条受保护 Reader 反向依赖违规**；旧 `ProviderService` 直连 Pica/E-H/JM 类、ProviderRegistry 的边均如实留在该基线证据中，不代表 Android/Windows 纯核心包已经去掉 SDK。
- **下一功能薄片已经提交**：将默认 Pica/E-H/JM 的 `new`、权限 lease 注入、registry 组装从 `src/services/provider-service.ts` 集中移至 `src/providers/compiled-composition.ts`，`ProviderService` 改经组合入口取对象。保持原构造参数顺序、EH/JM 测试注入、旧 Pica 无前缀 ID 与 EH/JM 路由；未更改推荐规则、来源账号/下载/数据结构。
- **CI 约束**：`moduleBoundaryViolations` 新增禁止 `ProviderService` 对三个具体类建立运行时 import，`test/unit/compiled-source-composition.test.ts` 逐项核对旧三源路由、零主动联网、注入同一实例和真实导入方向。独立架构工作流也纳入此测试和源文件。
- **精确阶段结论**：上述构造入口重构仍等待其自己的精确 SHA 架构与完整 CI，不能借用旧 `383c89e5` SUCCESS 宣称已验收。当前 `S2-01=IN_PROGRESS`、`S2-02=IN_PROGRESS`、`S3-01/02=NOT_IMPLEMENTED`、`G2=OPEN`。保留 v0.5.0/main、Release、账号/用户数据库及所有 S1/G1 和后续 S5/G3 阻断。

完整工程记录：`docs/S2_SOURCE_BOUNDARY_20261028.md`，Draft [PR #219](https://github.com/Saber-Alter-Lily/pica-library/pull/219)。

---


## 2026-10-28 | S2/S3 主线启动：核心依赖图 + 可撤销来源 Reader 端口（PR #219，未发布）

**最新优先级授权**：用户明确同意暂不继续反复调整 S1 截图测试，将开发主力切至 S2 模块维护边界和 S3 漫画源真正外置。此授权仅支持隔离 Draft 研发，**不视为 G1 已通过，不允许合并 main / Release / OTA / 生产迁移**。旧42+新增12案例继续保留；Android 真机 UI 测试仍为 G1 阻断项。

- **工作分支隔离**：`codex/s2-source-contract-20261028` 从 PR #218 的 `6e5c1a4a` 分出；[Draft PR #219](https://github.com/Saber-Alter-Lily/pica-library/pull/219) 以 PR #218 为 base，不直接改 `main` / 正式 `v0.5.0`。
- **S2-01 架构依赖门禁**：`scripts/audit-modules.ts` 复用已有 TypeScript 编译器 AST/解析器和 `ts.resolveModuleName`，枚举真实 `src` import 边、type-only 关系和已有 runtime cycles；`test/unit/module-dag-policy.test.ts` 把 Reader、来源契约、受控 Desktop 适配桥的反向依赖变成单测失败，针对人为注入的 SDK 引用/动态加载进行负向测试。它不会宣称全仓已经无循环，更不会隐瞒 `ProviderService` → 具体 SDK 的旧依赖。
- **S2-02 有实际调用的 Reader 无源对接**：`src/source-extensions/reader-contract.ts` 限定版本化 manifest、来源 ID/作品归属、章节/页 ID、媒体大小与安全 MIME，不提供任何 JS/JAR/APK 安装入口；`desktop-reader-adapter.ts` 将**应用显式提供的可信 transport**接入原 `OnlineReaderService` 的真实章节/页面/媒体/进度链，缓存 scope 随 source epoch 变化，禁用与迟到回复失效闭锁，禁止未知来源和裸 HTTP 路由回退。
- **实际测试任务**：`test/unit/external-reader-boundary.test.ts` 在无账号、无 Host、无网络数据的受控 fixture 中执行章节→图片→进度、跨作品访问拒绝、缓存后的撤销拒绝、来源 epoch 变更、超限媒体/非法 MIME/章节重复键、打包依赖闭包。**源码已提交；测试必须以后续 PR #219 精确 SHA 的完整 CI 才能宣称 PASS**。
- **参考和执行限制**：以 Mihon bring-your-own-content 和 Suwayomi 可选 Host 作为边界设计参考；不导入其可执行插件或代码资产，不提供任何来源绕过法律/权限审查的保证。该批不是 S3 独立安装/升级/签名来源，更不是双端纯 Core 已通过。
- **下一步**：拿到完整 CI 与真实 AST 图后修复失败，继续把来源构造移动到明确的 composition root，并测现有内置来源与 Reader/数据身份兼容；另行验证 Android 受控服务 + Windows 独立进程的实际 IPC、签名与隔离，最后才进行包内 SDK 的物理抽离和老用户迁移/回滚。

权威实施和验收边界：`docs/S2_SOURCE_BOUNDARY_20261028.md`。

---


## S1 视觉质量闭锁续修｜2026-10-28：ATD 纯黑截图的精确失败与非黑白门禁

- **新失败的硬证据**：AOSP-ATD 视觉矩阵 [#40649923301](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40649923301) 在第二组 `zhCN-dark-w393-f130/guide` FAIL，日志证明 `active-owner=com.picalibrary.android.dev` 且 `app-focused=true`，但是 `painted=false`；第一组 `zhCN-light-w360-f100` 的七张自动通过 PNG 经下载后逐图像素检验全部是 **720×1280 的 100% #000000 纯黑图（1种颜色、921600个黑像素）**。此时来源不是 Pixel Launcher 弹窗，而是 `aosp_atd` 图形帧不可用与原 `looksPainted` 浅色分支把纯黑当文字的**错误通过**；两种失败源分别保留。黑色 PNG **不能证明 Pica 自身持续黑屏**，更不能认定第一组已通过视觉 QA。
- **实现变更且已回读**：`12537807` 给真实 `S1AndroidLocaleMatrixTest` 增加纯黑/纯白双主题拒绝断言，并将 PNG 判定从单向“墨色数量”升级为**主题背景 + 明暗两端像素 + 非均匀边缘**门禁，仍保持前台窗口所有权判定，不放宽页面锚点、页面已加载和全部九组合验收。 `0724234d` 只将此独立视觉矩阵从图形不可用的 `aosp_atd` 换为 **API35 普通 graphical AOSP (`target: default`)**，独立于已有 Google APIs 八章聚光和完整 CI；官方 android-emulator-runner 支持此系统映像类型。 `41560ff3`、`c6a5af47` 对拒绝/成功 PNG 添加真实 8-byte PNG magic 校验，避免 `run-as cat` 的错误文字被当作 PNG；`57c542cc` 锁定新门禁的静态回归。
- **已知成功的历史测试范围**：`c23a1e3` [完整 CI #40649865872](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40649865872) SUCCESS，`81fbaed5` [完整 CI #40649938731](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40649938731) SUCCESS，均不是新的图形映像/新像素门禁的终态结果。原 `e44de731` 八章 VSpot [#40634745706](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40634745706) SUCCESS、中文浅色两字号的 40 张单独截图已抽查，不替代三语言九组矩阵。
- **待严格收口**：新精确源码 `c6a5af47` 的 [普通 AOSP 九组实页 #40651031422](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40651031422) 与 [完整 CI #40651038857](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40651038857) 在本登记时 **QUEUED/NOT_VERIFIED**。必须真实运行9组、保存有效63张、逐图人工核对，不能对黑屏做主题特判或降低阈值混过去。继续 G1=NOT_ACCEPTED，S2/S3 来源 SDK 真外置与 S5 旧 v0.5.0 数据升级均未完成，正式 main/Release/OTA 未改变。

---


## S1-02 视觉矩阵假阳性闭锁｜2026-10-28 · Pixel Launcher ANR 与前台画面归属

**来源/边界**：正式 `v0.5.0` 与 `main 095d6910` 无修改；继续在未合并 Draft PR #218、隔离 Debug/模拟器中实施。G1 用户验收仍 **NOT_ACCEPTED**，G2/G3/G4 继续 OPEN。保留历史 42 + 新增 12 验收案例。

- **精确旧源码实证**：`e44de731` 的 [完整 CI #40634752986](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40634752986) SUCCESS、[定向 Android #40634745752](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40634745752) SUCCESS、[八章 VSpot #40634745706](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40634745706) SUCCESS；但 [九组实页矩阵 #40634745695](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40634745695) FAIL。实际失败是第六组 `en-dark-w480-f130` 的 `guide` 截图未通过有效绘制判断，后续三组未运行。
- **新增 P1 证据污染**：下载并目视检查该次矩阵工件 [#12793718801](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40634745695/artifacts/12793718801)，前五组通过的 **35/35 张所谓有效页面截图都被系统弹窗 `Pixel Launcher isn't responding` 覆盖**，个别甚至只显示系统壁纸。原来的主题/亮度像素门禁对非本应用弹窗出现假阳性；此前 9/9 的 `d8b7f4c` 截图也存在空白转场，故不可将矩阵 Instrumentation 成功等同于页面视觉验收。ANR 弹窗归因于模拟器系统 Launcher 的图像证据，**尚未证明 Pica 正式/候选应用发生 ANR 或持续白屏**。
- **独立参考**：同批八章引导 [#12792869042](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40634745706/artifacts/12792869042) 实页聚光抽样未见 Launcher 遮挡；继续复用现有 VSpot 引导，不因此重写业务 UI/动画。
- **隔离修复（GitHub 已提交并读回）**：`c23a1e3b` 在 `S1AndroidLocaleMatrixTest` 的真实截图验收上新增“当前 Activity 有窗口焦点 + Accessibility 活动窗口归属本 APK + 有实际绘制像素”三重门禁，失败保留 `rejected-*.png` 与诊断而非套用旧 PASS；`f48f9897` 在失败用例导出拒绝截图和窗口焦点状态；`3c89e981` 只将 S1 独立视觉矩阵的 Android 系统映像切换为 `aosp_atd`，避免该组 Pixel Launcher 特定干扰（其他工作流基线不动）；`81fbaed5` 加入预防回退的仓库契约测试。**不缩减矩阵、不跳过失效用例、不取消外部遮挡检测**。
- **验收与下一步**：新 `aosp_atd` 九组矩阵 [#40649923301](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40649923301) 和新 HEAD `81fbaed5` [CI #40649938731](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40649938731) 在本回执时尚未产生成功终态，不能宣称 PASS。必须逐图审查实际 63 PNG，保证页面可读、无系统对话框、深色下拉高对比、英日翻译和标签真实已加载，再在真实 Android/OEM 验证，最后推进 S2 模块依赖 DAG / S3 SDK 真外置及 S5 老数据升级事务，保持既有 G1–G4 门槛。

---

## S1 人工视觉验收接续｜2026-10-27 · 63张截图复核与新版门禁

**当前事实基线：** Draft [PR #218](https://github.com/Saber-Alter-Lily/pica-library/pull/218)，业务最新候选 `e44de731`，正式 v0.5.0 / 生产 `main` `095d6910` / OTA / 用户资料均未改。S1 = IN_PROGRESS，G1 USER_ACCEPTANCE = NOT_ACCEPTED；S2/S3 来源 SDK 真正外置与 S5 老用户数据升级仍未完成。

- **八章真实 VSpot**：`b5e134f` [Android 35 #40622970105](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40622970105) 18/18 Instrumentation PASS、40 张实际截图；`8e581ea` 的 [#40629907241](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40629907241) 同类专项 SUCCESS。仅中文/浅色/360dp/字体100和150%，不等于真机和其他组合验收。
- **九组实页矩阵自动通过但人工视觉不通过**：`d8b7f4` 的 [#40632432541](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40632432541) 9/9 Android Instrumentation SUCCESS、63 PNG，涵盖 3 语言、2 主题、360/393/480dp、100/130/150% 字体的代表性九组，每组七页。已下载全部图并逐页人工审视，**至少七张为空白转场帧**（尚不能断言程序持续白屏）；标签页图多次停在“读取本地标签”，WebDAV 深色下拉文本与背景低对比、英日页面混有中文。故此阶段**视觉质量 FAIL/OPEN**，不因自动 PASS 偷换验收结论。
- **修复候选**：`8eb0c11` 新增深浅主题显式前景色 Spinner 与 WebDAV 13 厂商 UI-only 翻译，保留原厂商 ID/地址和数据结构；`9d86fda`、`c4e435c`、`e44de731` 补 WebDAV 初始标签、表单提示、状态和删除确认三语，新增 `RemoteStorageVisualContractTest`；`3a39ef1` 同步修复高级指南章节/标签筛选 Spinner 对比度并加入深色回归。所有均为 Draft 源码，**新 SHA 尚未得到完整模拟器、Android CI 和真机验收**。
- **真正的截图门禁**：`c4e435c` 在 S1 语言矩阵中加入真实内容已绘制的像素/主题检查与重试，标签页先等到真正标签操作按钮加载完成，超时 FAIL，绝不保存纯白帧当 PASS。此约束可能暴露真实耗时/加载失败，应保留最新运行日志而非放宽阈值。
- **单元测试已核实的历史部分**：`7b5cbcc` Robolectric [#40629290421](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40629290421) 5/5 组 SUCCESS；`8e581ea` 原子下载索引合成回归测试成功。旧全量 CI `b0db300` [#40630048456](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40630048456) 为516测试中1条标签英语窄屏布局断言 FAIL；`d8b7f4` 更正后 `e42919a` 的定向标签单测 SUCCESS，但 **最新候选全量 Android CI 仍需单独确认**。
- **当前精确源码门禁**：[真实九组矩阵](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40634745695)、[八章模拟器](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40634745706)、[定向 Robolectric](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40634745752)、[全量 CI](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40634752986) 均在最近查询时未有最终结论，不得判成 PASS。

**下一步优先顺序**：检查上述精确 SHA 的实际成功/失败与新图，修复仍空白或读不清的页面；真实 Android OEM 设备复核、Windows/v0.5.0 功能对照；之后按 S2→S3 来源解耦、S4 Issue #199/#200/推荐、S5 原子索引/迁移/升级回滚、S6 双端发布推进。历史42+新增12案例原文和状态继续保留。

---

## S0/S1 当前新增回执｜2026-10-27：标签英语窄屏与九组脚本失败分类

- 旧 [Android CI #40629479729](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40629479729)、[#40629559940](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40629559940) 的 Android job 是实际 **FAIL**，失败测试精确定位 `TagParticipationActivityTest.headerFitsEnglishNarrowPhoneWithoutCoveringBack` 第66行（标题起点不应贴住紧凑返回键）。`d8b7f4c` 在正式标签页加至少72dp返回控制宽度、标题最多两行，并强化原测试的实际 back/title 几何边界检查。仍以新 SHA Android 复测判定是否真的修好。
- [首次三语矩阵 #40629907105](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40629907105) **FAIL** 的实际根因是 here-doc 输入被子 `adb` 进程提前读取：首个中文浅色360dp100%案例已通过1次 Instrumentation 且写出6张 PNG，余下八个案例未执行；它不是第一个页面渲染FAIL。`d8b7f4c` 改为 `mapfile` 事先完整读取9条用例，仍保留 `count == 9` 的硬门禁，新增标签参与页为第7个视图，目标63张原生截图；任何未执行不可算PASS。
- `e42919a` 将 `TagParticipationActivityTest` 原测试加入**独立 Robolectric 矩阵**，与原 Full Android CI 双轨诊断。运行结果仍待新 SHA Actions/原始 JUnit。
- `8e581ea` 的 `PhoneDownloadStoreAtomicTest` 已在 [定向 job #40629907129](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40629907129) 单组 **SUCCESS**；测试全部使用合成文件，无生产升级证据。八章 VSpot 的复测 [#40629907241](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40629907241) **SUCCESS**，但 G1 仍待实体设备和用户确认。
- S2 仅执行 read-only import 关系核查（见 [来源耦合审计](docs/PRODUCT_RECOVERY_S2_S3_SOURCE_DEPENDENCY_AUDIT_20261027.md)），还未达到 `NEW-MOD-01`、`NEW-SRC-01` 的 CI/产物验收。保持 Draft、正式 main、发布和 OTA 不变。

---

## 最新执行回执｜2026-10-27 深度开发续轮（精确证据）

当前 Draft [PR #218](https://github.com/Saber-Alter-Lily/pica-library/pull/218) 继续保留 `main` `095d6910` / Stable v0.5.0 / OTA / 用户生产数据不变。**G1 用户验收、G2 真正来源外置、G3 正式升级回退、G4 发布仍 OPEN**。下列成果不代表完整 S1 或 S5 验收。

- **8章实页引导通过**：`b5e134f` 的 [Android 35模拟器 #40622970105](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40622970105) **SUCCESS**，18/18 Instrumentation 正常、40 张原始 PNG（中/浅/360dp，100%和150%字号）。画风最后一章确实显示5个目标，逐步可见与跳过无模型操作已验证，短期工件 [#12788940746](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40622970105/artifacts/12788940746)。实际下载并检查两张字体汇总图，未自动给出全部语言/主题/OEM 的 PASS。
- **Robolectric 停滞收口**：旧5组中3 SUCCESS、2因持续动画进入测试周期而 CANCELLED（不是FAIL断言）。`7b5cbcc` 使测试生命周期只观察已消费 one-shot 引导后状态，另保留真机模拟器对动画的验收。[隔离矩阵 #40629290421](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40629290421) **5/5组 SUCCESS 且独立 JUnit 文件存在**。整套 Android 全量 CI 仍须独立验证。
- **新增多语言/主题/屏宽真实图任务**：`a0f2d9a`+`061b2c1` 加入9组交叉模拟器测试，六页×九组目标54张原始PNG；英文/日文、深色、393/480dp、130%字号首次进入真实截图流程。原始 #40629554559 被后续新 SHA 触发的同组并发策略 CANCELLED，**不能计为测试失败/通过**；需看最新 #40629907105 的结果。9组仅为代表性，不是3×3×3×2全排列。
- **S0 数据持久性候选修复**：`c9e31e9`+`8e581ea` 将 `PhoneDownloadStore` JSON 索引改为 AtomicFile 原子提交；读取损坏/旧 `.tmp` 时 UI 警示并阻止任何保存/删除/目录重算，防止隐式将错误空索引写回；显式删除正文移至索引保存成功之后。保留旧 JSON v1 schema 和路径，增加5个纯合成 Robolectric 测试：损坏保护、兼容写、备份恢复、旧 `.tmp`、禁止误删本地正文。**尚未经这些新测试完整运行，不等于真实迁移/用户数据安全验收**，更不意味着已触及生产目录。
- **完整 CI 可观测性**：本轮给 Android 测试设置明确 step/job 超时，`--info` 输出测试运行细节，并在失败/超时上传有效 JUnit，避免再把无限停滞当作全量通过。Web/Desktop 与发布过程未删改。

近期应以新 SHA 的 Android focused/locale-matrix/CI 运行结果为依据继续修复，S1 完成物理手机验收前不进入正式 S6 发布。

---

## S1 最新执行回执｜2026-10-27，7章真实聚光及大字号缺陷整改

本段为后续推进的**当前权威状态快照**；不改写下文历史失败/中间运行和旧42+新增12条验收映射。生产正式版 `v0.5.0` / main `095d6910` / OTA / 用户真实数据保持不动；Draft [PR #218](https://github.com/Saber-Alter-Lily/pica-library/pull/218) 未合并。

- **实际通过**：源码 `eea0db58` 的 [Android35 模拟器运行 #40621769915](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40621769915) **SUCCESS**，16/16 独立 Instrumentation PASS、30张实际 PNG（中/浅色/360dp、100%与150%字体）。第0、1、3、4、5、6、7章真实高亮和跳过不记已读；人工偏好保存键维持禁用、远程来源无自动连接。截图及原始日志见短期工件 [#12787068908](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40621769915/artifacts/12787068908)。
- **真实图像复核及纠正**：下载解包目视检查，150%字体来源行标题末字孤行，推荐画像 Engine 长版本号被窄列拆成多段且整张卡片成为过大 VSpot 目标。已提交 `ff37b77`（大字号窄屏 SettingsRow 上下排）、`116244b`（技术状态行上下排、画像高亮真实标题），附 Robolectric 测量测试和截图路径守卫。此修复必须以新源码复拍才能判已验收。
- **最后一个高级章节**：`b5e134f` 将第2章原有五步画风 VSpot 加入真实 Instrumentation，校验控件在视口内、五张每档字体截图、跳过不写入已读或推荐新周期，同时补齐滚动目标逻辑。**尚未返回完整运行结论，当前仍是7/8个章节已验证，绝不宣称8/8通过**；[视觉工作流](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40622970105)。
- **Android 测试阻断仍开放**：[首次聚焦单测 #40621041603](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40621041603) 在 Gradle Javac 通过后卡在 `:app:testDebugUnitTest`，至任务时限被取消；没有 JUnit 成功证据，不将其记作测试失败或 PASS。新 `8efe395` 用5个独立 Robolectric 类、每个12分钟上限及逐类 JUnit 产物诊断卡点，实际运行仍待核实。普通 Android 全量 CI 亦未获得当前精确源码的完整通过结论。
- **阶段门禁**：S0/S1 IN_PROGRESS，S2 限定来源身份路由 IN_PROGRESS，S3–S6 OPEN。G1 用户未验收、G2 真正来源外置、G3 老版升级回滚、G4 双端发布均未通过。存在潜在 `PhoneDownloadStore` 损坏索引静默空值/非原子替换风险，未实测生产事故，也未修改个人下载。

**下一动作**：收口本次最后一章及字号修复的真实截图 → 独立判定被取消的 Android 单测故障原因并修复 → 全量中英日/浅深主题/360-480dp与物理手机 G1 → 然后 S2-S3、S4、S5、S6。禁止把模拟器 PASS 直接改成用户接受或正式发布。

---

## 当前执行权威快照｜2026-10-27 产品恢复 S0–S6

**本段更新最近结果，以下历史段落均为各自时间点的原始记录，不自动改写。** 仍基于 Stable v0.5.0 + [Draft PR #218](https://github.com/Saber-Alter-Lily/pica-library/pull/218)；正式 main `095d6910`、Release、OTA、安装与生产资料未改。当前阶段 S0 IN_PROGRESS、S1 IN_PROGRESS、S2 有限安全端口 IN_PROGRESS，S3–S6 PLANNED；G1 用户验收 NOT_ACCEPTED，G2/G3/G4 OPEN。

- **实际成功：** `cab5067c` 的 [Android35 模拟器 #40620663666](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40620663666) 10/10 Instrumentation PASS，18 张真实 PNG（100%/150%字体各9张）。已验证第0/3/5/7章真实 VSpot 两步、跳过不记已读；更新导览只读。有效证据 [#12787147081](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40620663666/artifacts/12787147081)。不是全八章、多语言、真机或用户 ACCEPTED。
- **已修复旧静态测试漂移：** `34ffaa1` 将原先 3 个 Web/Desktop 失败契约对应到现有 QA 安装隔离、多语言资源、来源归属路由；**保留冻结 Host 哈希及原测试，无删减。** [此 SHA 的 Web/Desktop 作业](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40620102405) 已实际 SUCCESS；Android 全量 CI 终态及后续源码须另核对。
- **新增聚焦单测基础设施：** `b44b9f97` 添加限时 Android Robolectric 工作流，执行本批账户/下载/高级引导相关真实测试，上传原始 JUnit 结果。新增工作流的首轮运行状态只以 Actions 原始结果为准。
- **尚未达标：** 四个高级章节 1/2/4/6、三语/深浅/多设备完整视觉矩阵、用户提出的具体手机缺陷全链路复现、物理手机验收、Windows 功能对等、纯核心包去除所有来源 SDK、正式签名覆盖升级、全量42+12案例复测。
- **新增潜在风险未修复：** `PhoneDownloadStore` 索引损坏与不原子替换路径需 S0/S5 独立故障注入和回滚方案；尚无现实事故证据，不改动用户数据。

**近期下一动作**：先处理当前 Android 全量 CI 与定向测试真实失败，再补 S1 的其余四章及真实屏宽/字体/语言证据；在 G1 通过前不宣布架构与完整产品验收。工作计划见 [S0–S6](docs/PRODUCT_RECOVERY_EXECUTION_PLAN_20261027.md)，历史 42 项与新增 12 项分别沿用 [验收映射](docs/PRODUCT_RECOVERY_ACCEPTANCE_MAP_20261027.md)。

---

## S1 真实截图整改、QA2 产物校验与 QA3 数据隔离（2026-10-27）

当前代码最新提交 `a28404e7fbdbad20906688a9fd0814bd1f658acd`，仍为 [Draft PR #218](https://github.com/Saber-Alter-Lily/pica-library/pull/218)，`main`、正式 v0.5.0、Release/OTA 与用户生产资料均未改变。**G1 用户验收、G2 来源外置、G3 旧版无损升级、G4 正式发布仍 OPEN**。

- **首次实体 UI 图像证据已成功**：[Android 35 模拟器 #40539159767](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40539159767) 在源码 `d7afa3db` 上获得了真实中文浅色 `AdvancedGuideActivity` 截图 2 张（Android 字体 100% 和 150%），已下载 PNG 与 Instrumentation/Logcat 并由本对话进行人工目视核查。该画面无明显横向裁切，但安全说明过长、选中章节重复展示、主 CTA 层级弱和底部导航按钮贴边。**不等于八章节聚光动画或其他语言/手机已通过。**
- **针对截图修复**：`7689f26b` 将首屏安全及操作说明压缩为短提示，原完整文本移入原可折叠说明，移除与 Spinner 重复的章节标题，主 CTA 用主题强调色，底部两个按钮增间距，补 Robotlectic 测试和 3 语言资源。修复后 [模拟器复拍 #40541090821](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40541090821) **仍为 QUEUED**；新截图未回收之前不能视为修复验收。
- **QA2 Dev v91 已完成**：[CI #40541090823](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40541090823) **SUCCESS**；工件 [#12750938267](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40541090823/artifacts/12750938267) 已下载，六文件逐项核验，APK 独立 SHA 计算 PASS。`com.picalibrary.android.dev` / code91 / APK 14,578,316 bytes / SHA-256 `568bbcb04f1af56ce0056599e103fb38d1244807acbd898032e3c35d4afd76ed` / Debug 证书 `a2f84443b72af8c85ad69d0d7d1c47a729b03169b4edc9c84165fe141e26576a`；与 v90 Debug 证书 `d3588d98...` 不一致，**不得称 v91 可覆盖升级既有 Dev90**。
- **修复 QA 测试数据风险**：`a28404e7` 添加仅允许 `.s1qaN` 的独立 QA 后缀配置，普通 Debug 默认 `com.picalibrary.android.dev` 不变；下一工件 QA3 `v92` 使用 `com.picalibrary.android.s1qa3`、不同配对 scheme、单独应用显示名，避免不同临时 Debug 证书覆盖旧 Dev 资料。对应 [QA3 workflow #40542505173](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40542505173) **QUEUED**，尚无实际 APK 产物/验收；这不是生产签名迁移的解决方案。
- **S2 端口切入**：前面 `ProviderRegistry.forPageForComic`、ProviderService/OnlineReaderService work-owned 图片权限校验及独立模块测试已提交，**不能**由 S1 Debug 包结果推断来源已从 APK/Windows 移除或 G2 成功。
- 旧 42 案例和 12 新增标准保持原有状态，不把 Debug 打包成功或“2 张主目录图像”重判为完整 NEW-UI-01/02 PASS。阶段证据详见 [S1 验收台账](docs/PRODUCT_RECOVERY_S1_UI_CLOSEOUT_20261027.md)、[Dev90/QA3 交接](docs/PRODUCT_RECOVERY_S1_DEV90_HANDOFF_20261027.md)。

---

## S1 开发包实体校验与最小模拟器回归（2026-10-27）

**唯一交付事实**：独立的 [S1 Dev QA workflow #40526064065](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40526064065) 在精确源码 `d288bc225e15e49c40eea06b52c67193f95ba457` 上 **SUCCESS**。已实际下载其 [6 文件 ZIP #12745469077](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40526064065/artifacts/12745469077)，逐文件回读并独立计算 APK SHA-256，等于包内 SHA256SUMS。编译/Lint/签名合法性/包身份均经 GitHub Actions PASS；测试包含 Debug APK 但**未执行这条工作流内的完整 Robolectric 或用户手机验收**。

- APK `Pica-Library-S1-Android-Dev-v90.apk`：**14,576,408 字节**，SHA-256 `bee99853830d5244c68eff2cda5eb58063564ea952a892d69de7b67e5c69ab28`；身份 `com.picalibrary.android.dev`、versionCode `90`、versionName `0.5.0-S1-QA-dev-pr35`，应用名称 `Pica Library Dev`，Android minSDK `28` / targetSDK `35`。证书 SHA-256 `d3588d987b4d0a6afdf4aed66909722db63011d5b7dacb1d7a8f509a07e4f6b1`。完整 ZIP 5,681,155 字节，SHA-256 `f4ee25f3ee182a0af0802334f79e7b124751091cbdd5bf70ef07579b377cb0d4`。GitHub Actions artifact 仅保留 1 天。
- 该 DEBUG 签名不承诺兼容之前别的 Dev 安装；发生签名冲突不得为了覆盖测试包而自动删除已有 Dev 数据。正式 v0.5.0 APK 是不同的 `com.picalibrary.android` 包，当前未经稳定覆盖升级验收。测试包不含任何 S2 新增桌面 TypeScript 路由代码的部署证明。
- **真实 UI 截图仍 NOT_ACCEPTED**：[#40526314386](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40526314386) 已冷启动/构建 APK 但 Instrumentation 长时无完成信号，随后 CANCELLED；不是 24 张截图 PASS。新 [第一张真实指南最小截图 #40539159767](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40539159767) 基于 `d7afa3db`，保留详细进度日志/150 秒超时，每个字体档先争取一张 `AdvancedGuideActivity`，**进行中，未确认 PNG**。
- 对测试人员的简明交接：[S1 Android Dev90 测试包与验证规范](docs/PRODUCT_RECOVERY_S1_DEV90_HANDOFF_20261027.md)，覆盖真实聚光指南、书库多选、三个语言长标题、更新只读模式和数据不破坏。此前错误/原 42 验收仍保留，S1/G1 用户接受为 NOT_ACCEPTED，S2/G2 来源真正外置未完成，正式发布无授权。

---


## S1/S2 最近一次执行回执（2026-10-27 · PR #218）

当前代码提交基线 **`2bb3b44b6c0b5fbfe0455f7beaa57995acbae07c`**。此条是本轮新增回执，不删除此前所有实际失败/证据。正式 v0.5.0、`main`、OTA 和用户资料仍未更动。Draft PR #218 未合并，S1/G1、S2/G2、S5/G3、S6/G4 均未通过用户验收。

- **S1 模拟器真实证据**：首次 Gradle CWD 错误 `#40517358640`；第二次 Android 35 `/sdcard/Android/data` 权限拒绝 `#40519878220`（Debug APK、AndroidTest APK 已构建）；第三次 `#40522901087` 因 runner 用户缺 `/dev/kvm` 硬件加速而启动超时。均是 **FAIL / 没有可验收截图**，不可认定 UI 已验收。
- 最新 KVM 预检/授权修正 `82558994`：Android 35 真实模拟器工作流 [#40526314386](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40526314386) 的 **KVM 检查已 PASS**，但首次读取时完整截图步骤仍 `IN_PROGRESS`；尚未确认24张 PNG、字型布局与操作。如果 CI 仍失败，应严格区分启动、Instrumentation 或真实页面缺陷。
- **Dev QA 安装物**：`#40521071684` 因重复完整 Android unit suite 达到工作流时间上限 CANCELLED，无 APK 工件。新 `d288bc22` 只保留打包工作流内 Lint/Debug assembly，并要求原 Android CI 独立做 JUnit；[#40526064065](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40526064065) 最近查询是 QUEUED，未经证实的 APK 不能发给用户或称“可无痛升级”。
- **S2 开始有真实读图链路**：在原 `ProviderRegistry` 之上新增 `forPageForComic`；真实 `ProviderService` 接入 `assertPageOwnedByComic/fetchPageForComic`；在线 `OnlineReaderService.picture()` 在缓存命中之前校验作品归属。新增回归覆盖来源冲突、缓存绕过与不完整新端口的 fail-closed 拒绝，旧 `fetchPage` 仍为 legacy 兼容。**源码已提交，不等于新 SHA 的测试已 PASS；尚未外置 Pica/EH/JM SDK。**
- 当前阶段以 [S1 视觉验收矩阵](docs/PRODUCT_RECOVERY_S1_UI_CLOSEOUT_20261027.md)、[S2/S3 来源解耦审计](docs/PRODUCT_RECOVERY_S2_S3_SOURCE_DEPENDENCY_AUDIT_20261027.md) 为证据入口，并严格保留原 [42 项+新增 12 项验收映射](docs/PRODUCT_RECOVERY_ACCEPTANCE_MAP_20261027.md)。后续精确 SHA 的 Android/Web CI 仍在队列；NOT_RUN / QUEUED / PASS 不得混写。

---


## S1 视觉验证第 2 次失败与存储边界修复（2026-10-27）

当前 [Draft PR #218](https://github.com/Saber-Alter-Lily/pica-library/pull/218) 保持独立候选；最后这次源码修复为 `505b4a90b8da1eb78808e1b4fc859b6eec30171f`。正式 `main`、Stable v0.5.0、OTA 与用户账号/数据均未触及。G1 真实用户 UI 验收仍为 **NOT_ACCEPTED**。

- `45e6e641` 修复了 Gradle 工作目录错误，真实 [Android API35 模拟器运行 #40519878220](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40519878220) 成功冷启动并执行 Gradle `:app:assembleDebug :app:assembleDebugAndroidTest`（**59 tasks / BUILD SUCCESSFUL**），两个调试 APK 均已编译。**之后的流程仍失败**：Android 35 拒绝 `adb shell rm -rf /sdcard/Android/data/com.picalibrary.android.dev/files/s1-visual`（Permission denied）。因此 **0 份可信 UI 截图，不能把 APK 编译成功写成模拟器验收通过**。
- `505b4a90` 改用 `getFilesDir()/s1-visual-f100|f150` 的应用私有临时证据目录，使用仅对 Debug 应用可用的 `adb exec-out run-as com.picalibrary.android.dev cat` 逐个提取 12 个已知文件名。禁用 shell 直接删除受保护的 Android/data 目录；不读取应用用户其他数据。新 [模拟器运行 #40522901087](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40522901087) 已触发，**当前不得宣称成功或提供 PNG**。
- 并行 [S1 Dev QA 构建 #40521071684](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40521071684) 源码 `b1cc4777` 使用隔离包名 `com.picalibrary.android.dev`、versionCode 90，严格经 JUnit/Lint/打包/签名/校验；构建任务仍应以真实 run 成功和工件存在为准。它与 `505b4a90` 只差视觉测试脚本/AndroidTest 改动，没有普通 Android UI 业务代码差异；**仍未正式发布**。
- 本次仅修复证据基础设施，不改推荐/Visual、数据库/来源 SDK、正式 updater。Android 真机/多字体/三语言的完整视觉证据与 G1 仍待验证；S2/S3 来源真实外置、老用户一键迁移和发布门禁保持未完成。

---

## S1 实际视觉证据与独立测试包（2026-10-27，继续推进）

**开发主体：** [Draft PR #218](https://github.com/Saber-Alter-Lily/pica-library/pull/218)；正式版 `v0.5.0`、生产 `main`、正式 OTA、历史 PR 和真实用户数据均未改。S1/G1 用户验收仍为 **NOT_ACCEPTED**。

- **独立模拟器真实 UI 验证**：新增 `.github/workflows/s1-android-visual-evidence.yml` 和 `S1AndroidVisualSmokeTest.java`，计划以 Android 35/360dp、100%/150% 字体、中文/英语/日语、深浅模式，对高级引导、标签/多选/更新页留下 **24 张截图**。数据仅写入 `com.picalibrary.android.dev` 临时目录；不需要正式来源、账号或用户数据。截图只允许公开仓库上传且保留 1 天。**未有截图包之前禁止宣称可视化通过。**
- **真实失败与修复**：首次视觉运行没有 APK/PNG：模拟器成功启动，但 `android-emulator-runner` 的多行 `script` 各命令工作目录不能保证持久，Gradle 错误在仓库根目录找不到 `settings.gradle`（失败运行 [40517358640](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40517358640)）。`45e6e641` 将完整流程改为同一 Bash 进程内执行的 `scripts/run-s1-android-visual-emulator.sh`；新 [可视化运行 40519878220](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40519878220) 发起时未完成，**不得沿用旧版 CI PASS**。
- **独立 Dev QA APK**：添加 `.github/workflows/s1-android-dev-package.yml`，在源码 `b1cc4777` 上独立执行 Android JUnit/Lint/Debug 编译并验证 APK 签名、包名、版本和 SHA256；目标输出 `Pica-Library-S1-Android-Dev-v90.apk`，固定 `com.picalibrary.android.dev`，与 Stable 正式包隔离。自动产物仅保留一天，无第三方签名私钥及 Release/OTA。首次 [QA 工作流 40521071684](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40521071684) 发起时仍在运行，**未证明候选 APK 已产生**。
- **边界不改变**：Gradle/API35 模拟器证据并非真实手机/OEM 验收；Dev APK 不代表正式签名覆盖升级；Pica/EH/JM 具体来源协议仍捆绑于历史程序，S2/S3 仍需要真正外置、独立组件生命周期与老用户迁移。

**下一动作**：按精确 GitHub Actions run 结果定位脚本、仪表测试或实际布局故障；只在生成的可审阅截图/Dev 安装包确实存在时，把对应记录由 NOT_RUN 更新为自动/模拟器已验证；维持 G1 人工验收 OPEN，不越级提交 Release。

---


## S0–S1 当前开发回执（2026-10-27，PR #218 独立 Draft）

产品策略不变：正式 `v0.5.0` 是功能/视觉体验基线；Dev89 源码是未发布工程起点。当前本分支精确源码 `8f8124657d203c71a51ea5e7121fd6798bfee998`；不得合并/发布/OTA。新版用户验收状态 **NOT_ACCEPTED**，真实手机/UI/字体放大和源码包体/来源外置门禁仍 OPEN。

- **S1 首批有效改动**：设置行有界标题/状态宽度、窄屏五项多选操作栏分行、标签参与页面标题宽度限制、更新版本说明可滚动、WebDAV 表单在主线程快照、只读引导不会重启更新任务。
- **高级引导可用性推进**：真实 VSpot 页面控件定位，8 章（其中画风复用历史五步），步骤说明三语言；手册正文改为可展开的次级内容，**交互引导默认呈现在正文前**，不再让长文字挡住入口；进度返回刷新，断点/跳过按现有 store，业务操作需用户手动执行。
- **自动证据范围**：Robolectric/Java 回归覆盖导航/控件/预览/窄屏/三语言部分情况；新的 Tag 标题有 360dp 测量测试。用户多处手机排版问题尚未提供完整截图，不伪造具体位置或宣布已消除；物理设备与 130%/150% 字体及 OEM 验收仍须补充。
- **历史失败可追溯**：早期 Android 测试行数断言失败（caacd016）；Lint `WrongConstant` 失败（868e4ec）；Web 测试 20 次固定引导重试断言失败（f64143b）；测试中 Activity 视图查找编译失败（a7118094）；较早 57275365 / 64009d41 集中旧 P2 工作流曾因外部实机证据/运行取消导致 automated-summary FAIL，不可与独立 Android/Web CI 绿灯混为全项 PASS。未覆盖全量专项时保持未验收。
- 先前 `be75219` Android/Web 两项 CI 已通过；之后各源码提交须以**对应 SHA** 的 Actions 为准。当前 `8f812465` 自动验证在提交时仍未结束，**不可预先填 PASS**。
- **证据与下一动作**：[S1 UI 修复/待验收矩阵](docs/PRODUCT_RECOVERY_S1_UI_CLOSEOUT_20261027.md)；严格按 [S0–S6 权威任务计划](docs/PRODUCT_RECOVERY_EXECUTION_PLAN_20261027.md) 和 [原 42 项+新增门禁](docs/PRODUCT_RECOVERY_ACCEPTANCE_MAP_20261027.md)。继续完成来源与真实 UI 证据之后才可讨论 G1；S2/S3 只已完成静态审计，来源正式外置未实现。

---

## 当前执行权威：产品恢复 S0–S6（2026-10-27）

**本段优先于下面全部历史“下一步/状态快照”；历史事实、任务 ID、失败记录均原样保留。** 此次工作基于正式 `v0.5.0` 作为功能/UX 基线、Dev89 `af42b4d3ecafd1d51b3c2ef8aee7339c56c75921` 作为未发布工程起点；当前新分支 `codex/product-recovery-s0-s1-20261027` / [Draft PR #218](https://github.com/Saber-Alter-Lily/pica-library/pull/218)。旧 PR #203/#205–#217 及 main 均不自动合并或发布。

- **总计划**：[S0–S6 分阶段实施方案](docs/PRODUCT_RECOVERY_EXECUTION_PLAN_20261027.md)；两条主线为正式版用户体验保留基础上的**实际模块维护隔离**和**Pica/EH/JM 等来源可选外置**。一键升级、Issue #199/#200、推荐/Visual、LAN/WebDAV 和旧用户数据兼容持续保留。
- **原验收**：[42 个原案例逐一映射 + 12 个明确新增案例](docs/PRODUCT_RECOVERY_ACCEPTANCE_MAP_20261027.md)；新阶段不删除/重判旧 42 项，不以“关闭来源默认启用”或“Windows 不带 JM JVM”冒充来源外置。
- **S0 已推进**：[首轮源码核查](docs/PRODUCT_RECOVERY_S0_BASELINE_20261027.md)、[v0.5.0 官方 Release 资产/功能基线](docs/PRODUCT_RECOVERY_V050_OFFICIAL_BASELINE_20261027.md)。正式资产哈希来自官方元数据，本轮未重新下载独立计算；真实 Windows/手机对照、完整来源文件清单仍需验收。
- **S1 已提交源码，未经用户验收**：Android `SettingsRow` 长状态文本宽度约束；高级 8 章节中的 7 个使用现有 VSpot 复用真实双控件聚光、画风章节沿用原五步；三语言独立短说明；教程进入更新页不自动检查更新，账户页教程避免首次自动账户探测；窄屏书库多选栏自适应两行、宽屏一行。已增加 Robolectric 测试；**物理手机/真实截图仍 NOT_RUN，排版问题还不能标为修完**。
- **新 CI 的原始失败不可删改**：PR218 首次 `caacd016` Android 481 测试中 2 个新增 Robolectric 行数断言失败；后续 `868e4ec` 定位并修复该断言，但 Android Lint 因两个错误的旧 Layout 常量引用 FAIL；后续源码已移除常量并重新提交。**最终精确 SHA 门禁结果以新的 Actions 检查为准，不预先声称通过**。
- **安全边界**：仅独立 Draft；不改生产 app/数据、账号、OTA、Release/tag、冻结 PR，不下载私钥，不在用户设备上安装或擅自迁移。任何 CI PASS 不等于 USER_ACCEPTED。

当前顺序：**S0 功能差异与资料矩阵 → S1 Android 排版/交互与真实控件引导 G1 → S2 核心模块隔离 → S3 漫画源真实外置 G2 → S4 书库/标签/推荐/跨端整合 → S5 升级/性能 G3 → S6 双端集中验收 G4**。后续小修只改变对应任务和证据，不得无限扩展 Dev 候选或宣布整个项目完成。

---

## Concentrated Dev89 — actual packages verified, teardown-only gate correction (2026-10-27 local)

Exactfe84055f4202b2c2917d0d9ee4fd8992fedd2b32 ordinaryCI40474512657 both jobsPASS. Dedicated40474606748 terminal9/10PASS, overallFAIL: source/Windowsunit/actualWindows/Androidsigning and five runtime scenesPASS; launch-rollback failed only in finally/stopOwned. Original result has actualHelperRollback=true, exactApplicationTree=true, selectedStateCanaries=true and no browser/source boundary events, but teardownError='Refuse process outside exact owned root'. Preserve overallFAIL, not waive cleanup. Raw stack is ownedPid called after process.kill at the existing second wait. Original generic assertion omitted PID/path-presence details; it cannot distinguish a transient missing CIM executable path from PID reuse/foreign process, so no retrospective exact-cause claim.

Download/independentNodeZIP/binaryXML/v2certificate/source-byte checks for fe84055 actual packagesPASS, not installableREADY while mandatoryjobFAIL. Core113files/0JM, optionalJM280files/167runtime files. ActualAPK com.picalibrary.android.dev/version89/fixedcertificate64fb87...; full cryptographic authority is successful same-source CIapksigner, localNode only extracts certificate. ActualJUnit60files/471tests/0failure/0error/0skip. Linux2629PASS/14skip andWindows2642PASS/1skip, all conditional cases have passing opposite-platform counterparts; rawJSON misleadingly reports2643passed, retained without alteration. No localJava/app/installation or productiondata.

Finite correction is CIharness ONLY: explicit absent/owned/unidentified CIM states. Missing executable identity never means gone or permission to kill; foreign paths/mismatched records still throw. Only owned may be killed, original50+100polls/intervals unchanged, and only confirmedabsence permits fixture removal. Bounded state-only observations distinguish future evidence without exporting process paths. Six inert-port tests execute the actual stopOwned function: unknown→absent withoutkill, persistentunknown fails/retains, owned→terminatingunknown→absent, foreign refusal; no duplicate implementation or realprocess run. Reuse existing fixture and its declaration; no app/mobile/Reader/helper/ranker/schema/timeout/dependency/workflow/version changes.

Localregression-7:236PASS/0FAIL/0skip/20files; fulltypes-6PASS, both0IOevents/source unchanged. Firsttypes-5 failure preserved: existing .d.mts omitted the newly exported pure classifier; declaration was then added, no any/ignore escape. New exact-source full gates/package/signature check still required, sameDev89 because no installer has been handed out or installed. Goal remainsOPEN; no feature expansion, release/OTA/deployment or modification of frozenPR213..216.

## Concentrated Dev89 — authorization, actual first gate and bounded correction (2026-10-27 local)

Direct human reply now authorizes pushing an independent Draft, Dev build numbering, and existing fixed-signing Secrets in Actions for unpublished Windows/upgrade-compatible Dev APKs. No main merge/tag/Release/OTA/deployment, private-key download, production data or localJava/application/listener. LocalMemory context/claim remainNOT_FOUND; standing isolated waiver continues, no identity guess/DPAPI repair. Exact0a8a0ddb152a6c0c303c54d090a59bf11ef2d861 pushed tocodex/concentrated-acceptance-20261027; DraftPR217 created/attached on frozenPR216/f5be335. Readback main095d6910c34e and frozenbase unchanged. Dispatched existinguser-host-acceptance.yml with explicitwindows-and-signed-dev89:run40473230012.

Actual firstsourcejob122085109052:2623PASS/6FAIL/14skip/332files. Android/windows/runtime-choice jobs skipped after requiredsource failure, so no fixed signing reached; Windows full-unit independent job's terminal result remains separately tracked, not fabricated. OrdinaryCI40473198434 actualAndroid taskPASS, Web/DesktopFAIL. Raw completed-source log and originalSourceEvidence JSON retained. Original local179/type/Rollup successes are preparation only, not a reason to dismiss these full-suite failures.

Root cause is exact contract drift from reusing existing build/identity helpers: recommendation allowlist omitted src/library/content-identity.ts, already admitted for reading projection; four old userHost recipe assertions still fixed old push-branch/Dev88/status/fixture label; global artifact guard required literal1day. Actual identity file has no imports or I/O. Correction admits ONLY that pure leaf, requires AST imports=[] and independent browser-target bundle containing only that file, leaving all transitive storage/model/network exclusions intact. Recipe asserts manual-only exact newbranch, explicitsigned mode,Dev89,read-only permissions,old predecessorHOLD and separate historicalT3/Host evidence. Retention7days is narrowly specific to this public/synthetic concentrated handoff; all other workflows retain1day and new parsedYAML tests check EACH concentrated upload exactly7. No test removal,skip,deadline/network/state/ranker change or dependency update.

Finite correctionpreflightregression-5:201PASS/0FAIL/0skip/16files, fulltypes-4PASS, both0IOevents and unchanged inspectedsource. New full current-source cloud gates/installable verification remain required. Dev89 is retained because the first run produced no installable. No further feature expansion; full goal/sevenphases/42cases remainOPEN. Source docs are preparation-time snapshots; PR217/independent post-run receipt will carry actual final outcome without rebuilding binaries merely for bookkeeping.

## Concentrated acceptance freeze — one candidate, no feature expansion (2026-10-27 local)

Human now explicitly prioritizes a usable consolidated acceptance build. Freeze further module/private-Host-tag expansion; prepare one isolated candidate branch `codex/concentrated-acceptance-20261027` from PR216/f5be335, leaving frozen PR213..216 untouched. Current-source full gates, actual packages, hashes/signature/profile isolation and short daily/advanced instructions are delivery requirements, not replaced by source review. Full objective/seven phases/42 cases stay OPEN; known complete Host metadata/tags/favorites/sync/background recovery, second real source and physical/OEM gaps remain explicit. Contract: `docs/CONCENTRATED_ACCEPTANCE_DEV89.zh-CN.md`.

PR216 final actual CI40459202415/f5be335: both Web/Desktop and Android PASS, read-only verified again. Web56, Vitest2620PASS/14skip/331files, realChromium61; native testDebugUnitTest/lintDebug/assembleRelease actually successful, no successful-run exact native count exported. Retained warnings and original471/470/1failed run are not erased. No installable artifacts or fixed signing were produced by ordinary CI.

One reproduced blocker fixed in this candidate: manually bound unknown/hosted IDs could inherit the old Pica fallback and become RELATED request seeds. New real red regression had9PASS/2FAIL; the seed now uses existing catalogSourceId validation and preserves valid legacy/Pica seeds without changing ranking weights or state. Final typecheck PASS/0IO; local no-listener regression168PASS/0FAIL/11actual files/0IO. An earlier broad attempt168PASS/2FAIL hit the unchanged local TCP_LISTENER guard in tag-profile-server's two realHTTP cases; this is an execution-scope failure, not falsely a product failure or PASS. Those HTTP cases remain in unfiltered full cloud Vitest; local runner explicitly defers them, no global skip or IO exception.

Reused existing user-host acceptance workflow, prepared manual-only/exact-branch mode with Windows-only safe default and explicitly selected fixed-signed Dev89 option. Keeps full source/JVM/Chromium/Windows/native gates and six component-choice scenarios; separately checks both actual core/JM ZIPs and retains native JUnit/lint/evidence for7days. Signing Secrets remain step-scoped after native gates, never on push/PR. Preparation is not new cloud/signing authorization: one consolidated permission question is pending. No push, dispatch, Secret retrieval, local Java/app/listener, production-data access, merge/tag/Release/OTA or deployment.

Final localregression-4:179PASS/0FAIL/0skip/13files; types-2 fullTypeScript PASS, both0IOevents and unchanged inspected source hashes. New workflow's7 parsed-YAML contract cases passed. Retain preceding regression-3:172PASS but one suite could not load js-yaml from the root under pnpm strict dependency layout; resolve the already-locked ESLint parser from ESLint's own scope, no install/lockfile change and no test removed. An approval-review timeout prevented the first types-2 launch; one permitted retry actually completed successfully. These local tool/parser failures are not cloud/product failures or hidden reruns.

## P2 native Host books — authorized Draft216, first actual Android result (2026-10-26 local)

Human explicitly authorized a newDraft and existing temporary-debug CI, still forbidding fixedSigningSecrets,version changes,merge/release/OTA/deploy and localJava/app. Pushed frozen67ef35ae16658b23ef32da178e12550e189ee954 tocodex/host-personal-library-20261027 and openedDraftPR216 on frozenPR215/8045754; attached it to this task. Eleven unchanged signing recipes were audited: no matching signing push trigger, PR signing jobs denied, no global signing env; the only reusable signing caller is manual-only and was not dispatched. Actual RC workflow40458023906 has android-rc/windows-rc SKIPPED; ordinaryCI uses no fixed keys. LocalMemory context/claim remainNOT_FOUND; standing isolated waiver continues, no DPAPI/identity changes.

ActualCI40458023912/source67ef35a: Web/Desktop PASS. Android job122035800397 compiled application and test code and executed471tests,470PASS/1FAIL: HostSourceActivityTest.removingReferenceRequiresConfirmationAndDoesNotSendAHostRequest at the combined assertion line52. Preserve raw completed-job log; do not relabel this source asPASS. No JUnit artifact was emitted by the existing CI, so first failure's individual expected/actual assertion is not available from the compact log.

Source attribution: Android AlertController posts button callbacks through a Handler; the test has PAUSED looper but omitted idle after native dialog clicks, unlike the project's existing JmSourceActivityTest.pressDialog helper. Reuse that exact click+mainLooper.idle pattern, separate/assert each confirmation stage and keep all retention/no-network checks. No product timing, retry or safety gate changes. Independently, real product source left main status at host_working after confirmed removal; add a localized completion state and assert it, rather than claiming deletion itself was proven broken. Strengthen existing metadata-refresh test with a different incoming save timestamp to actually prove the original timestamp is retained. Current-source fullCI still required; original failure remains.

Corrected localpreflightregression-5:235PASS/0FAIL/0skip/17files; fulltypes-4 PASS; bothIOaudit0events and unchanged source hashes. Nodegrammar-6 parsed254Java files without syntax errors; three locale XML files valid with62unique strings each. These do not substitute for the new current-source native CI. Frozen67ef35a failed raw result is retained; no blind retry, fixed signing, version/workflow change or source/timeout/guard weakening.

## P2 native explicitly saved Host books — isolated local implementation (2026-10-27)

Previous goal turn was concretePROGRESS: frozen8045754/PR215 realHost40453173182 H1..H6 engineering assertions and ordinaryCI40453179583 both jobs PASS; downloaded original result/archive digests, failed history, source diff and32-member review bundle independently verified (.NET31/31payloads). Two actual built-in synthetic books each reported-1 metadata then2pages; stop-ownedHost/fresh-process local four-page progress alsoPASS. This is not second-provider or physicalAndroid acceptance. The exact post-run addendum is now preserved in the realHost contract rather than relabeling old preparation snapshots.

New local branchcodex/host-personal-library-20261027 at8045754 closes a concrete native continuity gap: an explicitly saved Host reference survives session end/restart and has actual Library/Host UI entry, bounded12-row local paging, explicit same-host/account/source regrant and existingReader revalidation. Pinning, saving body pages and removing a local reference remain separate actions; removal confirms and does not delete downloads/history or mutate Host favorites. AtomicFile/local class locking and existing permissions/Reader/HTTP are reused; no new SDK/Reader/queue, source executor, SQLite migration or legacy catalogue coercion. Contract:docs/NATIVE_HOST_PERSONAL_LIBRARY.md.

LocalMemory context/claim bothNOT_FOUND; existing user-approved persistent isolated-development exception remains, no identity guess/DPAPI work. No localJava/app/browser/listener, production-data read/write, main merge, version change, fixed signing, Release/OTA/deployment. NewDraft/ordinary-debugCI authorization was requested once, pending actual human reply. Node22source/resource checks and fulltypes passed; Nodegrammar254Java files passed. First broad regression234PASS/1FAIL/17files,0IOevents retained: pre-existing guard rejected reading failure.getMessage in capacity handling. Product now uses typedHostSavedBooks.Full; the original no-error-text guard is unchanged. Second broad regression passed; final exact counts/new native test count must be sealed after final preflight. Android compilation, native tests and new installers remainNOT_RUN.

This is persistent selected-reference metadata, not complete native Host catalogue/private tags/favorites/sync/background recovery, a second real platform, or final user acceptance. Seven phases/42product cases and fullObjective=OPEN remain intact. FrozenPR215/T3/Dev88 and original data stay untouched; no user testing requested.

Final local preflightregression-4:235PASS/0FAIL/0skip in17files; finaltypes-3 PASS, bothIO-denying audits0events and unchanged source hashes. Nodegrammar-5 parsed254Java files without syntax errors; three locale XML documents valid,61unique strings each.24new native cases are written (HostSavedBooks12,manager+5,screen+7), NOT_COMPILED/NOT_RUN locally. Review also keeps captured session throughout resume and uses standard AtomicFile.failWrite for write exceptions/OOME. ExistingManifest allowBackup=true is explicitly disclosed, not changed or falsely described as preventing OS backup. No new cloud authorization is presumed from this local result.

## P2 actual Host failure attribution — unknown chapter count (2026-10-26)

PR215 remains Draft/unmerged. Actual run40451709011/source02a72e293b698f432f7435ebfbb73f17cd5b5c74 reached official Suwayomi in a loopback-only namespace: startup/inspection/source list/search succeeded, then CBZ prepare failed at hostChapter→hostInteger(pageCount), before body retrieval. Downloaded original result/job logs are retained; ownedHostStopped=true. This supersedes the earlier preparation-only NOT_RUN snapshot, not a PASS.

Fixed upstream ChapterTable blobf6fd7be8a37a3dba07c13c99a442d98e69824085 defines page_count.default(-1). Local source-only unit-5 reproduced the missing -1 sentinel support:196PASS/3FAIL, zeroIO guard events. Minimal Desktop/Android metadata codecs now preserve only this exact unknown value; ready page lists still require positive exact counts and owned identity/paths. Android initial Reader filtering also allows only Host/-1 so legitimate unfetched chapters are not discarded; local empty chapter behavior stays unchanged. Four new native tests cover codec/ready-page/ReaderPolicy/HostReaderSource paths, cloud execution pending. unit-6 is199PASS/13files/0events; fulltypes-4 and worker-5 PASS/0events before final evidence instrumentation. New full exact-source gates still required.

This is the first application/mobile delta in PR215, explicitly superseding the initial no-app-delta claim. No schema/version/lockfile/production-data changes, new Reader or downloader, local Java/app/listener or fixed signing. Only permitted existing temporary-debug CI; no merge/tag/Release/OTA/deploy. Seven phases/42cases and fullObjective=OPEN remain unchanged.

Final preflightunit-7:199PASS/0FAIL across13actual files,0boundary events; finalworker-6 and fulltypes-4 PASS/0events. Source02a72e2 ordinaryCI40451713301 bothjobs PASS is historical proof only, not acceptance of these new native/product changes. New exact-source realHost and ordinaryCI remain required.

## P2 real Host interoperability — authorized isolated gate preparation (2026-10-26)

First real-host run40450507601/source112038f failed in about28seconds before worker/Java: frozen source checks/types and pinned official JARhash/size PASS, then ERR_PACKAGE_PATH_NOT_EXPORTED for tsx/esm/api. The installed/frozen tsx4.7.0 exports ./cli, not that newer API. No runtime result artifact was created; preserve completed job122011847637's raw log. First bounded correction uses the existing public CLI/tinyTSentry; no dependency/application/version/schema or security/deadline change, no local Host/app/Java execution. Real interoperability remainsNOT_RUN pending corrected-source cloud proof.

Localunit-3 retained194PASS/1FAIL with3TCP_CLIENT guard labels from the proposed literalCLI probe; destinations were not recorded, so actualTCPvsIPC cannot be inferred. Original guard blocked those calls and is unchanged. Remove local CLI execution from the regression: resolve public export/bin and Node syntax-check only; real CLI/worker execution stays cloud-only. Java/Pica never started locally. This failed local probe is not relabeled as0IO or PASS.

Correctedpreflightunit-4:195PASS/13files,0audit events; worker-4/types-3 PASS with0events. PublicCLI syntax and whole diff checks PASS. No application/dependency/version change or network-guard relaxation. New exact-source runtime remains pending, original run112038f failure preserved.

Previous goal turn: **PROGRESS**, not a status-only wait. T3 source5f4b7ead0fcd actual run40444592760 seven/seven PASS; ordinaryCI40444597333 both jobs PASS. Downloaded23raw leaves independently verified, including0.5.2/200HTML readback,12precisely correlated transient probes, zeroHTTP errors/boundary/cleanup failures and58952msnegative-health span under the unchanged60000ms deadline.116-entry review ZIPSHA2564c8909ef67eccb79ca1106231f491acfd867e31afe0086481beb3be6070a3296 also passed independent.NET manifest115/115. PR214 remainsDraft/unmerged; old recovery is supported-headless CI only, not old interactiveLAN/publication/OEM acceptance. Original failures remain retained.

User now separately approved a newDraft and temporary real Suwayomi runtime integration using synthetic content only, no third-party sources/platforms/signing/release/deployment. New local branchcodex/source-host-interop-20261026 starts at frozen5f4b7ea; no app/mobile/schema/version/dependency changes. Local context stillNOT_FOUND; continue the existing persistent isolated waiver, not a guessed identity/DPAPI repair. Public officialtag/commit/JARdigest and26text Gitblobs verified; no JAR downloaded or Java/app/listener started locally.

The finite H1..H6 engineering gate reuses existing connection/Reader/cache/scheduler/ingestion/localReader ports, actual upstream built-in LocalSource, onefolder+oneCBZ/fourdistinct owned synthetic pages and a fresh offline Node process. A separateloopback-only network namespace isolates Java/client from external platforms. Source/op/body/page identity, explicit save/revoke, controlled child exit and persistence are checked. Only bounded diagnostics upload, neverJAR/images/DB/config. This does not count a second realProvider, finalWindowsGUI or physicalAndroid acceptance. Contract:docs/REAL_SOURCE_HOST_INTEROPERABILITY_GATE.md. Actual runtime/Actions remainsNOT_RUN at preparation; no test counts relabelled as interoperability.

Local preparation unit-1:194actualPASS/13files, fulltypes-1 and separately includedworker-1 types PASS; three IO-denying audits0events, no Java/app/listener. User subsequently clarified that existing temporary-debug APK CI is permitted while fixed private signingSecrets/Dev version changes/installable publication remain prohibited. The dedicatedHost workflow has no Android/signing task. No source/mobile/web/package/lockfile delta from frozen5f4b7ea.

Finalpreflightunit-2/worker-2/types-2:194PASS/13files, committed-worker tsconfig and fulltypes PASS, allthree new audits0events. Existingjs-yaml parsed the8step/onejob workflow and exacttwo-leaf upload allowlist; the local inspector's first unnamed-step accessor was corrected without changing the workflow. Readonlytriggeraudit of11fixed-signature workflows found no matching push/signing-job path for this new branch; none has global signingSecrets env. FrozenPR2145f4b7ea/main095d6910c34e readback unchanged; remote target branch absent before push. No signingSecret values were retrieved.

## T3 request attribution and first product correction (2026-10-26)

d292f70/40442777436 remains6PASS/1FAIL;23downloaded diagnostic leaves checked, no boundary/cleanup failure. The startup400 is POST recommendation-events: renderAll invokes the recommendation renderer before any cycle/batch exists, yet it publishes recommend_batch_presented; server context validation correctly refuses. Executing the actual small client function against inert ports reproduces2FAIL/115PASS with0IO audit events. Retain this red test evidence. Minimal web/app.js guard suppresses only nonexistent/invalid/empty batch presentations, retaining real batch fields and ordinary search/feedback; no server validation, DB/schema/ranker/Visual/user-state changes.

All connection refusals are the shipped reconnect GET capabilities/timestamped HTML probes in the accepted-apply/pre-reload interval. CI now classifies only same-origin fetch GET ERR_CONNECTION_REFUSED within the existing90second reconnect bound; console errors require one-to-one actual failed-request URL/1second correlation and real0.5.2/200capabilities/200HTML readback. HTTP errors,400,uncaught code,other origins/routes/methods/resources/times/codes still fail. This is an explicit correction of the overly literal zero-resource-message assertion, not a blanket ignore or an unchanged-assertion claim. Product60second health deadline unchanged. Product correction/new gates require new exact-source cloud evidence; PR213/Dev88 and original failures remain frozen. Broader source/device/P6 completion is still open.

Green source preflight unit-6/types-5:119actual PASS/13files and full types; JS parses and git diff check PASS, both new boundary audits0events. The red unit-5 retained2failures/115passes. Ledger phase summary and affected42case rows now distinguish verified Dev88 engineering evidence from real source/device and still-incomplete persistence/sync work; stale uncompiled/old-six-scene-FAIL labels are superseded, not used for a completion percentage.

## T3 second-run evidence — six of seven, diagnostic gap not waived (2026-10-26)

Sourcead7040aabb4e, CI40441171189 Web/Desktop+Android PASS; T3 run40441168209 completed in about6minutes with a real exit1, **6PASS/1FAIL**. Actual .cmd preview/cancel, integrity rejection, running refusal, concurrent ownership, launch rollback and60000ms health rollback PASS within the declared old-supported-headless CI scope. Health negative-response span58740ms; no boundary violations or cleanup failures. All23diagnostic leaves were downloaded and independently checked. Controller resource type names are now retained; earlier exact leftover-handle cause is not retroactively inferred.

The remaining success-forward scene reached migrated0.5.1, actual one-click forward target0.5.2/healthy process, exact target tree and retained synthetic state, but its unchanged final browser assertion recorded one400 and12ERR_CONNECTION_REFUSED messages. Overall FAIL is retained. Original diagnostics omitted request identity; add only bounded API/static-resource path/status/failure/stage/timing, never host/query/auth/body. Keep all browser-error and source/process/network assertions. No product code, deadline, dependency or schema changes; no local runtime. This is evidence collection for a new unresolved browser-error cause, not a green rerun or blanket resource-error exclusion. Remaining source/device and full-product gates stay open.

## T3 first-run evidence and bounded harness correction (2026-10-26)

PR214 source1360c5ce2e55: ordinary CI40433450181 Web/Desktop and Android PASS; dedicated T3 run40433426476 **FAIL,2PASS/5FAIL**, followed by55minute job cancellation because the controller remained alive after all seven result rows were durable. This is not evidence of a55minute migration transaction. Original summary, per-case result/audit/terminal and job log are retained under _validation/legacy-transition-t3-20261026 and _validation/user-host-cloud-20261026; no failed result is rewritten.

Evidence-backed harness fixes only: invoke actual .cmd by its filename from the tool cwd instead of double-escaped absolute quoting; await both log-stream open events before spawn; await and genuinely dismiss the fresh-profile welcome before browser navigation. Integrity rejection and concurrent entry already passed. Launch/health rollback restored the exact old tree, retained the failure terminal and actually restarted the old application, but both remained FAIL because old interactive mode attempted0.0.0.0:7788 and was blocked. Exact pinned public source confirms its supported --headless mode: external CI instrumentation selects it only for hash-attested old-desktop, without archive/config/helper patch or network exception. This proves only supported-headless CI recovery, not old interactive-default LAN acceptance/fix. New target remains interactive. Safety assertions and60000ms product health deadline stay unchanged.

After owned-process cleanup checks and synchronous summary persistence, record only active resource type names and explicitly exit the CI controller with the computed PASS/FAIL code. The first run did not record handle types, so the exact leftover-resource cause is not asserted. CI outer limits tighten to25minute job/15minute runtime step; no timeout extension, retry loop, product bypass, source/dependency/schema/Android-version change or local runtime execution. This is the first evidence-backed correction of these fixture causes; the new exact-source cloud result is still pending. PR213/Dev88/main/Release/OTA/formal data remain frozen; seven phases/42product cases and the full objective remain open.

Correction preflight unit-3/types-3:106actual passed assertions/11files, full TypeScript, three MJS parse checks and PowerShell AST PASS; both new IO-denying audits0events. Public old ZIP downloaded read-only and independently verifiedSHA25614b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf/sourcebec7f9f/95members, without local app execution. Remote PR213 remains40b3a555cb0d Draft/open and main095d6910c34e unchanged at the push precheck. No delta in src/mobile/web/package/lockfile versus frozen40b3.

## T3 separate cloud authorization and finite gate — original pre-execution snapshot (2026-10-26)

Human explicitly approved disposable Windows T3 with the pinned public0.5.0 and synthetic data. New independent branch `codex/legacy-transition-t3-20261026`; PR213/Dev88 fixed40b3a555cb0d, PR212/main/Release/OTA/formal profiles unchanged. No local Java/app/listener/migration, no signing secrets or Android-version change. Seven fixed scenario groups cover actual producer/preview/cancel, integrity/role rejection, running/concurrent protection, successful entry plus browser one-click forward update, asynchronous launch failure and retained60second health failure. Reuse the existing producer/coordinator/transaction helper/selected-state programs and inert publisher; MIT Microsoft node-pty1.1.0 and existing Playwright1.63.0 are CI-temp tools only. Old generated state-program hashes remain identical. Raw synthetic stable tools/targets never upload; only receipt/result/bounded text diagnostics. This is not a stable publication or authenticated real OTA claim. Full gate contract: docs/LEGACY_TRANSITION_T3_GATE.md. Cloud results still NOT_RUN, not PASS.

T3 local source preflight:103PASS/11files, full types, three JS parse checks and PowerShell AST PASS; four offline audits0events. The driver itself was tested to reject outside hosted CI before reading arguments or loading native tools. No change in src/,mobile/,web/,package.json,pnpm-lock.yaml against frozen40b3. New exact-source cloud execution is still required; source checks are not runtime migration evidence.

Frozen40b3 actual evidence is now complete: CI40426885328 PASS; candidate40426878627 all10jobs PASS, including six current-helper/browser scenarios. Linux2581PASS+14conditional skips and Windows2594PASS+1POSIX-permission skip cover2595case occurrences on applicable hosts; Web56/Chromium61/native443 (38Host) PASS; lint0errors/107warnings, fixed signed Dev88 verified. Downloaded actual core/JM ZIP/APK CRC/path/source bytes/binary version/fixed certificate readback PASS. Core0 vs optionalJM167runtime files. Local review ZIP SHA256 ac9bdc9f20651c79a633a7db8d60ce3190f27aeea8b5b988cd67f28d6db42db8. No automatic deployment or real Host/device acceptance. Exact Dev86 predecessor remains unavailable/HOLD; T3 does not rename another package as it. Real Host/second source, persistent native online catalogue/tags/sync/background resume and physical/gesture/tag/AI/sync QA remain open;7phases/42cases not expanded or marked complete.

## Human-authorized Dev88 cloud candidate — pre-execution snapshot (2026-10-26)

Source2ae2550 actual gates: CI40423708291 Web/Desktop+Android PASS; candidate40423702933 source/JVM/Chromium61 PASS. Case-level unit evidence is Linux2580PASS+14conditional skips and Windows2593PASS+1POSIX-permission skip; each host's skips passed on the other host, covering all2594 cases. Native full tests/lint/release shrinker/fixed-signed Dev88 PASS. Windows packaging reached the actual Host Reader subgate and failed its old `downloads=false` capability assertion after separately authorized chapter saving was implemented. Original job121929992271 log is retained; six runtime-choice scenarios were skipped, not PASS. Synchronize that one stale capability with an additional actual packaged chapter-save/consent/inventory/privacy check, then revoke the session, stop the synthetic Host and read both complete pages through the existing local Reader. This changes only CI harness/contracts/documentation, not product/native code, security defaults or deadlines. The new exact source still requires its own full CI/package gates. Vitest JSON top-level passed counters include conditional skips on both hosts; case-level statuses/stdout supersede earlier2594PASS aggregate descriptions, including the prior0ee6dec Linux snapshot (actual2580PASS+14skips).

Downloaded2ae native JUnit XML:443PASS/0FAIL/0skip in59suites, including38Host cases; lint XML107warnings/0errors (not zero warnings), and the existing upstream JM R8 stack-map warnings remain recorded rather than suppressed. New harness preflight95PASS/10files, full types and both JS parse checks PASS, audit0localJava/app/listener events. An initial sandbox esbuild ancestor-read denial is preserved separately; the reviewed Node-only retry passed without changing code or test assertions.

Actual first head ed6e8c7: new Draft PR213/open/draft/unmerged, cloud candidate run40420816195 and CI40420906568. Source full unit snapshot2588PASS/5FAIL: legacy export contract incorrectly froze the whole importer despite the reviewed shared-copier extraction; retain old full authority and freeze unchanged identity/archive/path/raster/inventory regions, plus copier bounds and actual native tests, rather than bless a new whole-file hash. AST Reader lifecycle fixture omitted the newly used hostedDownloadsPanel.refresh port, causing3ReferenceErrors/1dependent timeout; add the inert port and assert calls, no timeout increase or app change. Native actual javac failed on unsupported Android Authenticator.getDefault; remove the desktop-only API, retain cookie rejection/explicit-session header ownership and gate all owned native source against global Authenticator registration. No reflection/global mutation/new transport/dependency. Android public API authority: https://developer.android.com/reference/java/net/Authenticator. The source-ownership invariant is not a sandbox claim about arbitrary third-party in-process code. Original full JSON/native log preserved under _validation/user-host-cloud-20261026; no native tests/build/signing PASS yet, no artifacts deployed.

Second source d61d55d: actual native main compilation progressed past the prior error; unit-test javac then found two unavailable Files.readString calls in the new test fixture. Replace only those reads with existing-compatible readAllBytes + explicit UTF8; preserve every assertion. Original CI40422212263/job121919136184 log retained. Android tests/lint/build are still NOT_ESTABLISHED, not PASS.

Third source0ee6dec: actual lint reached245MissingTranslation errors after compilation, because new values-en/strings_host.xml introduced an explicit English locale while this app already keeps English in default values. Move Host English to default values and Chinese to the existing values-zh-rCN; retain Japanese and all copy/format assertions. No MissingTranslation suppression, baseline or duplicate fake translations. Raw native log preserved. Superseded d61 candidate workflow was deliberately cancelled after its completed source PASS/native compile failure; no cancelled/queued package is counted PASS. The new source must execute actual native tests/lint again.

The human explicitly approved the current independent branch, new Draft, complete CI and unpublished Windows/Dev APK builds. This supersedes the prior cloud-authority blocker, not the unverified product gates. Preserve PR212 at6efc865, main095d691, Dev87/frozen ZIPs and all formal/G-drive data; no merge, tag/Release/OTA, deployment, local Java/app/listener or private-key download.

Reuse existing source/Windows/native tests, packagers and six actual current-helper/browser scenarios in a dedicated exact-branch public/non-PR/read-only workflow. Fixed-signed side-by-side APK versionCode88, not an official version. The old Dev86 application artifact is absent from run40222828902's current artifact list (only source/unit/diagnostics remain); do not rebuild or substitute it as exact prior bytes. Old predecessor-cross-version and accepted one-time migration T3 remain NOT_RUN/HOLD, not waived or counted PASS. Old workflows/tests remain intact. Preflight unit-1 retains one failure: new recipe retention7 violated existing one-day artifact policy; set all new artifacts to1day, do not weaken the existing gate. Actual CI/package/device outcomes are not yet available at this snapshot.

## Android Host failure-path review — no new feature (2026-10-26)

**Source cc92217a614666c15ca6b4e1e91f39e87165fd7a; local codex/android-user-host-recovery-20261026. SOURCE_REVIEW_CLEANUP_FIX / NODE_GATES_PASS / ANDROID_NOT_COMPILED_OR_RUN / CLOUD_AUTHORITY_PENDING / FULL_OBJECTIVE_OPEN.**

- Previous goal turn made actual source/validation progress. Re-read current clean tree and original ZIP, then read GitHub PR212 metadata: still open/Draft/unmerged at6efc865fd229660f77929ebe2018b494fc198995. No PR/workflow mutation or live new job was started.
- Bounded review found a concrete worker Error gap: OutOfMemoryError bypassed start's provisional-session cleanup and task's UI busy reset. Only those two cleanup catches changed; two synthetic native regressions added, no real memory pressure, new feature, timeout/security weakening or general OOM/crash-recovery claim.
- Current13Node contract cases,485PASS/0FAIL/0skip across33files, full types/Web56,4offline audits0events and252Java grammar-only parse PASS. New native count38 plus3 shared importer tests are authored but UNCOMPILED/NOT_RUN. Final receipts bind current code under _validation/android-user-host-recovery-20261026; prior484/ffa54e2 ZIP remains unchanged/historical.
- Context routing NOT_FOUND/claim DPAPI rejection persists; standing goal-scoped isolation only. No local Java/app/browser/listener, real Host/formal data/schema/algorithm/protocol/version/workflow change, push/new Draft/cloud dispatch/Release/OTA/deployment. Fresh cloud authorization for this slice is unanswered; next required step remains actual same-source Android compile/tests/packages, not further feature addition. Ledger7phases/42cases and full goal remain OPEN, user testing NOT_READY.

## P2 Android user-Host — direct source, same Reader and owned chapter (2026-10-26)

**Status: LOCAL_SOURCE_AND_NODE_GATES_PASS / ANDROID_COMPILE_RUNTIME_AND_REAL_HOST_NOT_RUN / FULL_OBJECTIVE_OPEN. Source ffa54e2de0b2e573cc2355991c4f6b78e0ea3ede, isolated local branch codex/android-user-host-20261026. No push/cloud/version/Release/OTA/deployment.**

- User descriptor saved disabled → explicit enable without IO → separate15-minute memory grant → installed-source list → explicit one-source bind → manual search/book selection → existing Android Reader/history. Direct phone-to-user-Host, not Desktop relay. No default host/content, extension install/execution or provider account inheritance. Normal TLS/fixed routes, signed64-string identity, strict JSON/raster ownership and revoke/late-commit guards. Old Permit implements generic Access; three existing IDs/epochs/storage formats unchanged.
- Separate selected-chapter save consent reuses LocalComicImporter/LocalComicStore's copy/validation/generation/AtomicFile publication and original local Reader/library; not another queue or temporary-cache offline claim. Cancellation/failure retains old copies. Foreground single chapter only, no background resume; online references remain bounded session state, not complete persistent native Host catalogue/tags/sync. Host history never falls back to Pica/Desktop; unsupported Host-only IDs are excluded from portable recommendation evidence without modifying rankers/sync algorithms.
- Added36 Android/JUnit/Robolectric and3 shared-importer tests, all UNCOMPILED/NOT_RUN. Node contracts12PASS; final regression-2 484PASS/0FAIL/0skip in33files, full types-2/Web56/56 PASS,8offline audits0events. Isolated Node java-parser3.0.1 parses252 Java files: grammar-only, not JVM/Android/device/package proof. Evidence _validation/android-user-host-20261026, contract docs/ANDROID_USER_HOST_READER.md.
- Local context NOT_FOUND/claim DPAPI failure remains; standing isolated-goal exception, no identity repair. No local Java/app/browser/listener, formal/G-drive data, PR212/Dev87/main/Release/OTA, schema/SDK/version/workflow or ranking/Visual modifications. New cloud authorization remains unanswered; no push/dispatch. Next is exact-source cloud compile/tests, then actual packages/Host, not further feature addition. Ledger7phases/42cases unchanged, user testing NOT_READY, full goal OPEN.

## P2 unified Downloads — same Host tasks, shared view and safe query lifecycle (2026-10-26)

**Status: LOCAL_UNIFIED_DOWNLOAD_PROJECTION_AND_GATES_PASS / ANDROID_AND_REAL_INTEROP_PENDING / FULL_OBJECTIVE_OPEN. Application source6d5ce26f2fbee9dcf199463e433b5b7d3c21c88a, isolated branch codex/user-host-offline-20261026. No push/cloud/version/Release/OTA/deployment.**

- Previous goal turn implemented and verified actual Desktop saves; this turn closes its explicit unified-entry gap. The same ephemeral session jobs appear in Downloads through fixed current-session ports, with shared DOM rendering and separate persistence/count semantics. No second task queue, scheduler, download table, provider startup, retry/enqueue or legacy job-action delegation. Volatile scope exposes only ID/expiry, never credentials/CSRF; saved copies route to the existing local Reader.
- Local Memory context NOT_FOUND/claim DPAPI rejection remains; standing isolated-goal exception, no identity/secret repair. Status/cancel are already synchronous local controls, so validate their signal/authority without remote-reading withSignal's disconnect→session-end rule. Verified that aborting their reply preserves unrelated confirmed tasks; a deliberate cancel targets one job. Metadata/page requests retain prior lifecycle and access rules.
- Controller stops/fences work on view/hidden-tab/modal/page/scope/dispose changes, refuses stale results/detached buttons, never restores a grant on page return, and does no query without current authority. Shared renderer validates full snapshots/complete-copy identity before publishing safe text/DOM, with separate Host data attributes so old SQL queue controls cannot claim these rows. New inert test loader executes actual local modules/dependencies, not a mocked renderer.
- Final regression-2:472PASS/0FAIL/0skip in32files;17projection cases,19save-service cases, full types-3 and web-3's56/56syntax PASS,9offline audits0events. Earlier unit-1 and regression-1 are successful historical snapshots, not renamed final results. Actual app markup/port/visibility wiring is statically checked, not run in a browser. Evidence remains _validation/unified-host-downloads-20261026. No runtime listening, Java, app, browser, real provider/Host or formal data.
- Existing Host scheduler/store, LocalInventory/SQLite schema, Reader/download engines, platform/native/signing/version/workflow and ranking/Visual unchanged. Android source is under mobile/android-alpha2; current ReaderSource/ReaderSourceFactory were inspected read-only and lack a user-Host route. Next is that real native integration through existing modules, followed by separately authorized exact-source cloud/device acceptance; no Desktop-relay or cache-only shortcut. Ledger stays7phases/42cases; user testing NOT_READY and full goal OPEN. Frozen PR212/Dev87/main/Release/OTA/G-drive/formal data unchanged.

## P2 S2 Desktop host saves — explicit selection, shared scheduling and durable local Reader (2026-10-26)

**Status: LOCAL_DESKTOP_SAVE_FLOW_AND_OFFLINE_GATES_PASS / UNIFIED_DOWNLOAD_PROJECTION_ANDROID_AND_REAL_INTEROP_PENDING / FULL_OBJECTIVE_OPEN. Application source7a81e12f53685a1edfc221c97f92766906bd1ae1, isolated branch codex/user-host-offline-20261026. No push/cloud/version/Release/OTA/deployment.**

- Previous turn committed and verified the actual local storage foundation, not merely a plan. Continues it into Desktop chosen Host → selected chapter → separate save consent → progress/cancel → same local Reader. Local context NOT_FOUND/claim DPAPI failure remains; standing isolated-goal exception only, no coordination identity/secret repair, app/Java/browser/listener or production data.
- Reuses DownloadScheduler/state-machine/MediaRequestGate/balanced media spacing, shared RuntimeResourceCoordinator and LocalLibraryIngestion; no second downloader/Reader, copied upstream implementation or new dependency/schema. Host jobs do not enter the old platform SQL queue (which would create platform placeholder comics/events); they are ephemeral per-session adapters. Active work blocks update/engine switching; shutdown awaits task cancellation/cleanup before SQLite close.
- Original browse/read permission cannot save. Additional consent, actual listed chapter and current principal/source/book/chapter checks precede execution. Bounded20active/50temporary tasks, same15minute grant, serial importer publication, explicit manual retry, no persisted task/credentials/URL or restart auto-network. Existing2000page/512MiB book and20MiB page limits stay visible. Completed copies remain after revoke; source and local progress are separate. Duplicate active clicks coalesce, explicit subsequent confirmation can replace; failed replacement preserves the complete prior copy/favorite/progress. A late cancel cannot misreport a committed healthy copy as unwritten.
- Final regression-3:453PASS/0FAIL/0skip in31files; new service17 + inert actual-module UI8 assertions, full types-4 and web-4's54/54syntax PASS, all12offline audits0events. Covers actual synthetic SQLite/files/Reader reopen, queue/resource cancellation, revoke/expire/close, duplicate/limit/ownership/error isolation, retry, failed replacement and late-commit cancellation. First regression-1 retains445PASS+4FAIL: new UI fixture used reversed zh/en indices; fix the fixture against actual copy(zh,en,ja), not product locale/security/deadlines. Source emitted graph proves existing scheduler/gate/state-machine reuse and no concrete SQL/fs/provider/process dependency.
- One real-HTTP→save→local-Reader test added and typed in CI-only source-host-api.test.ts; NOT_RUN locally or in new CI. Evidence remains _validation/host-download-flow-20261026. Core inventory/database/Reader/scheduler/resource implementation, version/Android/dependencies/workflow and ranker/Visual unchanged. Main/PR212/Dev87/formal/G-drive data remain untouched.
- Ledger stays7phases/42product cases. Host task UI is not yet projected onto the unified download page; do that without another scheduler/store, then Android source/Reader/offline integration. Real Host/second source, exact-source packages/browser/native/device evidence and R1/T3 remain OPEN. No user test handoff or complete-goal claim.

## P2 S2 user-host offline — shared local storage foundation (2026-10-26)

**Status: LOCAL_STORAGE_FOUNDATION_AND_OFFLINE_GATES_PASS / HOST_JOBS_UI_ANDROID_AND_REAL_INTEROP_PENDING / FULL_OBJECTIVE_OPEN. Application source76bee26a41e096a74acb89d5a6f7a1023b2cb778, isolated branch codex/user-host-offline-20261026. No push/cloud/version/Release/OTA/deployment.**

- Continued the interrupted validation rather than restarting live work: regression-1/types-2 had already completed successfully. Final formatted source reran regression-2/types-3. Local Memory context/claim remains NOT_FOUND/DPAPI denied; standing goal-scoped isolated exception only, no identity/secret repair or memory promotion.
- Adds a source-neutral generated-chapter port to existing LocalLibraryIngestion, not another Reader/download/publication engine. Same LocalInventoryV1 and actual SQLite atomic transaction group chapters in one stable local book; append/replace retain IDs, favorites and applicable progress. Optional order hints require no SQL schema or old folder/CBZ format migration. Page producer owns no URL, credentials, network or scheduler in this module.
- Verifies existing owned pages before local copying; bounded raster/bytes/count/hash/path validation, exclusive generation creation, guard-before-publication and in-process stale-revision rejection. Fetch/cancel/save failure removes only this uncommitted generation and preserves prior DB/files. Postcommit revocation does not undo an accepted local copy; failed old-generation cleanup retains both safely. No cross-process CAS, complete Host download job or native offline claim.
- Final422PASS/0FAIL/0skip across28files, including21new actual temp-SQLite/Reader/PNG cases; full types PASS;6offline boundary audits0events. Database reopen/source-unavailable reading, stable grouping/progress, shortened chapter, late cancellation, actual transaction rollback, corrupted paths/hashes, collision and stale-writer cases are covered. Evidence remains _validation/host-offline-storage-20261026; no local app/Java/browser/listener or real provider/formal data access.
- Source/API capabilities intentionally still downloads=false/native=false. Next finite S2 step: explicit save consent, existing DownloadScheduler/MediaRequestGate, async progress/cancel/status and this storage port, then Android. Ledger remains7phases/42product cases, not expanded by unit-test count. R1/T3 cloud, real Host/second provider, issue/tag/AI/gesture/sync/device acceptance remain OPEN; user testing NOT_READY. PR212/Dev87/frozen packages and G-drive/formal data unchanged.

## P2 user-host source search/read — actual separate grant, shared engine (2026-10-26)

**Status: LOCAL_SOURCE_SEARCH_READER_AND_OFFLINE_GATES_PASS / HOST_DOWNLOADS_ANDROID_AND_REAL_INTEROP_PENDING / FULL_OBJECTIVE_OPEN. Application sourceb85deefd835d1aa661c6640115933de8bf737e93, isolated branch codex/user-host-source-browse-20261026. No push/cloud dispatch/version/Release/OTA/deployment.**

- Previous goal turn made actual source/test progress; interrupted exec cell1324 was missing and no unit-2 receipt existed, so no live test was restarted. Resumed the same code and retained original unit-1 failures. Local context routing NOT_FOUND/claim DPAPI rejection remains; standing goal-scoped isolated exception only, no broker identity/secret repair or memory promotion.
- Closes one real P2 implementation gap: Desktop saved user host → separate catalogue-side-effect consent → installed-source list → explicit immutable single-source binding → search/pagination → selected metadata/chapters → SAME main Reader/cache/progress. Existing inspect-only/library-only grants do not gain search. No mandatory host, default repository/catalogue, source auto-enable, extension interpreter or alternate Reader/downloader.
- Reuses official pinned Suwayomi2.4.2366 FetchSourceMangaInput and FetchMangaAndChaptersInput. Four raw GitHub protocol blobs/hashes verified, no implementation copied/run. Search modifies the user's host metadata, so additional consent is explicit. Canonical64-bit source IDs remain strings, actual listed choices only, expiry/revocation/late-result and existing bounded transport/CSRF/TLS rules apply. Unknown fields/mixed source or reused row results refuse; library sessions validate inLibrary even for stored search refs/cache. No atomic remote-CAS guarantee is claimed.
- New protocol/service14 + actual inert UI6cases; source suite181PASS/12files. Current-source combined host/Reader/update/translation regression380PASS/0FAIL/0skip across23files, full types/Web54 and CI-helper parse PASS,12audits0boundary events. The new real-listener API and compiled-Windows host-source journeys are authored/typed/parsed but NOT_RUN. No local application/Java/browser/listener, real-host/body/credential/account/production database access.
- Retains unit-1's12fixture contract failures (missing required allowInsecureLan=false) and1premature disabled-read-button test click; fixed the fixture and actual readiness oracle, not production validation/busy locks/deadlines. types-2's explicit header-record inference corrected without an any-cast. Source-bound receipts/logs remain _validation/user-host-discovery-20261026; no synthetic installer promoted.
- [Single ledger](docs/LOCAL_READER_DELIVERY_LEDGER.zh-CN.md) stays7phases/42cases. SRC-05 still lacks Host downloads/offline and Android; SRC-06 real second-source integration remains unverified. Next local work reuses existing download/native Reader modules rather than declaring this slice complete. R1 cloud attribution, T3 real migration/forward-update, issue/tag/AI/gesture/sync/provider/device acceptance remain OPEN. Frozen PR212/Dev87 and formal/G-drive data unchanged; user testing NOT_READY.

## Legacy transition T2 — bound independent entry delegates to current engine (2026-10-26)

**Status: LOCAL_IMPLEMENTATION_AND_OFFLINE_GATES_PASS / TRUSTED_PRODUCER_AND_REAL_WINDOWS_T3_NOT_RUN / FULL_OBJECTIVE_OPEN. Application source514e44d41f7199db1ddc61a12bbf1576502aca76. No push/cloud dispatch/migration/deployment.**

- Implements the accepted one-time transition, not another roadmap or replacement engine. Adds exact clean-checkout/pinned-old-ZIP/target-hash/source/provenance binding, actual cmd→CJS entry and preview/confirm flow. Packs target-matched independent Node/helper/payload/notices; rejects historical PS builder use for0.5.0, source/env authority injection and output overwrite. Review/noninteractive entry stays read-only. Real trusted producer execution and human terminal acceptance remain NOT_RUN.
- Reuses full-archive/staging and startUpgradeHelper readiness/nonce/ACK; all replacement, user-state snapshots, launch/health/recovery remain the existing full-upgrader. Requires user to close old app; read-only bounded hidden CIM checks selected-app and profile-instance identity, never arbitrary PID termination. Unknown/denied ownership refuses. Confirmation-gated exclusive write probes and complete post-preparation revalidation precede handoff.
- Same helper repeats old-tree/profile-config/process proof after coordinator exit, before snapshot or replacement. Installation-level exclusive nonce lock prevents two different work directories from taking the same installation. Unknown helper/replacement exit retains lock/recovery assets; only proven safe completion/recovery releases its own lock. Does not alter database/schema, ranking/Visual, source activation, sync, Android/signing, versions or workflow.
- Final unit-5:199PASS/0FAIL/0skip across11files,36new coordinator/producer cases; types-5 complete TypeScript PASS;10offline audits0boundary events. Actual CJS artifact bytes/checksum/preview and detached Rollup helper self-containment/no-instruction startup checked. Temporary synthetic app/config/DB transaction tests use fake process/OS/health ports, not real Windows migration, full producer release, runtime processes or devices.
- Retains unit-1's188PASS+1 helper third-party-dependency gate failure and types-2 control-flow errors. Fixes the dependency boundary by extracting pure Node identity, without loosening the standalone/license assertion; outer entry reuses verified target notices and checks compiled dependencies. Fixes never-return function declaration; raw logs and final receipts remain in _validation/legacy-transition-coordinator-20261026. No temporary fake installer is promoted/delivered.
- [Single delivery ledger](docs/LOCAL_READER_DELIVERY_LEDGER.zh-CN.md) remains7phases/42product cases. Next finite task is separately authorized T3 disposable Windows production/entry/cancel/rejection/launch/health/concurrency/forward-update evidence. PR212, old immutable failure results, main/Release/OTA/G-drive/formal data stay unchanged. User testing is still NOT_READY; source/reader/tag/device/full objective is not replaced by updater test counts.

## Legacy transition T1 — actual read-only preview and shared package validation (2026-10-26)

**Status: LOCAL_CODE_AND_TARGETED_GATES_PASS / BUILD_BINDING_AND_EXECUTION_PENDING / FULL_OBJECTIVE_OPEN. Source045587d746e1664a639f7e0ed427d86135e2a87f, no push/build/deployment/migration.**

- Implements the accepted route's T1 module and actual CLI, not another planner-only interface. Extracts the existing full-archive validator unchanged for both UpdateManager and preflight; reuse Desktop/SQLite disk-path and package asset/composition contracts. No new dependency, database/schema, model, ranker, source provider, Android/signing, application version or workflow change.
- Read-only exact source-tree/target ZIP/independent-engine identity, CRC, profile/path-role separation, canonical-path review, existing-backup and denied-access handling. Default CLI is unbound and rejects before file access; no user JSON/--manifest/--apply/env authority. Every returned preview has canApply=false and requires later revalidation; target provenance is expected build context, not claimed live publisher authentication.
- Final local unit-6:127PASS/0FAIL/0skip across7files,29new preflight cases including real compiled bound/unbound CLI; types-3 PASS. All nine unit/type phase boundary audits0events. Existing update-manager/full-orchestration/component and prior translation regressions pass; simulated transactions use owned synthetic temp files/fake processes only, never installed applications or formal data.
- Preserve unit-1..4 and types-1 failures. The full CLI's misleading missing-launcher diagnosis came from bundled AdmZip's instanceof Uint8Array against native fs Buffer in another VM realm; confirmed dependency line and an explicit counterexample, fixed the fixture's byte/Node intrinsic contract, not package validation. The temporary diagnostic-only altered bundle was not acceptance and is absent from final source. No timeout/skip/security weakening.
- T1 does not deliver an authenticated migration bundle or execute any transition. Next finite work is T2 trusted distribution/target binding and actual coordinator using existing startup/transaction engine, then separately authorized T3 synthetic cloud proof. [Current single ledger](docs/LOCAL_READER_DELIVERY_LEDGER.zh-CN.md). Known old first-hop failures, R1 cloud attribution and real source/device/gesture/sync/full-product gates remain open.

## P0-R2 — legacy transition route accepted, bounded compatibility decision (2026-10-26)

**Status: HUMAN_ROUTE_DECISION_CONFIRMED / IMPLEMENTATION_NOT_STARTED / NO_MIGRATION_EXECUTED / FULL_OBJECTIVE_OPEN. Read-only feasibility, documentation only.**

- Human explicitly accepts one independent first migration entry for old v0.5.0, automatic identity/data protection instead of manual file copying, then normal in-app one-click updates. No deployment/migration execution is authorized by this workflow choice. Keep the full goal and42cases; do not require endlessly repairing an immutable old helper, relabel its failed checks or silently weaken recovery.
- Re-read pinned public archive SHA14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf/sourcebec7f9f:93files, no standard Velopack install markers. Official integration requires real installation/startup handling. This is archive/document compatibility evidence, not actual Velopack install testing or inspection of user installations; no SDK/build/dependency added.
- Parse-only AST of existing fallback template SHA537483d4295d0adf8fa57afa01a3f8f7b3baeb969bece35fd5bb23652517ed2a:0parse errors, fixed formal data root and no post-Stop-Process exit verification before restoring state in Rollback-Upgrade. No script body, forms, process control, backup or restoration executed. Do not rebrand the old PS engine for isolated RC migration.
- Chosen route reuses current full-upgrader/process-lifecycle/user-state-snapshot/helper-startup, not a third engine or immediate Velopack migration. The existing manager chooses helper bytes from the installed applicationRoot, so a new external coordinator needs explicit verified self-package authority, not a renamed old registration call. Actual helper reuse/handoff is not proven by this source analysis.
- [Single ledger](docs/LOCAL_READER_DELIVERY_LEDGER.zh-CN.md) fixes three work items: T1 readonly identity/path/data-profile preview; T2 actual independent entry with old-process proof and existing engine handshake; T3 separately authorized disposable cloud scenarios and forward updates. Next safe work is T1 with synthetic files/inert ports. R1 cloud attribution and physical/source/sync/gesture acceptance stay open; no user test package, push, version/tag/Release/OTA/G-drive/formal data change.

## P0-R1 — idle translation request defect, first bounded local correction (2026-10-26)

**Status: LOCAL_DEFECT_REPRODUCED_AND_FIXED / OFFLINE_GATES_PASS / ACTUAL_WINDOWS_ATTRIBUTION_PENDING / LEGACY_RECOVERY_HOLD / FULL_OBJECTIVE_OPEN. No push/build/deployment.**

- Continues documentation checkpoint c9a9926 on independent local branch codex/reader-source-idle-boundary-20261026; sealed application source229330e85657f6fdee54d5ec5620c91330b74ccb. Coordination claim still fails DPAPI; standing isolated-goal exception only, no secret/identity repair. PR212/frozen packages and formal/G-drive data are untouched.
- Execute the whole original parity script with inert browser/locale ports, not isolated invented loader code. Original unit-2 has31PASS+2real regression failures: four automatic translation fetch attempts at boot, six after language rebuild. This proves an actual idle-network defect; old Windows events still lack target/protocol attribution and remain FAIL, not retroactively proven.
- Narrow correction: explicit optional GitHub translation action, fresh passive source-policy check, disabled/unknown policy refusal, one bounded single-flight request, abort on local source/dropdown change, atomic/late-result-safe maps and retry only by new action. Canonical tags remain usable. No source activation, account/SDK/DB/schema/ranker/Visual/sync/native/version changes. Cross-window immediate revocation is not established by these local events.
- Existing Windows gate retains exact blocking/empty-event assertions and unchanged deadlines. New enum-only request categories can identify known translation endpoints without logging arbitrary URL/host/path/query/credentials. Actual browser route execution remains pending; no local browser/app/Java/listener.
- Final unit-3:54PASS/0FAIL/0skip across4files, including23new actual-module/classifier cases; full types PASS, Web54/54 PASS, every runtime guard audit0events. Preserve unit-1's pre-test sandbox/esbuild failure and unit-2's actual counterexamples. [Scope, retained evidence and remaining gates](docs/SOURCE_IDLE_TRANSLATION_FIX.md).
- Update the single ledger and acceptance entry, not another Dev package. P0-R1 remains cloud-PENDING after its first local correction. Next safe local work is P0-R2 read-only/pure-simulation old-controller transition feasibility; no new updater or UI scope and no change to legacy rollback HOLD.

## P0 — consolidated product plan and acceptance ledger (2026-10-26)

**Status: BASELINE_AND_CASE_INVENTORY_RECONCILED / P0_RISK_DECISIONS_OPEN / FULL_OBJECTIVE_OPEN. Documentation-only local branch; no application change/build/push/release/deployment.**

- Human requested a whole-product plan informed by maintained open source, not another isolated patch. [The single delivery ledger](docs/LOCAL_READER_DELIVERY_LEDGER.zh-CN.md) now binds seven phases and 42 concrete cases to existing implementation, missing capability and separate engineering/provider/device/user evidence. Corrects the Dev83-era entrypoint while retaining immutable historical records. No new Dev version or second runtime/framework.
- Application source remains PR212 / 6efc865fd229660f77929ebe2018b494fc198995. Re-read run40305007546: completed/failure; source, windows-unit and fixtures succeed, all six transactions fail. Downloaded/read all six small result artifacts, no new synthetic/application ZIP: each reaches the final unexpected-browser-request assertion, with4events per single-launch scenario and16 for roundtrip. This identifies a shared next diagnostic, not six proved updater defects or six PASS gates. Actual request destination/scheme remains unknown. Static translation rawFetch startup calls are a hypothesis requiring attribution; no allowlist relaxation.
- PR203 head9a68d13 is a proven ancestor. GitHub compare confirms independent PR196 diverged (ahead335/behind29, common f382413f); do not claim its patches integrated or absent purely from ancestry, and do not merge recommendation-cap changes wholesale. Match its UX issues to individual cases. Rehashed Dev87 review ZIP unchanged at6d68de38ba68fb0b2e7a16825df5d8d5146c2b70e69a5b36383e171c507ef2cd.
- Reuse decisions retain optional version-bound Suwayomi, existing JM SDK and current Reader; Mihon/Komga guide workflow, Velopack only a bounded migration evaluation. Host existing-library reading is explicitly not full search/download/native integration. AI exchange remains Desktop file workflow plus confirmed-rule phone sync, not a claimed native parser. Source/Reader/tag/recommendation/sync boundaries and raw-fact/Visual safety remain unchanged.
- Local Memory fallback could not route the initial intent; the explicit pica_library claim then failed DPAPI. Human's standing target-scoped isolated exception is used without identity/secret repair, Formal/Global writes or repeated permission prompts. New local documentation branch stays outside frozen PR212; existing cloud jobs were only read/downloaded, not restarted.
- P0 is not DONE: risk P0-R1 (common request attribution/source compatibility) and P0-R2 (supported old-controller migration/recovery) must close under bounded evidence-backed iterations. Next safe action is P0-R1, not full CI rerun, app deployment or more interface extraction. User testing remains NOT_READY; old v0.5.0 rollback HOLD, missing source capabilities, physical/OEM/manual/scientific gates remain OPEN.
- Documentation-only verification passed:42unique/sequential cases across8groups,7actual phase rows,15local links, all6downloaded result SHA256/source/scenario/failure fields, trailing whitespace and Git diff checks. This is ledger/evidence consistency, not application tests or readiness. Local diagnostic index remains outside the Git source commit.

## Runtime-choice cloud execution — human-authorized pre-build snapshot (2026-10-26)

**At source creation: INDEPENDENT_DRAFT_AND_WINDOWS_TESTS_AUTHORIZED / CLOUD_TERMINAL_RESULTS_NOT_YET_AVAILABLE / LEGACY_RECOVERY_HOLD / FULL_OBJECTIVE_OPEN.** This is explicitly a pre-build snapshot, not a live CI result; exact-head execution receipts and the new Draft's post-build report must supersede it after actual execution.

- The human explicitly approved pushing local source `01d08bd0a622f85d94680811eca0a39c913ff5a4` to a new independent Draft and disposable hosted Windows tests. Frozen PR211/Dev87, PR210/Dev86 and the134-file source-review ZIP (SHA256 `6bc4cc9211d991d53c96b4597d3e08db89d8eb529acdf24adfa112a3b9256b2e`) remain unchanged. Independent .NET all-member/hash readback passed. No local Java/application/browser/listener.
- Add only a dedicated exact-branch read-only Actions workflow: full source/Windows tests, existing actual core/JM fixture builder and all six independent actual-browser/HTTP/current-helper scenarios. No Android version/signing change or signing Secrets, no main merge, tag/Release, OTA or deployment. Marked synthetic ZIPs remain diagnostic inputs, never user installables.
- Workflow/source preflight:10files/124PASS, full TypeScript PASS, YAML/four PowerShell fragments parse-only PASS, zero offline boundary events. These are preparation, not real transaction results. Old0.5.0 recovery failures and all user/source/device/full-goal work remain open. [Scenario contract](docs/RUNTIME_CHOICE_TRANSACTION_GATE.md).
- First actual dispatch: Draft PR212/head3c3b6c63ac2151c8b10771232b85a0aa01ce3234, run40300517335. Source job121496953216 FAIL:2383PASS+14conditional skips+1failed existing workflow-entrypoint security assertion; the new workflow omitted its explicit public-repository artifact guard. Fixtures/transactions dependency-SKIPPED, not tested or PASS. Windows-unit was still running when this corrective source snapshot was prepared; preserve its actual eventual result. Add `github.event.repository.private == false` to every new job and strengthen the new recipe check, not weaken the existing assertion. Corrective offline11files/132PASS, types and four-fragment parse pass with0guarded runtime attempts. No product/Android/deadline change or frozen-PR edit.
- Run40301266088 / b655e5f is terminal **FAIL**: Linux2384PASS+14conditional skips, Windows2397PASS+1conditional skip, Chromium61 and actual marked core/JM pair build PASS; all six transactions fail at the shared pre-transaction readiness check. Its flat composition assertion necessarily rejects the actual Desktop API envelope `{status:'declared',composition:{...}}`. A real installed-status-parser regression proves the incorrect oracle and now requires the exact declared envelope, still rejecting legacy/invalid/wrong composition, wrong versions, missing ready/token state and unchanged replacement identity. Correct only the external gate; no product/helper/deadline/retry change. Add bounded public readiness flags and the owned synthetic Desktop log for future failures, never raw status/token/header/config/DB exports. Offline11files/134PASS, types and four-fragment parse pass with0guarded runtime attempts. Raw six failures and downloaded marked input ZIPs are retained; no replacement/rollback success is inferred. Fresh exact-head execution is required.

## Runtime-choice transaction gate — isolated local continuation (2026-10-26)

**Status: LOCAL_SOURCE_AND_OFFLINE_GATES_PASS / ACTUAL_WINDOWS_BROWSER_RUN_PENDING / LEGACY_RECOVERY_HOLD / FULL_OBJECTIVE_OPEN. No push, release or deployment.**

- Continues frozen PR211 `e9b08b418c2fdbc55dbf499afb74f7b927b12434` on independent `codex/reader-runtime-transaction-gate-20261026`. The previous status-only turn made no implementation progress; this slice authors the actual six-scenario package/browser/HTTP driver, paired real-package fixture builder and external boundary, without adding a user-facing feature or another updater. Standing isolated-goal exception continues after NOT_FOUND/DPAPI claim rejection. No local Java/application/browser/listener or production/G-drive access.
- The synthetic stable-version pair is explicitly NOT FOR INSTALLATION and built/restored through the existing packager, not patched compiled code. Reuse the selected-state SQLite/config/download canaries with a separately confined temp-root identity; keep legacy first-hop wrapper compatibility. Preserve original request/health/recovery policies and raw failures.
- Actual callback over a real Node memory stream exposed one product defect: an oversized runtime command destroyed the request before its error reply. Preserve `unit-5` FAIL; a narrow route correction reuses the existing safe body-reader mode and connection-close reply without relaxing4096bytes/5seconds/Origin/CSRF. Parse failures use bounded fixed text; virtual tests share actual JSON/Error intrinsics rather than masking same-realm behavior. Post-fix offline results do not establish hosted browser/rollback acceptance.
- Final offline `unit-10`:23files/296PASS/0fail/0skip; full TypeScript `types-7` PASS, new MJS syntax checks PASS, actual pwsh builder parse/early-refusal PASS, all local boundary audits0events. Explicit Windows C:/D: path-port tests align browser-tool containment with hosted RUNNER_TEMP rather than incorrectly assuming it equals os.tmpdir. Retain earlier type-check failures and the one genuine oversized-stream regression instead of deleting/relabelling them. Six previous frozen ZIP hashes independently rechecked unchanged, including Dev86 and Dev87. No new installables were built.
- [Exact scenario acceptance, safety, invocation and evidence limits](docs/RUNTIME_CHOICE_TRANSACTION_GATE.md). Current offline results belong only to this local source; actual hosted execution/new installables remain pending and need their own evidence. No workflow, Dev version, frozen artifact or PR changes are included.

Next bounded closeout order: (1) separately authorized six-scenario real package/browser/HTTP run with failures retained; (2) supported safe old-client transition/recovery, not manual extraction or current-helper substitution; (3) freeze one-source installables/evidence and reconcile the grouped user acceptance checklist. Broader source-neutral/trust/native/sync/backup requirements remain explicit full-goal work, not secretly added UI features or declared complete by this checkpoint.

## Core / optional runtime and upgrade — authorized Dev87 cloud candidate (2026-10-25)

**Final checkpoint: e9b08b4 CURRENT_SOURCE_CI_AND_PACKAGES_VERIFIED / CANDIDATE_SPECIALIST_RUN_FAIL / LEGACY_FIRST_HOP_HOLD / FULL_OBJECTIVE_OPEN. No merge, release, OTA or deployment.**

- Post-build correction (2026-10-26): exact source `e9b08b418c2fdbc55dbf499afb74f7b927b12434`, Draft PR211, actual core/JM ZIPs and fixed-signed Dev87 APK are verified. Linux2349pass+13conditional skips / Windows2361pass+1conditional skip cover all2362 cases on an applicable host; Chromium61, native402 and current-helper nine replacement/recovery scenarios pass. This supersedes only the old top-level build-PENDING label, not historical failed runs below.
- Actual run40274664757 remains **FAIL**: old public v0.5.0 normal first hop and hash rejection PASS; health rollback FAIL with EPERM and old application not ready; asynchronous launch rollback FAIL with old helper exiting1 without terminal/recovery state. No helper substitution, consumed exception, timeout relaxation or waived failure. Earlier2433e39 settings timeout cause stays UNDETERMINED despite a later successful observed DPAPI call.
- Independently verified 254-file handoff `PICA_CORE_RUNTIME_DEV87_CLOUD_REVIEW_20261025_e9b08b418c2f.zip`, SHA256 `6d68de38ba68fb0b2e7a16825df5d8d5146c2b70e69a5b36383e171c507ef2cd`, remains a **PARTIAL unpublished review candidate**, not whole-goal acceptance. It excludes private data/keys and synthetic stable-version install fixtures. PR211 and frozen bytes remain unchanged.

- Human approved independent Draft/Actions/existing signing Secrets after the blocked local goal. `codex/reader-core-upgrade-dev87-20261025` continues sealed `555953600144d4e645b52155789f2bd3e6202f65`, stacked on frozen PR210 head4a18ba; PR210/Dev86 and previous archives remain unchanged. Remote main was inspected, not merged. DPAPI write claim still fails; standing isolated-goal exception continues without secret/identity repair.
- Adds only necessary exact branch allowance and Dev87 candidate authority to existing workflow. Builds both actual core and optional-JM ZIPs, uses composition-aware nine-scenario current-helper recovery recipe, and pins actual Dev86 push-run40222828902 Windows bytes/source. No predecessor substitution or formal data/native/schema/version/dependency change.
- Exact old-controller first-hop now has four independent real CI scenarios with fail-fast:false, genuine failures retained and no continue-on-error/helper substitution. Marked synthetic stable-version fixture remains separate and must never be installed or promoted. Existing Android tests/lint/shrinker precede fixed signing; package/certificate/version are verified, not bypassed.
- Pre-push selected offline gate382/382 cases across37files,0skips; strict types/Web54 and YAML/seven PowerShell fragment parses PASS, zero guarded boundary events. These do not establish remote CI/package success. No local Java/application/browser/listener was started.
- First push11803b1 / Draft211 / exact candidate run40263811750 failed the full Linux suite at the Windows-only java.exe fixture's host-availability assertion; type/Web passed, build/source-JVM/browser and dependent Windows/Android jobs did not run. Raw linux-unit JSON is retained. Product correctly selects java.exe on Windows and java on other hosts; separate Windows composition from host executable presence, retain both assertions and add missing/present-host differential. Do not fix it by changing product OS selection, adding skip or weakening source/runtime guards. Standard PR CI40263858773 observes the same old-source failure independently.
- Source2757c86 passed standard CI40264571737, source-JVM/real Chromium, Linux2342 passed+13 conditional skips and fixed-signed Dev87 native402/402; actual APK/compiled manifest/certificate independently read back without local Java. Its candidate run40264567639 then failed Windows full tests at four new harness/encoding cases (2350pass+1skip+4fail); package/legacy gates never ran, so neither is PASS. Preserve raw Windows JSON/logs and the older APK as historical-only evidence, not current-head promotion.
- Windows corrections: two unit calls now stub/assert the OS cwd port instead of changing worker-global cwd; pure build-choice probe uses the actual CI pwsh engine with unchanged10s deadline and explicitly rejects process timeouts. Real CP1252 parse regression traced to new literal Chinese in a BOM-less ps1: reuse existing Base64 README pattern, preserving identical Chinese output and ASCII-safe source. Actual PS5 parse-only UTF8/old-CP1252/fixed-CP1252 differential is0/3/0 errors. Selected thread-pool384/384/37files plus strict types/recipe parse pass, zero guarded runtime events; no actual local application/Java/listener or timeout relaxation.
- Exact df6d78d candidate run40266585484 passed source/browser/native but Windows full suite retained two unfinished legacy-PowerShell subprocess failures (2353pass+1skip+2fail); previous worker/encoding cases no longer fail. Preserve raw result; do not call it a package failure because packaging never ran. Align the remaining probes with actual CI pwsh and assert no process error/null exit, keeping10s. Full Windows tests move to an independent mandatory parallel job (same full inventory/deadlines, no continue-on-error), so actual ZIP/runtime evidence can accumulate without serially waiting; overall acceptance still requires both and old first-hop gates. No source/account/schema/algorithm or release-boundary relaxation.
- Source6d539d7 / run40268737492 reached actual Windows core/JM builds and all nine existing replacement/recovery scenarios successfully, Chromium61 and fixed-signed native402/402 also passed. Independently read back both ZIPs, exact source/composition/tag assets/CRC and APK manifest/certificate; no local runtime or installation. Full Windows2355pass+1conditional skip and Linux2343pass+13conditional skips cover all2356 assertions across applicable hosts, with0uncovered and0failures. Overall run remains FAIL: all four old-client scenarios failed before app launch because createWriteStream fd was still null at spawn, so none establishes a first-hop product outcome. Preserve their raw FAIL reports. Await actual stream open in the external test harness, and exercise that exact setup block with a harmless Node child/log readback; selected offline385/385 plus strict types pass,0guarded runtime events. No application/helper bytes, deadlines, scenario inventory or publisher checks are changed; require fresh exact-head cloud gates and artifacts, not relabelled6d539d7 packages.
- Source2433e39 / run40270855529 passed source/Chromium, full Windows unit and fixed-signed native gates, but actual Windows smoke timed out at its unchanged15s synthetic settings-save request (line198); downstream legacy cases were dependency-skipped, not PASS. Retain full raw log; no claim that DPAPI/provider/network is the cause without evidence. Add an external hosted-CI-only observer recording synchronous process start/end, elapsed/status/error-code and DPAPI operation flags, never arguments, stdin/out/err, env, config, credentials or DB. It preserves original results/errors and has no product timeout/retry/credential behavior change. Move the exact synthetic first-hop fixture to an independent required source-dependent job, so Windows/account smoke cannot conceal the four real old-controller outcomes; all existing gates remain mandatory and failures retained. Initial new simulated observer test correctly rejected a noncanonical mkdtemp root; fix its fake temp port/owned child, not the real guard. No application/native/schema/algorithm or published state changed.
- Source84f54a4 / run40272693245 actually executed the independent old-controller chain: hash-mismatch PASS preserves the original tree/state and starts no helper; launch-rollback FAIL reaches the exact old helper and injected async error but it exits without terminal/recovery status; health-rollback FAIL reports rollback EPERM and never restores a ready0.5.0; normal success FAIL is an unexplained fetch failure before publisher observation. Keep each raw result, not a blanket PASS or inferred cause. Add observation-only uncaughtExceptionMonitor/exit and bounded failure-step/cause-code fields, not exception consumption, transport retry or helper replacement. Windows smoke separately failed before instance publication because the test observer's raw Windows backslashes are escaped by NODE_OPTIONS; actual local no-app differential finds module-not-found for the old spelling and the existing early CI-refusal guard for forward slashes, with entry never executed. Use portable separators and retain a failure receipt even if observer never initialized. Product credentials/process timeouts and15s request deadline remain unchanged; original2433e39 settings-timeout root is still UNDETERMINED. Selected offline390/390/38files, types and10PowerShell fragments pass with0guarded runtime events.
- Run40272693245 full Windows units retained2358pass+1skip+1fail: the new simulated process observer passed containment inputs with a different temporary-path spelling than its native realpath root. Canonicalize that test's own created directory before deriving descriptor paths; preserve the actual observer's containment checks unchanged. This is not a product credential fix or a reason to waive the failed run. Preserve all raw Windows JSON/logs and require a new exact-head result.
- [Authorized scope, actual wiring, pending integrated runtime-choice gates and evidence rules](docs/CORE_RUNTIME_CLOUD_CANDIDATE.md). Current-source integrated component-choice HTTP/browser/add-remove and physical/source/native/user issue acceptance remain open; do not equate a candidate build or old-code audit with completing the full goal.

## Pinned legacy incremental/full paths — local compatibility audit (2026-10-25)

**Status: EXACT_OLD_CODE_COUNTEREXAMPLES_VERIFIED / LEGACY_FIRST_HOP_RECOVERY_HOLD / CLOUD_AND_INSTALLABLE_NOT_RUN / FULL_OBJECTIVE_OPEN. No product/runtime change, push or release.**

- Independent `codex/reader-legacy-update-path-audit-20261025` starts at sealed `749d50fc3de9716600f8cc896a57f9a25e07f515`. Standing isolated-goal exception only after NOT_FOUND; PR210/Dev86/prior review ZIPs, formal data/schema and local Java/application/browser/listener stay frozen. No new cloud authority inferred.
- Fixed official v0.5.0 bytes confirm both incremental launch branches also have no startup Promise or child-error listener. Exact old controller/registration methods on an in-memory filesystem select installed/registered old helpers, never the staged candidate helper, and return accepted before startup. This rules out assuming a normal incremental bridge or staged new full helper automatically fixes that first-hop defect; actual installed recovery and Desktop global handler effects remain unexecuted.
- Pinned incremental path-safety dependency inspected too. Old case-variant guard discrepancy is a diagnostic, never a supported self-replacement workaround; current case-insensitive protection remains covered. No payload, runtime/plugin installer, permission bypass or third-party guardian is introduced.
- Selected368/368 cases across33files,0skips; types/Web54 PASS, zero guarded boundary events. Initial missing-MJS-declaration type failure retained and fixed with explicit `.d.mts`, not suppression. No `src`/Web/native/schema/version/dependency/workflow changes. Audit exit0 means counterexample reproduced, **not upgrade PASS**.
- [Fixed identities, exact findings, limitations and required next gates](docs/LEGACY_UPDATE_PATH_AUDIT.md). Real first-hop/core/JM/browser/HTTP/replacement tests still need separate Draft/Actions approval. No manual extraction or weakened self-replacement rule is accepted as fulfilling one-click upgrade. Broader modular-reader/device/source acceptance remains open.

## Explicit optional-runtime choice — isolated local continuation (2026-10-25)

**Status: LOCAL_SOURCE_AND_OFFLINE_GATES_PASS / EXACT_HEAD_CI_BROWSER_INSTALLABLE_PENDING / LEGACY_FIRST_HOP_HOLD / FULL_OBJECTIVE_OPEN. Not pushed, released or deployed.**

- Independent `codex/reader-explicit-runtime-choice-20261025` starts from sealed `6a66711611c44df1b410bbe80d05ae725315af46`. Standing human isolation exception continues after NOT_FOUND; frozen PR210/Dev86/prior ZIPs, G-drive app, formal data/schema and local Java/application/browser/listener remain untouched. Cloud push/sign/build still requires separate permission.
- Added explicit Software update → Optional source runtimes → add/remove JM, using the existing full-application updater. Normal updates retain composition; installation is not source enablement, login, content download or permission reset. Windows x64 stable versions only, exact official variant required; no prerelease-to-stable substitution, downgrade or same-version different-source replacement.
- Preview/confirm binds single-use 15-minute consent, from/to/source/version/hash/name; stage/apply/detached preflight/post-exit/post-copy recheck. Shared download ownership prevents a cancelled old task's late failure clearing a newer task; owning-request disconnect now reaches actual transport. Same-version readiness requires matching declared composition plus a new Desktop session, not just an unchanged version number. UI passive/three-language/duplicate guards and existing timeouts retained.
- Final selected offline **358/358 test cases,32files,0skips**; strict types and Web54/54 PASS. In-memory-only closure checks207Desktop/9incremental/11full-helper modules; no generated code execution. Zero guarded boundary events. Synthetic temp filesystem/helper-port tests are not actual installables or real HTTP/browser/source/device evidence.
- Preserved failures: TS lib missing AbortSignal.any; three old-server same-version readiness regressions; wrong FS injection point in one new rollback test (corrected, assertion retained); request-disconnect355/356 counterexample before abort forwarding. AST/VM differential pins the exact old server branches and current source hashes. Old released Launcher source has no exit watcher; legacy helper launch error remains HOLD, not retroactively repaired by current-source successes.
- [Behavior, controls, evidence and pending exact-head gates](docs/EXPLICIT_RUNTIME_CHOICE.md). Stop adding features at this verification boundary; obtain new Draft/cloud authority for actual core/JM/HTTP/browser/replacement tests. No DB/native/dependency/version/workflow/ranker/sync contract change. Original issue acceptance and full user-owned source ecosystem remain open.

## Real old-client first-hop boundary — local continuation (2026-10-25)

**Status: LOCAL_HARNESS_AND_HASH_FIX_GATES_PASS / ACTUAL_FIRST_HOP_NOT_RUN / LEGACY_ASYNC_LAUNCH_COUNTEREXAMPLE_HOLD / FULL_OBJECTIVE_OPEN. Not pushed, released or deployed.**

- New independent local branch `codex/reader-old-client-first-hop-gate-20261025` starts from sealed `a5e57e1b776ac54b6bf1b7bddf6718f3056a9b2a`. Standing isolated-goal permission continues after NOT_FOUND context/claim; no new cloud/push authority inferred. Frozen PR210/Dev86/source-review ZIPs, formal data/schema and local Java/app/browser/listener remain untouched.
- Authored CI-only exact-old-client check/prepare-latest/apply gate, not candidate-helper invocation. External test publisher preserves actual official origin/hash/download/file checks; old controller selects its exact pinned helper. Marked CI-only version-metadata fixture, full app tree/state canaries, hash rejection, health/launch recovery, owned process checks and retained evidence. No production test hook, dependency, native/API/DB/ranking/sync change or arbitrary source market.
- Actual pure builder hash/reopen regression failed98/99: FileStream leaked after SHA calculation. Fixed explicit finally disposal; do not rely on GC/retry or weaken exclusive-open assertion. Initial native-SQLite test-loader/mock-generic development failures also retained. Final selected source/offline gate323/323 across29 files,0skips; strict types/Web53 PASS, zero guarded runtime boundary events.
- Separate fixed-public-ZIP AST/VM audit verified old helper launch `w` returns no Promise, has zero child error listeners and lets asynchronous EACCES escape. This is a real old-code counterexample, not installed rollback execution or an update PASS. Candidate-helper successes do not repair it. Keep first-hop launch recovery HOLD; actual four runtime scenarios remain unexecuted and must not substitute helpers or skip the known-risk case.
- [Exact input hashes, fixture safety, coverage limits and required continuation](docs/OLD_CLIENT_FIRST_HOP_GATE.md). Next: supported legacy compatibility/safety decision and separately authorized cloud execution, with real failures retained. Broader source-neutral core/native/trust/sync and physical user acceptance remain open; no one-action upgrade completion claim.

## Core / optional-runtime composition — isolated local continuation (2026-10-25)

**Status: LOCAL_IMPLEMENTATION_AND_SELECTED_OFFLINE_GATES_PASS / NEW_INSTALLABLE_AND_OLD_FIRST_HOP_GATES_PENDING / FULL_OBJECTIVE_OPEN. Not pushed, released or deployed.**

- Human granted a continuing exception for this goal's isolated local work after Local Memory routing remained `NOT_FOUND`. New branch `codex/reader-core-runtime-composition-20261025` starts at frozen PR210 `4a18ba769fb3c8df1e6bd100293d38db3013b5dc`. Frozen Dev86 artifacts/G-drive app, formal data/schema, Java/app/browser/listener and remote/OTA authority are unchanged; cloud signing/build needs separate permission.
- Windows/RC builders now choose core by default instead of copying any checkout JVM that happens to exist. Explicit JM uses the existing pinned SDK/JRE. A strict non-executable composition descriptor, pure format module and separate filesystem adapter bind the physical payload. A packaged core never borrows cwd's runtime. Core/optional docs and JM-unavailable UX distinguish installation from source enablement/account state.
- Reuses the single existing updater. Discovery is composition-scoped; optional JM cannot fall back to generic/core. Delta manifest/file binding, allowlists, helper-self-replacement restrictions and full staging/apply/detached preflight checks prohibit silent component changes. Helper bytes change, so use full application transition, not a falsely eligible incremental package. No DB/API/schema, dependency, ranking/Visual algorithm, account/choice or private-state rewrite.
- Expanded final local target:293/293 assertions across28 files,0skips; strict types and Web53/53 PASS, zero guarded boundary events. Initial119-case run failed a stale expectation and a real pure-layer filesystem violation; the adapter was moved without relaxing architecture rules. Two new fixture-table typing errors remain recorded as failures before correction. These are source/mock/synthetic tests, not new installable/device acceptance.
- Exact pinned v0.5.0 compiled discovery methods pass7 inert-VM response checks, including API/checksum fallback. Standard core filename is retained because renaming it `-core` breaks old discovery. This does not establish actual old-controller first-hop OTA; synthetic0.5.1 is not published/proposed. Previous unreleased JM controllers cannot be assumed composition-aware. An actual ZIP inspector and CI-only same-composition runtime/recovery recipe are authored, not locally executed or automatically triggered.
- [Scope, evidence, old-client limits and required cloud gates](docs/CORE_RUNTIME_COMPOSITION.md). Next: separately authorized exact-head core/JM package and compiled runtime/recovery checks, followed by actual first-hop/device/provider validation. The broader user-owned source/trust/catalogue/native/sync architecture remains open; do not close user issues or claim a finished content-free extension ecosystem from this slice.

## Reader-runtime correction — authorized Dev86 cloud candidate (2026-10-25)

**Status: LOCAL_FIX_SEALED / NEW_EXACT_HEAD_CLOUD_AND_INSTALLABLE_GATES_PENDING / HUMAN_QA_PENDING. Not released or deployed.**

- Human corrected the accidental local-only choice and explicitly authorized this independent Draft branch, required candidate metadata and existing-Secret unpublished Actions builds. Frozen PR209 stays at `16449a00a0eb2d9d0d792e5efe5312c86dbf4220`; corrective source `9aa5e1d162bcf6d804e489d0cede43bff14567c7` and its complete source-only review ZIP SHA256 `b039bfff2e0ff7494a13d5b5d468b7ad0b666ddde2e99b3cc9239be2afe13f9b` remain immutable.
- Candidate-only Dev86 uses one public build/manifest authority, the unchanged Dev package and fixed certificate. Signing remains owner/public/exact-branch/non-PR only, after tests/lint/release-compatibility checks. No private key is downloaded. The still-NOT_FOUND coordination exception covers only the approved work; no registration, DPAPI or Windows security-policy change.
- Retains all nine normal/health/launch replacement scenarios: stable baseline, current deep path and the exact actual Dev85 predecessor. Dev85 run40204828683, source16449a00a0eb and Windows payload SHA256 `d35ca45c7909197236eb27206370504f202b32b62b1f79aca452d0742fb31bb2` are pinned; unavailable/expired/mismatched artifacts fail closed rather than substituting a rebuild/latest. This remains replacement-engine evidence, not old-client OTA discovery.
- Adds authored cloud-only real Chromium cold/late-image centering plus stored-page checks, and compiled Windows default-LAN-off, explicit enable/disable, paired-token continuity and display-setting restart gates. Browser image requests are synthetic/no-store; the test does not scroll to repair the app. Source-side artifacts retain the screenshot/diagnostics. These gates are not run on the user's PC and remain PENDING until the exact new source actually executes them successfully.
- Local overlay selection passes170 assertions/13 files plus strict types and Web53/53; the two cloud test scripts are parsed, not executed here. Those local mock/static/fixture tests are not new Chromium, Windows, signature or installation evidence. The frozen159-assertion source-only handoff is not rewritten or relabeled.
- First authorized push `ddb5b2fe859974fbdfe864b1f931bb199e57a32f`, Draft PR210, failed full Desktop suites in runs40220572360/40220577526/40220577562/40220577380. All four retained logs identify the same two old viewport source-shape assertions and two shell VM cases missing the new Reader settings ports. Update those contracts to the loaded-image/intent-gated viewport and inject the real settings dependencies into the shell fixture, retaining capability-failure admission and adding assertions that settings are applied only after capability success. No failed test is skipped or timeout expanded.
- Independent offline counterexample unit-2 records170/171 PASS: asynchronous LAN disable saved its pre-close configuration, overwriting display/storage edits made while closing. The corrected branch persists the latest configuration after close while keeping immediate in-memory opt-out and close-before-save safety. The deferred-close regression requires both concurrent display settings and port choice to survive. The first new fixture Promise type was rejected by the type gate and corrected; no product/type check was waived. Expanded guarded selection now covers200 assertions/15 files; new exact-head cloud execution remains required before any installable handoff.
- Corrected source `3d98dc3b0ecc406fc40464f2413f56f7848e70c1` passed the full Linux unit/build gate and the real cold/late-image Reader case, but push run40221580051 failed six existing English/Japanese layout cases: the new enable button relied on a successful Desktop-status render instead of the static translation map. Browser result55/61 is not accepted. Added both LAN controls to the existing DOM translation map and a pure-DOM counterexample that fails before the fix (200/201 PASS), including the no-Desktop-render case. Corrected guarded selection201/201, strict types and Web53/53 PASS. A separate PR-event run40221584545 failed Maven dependency retrieval with HTTP429, not a test assertion; retain that infrastructure failure rather than relabel it. No retry, timeout, skip or localization leak allowlist is added.
- Independent readback of the digest-verified failed-head Source Evidence confirmed that a successful Reader screenshot attached as an in-memory body was not retained by the line-reporter artifact layout. The cloud case now writes the screenshot to its explicit `testInfo.outputPath` and attaches that file; static recipe checks require the write. Centering/progress assertions and timeouts are unchanged. This is evidence-retention correction, not a new product feature or permission for local browser execution; any superseded/cancelled run keeps its actual status and is not promoted.
- No new product feature, source protocol, native implementation, DB schema/migration, dependency, ranking/Visual/tag/sync or updater implementation change is added by this build overlay. Current full CI, actual ZIP/APK/source/certificate and upgrade/runtime receipts must be inspected before handoff. No main merge, tag/Release, stable OTA, G-drive replacement, local Java/application/browser/listener or production-state access.

## Dev85 local runtime acceptance — bounded Reader/LAN corrective slice (2026-10-25)

**Status: LOCAL_SOURCE_AND_OFFLINE_GATES / NEW_BROWSER_AND_INSTALLABLE_RUNTIME_GATES_PENDING / FULL_OBJECTIVE_OPEN. Not pushed, released or deployed.**

- Frozen Dev85 `16449a00a0eb2d9d0d792e5efe5312c86dbf4220` was independently deployed, then separately authorized for empty-profile synthetic folder/CBZ runtime acceptance. Actual result was **PARTIAL**, not a new whole-product PASS: packaged CLI ingestion, images, natural order and pre-Reader restart persistence worked; cold continuous resume showed the wrong page and subsequent synthetic progress regressed. The native PowerShell-owned picker was not automated under computer-use policy, so CLI success is not GUI import evidence. Original evidence ZIP SHA256 `e5d008acc09611894f392cb2d98f5448ab629dbe09906dece733d9c77ca1f296` stays unchanged.
- The initial interactive runtime also opened LAN Mobile Bridge for about five minutes before the owned instance was stopped. Later loopback-only test-process guarding was not a product fix. No unauthorized-client absence claim is made. These observations did not involve official/old RC databases, source login or Java.
- Human separately approved this new local branch `codex/dev85-local-reader-runtime-fixes-20261025`, outside frozen PR209, under the still-NOT_FOUND coordination exception. No push/cloud run, merge/tag/Release/OTA, G-drive program change, application/browser/listener/Java launch or production-profile access is authorized for this corrective slice.
- Reader viewport now waits for loaded saved-page geometry, requests only that page eagerly, re-anchors on earlier-image/resize changes and refuses layout-only replacement of the saved page before actual user reading intent. Lazy images reserve a box; stale frames, image callbacks, observers and input listeners are disposed. Reuses native browser APIs and the existing Reader/progress modules, not a second reader or new dependency. Settings codec/serialized writer are shared across Desktop and Web; validated display choices are saved in the existing profile config and cached for Browser Lite, without a SQLite migration or credential/source operation.
- Interactive LAN listening is now explicit opt-in with a visible enable/disable control, confirmation, strict independent settings action and default-off policy for absent/legacy choices. Existing paired records remain separate; disable closes the current listener even when persisting the off choice fails. Late activation after engine shutdown is closed, not adopted. Headless retains its additional explicit `--mobile-bridge` requirement. A saved explicit off choice wins over the startup fallback flag.
- Local offline target **159 assertions / 10 files PASS**, strict TypeScript, Web53/53 and memory-only Desktop compilation PASS. The actual Desktop dependency graph contains both new boundaries. The selected update-compatibility/helper/fixture-package tests include new Reader assets without config/DB/runtime replacement; this is not physical one-click upgrade or whole-package acceptance. All final guarded checks had zero TCP/provider/Java/application boundary events; the test framework's own WS transport is disabled only in the dedicated offline runner, while the real-I/O guard stays active.
- Preserved failures: initial sandbox/esbuild ancestor-read denial and Vite's attempted internal WS listener rejected before bind were test-harness issues; the first readiness-variable type error was a source-development error, not a runtime result. No listener/timeout/skip/dependency relaxation. New real-browser cold-layout/port-change persistence, native picker GUI, actual LAN enable/disable/restart, full exact-source CI/package/update/rollback and device/provider/gesture acceptance remain pending. [Corrective scope and next checks](docs/DEV85_LOCAL_READER_RUNTIME_FIXES.txt). Existing installables are not relabeled with this repair.

## Source-neutral reading Library — authorized Dev85 cloud candidate (2026-10-25)

**Status: LOCAL_SOURCE_SEALED / NEW_EXACT_HEAD_CLOUD_AND_INSTALLABLE_GATES_PENDING / HUMAN_QA_PENDING. Not released or deployed.**

- Human separately approved pushing this independent branch, a new Draft outside frozen PR208 and existing-Secret unpublished Actions builds. Local source is sealed at `291bdec208c96ff2cf3f2484b2e14859448a597c`; its101 selected assertions, strict types and Web52 are source-only evidence, not new installable results.
- Candidate-only Dev85 advances the single build/manifest authority beyond frozen Dev84, retaining the same development package and certificate. Existing public-owner/non-PR/explicit-branch restrictions remain. No private-key download or local Java/application/browser/listener/updater execution.
- Windows cloud validation additionally downloads the exact retained Dev84 Actions package, pins payload/source and requires normal replacement plus health/launch rollback in disposable synthetic profiles. The prior artifact is ephemeral: missing/expired/wrong bytes fail closed, never silently substitute a source rebuild or latest release. This is a replacement-engine test, not proof of old-client OTA discovery or physical installation.
- Existing stable-baseline and deep-path gates remain; no production updater implementation/schema/algorithm/dependency change. PR206/207/208, main, Release and stable OTA remain untouched. [New candidate plan, safety and evidence requirements](docs/SOURCE_NEUTRAL_CLOUD_CANDIDATE.md).
- First pushed source `74ba5d07fa4cce682ce04a562493c509d93fc926` failed both candidate source jobs:2184pass/5fail/8platform skips,300files. The two old AST-extracted Reader fixtures omitted new `activeView`/`readingLibraryPanel` closure ports. This was independently reproduced as35pass/5fail across40 inert tests. Only those test fixtures now inject explicit mock ports, retain every original assertion and additionally assert view-scoped Library refresh. No application change, timeout increase, skip or rerun-as-fix. The corrected exact source must rerun full CI and package gates; failed-head evidence remains.
- Second source `604ecfbec6ab24547dfcbdccebf8562278dec55a` passed2190 Linux assertions/8platform skips but real Chromium was57pass/3fail, all three common-Library journeys hidden. Digest-verified actual traces show capability503 twice per language (initial/reloaded mock shell): the fixture omitted `/api/v1/capabilities`, so existing `loadDesktop()` correctly cleared Desktop authority. The fixture now supplies the real capability/browser-session bootstrap and asserts version discovery; no product guard or visibility assertion is weakened. Two actual-function inert tests separately prove failure-denies/success-admits. Fresh local target151/15files and full cloud/runtime/installables remain required.

## Source-neutral reading Library — local-only integration (2026-10-25)

**Status: LOCAL_IMPLEMENTATION_AND_SELECTED_GATES / NEW_CLOUD_BROWSER_INSTALLABLE_DEVICE_GATES_PENDING. Not pushed, released or deployed.**

- Human authorization permits this local branch `codex/source-neutral-reading-library-20261025` outside frozen PR208 `295942c297f9377b28df5a2d3d32a311fed8a18f`, under the still-unavailable coordination exception. No new remote/build permission, production state, SQLite migration/schema, local Java/app/browser/listener/updater or stable OTA operation is authorized.
- Actual generic read-projection module, bounded legacy bulk adapter, principal-owned explicitly selected host snapshot, configured Desktop host/origin/CSRF query and common Library/Reader entry are wired. No detached-interface-only completion claim, source protocol clone, catalogue auto-import, fake Pica identity, new persistent state key or unsupported phone/tag/favorite/recommendation sync.
- Local and online route positions remain separate. A new readonly per-work SQLite view fixes chapter-row starvation; original `readingProgress()` source/API and every stored position are preserved. Missing metadata/history stays unknown. Optional host failure cannot reset local state. Opaque source facets do not contain endpoint/credentials/raw principal.
- Preserved actual48pass/2fail UI and51pass/1fail synthetic-memory SQL counterexamples, plus test-tool/type scaffold failures. Request freshness is distinct from ownership; revocation evicts stale labels, validated connection snapshots revoke client sessions without secrets, and expiry permits a new explicit session. No timeout/retry/skip/dependency relaxation.
- Selected target101 assertions/10files, types and Web52; clean final source/hash/evidence are recorded in the source-only handoff, not inferred from earlier green output. New Chromium/actual-Windows projection checks are authored and syntax-checked but require separately authorized cloud execution. [Scope, failures, concrete integration and remaining holds](docs/SOURCE_NEUTRAL_READING_LIBRARY.md).

Post-build historical PR208 evidence: exact `295942c297f9377b28df5a2d3d32a311fed8a18f`, run40192577286 candidate3/3,27/27 successful workflows;2147 assertions paired across Linux/Windows, Chromium60, Android402/53suites and six normal/deep upgrade/rollback diagnostics. Complete Dev84 handoff SHA256 `6aed83a17d7b33f3792abd2e1d6daafbdff964d4b2d3ca9d8207777cc69d8bf8`. It remains frozen and does not validate the new reading-library source. Main/Release/data are unchanged; human/provider/OEM acceptance and the full modular-reader objective remain open.

## Source idle boundary — authorized independent cloud candidate (2026-10-25)

**Status: LOCAL_SOURCE_GATES_PASS / CLOUD_AND_INSTALLABLE_GATES_PENDING / HUMAN_PROVIDER_QA_PENDING. Not released or deployed.**

- Human approval permits a new independent Draft PR and unpublished Actions builds using existing signing Secrets; the isolated coordination exception still applies. Base is frozen PR207 `1b7a9184eca11f73b295a55827d2cddee34dc69c`; local source corrections are sealed as `a723fbe29bc4323dddeb7370c37721dd6a4789bd`. PR206/207 and their packages stay unchanged.
- Candidate-only Dev84 advances the single build/manifest authority from Dev83. Same Dev application ID and fixed certificate are required; no private-key download, uninstall, installation or production profile is authorized. Existing owner/non-PR/explicit-branch signing restrictions remain.
- Exact a723 source passed135 selected assertions/18suites, strict TypeScript and Web51 syntax. A separate23-case/4suite source-and-synthetic update-planning check passed, including22 unchanged dependency/schema/module/updater inputs. These selections overlap; do not sum them as unique tests or borrow PR207 CI for this source.
- Compatible metadata is necessary, not sufficient for real incremental eligibility. Generated updater/helper bytes are unknown until build; differing helpers require the existing one-click full-application path. Actual Windows runtime, HTTP/browser, signed Android, package/upgrade/rollback and physical/provider checks need their own current-source evidence.
- No new product feature or updater implementation is added for cloud preparation. No main merge, tag/Release, stable OTA, local Java/application/browser/listener/upgrader, production data access or deployment. [Candidate scope and review limits](docs/SOURCE_IDLE_CLOUD_CANDIDATE.md).

## JM command route and Node-stream error boundary (2026-10-25, local-only continuation)

**ACTUAL_CALLBACK_OVER_VIRTUAL_REQUESTS / PASSIVE_GET_AND_EXPLICIT_POST / BOUNDED_GENERIC_INPUT_ERRORS / NO_SOCKET_OR_SOURCE_PROCESS / FULL_GOAL_OPEN.**

- Continues local `0d8dc49713e7400f9c53b57b592212759b1fc72f`, within the same authorized source-idle isolation. Actual callback/json/body and three service methods run through compiler-extracted VM functions, fake responses/transport and in-memory Node Readables; no application/server setup/listener/provider/profile is started.
- Initial24 cases had21pass/3fail: invalid JSON500, text/plain reaching the connection, oversize input using generic parsing. This action alone now requires JSON, limits input4096bytes and returns constant non-reflective errors; ordinary login/favorite routes remain unchanged.
- Actual Node-stream counterexample then had24pass/1fail: early rejection destroyed input before an error reply. Native iterator(false) is opt-in only for this command, with Connection:close on parse/media failure. A separate case retains ordinary body-reader default behavior. Reuses the existing parser and standard Node API, no new dependencies or runtime floor.
- Development133/134 runtime/type history retained. A contextual-this strict-type failure in the fake iterator is fixed using an explicit closure, not casts/relaxed criteria. Final target135 assertions/18 inspected suites plus types/Web51 is independently sealed; real HTTP/browser/compiled/cloud/signature/upgrade/device/source acceptance remains pending.
- PR207/installables, main, OTA, production data, schema/deps/Android/recommendation/Visual/sync/updater remain untouched. No push, release, deployment or Java/permission-sensitive execution. [Exact method and limits](docs/JM_VIRTUAL_ROUTING_VALIDATION.md).

## Source admission and idle observation boundary (2026-10-25, local-only)

**LOCAL_ONLY_CORE_DEFAULT / EXPLICIT_CLI_SOURCES / PASSIVE_JM_STATUS / FROZEN_PR207_UNCHANGED / FULL_GOAL_OPEN.**

- Continues candidate `1b7a9184eca11f73b295a55827d2cddee34dc69c` on a new local branch, not the unfinished profile-recovery branch. PR207, its Dev83/Windows handoff, main, stable OTA and official data remain untouched. User authorized this isolated write exception after Local Memory routing returned NOT_FOUND and broker status still showed DPAPI failure; no registration/secret/security-policy changes.
- New SourceRuntime/LibraryService/ProviderService contexts default to no external adapters, even with credentials or an injected SDK. Desktop explicitly retains its old-config compatibility and saved choices. CLI uses an explicit validated `--sources pica,eh,jm|none` invocation choice before opening storage; intentional online CLI automation must add that flag. No implicit credential-to-source consent.
- JM settings GET now reads an allowlisted local account snapshot and never restores login/requests a worker. UI distinguishes remembered/cached/not-checked in three languages. Empty-body, Desktop-CSRF-protected explicit connect reuses the existing worker/account flow, can retry saved login, and cannot enable sources or accept secrets/choice fields. The earlier trigger was opening the JM section, not ordinary homepage startup.
- Local selected gates108/108 across17 inspected suites, strict types and Web51 PASS. Original68pass/1 historical policy-hash guard failure is retained; updated current pin plus exact inverse old-text hash permits only the reviewed default change. Historical50 fixture/harness files/92 constructors now declare their prior enabled context via a test-only helper; default-off tests remain separate. No test is skipped to obtain this result.
- Final review reproduced an actual empty-array acceptance bug in the initial connect predicate through its AST-extracted expression (4pass/1fail preserved); now rejects nonobjects/arrays and unexpected fields. The new pure guard case plus future HTTP array/null/primitive cases are added; exact final-source target109 assertions is recorded separately.
- Actual HTTP route/CSRF cases are extended but not locally run. Current full CI/browser/package/signature/upgrade/device/provider gates remain pending; no prior green is borrowed. No local Java/app/browser/listener or production data, new dependencies/schema/Android/ranking/Visual/sync/updater changes, push/Release/OTA/install/deployment. [Boundary, CLI compatibility and limits](docs/SOURCE_IDLE_BOUNDARY.md).

## Reader reliability integration — focused unpublished candidate (2026-10-25)

**IMPLEMENTED_AND_LOCALLY_INTEGRATED / EXACT_HEAD_CLOUD_RECEIPTS_ARE_SEPARATE / MANUAL_QA_PENDING / FULL_GOAL_OPEN.**

- Human authorized a new independent Draft branch and existing Actions/signing-Secrets builds only. Do not edit frozen PR206, merge main, create tag/Release, change stable OTA, download keys, install/deploy or read production data.
- Frozen base is `9e879d3aa7030d1fc49a92354f54bba0bd610074`; Reader/local-guide/input/viewport/progress fixes come from the bounded local series through `90a1595769ed382fe0bb43988a27d3c47651ad1f`. Preserve local-only reading with no source/account/content service, existing native/tags/recommendation/source/sync protocols and one application updater.
- The source integration includes the independently useful instance/owned-profile initialization fix and its data-only theme-validator dependency/tests. It excludes unfinished `src/profile-backup`, ZIP64 packages/lockfile additions and unrelated local work; those remain in the original local branch/backlog, not reverted or accepted.
- Initial integration commit `679a5f15d4f95a9ad4f7ecfc3d83acb7963b63dd` exactly binds all1371 tested source files/modes to manifest SHA256 `3193b497a414eacc5493ce31df3448e9ae0aad2efaac3081f14964734e989425`. Local284 tests/23files, strict types/Web51 PASS. These mocks/owned synthetic fixtures are not HTTP/browser/physical/provider/upgrade or full-CI acceptance.
- Read-only Windows checkout-root guard prevents a nested source snapshot borrowing an ancestor's Git SHA before any provenance override/build/download/delete. Genuine roots remain supported; no Git ownership/security exception is added by the production helper.
- This subsequent CI/ledger-only overlay enables the exact new candidate branch in the existing unpublished workflow and advances fixed-signature Dev82→83 from one tested public version authority; certificate/package checks and test-before-secret order remain strict. Native implementation remains unchanged. Local pre-overlay gates are not mislabeled as cloud or installer results: consult the exact source SHA/run/artifact receipts recorded in the new Draft PR and immutable handoff.
- Existing r2/Dev82 handoff and PR206 head remain frozen. New binaries, if produced and verified, use their own exact SHA and isolated profile. Full neutral-source/trust/native/sync/asset/backup scope, real user/gesture/provider/AI/offline/retention/physical-upgrade acceptance remain OPEN. [Integration ownership and provenance](docs/READER_RELIABILITY_INTEGRATION.md).

## Local execution restriction — security prompt disruption (2026-10-23)

User reported repeated security-center permission prompts for Java/validation programs. Stop launching local Java, random-path Windows artifacts, LAN bridges and upgrade runtime matrices by default; move those checks to the already-authorized Draft CI. Local source/type/syntax and inspected no-Java/no-LAN targeted tests may continue. Do not allow dialogs, add exceptions or weaken protection. Read-only snapshot found zero active Java/current validation drivers; firewall logs confirmed prior task-temp application paths, including Node. Exact unseen dialog identity remains unverified. [Effective local validation policy](docs/LOCAL_VALIDATION_SAFETY.md).

## NEXT-67 — existing user-host library to shared Reader (2026-10-24, unpublished)

**ISOLATED_IMPLEMENTATION / LOCAL_SYNTHETIC_SOURCE_CHECKS / CURRENT_SOURCE_HTTP_BROWSER_COMPILED_PACKAGE_CI_REQUIRED / COMPLETE_EXTERNAL_SOURCE_AND_FULL_OBJECTIVE_OPEN.**

- Frozen NEXT-66 `91b62d0fcccd552e4a6af1609283598f75022080` completed candidate3/3, broader39success+6conditional skip/45,1936+8 Linux/1943+1 Windows /1944,57 Chromium,402 native and separate recovery1 test/probe/workflow.159-entry handoff SHA256 `f82d331443e0ea78c8d31661c737181c8bc458a62aee03cba9fbaa7edb524406` independently verified. Prior timeout/J7 internal exit cause remains undetermined. Previous package/source stay immutable.
- Advances beyond diagnostics to real optional Desktop reading of the user's existing Suwayomi2.4 library; no app-owned catalogue/service/market/default endpoint/repository/required backend, provider-wide search or import. Separate15-minute explicit library-read scope discloses host fetch/cache/KOReader side effects. Inspector permission remains unchanged. [Implementation and limits](docs/USER_HOST_LIBRARY_READER.md).
- Reuses the actual main Reader through structural state/source/cache/identity/access ports, not a second Reader. Canonical LongString source + connection/principal/source-URL digest book identity, fresh manga/chapter ownership and row-reuse rejection before cached image/progress access. Only minimal selected references/recent private progress enter two owned app_state key families; no schema/provider fallback/catalogue/recommendation/Visual/user-event/favorite/sync/native change. Separate session/account credentials remain memory-only and revocable.
- Shared bounded HTTP mechanics, reviewed fixed operations/routes, per-session/queue/deadline/body bounds, no cookie/redirect/ambient credentials and raster checks. Explicit ready-local Origin/CSRF commands and same-origin/referrer or explicit-CSRF GET guards prevent cross-site authenticated image proxying. Connection change/exit/disconnect/expiry cancel and fence late writes. Existing updater/config/SQLite protection retained.
- Initial125 synthetic assertions passed but typecheck found concrete DB return-type coupling and a captured unknown index; structural Reader ports/validated value corrected them. Later126 passed with one new HTTP fixture headers inference type error; explicit headers type fixed it. Current126/126, types and Web48/48 PASS; failed logs remain, no criterion relaxation. Final clean-source run and fresh real API/three-language Chromium/compiled-Windows/cache/resume/stale/cross-site/revocation plus existing full/incremental/deep/native/signature gates required before package PASS. Dev81→82 is version authority only, not native host support or physical overwrite.
- Next human acceptance is a bounded consolidated candidate, not permission to keep expanding every unfinished module before the user tests. [Frozen next-acceptance scope and true long-term gaps](docs/NEXT_USER_ACCEPTANCE_SCOPE.md). No end-state requirement is dropped or declared complete; source-host native/search/plugin ecosystem and whole-profile relocation/recovery remain explicit later development. Engineering ETA is conditional on actual current CI and artifact checks, not a promised completion time.
- First source15c56be candidate40095595901 failed the unchanged ordinary-app i18n gate; Windows/Android dependent artifacts were skipped, not accepted. Adds actual en/zh/ja dictionary key rather than disabling the test. Independent J7 run40095599693 timed out with zero page errors/unchanged cards/enabled next/no observed next request; raw official diagnostics and actual same-tree c49c213… authority retained. A frozen old-handler oracle reproduces a real pending-current/enabled-next/lost-click mechanism; the actual UI now gives all three controls one busy owner. Matching mechanism is proven, unique attribution of that historical timeout is not. No benchmark, timeout, retry, skip or algorithm relaxation; repaired source needs fresh full CI.
- Repair source passes148/148 across10 inspected pure/source/fake-port files, including20 existing i18n assertions and2 actual old/new handler reproductions, plus types and Web48/48 syntax. This is not current real-browser/J7/Windows/native/artifact acceptance; fresh exact-source CI remains required. No local app/browser/Java/listener or production data used.
- Second source d7cb690 passed full source/type/unit/build/JVM, ordinary Android, unchanged strict J7 and Android recovery, but remained rejected: Chromium57/60 failed only the3 new hosted-Reader locales at selecting `#reader-mode` while its existing Reader-settings details were closed. Raw original logs/CI diagnostic screenshots retained. Corrects the test to open the actual settings summary, assert visibility, select/verify single-page, close settings and then test page/progress. No force, relaxed timeout/retry/skip, alternate Reader or production UI workaround. New exact-source browser/compiled Windows/fixed-signature candidate proof is still required; dependent skipped artifacts are not accepted.
- Consolidated-guide review corrected stale 'inspection only / Reader unwired' wording: daily use still requires no external host, advanced use now explicitly separates diagnostic permission from Desktop-only15-minute library reading, hide versus revoke, independent local progress, host cache/sync effects and unsupported global search/import/native/sync. Added [one grouped acceptance checklist](docs/NEXT_CONCENTRATED_ACCEPTANCE_CHECKLIST.zh-CN.md) distinguishing untested/not applicable from PASS, production/Dev identities, body export versus backup and CI update fixtures versus installable updates. This is documentation alignment, not new host capability or physical/provider acceptance. Final package/source must include the same corrected guidance.
- No local Java/Gradle/JM/app/browser/LAN/update runtime, security exceptions, production account/profile/body/vector/data, main merge, tag/Release, stable OTA,key download,installation/deployment. Unified history/catalogue/tags/Android/sync, host/provider real interoperability, source trust, secure persistence, whole-state recovery and prior deferred user/OEM/gesture/AI/performance QA remain OPEN. No immediate user test requested; full objective OPEN.

## NEXT-66 — user-owned external-host configuration (2026-10-24, unpublished)

**ISOLATED_IMPLEMENTATION / LOCAL113_SOURCE_ASSERTIONS_PASS / CURRENT_SOURCE_HTTP_BROWSER_COMPILED_PACKAGE_CI_REQUIRED / EXTERNAL_READER_AND_FULL_OBJECTIVE_OPEN.**

- Frozen baseline NEXT-65 `e0265086584340ef19fbf7106170f0542bdffcb2`; immutable183-entry handoff SHA256 `29f6685722c6c44d715a4eb9342f175f3cfe69b7d60a669e079d34f259e7b592`. That source's candidate3/3, broader39success+6conditional skip/45 and actual recovery1 test/probe/workflow PASS remain historical evidence. Prior timeout/J7 action/process-exit cause is not solved by a later green run.
- User re-emphasized **reader/library, not manga platform**. No app-owned catalogue/content service/source marketplace/default endpoint/repository/required backend. User owns source choice and access; app retains adapter security/accurate-scope responsibility. Product architecture is not a blanket legal-exemption assertion.
- New actual host-settings module: pure permission/state machine + separate bounded file adapter + configured local Desktop routes and en/zh/ja panel. Save public metadata disabled; separate enable; settings operations/restart never connect; explicit inspect reuses NEXT-64 inspector/transport. UUID connection identity cannot be rebound to another endpoint. Strict schema/capacity, no inherited credentials, stale revision and cancel/late-result fences, optional-config degradation without reset or local-reader breakage. [Exact boundary and unfinished work](docs/USER_OWNED_SOURCE_HOST_SETTINGS.md).
- Credentials remain per request, not in JSON/vault/browser/sync. No production account/profile/body/vector, DB/schema, recommendation/Visual, source-policy/provider IDs, native implementation or updater helper change. Existing local/remote content, favorites/history and source choices are not removed. Saved metadata is not an imported catalogue or comic identity; Reader/import/install still false. External comic/search/read/library/native/session/trust remain OPEN.
- Local first attempt retained esbuild shared-parent sandbox denial and one mock tuple type issue; explicit narrow source-test filesystem authorization and mock signature corrected them. Final113/113 across7 inspected no-network/temp/fake-fetch files, TypeScript and Web47/47 PASS. Actual HTTP/three-language Chromium/compiled Windows save→enable→inspect→disable→remove gates authored for CI; fresh current-source native/signature/full/incremental/deep-upgrade proof required before candidate PASS. Dev80→81 only changes candidate build authority, not native functionality.
- No local Java/Gradle/JM/app/browser/LAN/update runtime, protection exception/security dialog approval, main merge, tag/Release, stable OTA, key download, installation or deployment. Human/provider/device QA remains deferred; no immediate user test requested. Full objective OPEN.

## NEXT-65 — minimal tag runtime, evidence separation and upgrade layout (2026-10-24, unpublished)

**ISOLATED_IMPLEMENTATION / LOCAL_SOURCE_CHECKS / CURRENT_SOURCE_FULL_PACKAGE_CI_REQUIRED / FULL_READER_OBJECTIVE_OPEN.**

- Previous goal turn: **PROGRESS**, not an unverified wait. Frozen NEXT-64 `a5e4a1d0cb078823f872e22a8561ea651f2a8db8` and complete handoff SHA256 `db3c4c4c632892e094977c3c0df32393e86ce2203fa0a40ddc70d277d2e87498` provide actual inspection, audit and exact-source evidence; broader acceptance remains PARTIAL as recorded below.
- User's reader-not-platform boundary is enforced in distribution, not just a declaration. Existing review evidence stays in tracked source for provenance but is no longer directory-globbed into the application. Shared staging for Windows x64/ARM64/Linux/macOS includes only7 consumed semantic/entity/alias/watchlist files (82455bytes), not example titles/authors/counts/review columns or duplicate source roots. [Authority, reuse, formats and holds](docs/MINIMAL_TAG_RUNTIME.md).
- Extracts asset I/O and compatibility tables into `src/tag-assets`, leaving the frozen V3 resolver body and pure personal-tag policy intact. Reuses existing CSV/adapters/precedence, Node JSON/FS/crypto, no dependency/schema/API/ranker/model/source/account/sync change. The actual module graph must exclude recommendation/storage/provider ownership.
- New manifest/file integrity is separate from the pinned old semantic authority. Complete maps and3957 differential resolution cases plus full profile output/registryVersion are compared to a whole frozen old implementation. Removing evidence must not initialize a policy, rebuild embeddings or make unchanged rules appear new.
- Default application paths choose only minimal runtime assets; missing/corrupt assets fail rather than silently using old installed evidence. Unsupported fields, alias metadata, payload changes with recomputed hashes, extra files, oversized/non-file assets and mixed stages are rejected. Generated source bytes have an explicit reproducibility check.
- Old source-path removal requires the existing one-click full replacement; path-safety allowlists/helpers are not weakened. Modern app-only incremental transport remains supported, mixed evidence targets reject. CI-only full upgrade/health rollback/launch rollback/deep cases now compare exact asset layout/bytes while retaining external data canaries. No local runtime or production migration.
- First local attempt retained24 passing tests but the new test file had a syntax typo; the next retained50/50 but typecheck found a moved private Row alias missing from the unchanged resolver. Both were fixed. A later52pass/1fail source-graph criterion counted repeated imports as distinct dependencies; it now compares exact unique dependency identities and retains a rejecting child_process counterexample. No runtime/security/cap/skip criterion was weakened. Final current-source local/native/Windows/browser/signature gates and new immutable package are required before claiming candidate PASS. Dev79→80 advances only the existing fixed-signature candidate version; no native feature change.
- Current inspected source gates53/53 across7 files,3957 resolver comparisons, typecheck/Web46/46 and four PowerShell AST parses pass; actual emitted tag-asset dependency closure is3 files with only Node FS/path/crypto. Serialized runtime bytes are explicitly non-translated in .gitattributes. These checks are not local application/browser/upgrade/native execution; current full CI/package evidence remains required.
- First pushed source `53737de97133df3cf5c8905de162c3cefa2ad473` exposed a real macOS stage-root error (PR run40086327118: missing outer app/desktop.js). Rules were staged into the outer archive rather than Contents/Resources, colliding with the existing app link. Corrects the Resources target, removes obsolete src link and makes shared staging require actual engine/module-contract file markers before writing. Adds a rejecting outer-directory fixture and exact platform argument checks. Raw failed run/log are retained; no timeout/skip/permission relaxation or local app execution. This follow-up needs fresh exact-source CI, not a rerun relabelled as the old source.
- Follow-up inspected source checks54/54 across7 files,3957 resolver comparisons, typecheck and Web46/46 PASS. No user data, compiled updater helper, module API or native logic changed by the layout correction.
- No production account/profile/body/vector access, main merge, tag/Release, stable OTA, key download, install or deployment. Vocabulary provenance/optional source ownership, all-binary content audit, source-host Reader/identity/native/trust lifecycle, full backup/restore and deferred physical/provider/gesture/tag/AI/offline acceptance remain OPEN. No immediate user testing requested.

## NEXT-64 — explicit existing-source-host inspection (2026-10-24, unpublished)

**IMPLEMENTATION_IN_PROGRESS / LOCAL_PURE_SOURCE_CHECKS_PASS / CURRENT_SOURCE_HTTP_BROWSER_PACKAGE_CI_REQUIRED / FULL_SOURCE_READER_AND_OBJECTIVE_OPEN.**

Final frozen-source addendum: `a5e4a1d0cb078823f872e22a8561ea651f2a8db8` candidate3/3 +standard CI PASS; Linux1892+8 /Windows1899+1 /1900, Chromium54, native402/53 suites and signed Dev79. Broader38success+6conditional skips+1CANCELLED/45 = **PARTIAL/HOLD**, not all green. Recovery40080731580 actually reports OK(1 test), recovered probe/runCount2 and PASS, then hangs after emulator-kill ACK until35m cancellation; internal exit cause and prior J7 remain UNDETERMINED. No criterion/timeout/retry/skip/security change or rerun. Complete162-entry handoff SHA256 `db3c4c4c632892e094977c3c0df32393e86ce2203fa0a40ddc70d277d2e87498` preserves raw evidence/source/diff/installables/recipes; archive integrity was independently checked. The preparation notes below describe what was known before that build, not a claim that current NEXT-65 is validated.

- Continues frozen NEXT-63 `cbbf3432efb2ead4517cebeafc44ac1901ac9fdb`, complete handoff SHA256 `b41913dbcc8ddbb9ca4824229a1b0bd9cb83123137ef0f76aa84fd30a0d2690d`. Its verified Windows/Web/updater gates and Android402 tests/fixed-signed Dev78 remain historical proof, not current uncommitted-host proof.
- Official Suwayomi stable v2.4.2366 / commit `40bc5da57820324ed0ae724cbbc020cc4673b594` supplies seven pinned protocol references. Actual schema maps Long to LongString; source IDs stay canonical strings, never rounded numbers or guessed Pica/library comic identities. No upstream implementation is copied, installed or executed.
- Adds separate contract/protocol/inspection/HTTP adapters and actual local Desktop/UI wiring. Explicit one-shot consent, fixed read-only queries, scoped anonymous/Basic auth, no redirect/cookie reuse, byte/deadline/pagination bounds, cancel/late-result fences and no persistence. Native/provider/catalogue IDs, schema, algorithms, existing source choices and module APIs remain unchanged. [Scope, reuse and open integration](docs/SOURCE_HOST_INSPECTION.md).
- Local inspected source tests92/92 across4 files, types and Web46/46 syntax PASS. Actual HTTP/three-language Chromium/compiled-Windows tests are authored but not run locally; the compiled gate reuses the existing isolated source/media application rather than creating another application lifecycle. First type issues and a real early-response cancellation cleanup gap are retained separately from passing results.
- Current work is not yet pushed/built. Reader/import/extension-install capabilities remain explicitly false. Real host interoperability/auth, stable host/comic identity, source-to-library/tag/Reader/Android integration, repository trust and all previously deferred device/provider/AI/gesture/sync/upgrade acceptance remain OPEN. No user test is requested, no production data or release/OTA/deployment touched, and local permission-sensitive runtime remains prohibited.
- User clarified the hard product boundary: reader/library, not a manga platform; user-selected sources are not app-operated content/services. [Core/source ownership](docs/CORE_READER_SOURCE_BOUNDARY.md) now explicitly forbids an official catalogue/source market, pre-enabled repositories and a required external host/account. Historical fixed Pica/EH/JM coupling is retained as an unfinished compatibility-separation task, not declared solved or destructively removed. Existing profiles/data remain protected; source-specific packaged registries/default discovery still require semantic audit before full neutrality/content-free acceptance.
- The single unpublished Android version authority advances Dev78→79 for safe fixed-certificate candidate continuity; native source/store/Reader/tag/gesture code is unchanged. This does not add native host support or prove actual phone installation/state retention.

## NEXT-63 — native local-comic body export (2026-10-24, unpublished)

**ISOLATED_IMPLEMENTATION / CURRENT_SOURCE_NATIVE_CI_AND_INSTALLABLE_PROOF_REQUIRED / FULL_OBJECTIVE_RELEASE_OTA_DEVICE_QA_OPEN.**

- Continues frozen NEXT-62 `7203626e1cb324e6ca9601872e561950234f7231`, full handoff SHA256 `c899272db9eeddcb0bef8a1d082236323a6af3dcced78f8f27acb77d19b6100d`. Its Linux1780+8 / Windows1787+1 /1788, Chromium48, Android362 and signed Dev77 results are historical proof, not current-source validation.
- New pure native body exporter reuses existing name/signature/natural-order validators and standard Java ZIP, with actual page/total/complete-archive byte limits. Separate stage/SAF/UI adapters expose only owned imports, pin the generation through final copy, refuse active-copy removal and never delete originals or external documents. [Actual ownership, limits and open acceptance](docs/NATIVE_LOCAL_CONTENT_EXPORT.md).
- Explicit write-only system destination, retained rotation task, cancellation/finish and no raw error paths. En/zh/ja daily/advanced guidance distinguishes pages-only export from complete personal-state backup. Reimport of an exported selection creates a new local identity; history/private tags are not restored. No schema, recommendation, Visual, source/account, Reader API or sync format change.
- Inspected local source checks:23/23 across4 files, TypeScript, Web45/45 syntax and six localized resource XML parses PASS. The first contract attempt misclassified the `com.picalibrary.android.local` package namespace as a runtime import (22 pass/1 fail); the criterion now removes only the package declaration and retains a rejecting Android-import counterexample. Raw failed/passing evidence remains. Real synthetic plain-Java / SDK28/35 store/SAF/Reader/UI tests are authored but not executed locally. Native execution, lint/R8/fixed signing and same-source Windows/source/browser/update regression remain REQUIRED before claiming current package PASS. Single Android candidate authority advances to Dev78, retaining Dev77 package/certificate.
- No local Java/Gradle/application/browser/LAN/upgrade runtime, no production data, main merge, tag/Release, OTA, signing-key download, install or deployment. Whole-state backup/restore, identity-preserving relocation, crash-orphan/retired generation cleanup, source host/trust and concentrated physical/provider/gesture/tag/AI/offline QA remain OPEN; no immediate user testing is requested.

## NEXT-62 — legacy recall and stored-only compatibility sessions (2026-10-23, unpublished)

**ISOLATED_IMPLEMENTATION / CURRENT_SOURCE_CI_AND_INSTALLABLE_PROOF_REQUIRED / FULL_OBJECTIVE_RELEASE_OTA_DEVICE_QA_OPEN.**

- Continues frozen NEXT-61 `3ce697566f379fef2dc566af9e91f3ee183c2d21`, full handoff SHA256 `a6ee113fa3ab7957bdd03d3dd14d07baaa666807f419d9f8a7a9c97ab21b66b3`. Its CI passed Linux1737+8 / Windows1744+1 /1745, Chromium48, Android362; those results do not validate this new source.
- Three actual baseline probes reproduced status initialization and seen-ID consumption before a failed adaptive batch. Actual recall/V2/adaptive bodies now use explicit domain ports;19 frozen method hashes include both complete old controllers. [Scope, reuse and holds](docs/LEGACY_ADAPTIVE_RECOMMENDATION_MODULE.md).
- Status uses ephemeral drafts without writes or generation capability. Existing SQLite savepoint covers adaptive pool+pointer and final allocation+batch+pointer+view; source revision fences late legacy metadata. Same old rankers/p-limit/converter, schema/API/state keys/response shapes; no new dependency/framework/protocol/model.
- Inspected source-only108/108 across11 files, including43 new assertions, types and Web45/45 PASS. Shared helper text hash proves its only change is the import of the same normalizer. Sandbox dependency denial occurred before tests and is retained separately. Full exact-source CI/compiled faults/fixed-certificate Dev76→77 remain REQUIRED before package PASS. No local Java/application/browser/LAN/upgrade runtime.
- Static session-size criteria now inspect the actual inherited constants/owner. No security/cap/timeout/retry/skip relaxation. Full objective/source host-trust/overlapping commands/physical provider-phone-gesture-tag-AI-offline QA/crash-OTA-UNC remain OPEN. No production access, merge/release/OTA/key download/install/deployment.

## NEXT-61 — stored work-identity views/commands/task and atomic human decisions (2026-10-23, unpublished)

**ISOLATED_IMPLEMENTATION / CURRENT_SOURCE_CI_AND_INSTALLABLE_PROOF_REQUIRED / FULL_OBJECTIVE_RELEASE_OTA_DEVICE_QA_OPEN.**

- Continues frozen NEXT-60 `2c3f7d647100441398b28fbdc0cc41a5e8ffd0cc`; immutable complete handoff SHA256 `da40f5b62e7370ec4b304eb7b5c91abe5f94f097a04de0048c1f893251876c99`. That source's actual CI/package results remain preserved, not borrowed for this candidate.
- Four synthetic baseline probes confirmed audit/detail policy initialization and decision-save/clear half-state after policy write rejection. Extracts actual six view, three command and five task-control methods with a frozen15-method oracle (includes catalog helper); public compatibility, matching bodies/thresholds/model, schema, formats and module APIs stay. Read/evidence paths now use ephemeral policy defaults.
- Identity now owns its actual domain under `src/identity`, outside recommendation orchestration, and consumes only frozen explicit-distinct facts, not tag/taste/session profiles. Shared matcher input changes are type-only; canonical emitted matcher JavaScript retains the exact frozen hash. Explicit decision/clear reuses the existing SQLite synchronous savepoint for decision + distinct-pair policy + returned review. Pre-/post-policy-write, validation, view failure and nested rollback tests cover the concrete gap. Evidence keeps its existing batch transaction; preparation stays idempotent PREPARED_ONLY with no binding apply. [Ownership, reuse, coverage and limits](docs/WORK_IDENTITY_MODULE.md).
- Inspected local source checks:149/149 across8 files, types and Web45/45 syntax PASS;84 new identity assertions cover complete output/row/read-order parity, >5000 decisions, synthetic cover matching, local pairs, all-table safety, actual background control, minimum factual authority and pure runtime import direction. First stale service-location assertions are retained and redirected to actual owners, not duplicated strings. Full exact-source CI, compiled Windows post-SQL fault gates and fixed-signed Dev76 remain **REQUIRED BEFORE CLAIMING PACKAGE PASS**.
- No local Java, packaged application, browser/LAN or upgrade runtime checks: current full/native/signature/runtime gates run only in authorized Draft CI. No production data, main merge, tag/Release, OTA, key download, install or deployment. Large-profile latency, release/crash/multi-process durability, physical/provider/gesture/tag/AI/offline acceptance and the full objective remain open.
- First pushed source `170b91dc6d10262c3627e9d53aced0f85ae57dc3`, run `40064133920`, retained1735 passed +2 stale source-location failures +8 platform skips /1745. The two criteria (variants/no-write ownership and unbounded authoritative identity reads) now inspect actual query methods and adapter/service binding; expanded inspected source checks156/156 across10 files PASS. No matcher, application guard, cap, timeout, retry or skip was weakened. Full failed log/source metadata are preserved in the handoff. No Windows/native candidate was produced by that failed push.

## NEXT-60 — V5 shadow execution/task boundaries (2026-10-23, unpublished)

**ISOLATED_IMPLEMENTATION / EXACT_SOURCE_CI_AND_PACKAGE_GATES_REQUIRED / FULL_OBJECTIVE_RELEASE_OTA_DEVICE_QA_OPEN.**

- Continues frozen NEXT-59 `f4e2c2ba8cb147292e4c344c59ca1619766a4380`, immutable handoff SHA256 `cb56e1130ea34af23fd64ed1823f2a29d757728419ea85aeda5b19b4c55292b0`; prior packages/results untouched.
- Three isolated synthetic baseline probes confirmed missing-policy initialization and audit commits after source revision changes. No real provider/profile/body/vector was used.
- Extracted the actual shadow pipeline and existing task-control state through explicit evidence/provider/semantic/audit/runtime capabilities, retaining compatibility entry points. New audit adapter reads policy without initialization and fences source revisions; no serving activation or raw-catalog writer is exposed. Existing algorithm bodies/limits/model versions remain.
- Frozen six-method hash oracle and actual browser-platform closure enforce real extraction. Local inspected synthetic tests compare complete outputs/telemetry/progress/read/provider order, budgets, private tags, failure, pause/resume/cancel/admission/duplicate/release, all-table safety and source fences; targeted94/94 across6 files, typecheck and Web45/45 syntax PASS. One first sandbox dependency-read failure and one stale source-location assertion failure are retained; no application or permission guard was weakened. [Ownership and limits](docs/RECOMMENDATION_SHADOW_MODULE.md).
- Full Windows unit/runtime and Linux/browser/JVM suites now belong to the authorized CI, with raw test artifacts; compiled Desktop gate adds real confirmation/background completion and exactly one audit-only append in a source-disabled synthetic profile. Fixed-certificate Dev75, exact-head complete CI, artifact integrity and a new handoff are **REQUIRED BEFORE CLAIMING PACKAGE PASS**. Local Java/artifact/LAN/upgrade runtime checks are deliberately NOT RUN, not inferred from CI. Previous immutable evidence is not borrowed as current acceptance.
- Apply the new no-local-Java/no-random-artifact/no-LAN validation policy. Continue only within the original isolated candidate/Draft/CI authority and prior coordination exception; no production data, main merge, tag/Release, OTA, signing-key download or deployment.

## NEXT-59 — read-only V5 audit/query and export modules (2026-10-23, unpublished)

**ISOLATED_IMPLEMENTATION / EXACT_SOURCE_GATES_REQUIRED_IN_HANDOFF / FULL_OBJECTIVE_RELEASE_OTA_DEVICE_QA_OPEN.**

- Continues frozen NEXT-58 `fe360d315d53c597042307a47e6e81fc14c9a1ef`, immutable handoff SHA256 `39faf0f43235c6cdce911962f3253aa14c677f72d2ec43a4362d8ced953ed632`. Keeps all prior packages and first failures unchanged.
- Verified eight read paths initializing missing policy and export computing reports before a cancelled Save dialog; a separate rejecting regression also exposed initialization in mobile sync preview. Extracts13 actual V5 query/audit/planning methods through explicit read-only ports, plus schema2 export assembly and existing ZIP/file adapter. Selected reads and preview no longer initialize policy; explicit merge/save defaults and JSON/schema/weights/Visual thresholds stay unchanged. Save cancellation precedes any data acquisition.
- Moves existing E-H string tag parsing unchanged away from the account client, keeping its compatibility export. Actual browser-platform dependency closure, frozen14-method/output/read-order oracle and frozen old export entry-byte comparison complement synthetic all-table no-write/cancel/error tests. [Ownership, evidence, privacy and limits](docs/RECOMMENDATION_AUDIT_READ_MODULE.md).
- NEXT-58 J7 initial timeout remains UNDETERMINED despite one same-parameter passing retry. Adds bounded, allowlisted phase/button/card/network-status failure diagnostics with no identities/text/headers/bodies; no timeout/retry/criterion relaxation or claimed product fix.
- Native/JVM app logic, recommendation algorithms and stored formats stay; current-source CI, downloaded artifact gates and signed Dev73→74 belong to the new handoff. Physical testing stays deferred. Legacy/adaptive, V5 shadow/identity mutation, optional runtime/trust, native export/orphan/backup retention and published OTA/first-hop remain open.
- Same candidate/Draft/CI + prior DPAPI exception; no production access, merge/release/OTA, key download or deployment.

## NEXT-58 — shared update lifecycle, acknowledged startup and incremental recovery (2026-10-23, unpublished)

**ISOLATED_IMPLEMENTATION / EXACT_SOURCE_GATES_REQUIRED_IN_HANDOFF / FULL_OBJECTIVE_RELEASE_OTA_PHYSICAL_QA_OPEN.**

- Continues frozen NEXT-57 `7f9fdb772feadf40fdf24906ea553df677f0fe3b`, handoff SHA256 `48086613a54936fd365c615d9b4831a4b8ed3ba9bf9b64d02f40950e456d77c0`. Its isolated incremental-launch probe was a confirmed follow-up, not completed transaction acceptance.
- Shares existing full-helper process/health/shutdown/progress and user-state recovery via small modules. Current Desktop exits only after nonce/PID/parent/kind-bound ready plus acknowledgement. An unacknowledged orphan cannot later acquire replacement authority. Duplicate apply/staging are fenced; unsafe helper-stop failure retains the lock. No new framework/dependency.
- Incremental preflight rechecks source/bytes, path/disjoint roots, regular files, collisions, data exclusions and unchanged updater before app exit. Completes owned application/config/SQLite-sidecar backups before mutation; awaits launch and stops unhealthy replacement before recovery. Failed backup/status cannot be treated as usable recovery. Config absence is restored; proven healthy success is not rolled back for reporting failure. Existing recovery copies are retained.
- Adds actual Desktop/controller/helper same-source scoped asset cases and ready/ack to full-engine tests. No helper self-replacement/allowlist relaxation. These are **not** a published OTA or proof that new helper fixes already exist in old installed clients. [Scope, reuse, protocol, tests and limits](docs/INCREMENTAL_UPDATE_RUNTIME.md).
- Actual first-package staging exposed the missing explicit `postrc` prerelease label; this is now recognized without admitting stable local-test updates. Successful spawn without instance publication fails closed: retain backups, do not overwrite or relaunch into an unknown process. Both source tests and an actual child-process fixture cover this boundary; failed first-attempt evidence stays retained.
- First pushed CI `40046718879` / `1a4b44af...` retained a real full-engine rename EPERM after eight scoped cases passed. Adds bounded Windows EPERM/EACCES/EBUSY directory-rename retry, with repeated backup-ownership checks and permanent/nontransient failure protection. Does not infer who held the directory or retrospectively diagnose older runner failures; first failed run/log/diagnostic remain evidence.
- Native/JVM and recommendation/tag/Visual/schema/module contracts stay; current-source CI, fixed-signed Dev72→73 and actual packages/stable/prior/deep gates belong to the new handoff. User/device QA remains deferred. V5/legacy, optional runtime/trust, export/orphan/backup retention and crash/power-loss/UNC remain open; original runner-only cause undetermined.
- Same independent candidate/Draft/CI + prior DPAPI exception; no production account/data, main merge, tag/Release, OTA, key download, installation or deployment.

## NEXT-57 — recommendation build ports, actual pipeline and commit-status truth (2026-10-23, unpublished)

**ISOLATED_IMPLEMENTATION / EXACT_SOURCE_GATES_REQUIRED_IN_HANDOFF / FULL_OBJECTIVE_AND_PHYSICAL_QA_OPEN.**

- Continues frozen NEXT-56 `2167576eea14e2c02f4d143e2097f4ca24da8856`, immutable handoff SHA256 `593c0b28eadebbe89acb4758e587c5fee22de4896bf46eb1b6d0db9af8e61874`. Keeps all previous packages and failed evidence unchanged.
- Extracts the real Final V3 ordered build from LibraryService behind explicit evidence/semantics/provider/checkpoint/progress/version/revision capabilities. SQLite/account/Registry I/O remains in application adapters; existing algorithms, budgets, result format and observation timing are retained. Pure author normalizers are shared without crypto; the old API re-exports them.
- Adds browser-platform actual dependency-closure enforcement and a hash-frozen old-method oracle. Synthetic old/new comparisons check full scores/ranks/evidence/versions/telemetry and I/O order across Visual modes, provider restrictions/failure, private tags, limited pools, both source fences and cancellation. No DINO inference/training, real account or body data.
- Reproduces false-complete UI after candidate-pool save failure. Optional commit-state observation now distinguishes persistence from successful activation, fences obsolete status updates and cannot veto storage; failure/retry and old-batch preservation tests complement unchanged read-only delivery gates. [Contract and limitations](docs/RECOMMENDATION_BUILD_PIPELINE.md).
- Native/JVM logic remains unchanged; Dev72 must preserve Dev71 identity/certificate. Exact-source full suites, CI, actual Windows/Android packages and state-retaining stable/prior/deep update gates belong to the new handoff, not borrowed green results.
- V5 audit/export/legacy separation, source-extension trust/runtime, native export/orphan collection and concentrated physical/provider/gesture/tag/AI/offline QA remain open. Legacy incremental asynchronous-launch error parity is a separately tracked follow-up, not covered by full-update recovery. Same candidate/Draft/CI + prior DPAPI exception; no production access, main merge, tag/Release, OTA, private-key download, installation or deployment.

## NEXT-56 — SQLite physical-path adapter and deep-path upgrade recovery (2026-10-23, unpublished)

**ISOLATED_IMPLEMENTATION / EXACT_SOURCE_GATES_REQUIRED_IN_HANDOFF / FULL_OBJECTIVE_AND_PHYSICAL_QA_OPEN.**

- Continues verified NEXT-55 `acab174c7b01f3ee32883b2bb89cfbf717ac0bf7`, complete handoff SHA256 `4d2a819a0325cebe118fc6c1fe3dd7dcfd359a30f14dceceb73212b15691b8e3`. Preserves that archive and its separately recorded deep-profile failure.
- Uses the same actual packaged Node/SQLite to isolate two path limits: Win32 journal paths and the default SQLite VFS byte ceiling. Reuses Node's namespace conversion plus SQLite's built-in locking `win32-longpath`; no custom database engine/extension, registry changes, new dependency or data relocation.
- Extracts a pure filename adapter; logical filenames/config/schema stay unchanged. Checks unsupported native limits before setup save, database mkdir/open, full-update apply and helper replacement. Closes a constructed SQLite connection when subsequent startup fails, retaining the original error.
- Adds real deep LibraryDatabase/ordinary-VFS lock tests and actual source-free CLI/Desktop import→Reader→restart/backup gates at253/1200/4096. Extends current-candidate replacement/health/async recovery fixtures to1200 characters, while retaining public/prior baseline ordinary-path gates and minimal diagnostic retention. [Scope, reuse, evidence and limits](docs/SQLITE_PATH_ADAPTER.md).
- The first local candidate's actual recovery test caught a Rollup shared-chunk dependency outside the detached helper. That failure is retained. CLI/Desktop keep their shared chunks, but each external helper is independently bundled into one file with a built-in-only closure guard and real isolated-start tests; no path-policy duplication or second updater framework.
- The first pushed candidate's Windows/standard CI passed, but its Android signing-step gate exposed inconsistent Dev version metadata (build71 versus literal verify70). Build and manifest verification now share one public workflow authority with a rejecting regression fixture and explicit mismatch diagnostics; package/certificate checks are not relaxed. The failed run is retained, and new exact-head signed-artifact gates remain required.
- Native/JVM app logic is unchanged; Dev71 retains Dev70 identity/certificate. Exact-source package/CI results are recorded in the new handoff. UNC/network/removable storage, maximum endpoints, physical device/provider/gesture/tag/offline-sync and released OTA acceptance remain unverified. The older runner-only failure is still UNDETERMINED, not conflated with the reproduced path defect.
- Same independent candidate/Draft/CI and prior DPAPI exception authority. No production access, main merge, tag/Release, stable OTA change, key download, installation or deployment. Recommendation build-pipeline/V5/legacy, source-host trust decisions and native export/orphan collection remain open.

## NEXT-55 — update transaction recovery and bounded failure diagnostics (2026-10-23, unpublished)

**ISOLATED_IMPLEMENTATION / EXACT_SOURCE_GATES_REQUIRED_IN_HANDOFF / RELEASE_AND_PHYSICAL_QA_HELD.** Full modular-reader objective remains open.

- Continues verified NEXT-54 `bb9bdefe53768a421afa9bc7e7428c541e4af75a`, complete handoff SHA256 `08d6f8ff612ddd7863893edf5de8d5933acd5a9d4be3df6c3fc39b3bede9b432`. That turn completed direct Android local import, actual source-bound installables and synthetic upgrade gates; no production/deployment/release change.
- Awaits asynchronous launcher failures inside the existing full-update transaction; recovery status-write failures cannot block restoring application/config/database; records backup ownership before partial copy; nonfatal browser fallback errors cannot roll back a healthy installation.
- Adds source and actual-old-Windows counterexamples, including a work path with spaces. New actual package must restore/start the original application after a deterministic test-only first-spawn error, in addition to ordinary replacement and deliberate health failure. No production fault flag or new updater framework.
- Extracts a bounded test-diagnostics adapter with progress-field/file allowlists, secret-line omission and byte limits. Windows CI retains only those reports with always-run artifact upload; no profile/database/instruction wildcard. Own-process cleanup verifies its exact synthetic root.
- Dev70 preserves Dev69 package/certificate; native/JVM logic is unchanged. Exact-source/current CI and actual Windows/Android artifact identity plus stable/prior upgrade/rollback gates are recorded separately. Original runner-only code1 remains **UNDETERMINED**, not attributed to these independently verified defects. [Scope and holds](docs/UPGRADE_RECOVERY_MODULE.md).
- Same isolated candidate/Draft/CI and prior DPAPI exception authority; no main merge, tag/Release, stable OTA change, private-key download, production access, installation or deployment. Recommendation build-pipeline, trusted extension/runtime decisions and concentrated physical/provider QA remain open.

## NEXT-54 — Android direct local folder/CBZ import (2026-10-23, unpublished)

**ISOLATED_IMPLEMENTATION / EXACT_SOURCE_GATES_REQUIRED_IN_HANDOFF / PHYSICAL_SAF_QA_PENDING.** Full modular-reader objective remains open.

- Continues frozen NEXT-53 `9ff83d2d09fdcb87e3f43e761ac5e09004b5b5f7`; immutable complete handoff SHA256 `19ebe7123f012394a5d27aad79a57b2d82cc531320b3339a74d34b0d77635293`.
- Adds phone-local folder/CBZ picker → bounded private staging → preview/explicit confirm → existing Reader/catalog/cover/history. Reuses SAF/DocumentFile/Java ZIP, no new dependency or reference APK code. Pure import rules have a no-Android compilation gate.
- Device/origin/kind-scoped opaque local IDs, no persisted original URI, no provider authentication/transport. Reimport keeps identity and page-ID progress; invalid/cancelled commits preserve previous inventory. Removing a confirmed app-owned copy leaves original/Desktop/cloud files and private metadata/history untouched. Retired generations remain for in-flight Readers; crash-orphan collection is not claimed.
- Pinned internal body store is separate from disposable caches/data-root preferences. Existing state formats/database schema/public module APIs stay; additive `localImported` is an availability fact, not a provider download. Dev69 retains Dev68 package/signature. No uninstall/reset or automatic deployment.
- [Scope, byte/path limits, reuse and unverified native/provider boundaries](docs/NATIVE_LOCAL_CONTENT_INGESTION.md). Exact-source Android/Desktop/browser/actual-Windows and upgrade gates are required in the new handoff; prior results are provenance only. Same isolated candidate/Draft/CI + DPAPI exception authority; no production access, main merge, tag/Release, OTA or private-key download.

## NEXT-53 — recommendation cycle commands, read-only delivery and storage ports (2026-10-23, unpublished)

**ISOLATED_IMPLEMENTATION / EXACT_SOURCE_GATES_REQUIRED_IN_HANDOFF / DEVICE_QA_PENDING.** Full modular-reader work remains open.

- Continues frozen NEXT-52 `21c94df844f87db7d58aaa9625612b132eaea32f`; immutable complete handoff SHA256 `a6a33363ad1f96e7f26b19f5118989c9db2b9812c61477f052f8df4fe309a1c8`.
- Moves V3 cycle orchestration and result queries into a domain with explicit read/write/build/clock/identity capabilities. Reuses existing ranker, allocator, ownership/block and tag algorithms; SQLite methods/transactions and the old constructor remain application adapters. Browser-platform compilation checks actual runtime imports.
- Mobile GET current/cache can only read persisted data; no state initialization, first-batch allocation, seen advancement or recall. Explicit recompute POST prepares the first batch. Local server startup stops legacy automatic recall. Existing Desktop command and portable formats remain.
- Invalidates warm eligibility for newly seen/duplicate/blocked/temporarily suppressed items, and uses reviewed canonical ownership in both batch and portable views. Stored scores, batches and pool evidence are unchanged. New SQLite/paired-HTTP tests cover these flows; old static guards follow the moved implementation instead of a compatibility facade.
- Dev code68 retains code67 identity/signature; native logic and shared JVM sources are unchanged. Exact-source CI, actual Windows package checks and stable/prior full replacement/forced rollback must be recorded in the new handoff. Prior green results are provenance only.
- Initial actual-Windows gate at `eeebe93` correctly rejected the fixture: CLI CSV import creates library membership as well as favorites, so clearing only favorites left both supposed candidates owned and correctly filtered. Preserve the failed CI log, remove only those two synthetic membership rows and assert candidate eligibility before launch. Production ownership logic stays unchanged; rebuild from the corrected final source.
- [Module contract and remaining build-pipeline work](docs/RECOMMENDATION_CYCLE_MODULE.md). Existing isolated candidate/Draft/CI and DPAPI exception authority continues. No production data, main merge, tag/Release, stable OTA change, private-key download, installation or deployment.

## NEXT-52 — native tag domain and cross-client golden contract (2026-10-23, unpublished)

**ISOLATED_IMPLEMENTATION / EXACT_SOURCE_GATES_REQUIRED_IN_HANDOFF / PHYSICAL_QA_PENDING.** The full modular-reader objective remains open.

- Continues frozen NEXT-51 `b4517ea70519d0266c985e1f67cb48beb393bc2d`; complete immutable handoff SHA256 `2412d0fcadbd5bde549e963cb1d86da230d0139511bd307b13d48ac438670dbd`. Old archives/results are unchanged.
- Extracts pure Java personal-tag normalization, participation, private matching and unique-work counts. Existing org.json, Android catalog/portable/E-H raw-fact stores and editor remain adapters. No new dependency/protocol or taxonomy framework.
- Both Desktop and Android read the same 44-case hand-authored synthetic fixture. Empty-classpath compilation plus SDK28/35 domain/adapter tests protect provider isolation, raw namespaces, private binding, explicit save/conflicts and immutable inputs.
- Corrects Android's missing local namespace in unscoped controls, stale selected-list influence in ALL and missing current-comic facts at score gates. Explicit malformed false/numeric-name state rejects instead of coercing/resetting. Valid schema1/module API2 state, raw BLOCK, pending/cache baseline, ranking weights and Visual remain unchanged.
- Candidate Dev code67 must preserve code66 identity/signature. Full local tests, exact-source CI, downloaded-artifact inspection and actual Windows update/forced rollback receipts are required in the separate handoff; no previous green result validates this source.
- [Detailed boundary and device holds](docs/NATIVE_TAG_POLICY_MODULE.md). Recommendation service ports, Android local import, source-runtime/trust decisions and deferred concentrated user tests remain open. No main merge, tag/Release, stable OTA, production access, key download, automatic install or deployment; prior isolated-write/DPAPI exception authorization remains in effect.

## NEXT-51 — native Reader gesture decision seam (2026-10-23, unpublished)

**ISOLATED_IMPLEMENTATION / EXACT_SOURCE_GATES_RECORDED_IN_HANDOFF / PHYSICAL_TOUCH_QA_PENDING.** The complete modular-reader objective remains open.

- Continues frozen NEXT-50 `76898ad29c1ac804b7451ac889107511c7532b21`; immutable complete handoff SHA256 `7c2003e35c5a5a48a735da2488821939c57f037a5046f3d31cc833ecf9d6a1e2`. No old archive/evidence is overwritten.
- Extracts pure Java gesture decisions and per-touch ownership from the image widget. Reuses Android GestureDetector/ScaleGestureDetector and existing AndroidX containers, not a new recognition stack. A no-Android compilation gate and plain JUnit protect the seam.
- Adds SDK28/35 event regression for cancelled/pending taps, recycled/detached views, vertical-dominant flings, parent interception, pinch/pan and pager-managed suppression. Disabling double-tap also disables Android quick-scale; pinch remains independent.
- Local Desktop: 1359 passed + one existing POSIX-host skip. Android: 285 passed + 13 existing Windows/SDK35 AtomicFile skips (298 total, required to execute on Linux CI); lint and release shrinker passed. Running the old widget against the new 36-case SDK28/35 event suite produced eight expected failures across four defect scenarios; restoring the candidate must pass again before freezing evidence.
- Preserves phone-local preference file/keys/defaults and existing zoom levels; portable reading settings, progress, sources, accounts, schema and production data are not migrated or reset. Candidate Dev code66 must retain code65's package/certificate.
- [Detailed contract and remaining physical-device limits](docs/NATIVE_READER_GESTURE_MODULE.md). Automated counts, exact-source CI, actual installable hashes and Windows update/rollback evidence belong in the separate handoff. No issue/device acceptance is inferred from CI, and no user test is forced now.
- Existing isolated-development/Draft-PR/CI and DPAPI coordination exception authorization continues. No main merge, tag/Release, stable OTA, production-profile access, key download, automatic install or deployment.

## NEXT-50 — phone-local native source lifecycle (2026-10-23, unpublished)

**ISOLATED_IMPLEMENTATION / LOCAL_REGRESSION_PASS / EXACT_SOURCE_CI_AND_PACKAGE_EVIDENCE_IN_HANDOFF / REAL_DEVICE_QA_PENDING.** The full modular-reader objective remains open.

- Continues immutable NEXT-49 `81f8b5665c6ba456a64b6660049727182d3ff4d1`; its complete handoff SHA256 is `9385440668d86fdb96e682eaeded5fba9fc54e56b61c8fbfe0be01f9f3f0246f`. Previous archives/evidence remain unchanged.
- Adds phone-local Pica/E-H/JM choices with explicit draft/save, stale-revision protection, retained rotation draft and Chinese/English/Japanese UI. New installations start source-free; existing installs adopt legacy availability once, without decoding credentials. Desktop pairing does not overwrite phone choices.
- Pure Java source authorization is separate from Android storage/UI. Existing direct and Desktop-relay provider transports, workers, metadata/favorite imports and image caches receive cancellation/late-result guards. JM uses the existing pinned SDK with non-blocking request-monitor revocation. Local/LAN/WebDAV reads and stored data remain independent.
- Synthetic tests cover source policy, real AtomicFile persistence/restart, locales, task cancellation/data retention, stale results and already-cached/local Reader pages. Windows SDK35 AtomicFile persistence cases are explicitly skipped only on that host and must execute on Linux CI; SDK28 counterparts pass locally. Final counts and exact-source CI/installable evidence are in the separate handoff.
- Existing task registries are preserved even when a historical identity is malformed; re-enabling does not automatically resume paused downloads/bootstrap. Dev code65 retains the existing package/certificate; current Windows artifacts and upgrade/rollback gates must cover the shared JVM change.
- [Implementation, migration and remaining device limitations](docs/NATIVE_SOURCE_LIFECYCLE.md). Native WebView/SAF/OEM behavior, real provider accounts, gesture acceptance and the remaining architecture work are not certified by synthetic tests.
- Existing authorization covers isolated edits, this Draft PR and unpublished CI builds. No main merge, tag/Release, stable OTA change, production data/credentials, private-key download or deployment; the previously authorized DPAPI coordination exception remains in effect.

## NEXT-49 — persisted Desktop source lifecycle (2026-10-23, unpublished)

**ISOLATED_IMPLEMENTATION / LOCAL_AUTOMATION_PASS / EXACT_SOURCE_PACKAGE_GATES_IN_HANDOFF / NATIVE_LIFECYCLE_AND_DEVICE_QA_PENDING.** Not completion of the full modular-reader objective.

- Continues immutable NEXT-48 `963af71c96e55578722f0806e37393b5bfa40c13`; its complete handoff SHA256 is `ec732724f7435eecc8a012008d290f8a9c34252671fffa8f70536a3c28eb0f86`. Prior artifacts/proofs are not overwritten or relabeled.
- Adds a pure source-policy/request-lease module and atomic Desktop configuration adapter, explicit three-language Read → draft checkbox → Save UX. Fresh local setup has no online source enabled; existing pre-policy configuration preserves legacy choices. Credentials, library membership, local Reader/LAN and current recommendation batches are not deleted or reset.
- Low-level Pica/EH/JM transport guards cover retained clients, not just UI/registry entrypoints. Disable aborts requests/closes JM; stale completions cannot import metadata after disable/re-enable. V3 no longer requires Pica when its source is off and EH is selected; capabilities/planning reflect enabled sources. No ranking/Visual re-tuning.
- Mobile Desktop account status honors source availability; phone-owned source toggles/worker lifecycle remain a separate unfinished step. Existing direct phone sessions are not silently disabled by Desktop. Draft Dev code64 retains package/fixed signing certificate, with no install/OTA action.
- Local tests: TypeScript, Web45 syntax, 1359 assertions + one platform skip; Edge46 including all three locale source-choice cases. Actual new archives, CI and restart/upgrade proofs are bound in a separate final handoff. [Detailed semantics, failure handling and holds](docs/SOURCE_LIFECYCLE.md).
- No main merge, tag/Release, production data/credential reads, automatic deployment or new extension host. DPAPI coordination remains unavailable; the user's existing isolated-write exception is reused without changing identities/secrets.
- Pre-build fixture review found that the earlier packaged media test assumed every fresh local installation could immediately fetch JM covers. The new explicit opt-in contract correctly forbids that. Update the fixture to assert all sources initially off, explicitly enable only JM, and test real in-flight HTTP cancellation, disabled-request rejection, stale-save protection and policy persistence through actual shutdown/relaunch. Do not weaken the production default to preserve an obsolete fixture assumption.

## NEXT-48 — local folder/CBZ ingestion and cache freshness (2026-10-23, unpublished)

**IMPLEMENTED_IN_ISOLATED_CANDIDATE / EXACT_SOURCE_PACKAGE_GATES_RECORDED_IN_FROZEN_HANDOFF / MANUAL_QA_PENDING.** This does not complete the full local-reader/source lifecycle objective.

- Continues frozen NEXT-47 `241734856565b09f6bf18dae43b4f2fba6094268`; actual source/media Windows + fixed-signature Dev gates passed in run39944017468, with complete unchanged handoff SHA256 `bf344a511dc5ad5abb854f61a5f3629cef06c95e03078741bad88ceca7845798`. Prior evidence is provenance, not acceptance of new source.
- Adds independent catalog `local:` identity (not an online adapter); existing native folder/CBZ open picker → bounded preview → explicit copied import → existing Reader and authenticated LAN. A narrow inventory storage port separates ingestion from SQLite/source auth/recommendation. Originals are untouched; no disk-wide scan or credential transfer.
- Reimport preserves origin-based comic IDs, relative chapter/page IDs, logical reading position, favorites/private state; missing pages leave the readable inventory, missing chapters retain unavailable identities/history. Input changes/SQL failure preserve the old committed inventory. Limits, cleanup/crash-orphan holds and unsupported CBR/PDF/Android direct import are explicit in `docs/LOCAL_CONTENT_INGESTION.md`.
- Fixes browser cover freshness (`private, no-store`) and revisioned imported-body URLs preserved by the paired bridge. Corrects source labels/CSV inference, local tag namespace on both clients, native foreign-source fallbacks and local detail's inappropriate Pica-login action. Local-only storage can now contain ordinary words such as “account/token”; config still rejects secret keys and credentialed proxy URLs.
- Library/tag module APIs2 intentionally require the existing one-click full replacement, not a forced incompatible delta; schema14/Reader/source APIs unchanged. Dev code63 must retain the fixed package/certificate. Real Windows-archive CLI/import/Reader/reimport/restart is added to CI, alongside full successful/failed-health recovery and native tests.
- First browser attempt stopped at the ordinary welcome guide, then used the existing completed-v2 fixture contract (disclaimer still handled normally). First full suite found two historical test assumptions: first-adoption module floor and the old three-provider catalog type. Tests now preserve the old compatibility-floor case, explicitly reject the new module break as incremental, and cover the local catalog identity rather than weakening production guards. Failures remain in task evidence.
- Exact new source/hash and applicable-platform counts are frozen after build; no previous artifact is renamed. Native dialogs/OEM gestures, real devices/accounts, AI semantic usefulness, source opt-in/trust lifecycle and further recommendation/native decomposition remain pending. No issue closure, main merge, tag/Release, stable OTA, production data, key download or deployment.
- Pre-handoff source review of `1042af3` also found the legacy recommendation fallback calling `pica.related(seedId)` directly, outside the registry. Restrict that specific native-ID route to legacy Pica catalog identities; a synthetic behavioral test proves local favorites never reach it while a real Pica-identity fixture still does. This is source routing, not a ranker-weight/model change. Rebuild the final follow-up source rather than accepting the superseded in-progress artifacts.
- The actual Windows ZIP gate at `5ce9879` failed after successful import/ordinary/media checks: imported paths used native async canonicalization, while Reader's legacy synchronous realpath retained a Windows 8.3 root alias (`RUNNER~1` vs long user path) and falsely treated owned files as outside the library. Use native realpath for both Reader root/file, retaining the escape rejection. Add a deterministic alias-mismatch regression and better actual-archive chapter diagnostics. Source-only/old-launcher-overlay diagnostics pass but are explicitly not installable proof; retain the real CI failure and rebuild/reverify the final archive.
- Follow-up `d38b9ae` passed actual Windows CI run39955461162 and independent downloaded-package import/Reader/reimport/restart; both v0.5.0 and prior candidate full replacement/forced rollback preserved synthetic state. Final evidence collection nevertheless rejected the browser count: the shell CI selector still ran 42 tests, omitting the new local-import scenario that passed among 43 locally. Add that scenario to the existing CI command; preserve the count discrepancy and rebuild from this final coverage fix. Do not report local-only execution as CI execution.

> **Purpose:** authoritative engineering task log for the architecture/runtime/multi-platform expansion.
>
> This file is intentionally different from `PROJECT_LOG.md`: `PROJECT_LOG.md` records released/versioned product evolution; this file records **what still needs to be done, why, in what order, and what evidence is required before a task is considered complete**.

Last reconciled: **2026-10-12**

2026-10-21 isolated integration update: see **NEXT-38/39** and its exact-source package evidence. The dated reconciliation below remains historical; it is not a fresh acceptance claim for every backlog item.

Audited repository baseline: `main@095d6910c34e00824e03b08a30af0ce4e708137e` (post-release reconnect fix, PR #198 merged)

Published baseline: **v0.5.0 / Android v55**, source `bec7f9f31828e8c57e0a2c103b6b1206c22c37cf`, published 2026-10-01 UTC

Current critical path: **NEXT-33 isolated post-release RC evidence → representative Windows/Android manual/physical evidence → K5 variance/budget review**

## Current reconciliation — 2026-10-12

Historical dated entries below retain their original context. The table below and the current NEXT status lines supersede obsolete "publication pending" or "J1/J2 only" wording; publication does not close the larger engineering backlog.

| Lane | Verified progress | Still open |
| --- | --- | --- |
| NEXT-32 release | [v0.5.0 published](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.5.0); [publish run 36815096800](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/36815096800) passed released Windows upgrade, Android signing/install and asset verification | No new release authorized by this reconciliation |
| Post-release reconnect / NEXT-33 | PR #198 merged; [RC run 37492489884](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/37492489884) passed contract, Windows, Android and summary jobs at `454e9fef1a04` | Representative restart/reconnect and device QA remain pending. Artifacts are no longer listed by the run API on 2026-10-12; historical package PASS is not current download availability |
| P2-J / P2-K | J1–J11 measurement harnesses and K1–K5 collection/reconciliation tooling implemented | Nine representative evidence categories listed in NEXT-33; no performance budget or P2 completion claim |
| P2-C / P2-G | Desktop and Android G17 resource observation implemented | C3/G20 enforcement remains evidence-blocked; do not invent capacities |
| H2B | Visual QC / Author Atlas / Style Family timing and synthetic scaling available | Real measurements and foreground/background threshold decision |
| NEXT-28 | Release-scope corrective work shipped through PR #197 | A3 author-work completion prominence and A5 deeper refresh decomposition; PR #196 is a divergent Draft, not an accepted replacement for main |
| P4 / P4B / P6 | Automated previews and Windows/Android release paths exist | Real-platform/provider/rollback/performance/trust evidence; Server/Docker deployment and soak acceptance |
| W5 | W5A/B/C complete | W5D onboarding and W5E weak-network acceptance planned; W5F/G/H remain deferred |
| Community feedback / NEXT-34–35 | Display-only atlas projection and full-local-catalog preference discovery implemented in local-only `e12d48839d0a`; local automated gates passed | Implementation is not uploaded in this documentation update. Fresh remote CI, Windows package/human acceptance and #200 explanation/taxonomy/Android gaps remain open; neither issue is closed |
| Reader reference analysis / NEXT-36 | Isolated static analysis and 14-feature inventory completed; 27 analysis-model tests passed | Target APK was not executed; 28 reference-runtime scenarios remain pending. No third-party implementation or assets are imported |
| Android Reader gestures / NEXT-37 | Phone-local double-tap switch and 1.5×/2×/3× zoom implemented locally; 28/28 targeted tests passed | Uncommitted local source only; full Android build/lint/APK, ReaderActivity integration and device QA are not complete |

### 已推进但未验证 / Unreleased implementation inventory

The local-only work above is **PARTIAL**, not released capability. [Conversation progress and evidence limits](docs/UNVERIFIED_PROGRESS_20261012.md) records NEXT-34–37 with the remaining acceptance gates. This documentation commit uploads no application source, APK, decompiled material or private data. Historical RC checks do not validate the newer local implementations.

P1-E/G follow-ups and P1-F/P3 regression obligations remain open as documented. Old dependency-cleanup Drafts #23/#24 are not evidence of accepted implementation. Do not merge PR #196 wholesale: overlapping changes already shipped through #197, while its remaining author-progress work needs a current-main port and fresh tests.

---

## 0. How this log must be maintained

### Status vocabulary

- **DONE** — implementation exists and acceptance evidence is present.
- **PARTIAL** — meaningful implementation exists, but one or more acceptance gates remain.
- **IN_PROGRESS** — active branch/PR is implementing the task.
- **PLANNED** — accepted target; implementation not yet started.
- **BLOCKED** — cannot complete until an external prerequisite is available.
- **DEFERRED** — intentionally postponed; not silently abandoned.

### Update rules

1. Every PR that materially changes architecture, runtime behavior, platform support, Remote Web, packaging, performance, or recovery must reference one or more task IDs from this file.
2. A task must not move to **DONE** only because code exists. The relevant unit/integration/browser/package/real-device gate must also exist and pass.
3. Newly discovered work is appended under the closest existing workstream. Do not silently remove an unfinished task.
4. If scope or order changes, update this file in the same PR and record the reason in the **Decision / scope-change log**.
5. Existing safety boundaries are constraints, not suggestions. A new platform or UI must not bypass them to make a demo work.
6. Do not reopen completed recommendation-science/model work merely because this architecture project touches recommendation runtime. This log governs product architecture/runtime/platform work, not model-quality promotion.
7. Release/version history stays in `PROJECT_LOG.md`. This file remains the forward-looking source of truth.

### Non-negotiable product rules

- Ordinary browsing, page switching, search, Reader navigation and settings must remain responsive while heavy work is running.
- A task that can take more than a few seconds must not be a black box.
- Long tasks expose authoritative state, progress or an explicit indeterminate phase, bounded waits, cancel, retry/resume, and a documented pause/safe-stop semantic where technically meaningful.
- The last usable result remains authoritative until a replacement is fully committed.
- Network loss must fail within bounded time with an actionable state; no indefinite spinner.
- User-requested pause/cancel is not an item-level failure and must not be swallowed.
- Partial download/upload/index/recommendation results must never masquerade as completed state.
- UI state must reflect backend/Worker state; decorative progress or pause controls are unacceptable.
- Application binaries and user data remain separate across every platform.
- Platform capability reporting must be honest. Unsupported/unvalidated targets remain `distributionReady=false` and `selfUpdate=false`.
- Remote access never weakens the local loopback boundary by simply exposing the Desktop controller to the network.

---

# 1. Current priority and execution order

The current critical path is:

1. **P2 — Architecture & Runtime Hardening**: finish the system-level runtime/performance work that earlier versions addressed only partially.
2. **P2-H1 — Maintenance runtime hardening**: remove the confirmed foreground blocking/truncation paths before introducing broader resource arbitration.
3. **P3 — Platform foundation regression lock**: keep the shared platform/runtime layer clean while P2 changes land.
4. **P4 — Real-platform acceptance**: finish the open Linux/macOS/Windows ARM64/Server gates without weakening capability truth.
5. **P5 — Remote Web**: W5A/W5B/W5C are complete. Continue later Remote Web stages without allowing them to replace the P2 hardening work.
6. **P6 — Formal distribution/release gates**: only after real-device, signing/trust, performance and rollback evidence exists.

**Parallel-work rule:** isolated future Remote Web work may proceed only when it does not redefine the priority order above or weaken the completed W5A/W5B/W5C boundaries.

---

# 2. P1 — Correctness Foundation

Overall status: **PARTIAL / regression baseline established**

The original architecture audit put correctness before portability. Several core items are already locked by `test/unit/correctness-foundation-p1.test.ts`; the remaining requirement is to keep these invariants intact while runtime/platform work proceeds.

## P1-A — Direct single-object data access
**Status: DONE**

- Single comic detail lookup uses direct indexed database access.
- Do not route a single-comic detail request through a full-catalog list.
- Keep direct lookup behavior for future platform/API wrappers.

**Acceptance**
- Contract test continues to assert direct `WHERE c.id = ?` style lookup.
- No new API adapter reintroduces whole-catalog scans for single-object reads.

## P1-B — Correct detail navigation identity
**Status: DONE**

- Android comic-to-comic navigation uses the normal Activity back stack.
- `A detail -> B detail -> Back` must restore A rather than reuse stale B state.
- Web/Desktop detail transitions must not reuse stale async responses.

**Acceptance**
- Android manifest/back-stack regression remains green.
- Web stale-response generation/request-ID gate remains green.

## P1-C — Stale asynchronous response suppression
**Status: DONE**

- Requests tied to a selected comic/page/session must carry a generation/request identity.
- Late A responses cannot overwrite newer B UI state.

**Acceptance**
- Existing request-ID checks remain covered in tests.
- New Remote Web/mobile async detail flows follow the same rule.

## P1-D — Atomic portable/catalog persistence
**Status: DONE for current Android catalog path**

- Android Unified Catalog uses `AtomicFile` recovery semantics.
- Future portable-state files that can be rewritten in place must use equivalent atomic replace semantics.

**Acceptance**
- Process interruption cannot leave a half-written authoritative portable file.

## P1-E — Bounded-list correctness
**Status: PARTIAL**

- Large-library Work Identity lookup no longer relies on the old 5000-row limit.
- Audit remaining code paths for fixed list limits being incorrectly reused as identity/correctness limits.

**Acceptance**
- Pagination/UX bounds may remain, but correctness queries must not silently truncate the domain they claim to reason over.

## P1-F — Conservative Canonical Work identity
**Status: PARTIAL / ongoing regression requirement**

- `KEEP_SEPARATE` remains higher authority than heuristic similarity.
- Cover similarity remains auxiliary evidence, never a sole authoritative merge trigger.
- Series / Work / Edition / Upload distinctions remain explicit.

**Acceptance**
- No architecture/platform refactor collapses these layers or auto-materializes uncertain relationships.

## P1-G — Last-known-good replacement semantics
**Status: PARTIAL**

Applies to:
- recommendations,
- Visual index generations,
- catalog/portable state,
- remote sync publication,
- update/install replacement,
- migration/rollback.

**Acceptance**
- Incomplete replacement cannot destroy or supersede a previously usable generation.
- Commit/publish/activate boundaries are explicit and testable.

---

# 3. P2 — Architecture & Runtime Hardening

Overall status: **IN_PROGRESS priority workstream**

Existing v0.4.1, v0.4.7 and v0.4.8 work solved important concrete problems. P2 is not a request to rewrite those systems. Its purpose is to turn those fixes into a consistent runtime architecture, remove remaining duplicated/hidden heavy work, establish resource budgets, and add real performance evidence.

## P2-0 — Full runtime inventory and dependency map
**Status: DONE — see [docs/RUNTIME_INVENTORY_P2.md](./docs/RUNTIME_INVENTORY_P2.md)**

Inventory every operation that can materially consume CPU, disk, network, SQLite write bandwidth or UI time.

Minimum inventory:
- Recommendation V3 generation.
- Recommendation V5 shadow/evaluation/manual benchmark paths.
- Visual indexing / Visual QC / embedding-related work.
- Pica favorites sync.
- E-H/ExH account/favorites operations where long-running.
- WebDAV scan/upload/publication.
- Local download queue.
- Android download Workers.
- Android recommendation generation.
- Android Pica bootstrap/favorites import.
- Desktop-to-Android catalog/cover import.
- update download/apply/restart flow.
- maintenance/repair scans.
- Work Identity evidence scans/materialization preview.
- large library import/re-import.
- Remote Web/server operations that may proxy long-running work.
- startup recovery and migration work.

For every task record:
- execution owner (main thread / Worker / WorkManager / detached backend / child process);
- authoritative state store;
- progress source;
- pause semantics;
- cancel semantics;
- timeout/failure budget;
- restart recovery;
- SQLite read/write pattern;
- CPU/IO/network class;
- concurrency with other heavy tasks;
- last-known-good/commit boundary.

**Acceptance**
- A checked-in audit table exists.
- Every long-running task has an owner and lifecycle; “unknown/implicit” is treated as a defect.

## P2-A — Unified long-task state contract
**Status: PARTIAL**

Current mature pieces already exist for recommendation, Visual, favorites sync, WebDAV, downloads and Android Workers.

Target:
- define a common conceptual lifecycle without forcing all tasks into one implementation class;
- standardize state names and user-visible semantics;
- standardize `phase`, `done/total`, failure reason, canPause/canCancel/canRetry and recovery metadata where applicable;
- distinguish **in-place pause** from **durable safe-stop**;
- prevent page-local state from being treated as task authority.

**Do not regress**
- recommendation pause/resume/cancel;
- Visual comic-boundary checkpointing;
- favorites page checkpointing;
- WebDAV checkpointing;
- DB-backed download pause/resume;
- Android WorkManager durable semantics.

**Acceptance**
- task state returned by backend/Worker is authoritative;
- reload/navigation reconstructs task UI from authoritative state;
- control availability matches real backend capability.

## P2-B — Heavy-work execution isolation
**Status: PARTIAL**

Target:
- CPU-heavy Visual/model work stays off the UI/main event loop.
- Long HTTP endpoints start/inspect/control work; they do not own the lifetime of the work.
- Disk scans and hashing remain asynchronous and periodically yield.
- Android Activities render first and load/compute heavy recommendation state off the UI thread.
- opening a normal page never implicitly launches Evaluation, Visual QC or provider shadow work.

**Acceptance**
- no normal navigation path performs a hidden full-library scan/model load/network benchmark before first usable render;
- long work survives page navigation according to its documented semantics.

## P2-C — Runtime resource classes and concurrency budgets
**Status: IN_PROGRESS — C1 foundation + C2/C2B Desktop observe-only coverage; production enforcement remains disabled**

Create explicit budgets for at least:
- provider/API requests;
- media transfers;
- SQLite write-heavy work;
- local file hashing/scanning;
- CPU/model inference;
- background analysis/evaluation.

Questions the implementation must answer:
- Which tasks may run together?
- Which tasks should serialize?
- What is the Desktop default budget?
- What is the more conservative Android budget?
- What happens when a new heavy task starts while another is active?
- Does user-facing work receive priority over maintenance/background work?

Target behavior:
- Recommendation/Visual/WebDAV/downloads cannot all independently saturate CPU/disk/network.
- Foreground library/detail/Reader API latency remains protected.
- Provider limits are respected; do not optimize by evading upstream restrictions.

**Acceptance**
- budgets are centralized or otherwise auditable;
- concurrency is bounded;
- stress tests cover representative competing workloads.

## P2-D — SQLite/query/write discipline
**Status: PARTIAL — D1–D8B + D7C merged; further query/write rewrites require representative performance evidence**

Already improved:
- direct comic lookup;
- removal of known Android N+1 catalog reads;
- batched/throttled download progress writes;
- bounded download queue page.

Remaining:
- audit N+1 loops across Library/Shelves/History/Work Identity/recommendation/supporting APIs;
- audit synchronous DB/file operations on hot request/UI paths;
- identify repeated full-catalog materialization in one interaction;
- ensure indexes support common filters/identity lookups;
- batch transactionally coherent writes;
- avoid high-frequency progress/event writes starving foreground reads.

**Acceptance**
- documented hot-query inventory;
- no known per-card/per-page full-catalog read;
- representative large-library query regression tests.

## P2-E — Snapshot/cache discipline
**Status: IN_PROGRESS — E1/E2 merged; critical cache authority inventory documented; remaining browser/process cache audit moves into P2-F**

Keep and generalize successful patterns:
- frozen Recommendation serving snapshot for batch switching;
- Android Catalog/Policy/evidence/package reuse;
- Reader current-comic metadata cache;
- ownership fingerprint invalidation;
- generation/version identities.

Target:
- cache by authoritative generation/revision, not arbitrary time when possible;
- define invalidation source for every long-lived cache;
- never let cache identity leak across users/sessions/devices;
- avoid duplicate JSON parsing and file hashing in one interaction;
- preserve portable-state version separation.

**Acceptance**
- cache ownership, key and invalidation reason are documented for critical caches;
- stale cache cannot silently become authoritative.

## P2-F — Frontend responsiveness and observer discipline
**Status: IMPLEMENTATION_COMPLETE_REFERENCE_TRACE_OPEN — F1–F13 merged; real-browser cadence evidence passed; representative low-end Windows/browser CPU+jank trace remains external evidence**

Already improved:
- coalesced observers;
- duplicate-submission locks;
- lazy cover rendering;
- bounded Library/download rendering;
- settings pages avoid automatic provider probes;
- experimental tools do not automatically recompute on page open.

Remaining evidence only:
- capture representative low-end Windows/browser CPU + jank trace across Settings, Online, Recommendation and long-running analysis-task transitions;
- do not add more frontend rewrites unless that trace or a future regression identifies a concrete remaining hotspot.

**Acceptance**
- no full-page rescan per DOM mutation;
- only one authority for each recurring poll/state stream;
- browser performance trace shows no persistent high-frequency idle work from the app itself.

## P2-G — Android runtime hardening
**Status: IMPLEMENTATION_COMPLETE_UI_THREAD_IO / PHYSICAL_DEVICE_EVIDENCE_REQUIRED — G1–G19 merged; G20 enforcement blocked pending representative Android evidence**

Already improved:
- heavy recommendation profile work moved off Activity first frame;
- Catalog/Policy/evidence caches;
- bounded recommendation redraw;
- WorkManager-based background operations;
- page-level durable download resume.

Remaining:
- inventory all Activities/Fragments for main-thread file/JSON/DB/network work;
- unify background-task status presentation through the task center where appropriate;
- collect representative physical-device G18 idle startup/frame timing;
- collect representative physical-device G19 real recommendation-overlap timing with provider-network + cpu-analysis actually RUNNING;
- add/collect explicit real download and Reader loaded scenarios using user-selected real comic/chapter inputs rather than synthetic media work;
- pair G17 resource-overlap evidence with G18/G19 foreground metrics before choosing concurrency budgets;
- keep G20/P2-C3 Android concurrency enforcement blocked unless measured contention justifies it;
- validate remaining OEM/physical-device background restrictions where generic emulator evidence is insufficient;
- verify large Catalog and long Reader behavior on representative mid-range hardware.

**Acceptance**
- no known heavy blocking operation on the Android UI thread;
- process death does not convert partial work into completed state;
- background task UI is reconstructible after Activity recreation.

## P2-H — Startup, shutdown and crash recovery
**Status: IMPLEMENTATION_COMPLETE — H3 merged; automated recovery matrix reconciled; external Android/OEM evidence tracked under P2-G/P2-K**

Required:
- stale recommendation building state cleanup;
- active download recovery without reviving deliberate PAUSED tasks;
- WebDAV publication safety;
- Visual pending work preservation;
- explicit graceful shutdown ordering;
- forced-exit fallback must not leave a false completed state;
- schema migration backup before destructive/irreversible change;
- Browser lifecycle must not kill Mobile Bridge when paired devices require it;
- headless runtime must not depend on browser lifecycle.

**Acceptance**
- automated kill/restart tests for critical durable tasks;
- explicit recovery table checked into docs/tests.

Current reconciliation:
- Recommendation interrupted-building recovery: implemented and tested;
- Desktop LOCAL download restart/PAUSED preservation: implemented and tested;
- WebDAV publication safety: implemented;
- Visual unfinished-work preservation: implemented;
- schema pre-migration backup: implemented and tested;
- browser-close Mobile Bridge lease protection: implemented and tested;
- headless/browser lifecycle separation: implemented and tested;
- **H3 merged (PR #175):** Desktop shutdown is globally bounded and fault-isolated; one failed close owner cannot skip later HTTP/DB/instance cleanup.
- Full platform/package acceptance plus Android regressions passed before merge.
- Detailed recovery matrix: `docs/DESKTOP_SHUTDOWN_RECOVERY_P2H3.md`.

## P2-I — Observability without exposing internals to ordinary users
**Status: IMPLEMENTATION_COMPLETE_CORE_DESKTOP — I1/I2 merged; Visual remains browser-owned with H2B diagnostics unless a concrete trace proves a gap**

Internal diagnostics should expose:
- task ID/type/state/phase;
- start/update/end time;
- queue/wait/run duration;
- retries and bounded failure reason;
- resource class;
- provider route where safe;
- recovery origin after restart.

Ordinary UI should expose only useful status, progress and actionable errors.

Security:
- no provider credentials, cookies, bearer tokens or sensitive local paths in normal diagnostic exports;
- providerRoute, when present, must be a fixed low-cardinality label and must never contain URL/host/account/path values.

**Acceptance**
- enough structured telemetry to diagnose “stuck” vs “slow” vs “waiting” vs “failed”;
- diagnostic data follows existing credential-exclusion rules.

I1 merged (PR #176):
- read-only adapter over existing task authorities; no second scheduler/registry;
- Desktop-only `GET /api/v1/desktop/runtime/tasks`;
- first batch covers Recommendation V3, Favorites, Maintenance Update/Repair/Organize, V5 Shadow, Work Identity evidence and aggregate LOCAL downloads;
- unavailable task IDs/timestamps/control flags remain `null` instead of being synthesized;
- current resource wait/run state is correlated from the existing RuntimeResourceCoordinator;
- bounded error text redacts URLs, absolute paths, Bearer/token/password/cookie/authorization shapes;
- endpoint is excluded from Remote API and from J1 HTTP latency samples.

I2 merged (PR #177):
- extends the same schema/endpoint to WebDAV, Browser Lite export, managed E-H login and software update;
- external owners remain authoritative; Desktop main only aggregates snapshots;
- WebDAV reuses the existing shared `remote-storage-sync` resource lease;
- Browser Lite/E-H/updater do not receive invented resource leases/timestamps/IDs;
- adds safe `providerRoute` labels only for `webdav`, `eh-managed-browser`, and `github-release`;
- failed external-owner messages pass through the same I1 sanitizer;
- Remote API/browser-session boundaries remain unchanged;
- full CI/platform/Android regression matrix passed before merge.

Visual decision:
- do not add an I3 adapter merely for uniformity;
- Visual indexing task authority remains browser page/Worker-owned;
- H2B already exposes bounded Desktop Visual runtime timing/profile diagnostics;
- revisit only if representative traces show that current Visual diagnostics cannot distinguish slow/stuck/failed behavior.
- Detailed boundaries: `docs/RUNTIME_TASK_DIAGNOSTICS_P2I1.md`, `docs/RUNTIME_TASK_DIAGNOSTICS_P2I2.md`.

## P2-J — Performance instrumentation
**Status: AUTOMATION_COMPLETE_EXTERNAL_EVIDENCE_REQUIRED — J1–J11 merged; representative hardware/real-model evidence moves to P2-K**

Current `docs/audit/PERFORMANCE_REPORT.md` contains implementation bounds, not a complete real benchmark.

Add consistent measurement for:
- process cold start -> local API ready;
- browser open -> usable Home/Library;
- Android cold start -> usable main shell;
- Library first render and filtered query;
- comic detail open;
- shelf open;
- recommendation generation and batch switch separately;
- Reader chapter open / next page / long-session memory behavior;
- download queue API responsiveness under active transfers;
- WebDAV scan impact on foreground API latency;
- Visual indexing impact on foreground latency;
- task-concurrency scenarios;
- graceful shutdown.

**Acceptance**
- metrics are reproducible and emitted in machine-readable form where practical.

J3 merged (PR #179):
- adds `pnpm benchmark:desktop-startup` over the real built `dist/desktop.js --headless` entry;
- records a separate fresh-home sample, then repeated cold-process starts against the same isolated data root;
- measures spawn → instance publication, spawn → identified local API readiness, shutdown response and shutdown → process exit;
- emits raw samples plus min / median / max JSON summaries;
- build time and Provider credentials are outside the measured window;
- CI runs only a two-round `harnessValidationOnly` smoke; GitHub-runner milliseconds are not P2-K performance evidence;
- browser open → usable Home/Library is intentionally deferred to J4 rather than approximated from static Web smoke;
- J3 source/harness acceptance passed Desktop Startup Harness `36222961030`, normal CI `36222960972`, P2-L `36222961015`, Linux `36222960986`, macOS `36222961039`, Windows ARM64 `36222961116`, Docker `36222960967`, Macrobenchmark `36222961067`, G15 `36222960988`, and G16 `36222961046`.
- Detailed boundary: `docs/DESKTOP_STARTUP_BENCHMARK_P2J3.md`.

J4 merged (PR #180):
- reuses pinned Playwright Chromium 1.63.0 from a temporary tool directory rather than adding it to production/project dependencies;
- assumes a ready loopback Desktop engine so engine startup stays J3-owned;
- prepares synthetic local Desktop configuration outside the measured browser window and isolates external Provider access behind a dead loopback proxy;
- every round launches a new Chromium process;
- measures Chromium launch, navigation → usable Home shell, real Library-tab click → usable Library, and combined browser/navigation intervals;
- usable shell requires connected mode plus completed local Library count, not merely DOMContentLoaded;
- CI runs only two `harnessValidationOnly` rounds and does not promote hosted-runner timing into P2-K.
- Detailed boundary: `docs/DESKTOP_BROWSER_HOME_BENCHMARK_P2J4.md`.

J5 merged (PR #181):
- uses a deterministic fully local Library/shelf/downloaded-Reader fixture through LibraryDatabase APIs;
- measures Library→Detail, Shelves→list, Shelf→contents, Shelf→Reader and Reader→next chapter separately;
- Reader readiness includes successful decode of every expected local image;
- source/harness acceptance passed the dedicated J5 Chromium workflow, normal CI, P2-L gate, J3/J4 harnesses, Android Macrobenchmark and G15/G16 regressions;
- hosted timing remains harness-only and no foreground budget is selected.
- Detailed boundary: `docs/DESKTOP_BROWSER_DETAIL_READER_BENCHMARK_P2J5.md`.

J6 merged (PR #182):
- one long-lived Chromium Reader session repeatedly switches two fully local chapters from the J5 fixture;
- GC-normalized Runtime heap + DOM counters and chapter-switch readiness are sampled over the session;
- controlled-scroll RAF intervals remain descriptive main-thread cadence only, not compositor-jank or RSS claims;
- source/harness acceptance passed Reader Long Session `36227293068`, P2-L `36227292880`, J3 `36227293051`, J4 `36227292990`, J5 `36227293002`, Macrobenchmark `36227292839`, CI `36227292875`, G16 `36227292969`, and G15 `36227292952`;
- hosted timing/memory counters remain non-promotional.
- Detailed boundary: `docs/DESKTOP_READER_LONG_SESSION_BENCHMARK_P2J6.md`.

J7 merged (PR #184):
- separates Recommendation generation from already-built managed-V3 batch switching;
- J7A seeds a local 72-candidate V3 cycle through production LibraryDatabase + CycleCoordinatorV3 APIs and measures only `#recommend-next-batch` click → usable changed 12-card batch;
- J7B remains opt-in real-Provider evidence: one usable cycle must already exist before any Recommendation UI action, regeneration requires explicit confirmation, and the measured window must observe the authoritative `recommendation-v3` task using `provider-network`;
- source/harness acceptance passed Recommendation `36228962705`, P2-L `36228962691`, J3 `36228962718`, J4 `36228962698`, J5 `36228962715`, J6 `36228962707`, Macrobenchmark `36228962712`, normal CI `36228962722`, G16 `36228962702`, and G15 `36228962741`;
- J7B is never faked on hosted runners and no J7 threshold is selected.
- Detailed boundary: `docs/DESKTOP_RECOMMENDATION_BENCHMARK_P2J7.md`.

J8 merged (PR #186):
- final pre-merge head `aeb91224c72737afb2f9f279ae58f75c4d86b5d0` passed all 15 triggered workflows; merge commit is `97d37db7ee29279ba5cd6549ba5ab80a541f3275`;
- refactors J2 into a reusable `runHttpLatencyScenario(...)` function while preserving its CLI and one authoritative load-window validity rule;
- starts a fully local deterministic synthetic Provider adapter but runs the real production LOCAL `DownloadScheduler`, `MediaRequestGate`, SQLite progress writes and filesystem writes;
- requires `local-download-runner` to cover every foreground J2 sample and separately requires actual `appendFile()` writes during the measured window;
- emits the full J2 profile plus controlled-fixture/download metadata;
- uses no Provider credentials or external network and explicitly does not claim real Pica throughput;
- hosted timing remains harness-only and no latency budget is selected.
- Detailed boundary: `docs/DESKTOP_ACTIVE_DOWNLOAD_LATENCY_P2J8.md`.

J9 merged (PR #187):
- final pre-merge head `6a57cfa891528a8a388e433366626d298aa54743` passed all 16 triggered workflows; merge commit is `d90c697c08f9a009c5584989a2f41de51d9a935e`;
- first accepted smoke confirmed 24/24 `remote-storage-sync` foreground-sample coverage plus 6 real WebDAV requests inside the measured window;
- follows the open-source `webdav-client` test pattern by provisioning pinned `webdav-server@2.6.2` only in a temporary benchmark tool root;
- runs the real `RemoteStorageDesktopManager.sync()`, `WebDavStorageProvider`, `RemoteLibrarySyncService` and process-shared `RuntimeResourceCoordinator`;
- J2 requires `remote-storage-sync` to cover every foreground sample;
- a second validity condition requires actual local WebDAV requests inside the measured window;
- production dependencies and lockfile remain unchanged;
- CI is harness validation only and no WebDAV/provider latency budget is selected.
- Detailed boundary: `docs/DESKTOP_WEBDAV_FOREGROUND_LATENCY_P2J9.md`.

J10 merged (PR #188):
- final pre-merge head `f4db47bdbdab1e1ceb342b1385cba3dea18ddf44` passed all 17 triggered workflows; merge commit is `fd471b22280d0c67e2a9015cec9ab9190b9239cd`;
- automated acceptance remains source/contract only: the real DINOv2 run still requires explicit `--allow-model-network` and representative hardware;
- the harness measures the real browser Visual worker and does not fabricate a backend `cpu-model` lease;
- cold/bootstrap evidence is separated from warm-inference foreground navigation/RAF observations;
- hosted CI does not silently download the model and no Visual performance budget is selected.
- Detailed boundary: `docs/DESKTOP_VISUAL_INDEX_FOREGROUND_P2J10.md`.

J11 merged (PR #189):
- final pre-merge head `92cc8dc2d3687cacd0cd68203d88dc134885426e` passed all 18 triggered workflows; merge commit is `f954414b23ca5ca4409e9de56481593be17ad3fc`;
- hosted smoke confirmed both task types covered 24/24 foreground samples, with 7 real LOCAL writes and 6 real WebDAV requests inside the measured window;
- combines the accepted J8 LOCAL download and J9 WebDAV workload patterns in one Desktop process;
- both production owners share one observe-only `RuntimeResourceCoordinator`;
- J2 accepts a foreground window only when `local-download-runner` and `remote-storage-sync` both cover every recorded sample;
- independent validity checks require real LOCAL `appendFile()` writes and real WebDAV requests during the measured wall-clock interval;
- the workload is fully local/deterministic and selects no latency/concurrency budget.
- Detailed boundary: `docs/DESKTOP_OVERLAP_FOREGROUND_LATENCY_P2J11.md`.

## P2-K — Real benchmark matrix and performance budgets
**Status: IN_PROGRESS — K1/K2/K3/K4/K5 tooling merged; representative execution still required; no budgets selected**

Do not call synthetic benchmarks real throughput tests.

Minimum matrix:
- small / medium / large libraries;
- idle vs download-active vs scan-active vs Visual-active conditions;
- Windows x64 reference machine;
- representative Android mid-range device;
- later Linux/macOS/ARM64 reference hardware as those previews mature.

For provider/network tests:
- use the same content IDs/plans where possible;
- repeat runs and report median + range;
- record proxy/network route/region/provider limits;
- stop on rate limits rather than tuning to bypass them.

Initial budgets should be evidence-driven; do not invent flattering thresholds before measuring.

**Acceptance**
- checked-in benchmark report with environment and variance;
- regressions above approved budget fail or at minimum block release promotion.

K1 merged (PR #190):
- Windows x64 reference collector is merged at `7b09fa1943512c9b631b86eb52c993287832a7f1`;
- final K1 head passed its evidence-kit contract plus P2-L, CI, Desktop benchmark regressions and Android runtime gates;
- deterministic J3/J4/J5/J6/J7A/J8/J9/J11 scenarios are bundled with commit/environment metadata and SHA-256 manifest;
- J10 real Visual remains explicit opt-in and J7B real Provider regeneration remains separate;
- no performance or concurrency budget was selected.
- Detailed boundary: `docs/P2K_REFERENCE_EVIDENCE_K1.md`.

K2 merged (PR #191):
- Android physical G18/G19 collection tooling is merged at `5bb3085cb22c60bca23e98d15fbaafd2f6942324`;
- final K2 head passed its dedicated contract, P2-L, CI, Android runtime gates and Desktop benchmark regressions;
- stages G18 idle baseline and G19 real recommendation-loaded Macrobenchmark on one physical Android device and exact commit;
- rejects emulator/generic devices, cross-device/cross-commit sessions and dirty-tree promotion by default;
- stores a SHA-256 device identity instead of raw adb serial in the K2 evidence copy;
- reuses the generic P2-K SHA-256 manifest while preserving K1's default Windows evidence type;
- CI validates only script/contracts; physical timings are never generated or promoted by CI;
- explicit real download/Reader loaded scenarios remain external and may not be replaced with synthetic media.
- Detailed boundary: `docs/P2K_ANDROID_PHYSICAL_EVIDENCE_K2.md`.

K3 merged (PR #192):
- final pre-merge head `d1b191cd32f72336d0693d2ead93a9b28b3a5afc` passed all 17 triggered workflows; merged commit is `f5517a7c34eec06a6db66a11055ab9aa784316e7`;
- final automated validation included dedicated K3, K1/K2 evidence contracts, P2-L, CI and Android runtime gates;
- adds physical-device-only real download-loaded and Reader-under-download Macrobenchmark scenarios using AndroidX Macrobenchmark/UiAutomator already adopted by G18/G19;
- synthetic media is explicitly prohibited;
- download-loaded acceptance requires `media-network` + `filesystem-heavy` RUNNING before and after measured navigation;
- Reader evidence uses a benchmark-only exported bridge to launch production `ReaderActivity` with tester-supplied real comic/chapter inputs; release/debug manifests remain unchanged;
- evidence JSON stores only SHA-256 comic/chapter identities, never raw IDs or credentials;
- Reader collector preserves before/after raw `dumpsys meminfo` snapshots for review but selects no memory/frame budget;
- physical execution remains external and must use representative hardware.
- Detailed boundary: `docs/P2K_ANDROID_REAL_LOAD_K3.md`.

K4 merged (PR #193):
- adds a shared manual-acceptance recorder for the remaining P2-L Windows and Android physical/OEM blockers;
- scenario structure follows open-source Cucumber/Gherkin-style Given/When/Then semantics without adding a dependency;
- Windows requires native Windows; Android requires one physical non-emulator device;
- PASS requires at least one attached screenshot/recording/log and every copied artifact is SHA-256 indexed;
- Android device identity is hashed and current standby/device-idle observations are recorded when available;
- the generic P2-K manifest now requires every named Windows/Android manual scenario before manual acceptance can be complete;
- human FAIL remains preserved evidence and keeps promotion incomplete;
- no performance budget or concurrency capacity is selected;
- implementation head `f661dc9de0b5fe35db2c4e45afd10b3f965a4bdf` passed all 18/18 triggered workflows, including the dedicated K4 contract, K1/K2/K3 contracts, P2-L, CI, Desktop J3–J11 regressions and Android runtime/build gates;
- final documentation head `a46c3d5567970434301a2c28800e5937b6fd732b` passed all 18/18 triggered workflows with zero failures; PR #193 merged as `9197e9935543c01915222ed106d492d837101b85`;
- this accepts only the source/evidence contract; native-Windows and physical-Android execution remain external.
- Detailed boundary: `docs/P2K_MANUAL_ACCEPTANCE_K4.md`.

K5 merged (PR #194):
- adds a read-only evidence review/completeness layer rather than another benchmark framework;
- verifies K1/K2/K4 manifest file hashes, embedded commit authority, platform authority and required run IDs independently of the collector's `complete=true`;
- accepts K3 as its approved standalone physical session format, rechecking physical-device authority, hashed identities, real-media policy and benchmarkData presence;
- recognizes nine structural evidence categories: Windows K1, Android K2, K3 download, K3 Reader, Windows K4, Android K4, J7B real Provider, J10 real Visual and low-end Windows trace;
- blocks mixed-commit evidence and preserves `budgetSelected=false` / `concurrencyCapacitySelected=false`;
- when all categories are structurally present, the strongest automatic state is `READY_FOR_HUMAN_VARIANCE_AND_BUDGET_REVIEW`, never P2 complete;
- K3 collection is hardened so download-loaded and Reader runs default to independent timestamped roots and only current-run artifacts are copied;
- implementation head `ad64b2eaa40b968afae1d9fff6876a80086fa56f` passed all 19/19 triggered workflows with zero failures, including dedicated K5/K1/K2/K3/K4 contracts, normal CI, Desktop J3–J11 regressions, Android recovery/background gates, Macrobenchmark build and the aggregate P2-L promotion gate;
- final documentation head `9989a47a835f442b7d7904ba9e2ec24e1f342db5` also passed 19/19 workflows with zero failures; PR #194 merged as `8d31d8a9c4f7c5a5786cbb60a01a6e267c8e2b4e`;
- this accepts only the source/review contract; representative hardware/provider/model evidence remains external.
- Detailed boundary: `docs/P2K_EVIDENCE_REVIEW_K5.md`.

## P2-L — Runtime hardening regression gate
**Status: AUTOMATED_GATE_PASS / MERGED — PR #178; P2 exit remains blocked by external evidence**

Final P2 gate combines:
- TypeScript/unit/integration tests;
- Chromium UI smoke;
- long-task contract;
- network interruption tests;
- large queue tests;
- Android unit/lint/assemble;
- Windows package smoke;
- runtime concurrency/performance checks;
- manual Windows + Android task-control acceptance.

L1 automated candidate:
- adds `.github/workflows/p2-runtime-hardening-gate.yml` as an explicit workflow-dispatch promotion gate;
- Desktop job runs full validation plus named critical runtime contracts;
- Windows job builds the current package and reuses `test-windows-artifact.ps1`;
- Android static job runs unit/lint/release plus Macrobenchmark harness build;
- G15 force-stop and G16 memory/Doze emulator gates are rerun as first-class jobs;
- final report `p2-runtime-hardening-gate.json` is machine-readable and fails when any automated job fails;
- automated PASS is deliberately named `AUTOMATED_PASS_EXTERNAL_EVIDENCE_REQUIRED`, never P2 complete;
- external blockers include P2-K real benchmark matrix, Windows manual task control, Android physical task control/G18-G19 performance, and low-end Windows/browser trace.
- Detailed boundary: `docs/P2_RUNTIME_HARDENING_GATE.md`.

**P2 exit criterion**
P2 is not complete until the product can demonstrate that heavy work may take time **without making ordinary use feel frozen or opaque**.

Current promotion state:
- automated regression gate: merged and self-tested in P2-L1;
- real performance budgets: blocked on P2-K evidence;
- representative Windows/Android task-control acceptance: external/manual;
- therefore P2 completion remains **BLOCKED_EXTERNAL_EVIDENCE** even if P2-L automated jobs pass.

---

# 4. P3 — Shared Platform Foundation

Overall status: **DONE with regression obligations**

## P3-A — Platform/architecture capability model
**Status: DONE**

- Windows / macOS / Linux platform IDs.
- x64/arm64-aware capability reporting.
- `supported / available / reason / execution` distinction.
- Only Windows x64 currently reports formal production distribution/self-update readiness.

## P3-B — Native data roots
**Status: DONE**

- Windows: LocalAppData-based Pica root.
- macOS: Application Support.
- Linux: XDG data root with standard fallback.

## P3-C — OS action adapters
**Status: DONE / platform preview implementations still gated**

- browser launch;
- directory launch;
- folder/save picker capability;
- secure credential backend;
- managed E-H browser capability.

Business logic must not reintroduce direct Windows-only assumptions.

## P3-D — Interactive vs headless runtime
**Status: DONE**

- ordinary Desktop remains interactive;
- headless is persistent/no-GUI;
- Mobile Bridge and Remote API are explicit opt-ins;
- browser-close lifecycle is not applied to headless.

## P3-E — Network boundary
**Status: DONE**

- ordinary application engine remains loopback-only;
- remote access is behind the authenticated Remote API gateway.

## P3-F — Shared core services
**Status: PARTIAL / regression requirement**

CLI, local Web API, Desktop and Server should continue to reuse:
- `LibraryService`;
- `LibraryDatabase`;
- download state machine/scheduler;
- common Provider/domain logic where platform-appropriate.

**Acceptance**
- no new platform fork of core library/download semantics without a documented reason.

---

# 5. P4A — Desktop multi-platform previews

Overall status: **PARTIAL**

## P4A-Linux-x64
**Automated preview status: DONE**  
**User-preview promotion: BLOCKED by real environment evidence**

Completed automated evidence:
- official pinned Node linux-x64 runtime;
- glibc 2.28 boundary;
- Rocky Linux 8.9 live runtime gate;
- synthetic library reopen;
- Library/detail/shelf/Reader/download pause-resume/restart vertical acceptance;
- external data root;
- W4A application replacement/rollback;
- migration backup requirement when schema rises;
- rootless user installer/uninstaller;
- Desktop Entry/icon validation;
- formal distribution/self-update remain disabled.

Still required:
- real authorized Provider login/browse/detail/read flow;
- Secret Service in real graphical session;
- GNOME/Zenity and KDE/KDialog picker validation or narrower declared support;
- real menu/icon/browser-launch behavior;
- real graphical distro near glibc baseline;
- schema-changing real preview rollback;
- cold start / long Reader / task concurrency benchmark.

## P4A-macOS-arm64
**Automated preview status: DONE**  
**User-preview promotion: BLOCKED by real Mac trust/UX evidence**

Completed:
- native Apple Silicon runner/runtime;
- macOS minimum-version inspection;
- Keychain credential persistence;
- external data root;
- replacement/rollback;
- self-contained `Pica Library.app`;
- Bundle ID/icon/Info.plist;
- LaunchServices startup;
- signed/notarized/distributionReady/selfUpdate remain false.

Still required:
- real Provider login/read/download;
- interactive native folder/save pickers;
- Finder/Dock/browser-launch UX;
- Developer ID signing;
- hardened runtime where required;
- notarization/stapling/Gatekeeper;
- runtime check near macOS 13.5;
- schema-changing rollback;
- cold start / long Reader / task concurrency benchmark.

## P4A-Windows-ARM64
**Automated preview status: DONE**  
**User-preview promotion: BLOCKED by physical-device evidence**

Completed:
- native Windows ARM runner;
- official Node win-arm64 runtime;
- AnyCPU launcher;
- DPAPI;
- WinForms picker capability;
- vertical acceptance;
- replacement/rollback;
- per-user installer/uninstaller;
- running-engine install/uninstall refusal;
- formal distribution/self-update remain false.

Still required:
- physical ARM64 Windows device;
- real Provider login/read/download;
- interactive browser/picker/managed E-H flow;
- installer/Start Menu/uninstall UX on device;
- schema-changing rollback;
- cold start / long Reader / Visual / concurrent download benchmark;
- signing/SmartScreen/reputation/release provenance;
- formal update channel design.

---

# 6. P4B — Server / Docker operator preview

Overall status: **PARTIAL**

Completed W4B foundation:
- headless runtime;
- Caddy-only public ingress;
- authenticated Remote API gateway;
- loopback application engine;
- Host/Origin restrictions;
- non-root container;
- dropped Linux capabilities;
- no-new-privileges;
- read-only application filesystem;
- persistent config volume;
- one-shot secret-init flow with private runtime token;
- image replacement + stopped-volume snapshot rollback model;
- default Compose keeps browser sessions/Remote Web disabled.

Still required:
- real Provider credentials and real Provider behavior in a representative deployment;
- long-running soak/restart/resource tests;
- public/preview registry decision;
- immutable digest-based operator guidance;
- image signing/attestation/provenance;
- formal server release/update/rollback policy;
- multi-user/tenant isolation before calling it a family/shared-host product;
- P2 performance/resource-budget integration.

---

# 7. P5 — Remote Web

Overall status: **IN_PROGRESS**

## W5A — Browser session security primitive
**Status: DONE**

Locked boundary:
- long-lived bearer used only for explicit session bootstrap;
- browser receives HttpOnly Secure SameSite=Strict `__Host-pica_session`;
- gateway stores only session-token digest;
- process restart invalidates sessions;
- exact HTTPS Origin binding;
- CSRF for browser-session writes;
- bearer/session/Origin headers are stripped before loopback engine;
- disabled by default.

## W5B — Isolated read-only Remote Web shell
**Status: DONE**

Completed:
- library search;
- shelves;
- comic detail/covers;
- downloaded list;
- downloaded Reader;
- zh-CN/en/ja;
- logout;
- strict static asset allowlist;
- restrictive CSP and security headers;
- no LocalStorage/SessionStorage/IndexedDB/Cache Storage/service worker;
- browser-session API allowlist is narrower than bearer API;
- reader-progress/favorite/download/shelf/settings/provider/update/restart writes are denied.

## W5C — Installable shell-only Remote Web PWA
**Status: DONE — PR #109 merged**

Current PR scope is accepted as the actual W5C label. Do not rename it retroactively.

Intended W5C boundary:
- scoped manifest;
- dedicated reviewed icon;
- scoped service worker;
- cache **only** fixed shell assets;
- network-first shell with cache fallback;
- no API/session/media/cover/Reader/user-JSON caching;
- shell/login UI may load offline;
- offline manga/library data is explicitly out of scope;
- CSP opens only the minimum manifest/worker sources;
- capability is reported separately;
- default operator Compose remains disabled.

**W5C acceptance**
- source contract + gateway tests;
- Chromium service-worker/cache/offline-shell smoke;
- Docker/Caddy TLS validation;
- all existing Desktop/Android/Linux/macOS/Windows ARM64 gates remain green.

## W5D — Operator-friendly browser authorization/onboarding
**Status: PLANNED**

Goal: ordinary users should not need to understand or paste a long-lived Remote API bearer during routine use.

Design requirements:
- short-lived or one-time authorization/pairing primitive;
- long-lived bearer remains operator/admin secret;
- no bearer persistence in browser storage;
- explicit approval and revocation;
- origin/session binding preserved;
- clear session-expired/revoked/server-unreachable UI;
- no weakening of W5A CSRF/cookie boundary.

**Acceptance**
- successful onboarding without exposing the long-lived bearer to persistent browser JS state;
- revocation invalidates future use;
- replay/expired-code tests.

## W5E — Real mobile/desktop browser usability and weak-network validation
**Status: PLANNED**

Validate:
- iOS/Android browser layout;
- installed-PWA launch behavior where supported;
- narrow-width navigation;
- touch target sizing;
- Reader tap/swipe/page navigation decision;
- server disconnect/reconnect;
- high latency and intermittent network;
- large library search;
- cover/media loading;
- session expiration mid-use;
- browser back/forward behavior;
- long Reader memory behavior.

## W5F — Secure offline user-content design
**Status: DEFERRED until identity/cache model is proven**

This is distinct from W5C shell-only caching.

Before caching library/user content:
- partition cache by authenticated identity/session/tenant;
- version content/cache schema;
- define encrypted-at-rest expectations or explicitly state limitations;
- logout/revoke purge;
- server/account switch purge;
- stale-data rules;
- storage quota/eviction behavior;
- never cache provider/admin secrets.

Only after this contract exists may downloaded content/offline library reading be evaluated.

## W5G — Selective Remote Web writes
**Status: DEFERRED**

Potential future writes:
- reader progress;
- shelf mutation;
- favorite mutation;
- download creation/control;
- recommendation feedback.

Rules:
- add one workflow at a time;
- explicit browser-session permission;
- Origin + CSRF;
- idempotency where needed;
- auditability;
- do not expose the entire W4B bearer API to browser sessions.

## W5H — Multi-user / tenant model and formal Remote Web support
**Status: DEFERRED**

Required before shared household/server claims:
- user/tenant identity;
- per-user library state where appropriate;
- cache/session isolation;
- authorization model;
- audit/revocation;
- migration path from current single-operator server.

---

# 8. P6 — Formal distribution and release hardening

Overall status: **PLANNED / partially blocked on real devices and credentials**

## P6-A — Windows x64 regression authority
**Status: ONGOING**

Windows x64 remains the formal Desktop production target.

Every shared-platform/runtime refactor must prove it did not regress:
- existing install/update chain;
- DPAPI credentials;
- local data root;
- library/download/shelf/history state;
- Reader;
- Mobile Bridge;
- Provider flows;
- rollback/update safety.

## P6-B — Real-device/manual acceptance
**Status: PARTIAL**

Maintain explicit acceptance scripts for:
- Windows x64;
- Android;
- Linux x64 when real device/session available;
- macOS arm64;
- Windows ARM64;
- Server/Docker deployment.

## P6-C — Signing/trust/reputation
**Status: PARTIAL**

Required by platform:
- Windows: signing/SmartScreen/reputation/release provenance.
- macOS: Developer ID/notarization/Gatekeeper.
- Docker: image signing/attestation/provenance.
- Android: same production package/signing identity for in-place upgrades.

## P6-D — Performance promotion gate
**Status: PLANNED**

A platform must not be called ready solely because functional CI passes.

Need:
- cold start;
- Reader;
- task concurrency;
- download/API responsiveness;
- representative hardware evidence.

## P6-E — Schema-changing replacement/rollback
**Status: PARTIAL**

Same-schema replacement is already well covered for previews.

Still require real evidence when a future preview actually raises schema:
- pre-migration backup;
- candidate migration;
- functional validation;
- rollback using matching application + data snapshot;
- explicit statement about post-snapshot state loss.

## P6-F — Release documentation and support boundaries
**Status: PARTIAL**

Before promotion:
- support matrix matches capability truth;
- no unsupported self-update claims;
- install/uninstall data-preservation behavior documented;
- limitations visible;
- current README remains user-focused and does not expose unnecessary internal detail; engineering details stay in docs/task log.

---

# 9. Cross-cutting scenario acceptance

These scenarios must remain part of regression thinking even when a specific PR changes only one module.

1. Open a large Library while downloads are active.
2. Switch recommendation batches while the previous batch remains stable.
3. Start recommendation generation, navigate away, return, pause/resume/cancel.
4. Lose network during recommendation retrieval.
5. Kill/restart Desktop during recommendation generation.
6. Run Visual indexing while browsing Library/Reader.
7. Pause/resume/cancel Visual indexing.
8. Run WebDAV scan/sync on a large local library while using the local API.
9. Lose network during WebDAV upload.
10. Start a large download queue; reload/close/reopen Web UI.
11. Restart application with interrupted downloads.
12. Android process death during recommendation generation.
13. Android process death during a chapter download.
14. Rapidly open comic A then B while A async requests are still pending.
15. Navigate A detail -> B detail -> Back.
16. Switch between Library/Recommendation/Online/Settings repeatedly during background work.
17. Upgrade application while preserving external user data.
18. Roll back application with the matching data snapshot.
19. Headless runtime restart with Remote API enabled.
20. Browser Remote Web session expires/revokes while the page is open.
21. Weak/high-latency network Remote Web Reader.
22. New-platform missing native dependency: capability reports unavailable with a reason instead of crashing.
23. Provider failure/rate limit: bounded failure without aggressive retry escalation.
24. Multiple heavy tasks contend for CPU/disk/network: foreground use remains responsive.

---

# 10. Evidence references already in the repository

The task log should be updated against, not replace, these focused documents:

- `docs/architecture.md`
- `docs/LONG_TASK_STABILITY_V047.md`
- `docs/WEB_UX_AUDIT_V5.md`
- `docs/audit/PERFORMANCE_TEST_PLAN.md`
- `docs/audit/PERFORMANCE_REPORT.md`
- `docs/LINUX_X64_PREVIEW_SUPPORT.md`
- `docs/MACOS_ARM64_PREVIEW_SUPPORT.md`
- `docs/WINDOWS_ARM64_PREVIEW_SUPPORT.md`
- `docs/SERVER_DOCKER_PREVIEW_DEPLOYMENT.md`
- `docs/REMOTE_WEB_SESSION_W5A.md`
- `docs/REMOTE_WEB_READONLY_W5B.md`
- `docs/NEXT_STABLE_RELEASE_READINESS_20260920.md`
- `test/unit/correctness-foundation-p1.test.ts`
- `test/unit/long-task-stability-v047.test.ts`
- `test/unit/download-large-queue.test.ts`
- `test/unit/desktop-platform-foundation.test.ts`
- `test/unit/desktop-headless-runtime-p5c.test.ts`

---

# 11. Immediate next work

## NEXT-1 — P2-0 runtime inventory
**Status: DONE**

Produce the checked-in runtime inventory/dependency map and identify:
- remaining hidden main-thread work;
- duplicate task-state authorities;
- missing timeout/cancel/recovery behavior;
- resource-concurrency conflicts;
- repeated DB/full-catalog/JSON work;
- missing performance instrumentation.

## NEXT-2 — H1 maintenance runtime hardening
**Status: DONE**

Fix the confirmed foreground maintenance hazards before adding a global resource arbiter:

- **DONE (PR #112):** repair scanning no longer performs synchronous per-file `existsSync/statSync` work on the Node event loop; it now uses asynchronous stat calls, progress callbacks and event-loop yielding.
- **DONE (PR #113):** full maintenance update checks now run as an observable background task with pause/resume/cancel; explicit narrow comic-ID checks remain synchronous for compatibility.
- **DONE (PR #113):** the correctness-significant 5000-comic default update-scan cap was removed by querying the complete downloaded-comic ID domain directly.
- **DONE (PR #114):** organize/materialize filesystem work now uses asynchronous checkpointable primitives; the Web organize route is a controllable background task, CLI organize/portable use the complete catalog, and final indexes/manifests publish only after the last checkpoint.
- **DONE (PR #115):** repair scanning now uses the same background task model with authoritative progress and pause/resume/cancel.
- preserve the current safety model: scan/review first, then enqueue repair/update jobs.

## NEXT-3 — H2 background analysis runtime
**Status: IN_PROGRESS**

Promote expensive manual/advanced analysis paths to observable background tasks without changing their scientific/product semantics.

- **DONE (PR #116) — H2A / RT-11:** Recommendation V5 Shadow Retrieval is a detached Desktop task with authoritative phase/provider progress, pause/resume/cancel, reload recovery, and compact terminal summary. Shadow-only, explicit-confirmation and `servingImpact=false` boundaries remain unchanged.
- **IN_PROGRESS — H2B / RT-13:** Visual QC / Author Atlas / Style Family now record bounded runtime telemetry and have a deterministic synthetic scaling harness. No foreground threshold has been selected yet; background only calculations that exceed the later evidence-based threshold.
- **DONE (PR #118) — H2C / RT-14:** Work Identity evidence refresh is a checkpointable detached service-owned task with pause/resume/cancel and reload-safe Web controls. The async audit is tested for exact result equivalence with the synchronous baseline; evidence remains evidence-only and persists only after the final checkpoint. All main CI plus Linux, macOS arm64, Docker and rerun Windows ARM64 package gates passed before merge.

## NEXT-4 — P2-C resource-budget design
**Status: IN_PROGRESS — C1 foundation + C2/C2B Desktop observe-only coverage**

- **C1:** add a tested resource coordinator with shared resource-class vocabulary, atomic multi-resource leases, priority/FIFO admission semantics, cancellation and diagnostics. Production mode remains observe-only and does not impose invented capacities.
- **C2 first batch implemented:** maintenance update, repair, organize, Recommendation V5 Shadow and Work Identity evidence refresh now declare observe-only resource leases; Desktop-only diagnostics expose current/peak overlap.
- **C2B Desktop batch implemented:** Recommendation V3, favorites sync, local/GitHub download runners and WebDAV now join the same process-wide observe-only resource graph. Desktop injects one coordinator into LibraryService and RemoteStorageDesktopManager; existing task schedulers remain authoritative.
- **C2 remaining:** collect overlap/latency evidence and keep Visual under its H2B timing path unless phase/resource observation is useful. Android-specific cross-task observation is already implemented under G17; its physical overlap evidence is still pending.
- **C3 later:** propose enforceable capacities only after overlap and latency evidence exists; before enforcement, task-lifetime leases must become phase-aware where needed so paused tasks do not reserve enforced capacity.

Use the runtime inventory plus H1/H2 measurements to define resource classes and concurrency policy. Do not invent limits before observing current workloads.

## NEXT-5 — P2-J/P2-K performance baseline
**Status: PARTIAL — J1–J11 and K1–K5 tooling implemented; representative evidence and budget decisions pending**

- **J1 implemented:** bounded in-memory local HTTP latency telemetry classifies requests into low-cardinality route classes and correlates them with active resource-task types without storing URLs, comic IDs, search terms, bodies, tokens or paths.
- Desktop-only `/api/v1/desktop/runtime/http-profile` exposes count/p50/p95/max/error summaries for overall, idle, under-load, route class and active task type.
- **J2 implemented:** `pnpm benchmark:http-latency-scenario` drives repeatable sequential Library/detail/Reader foreground traffic against an already-running loopback Desktop engine, with warm-up, clean telemetry reset and three rounds by default.
- J2 idle windows are valid only when every foreground sample is idle; load windows are valid only when each requested observed task covers every foreground sample. This validates the measurement window, not the performance result.
- The J2 harness never starts or controls the measured background workload, never emits discovered comic/chapter IDs, and selects no latency threshold or release budget.
- **Current reconciliation:** J3–J11, Android G18/G19 and K1–K5 now provide the additional measurement/collection paths; they are no longer future implementation work. The J1/J2 details above describe the original foundation only.
- **Next:** collect representative Windows x64 idle/load and Android physical startup/jank/overlap evidence using the existing harnesses, reconcile through K5, and only then review variance and budgets. See NEXT-33 for the explicit missing evidence categories.

## NEXT-6 — P2-D SQLite/query discipline
**Status: PARTIAL — D1–D8B + D7C merged; evidence collection blocks further production query rewrites**

This remains the next unblocked P2 lane while J2 real Windows x64 measurement evidence requires a representative running Desktop environment.

- **D1 merged (PR #124):** complete-domain Browser Lite/CLI paths no longer reuse the legacy 5000-row presentation cap.
- **D2 merged (PR #125):** Shelf/recommendation exact-ID reads use chunked `getComicsByIds()`; author metadata changed from 2N+1 to fixed batched queries with the required reverse indexes.
- **D3 merged (PR #126):** ordinary no-text Library queries avoid complete author metadata; `pnpm benchmark:library-query` records SQLite scaling evidence without defining a release budget.
- **D4 merged (PR #127):** Final V3 frozen serving, portable readback and serving-composition diagnostics use complete owned+candidate exact-ID domains instead of unrelated 10000-row catalog materialization; Canonical Work ownership semantics remain unchanged.
- **D5A merged (PR #128):** Work Identity bounded review reads and authoritative correctness reads are separate contracts. Materialization plan uses all decisions + all bindings; review preview switches to the full decision domain when the bounded review list is incomplete; Final V3 Canonical Work ownership uses all bindings.
- D5A regression constructs 10001 bindings and 5001 decisions in real SQLite, requiring bounded APIs to remain capped while authoritative APIs cross both former boundaries.
- **D5B merged (PR #129):** `workVariantsForComic()` uses targeted current binding, same-work bindings, current-comic decisions and current-comic probable evidence rather than global 10000/5000 relationship prefixes.
- D5B preserves binding metadata for decision/evidence variants through a batched exact-ID binding lookup and keeps the intentional full-catalog creator/title/cover heuristic funnel unchanged.
- Migration 15 adds only the missing right-side decision and left/right probable-evidence indexes needed by symmetric current-comic relationship reads.
- **D6A merged (PR #130):** `visualPreferenceProfile()` and `visualIndexStatus()` use the complete dedicated `favoriteIds()` query instead of materializing a nominal 10000-row / effective 5000-row catalog prefix merely to recover favorite IDs.
- D6A deliberately leaves Author Atlas / Style Families / Representation QC full-catalog inputs unchanged because those analyses use catalog/provider/favorite coverage denominators; blindly narrowing to embedding IDs would alter diagnostic meaning.
- A 10001-favorite SQLite regression places the only embedded favorite outside the legacy effective 5000-row catalog prefix and requires both Visual preference evidence and index target counts to include it.
- **D7A merged (PR #131):** the existing 250 ms download-progress persistence cadence remains unchanged, but each persisted patch no longer performs a pre-read solely to recover unspecified fields. SQLite `COALESCE` preserves omitted fields, reducing the hot write shape from SELECT → UPDATE → SELECT to UPDATE → SELECT.
- D7A regression preserves partial-patch semantics, explicit zero writes, unknown-job failure behavior and the existing 250 ms service throttle.
- **D7B merged (PR #132):** Shelf add/remove still records one behavior event per comic, but the route sends the event array through `recordUserEvents()`, which wraps the existing single-event recorder in one short `BEGIN IMMEDIATE / COMMIT / ROLLBACK` transaction.
- D7B preserves event IDs, metadata safety, dedupe behavior and per-comic evidence granularity; invalid input rolls back the event batch rather than leaving a partially recorded shelf action.
- **D8A merged (PR #133):** migration 16 adds `idx_pictures_comic_status(comic_id, status)`, filling the missing comic-first access path used by the correlated `comicSelect` picture-count subquery.
- D8A planner regression requires `COUNT(*) WHERE comic_id = ?` to use the new index; completed-picture counts may validly use either the new comic-first index or the existing status-first downloaded index.
- D8A does not rewrite `comicSelect`; aggregate joins/CTEs remain deferred until representative scaling evidence justifies a broader semantic-preserving query change.
- **D7C merged (PR #134):** Web recommendation impressions that pass the existing 50% / 800 ms visibility rule are queued into a 25 ms micro-batch and sent through a dedicated impression-only endpoint capped at 24 events.
- D7C reuses D7B `recordUserEvents()` so one natural impression burst becomes one short SQLite transaction while every impression retains its own event ID, client-observed time, cycle/batch/comic/rank context and dedupe key.
- The batch route preserves the existing zero-based rank contract, rejects non-impression event types, and rolls back the whole batch if one event fails storage validation. `recommend_batch_presented`, feedback and detail-open events stay on the existing single-event path because they are separate user/authority actions rather than one natural burst.
- **D8B merged (PR #135):** `pnpm benchmark:comic-select-picture-count` builds identical real SQLite fixtures with and without migration 16's `idx_pictures_comic_status`, then compares single-comic `getComic()` and broad catalog projection p50/p95/max.
- D8B reports descriptive without-index/indexed ratios but defines no timing pass/fail threshold. A semantic regression requires count outputs to remain identical with and without the planner index.
- D8B changes no production SQL. Aggregate join/CTE or denormalized-count work remains prohibited until repeated D8B plus J1/J2 foreground evidence demonstrates a remaining bottleneck.
- **Next after D8B:** collect representative A/B runs, combine them with real Windows x64 J2 idle/load profiles, then decide whether P2-D should prototype an aggregate alternative or move on to the remaining runtime/cache/frontend workstreams.
- Detailed boundaries: `docs/SQLITE_QUERY_DISCIPLINE_P2D1.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D2.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D3.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D4.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D5A.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D5B.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D6A.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D7A.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D7B.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D7C.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D8A.md`, `docs/SQLITE_QUERY_DISCIPLINE_P2D8B.md`.

## NEXT-7 — P2-E snapshot/cache discipline
**Status: DONE FOR CURRENT CRITICAL INVENTORY — E1/E2 merged**

P2-D remains evidence-gated. The critical cache authority pass is now complete enough to hand the next unblocked architecture lane to P2-F.

- **E1 merged (PR #136):** Desktop cover cache validates source/version identity instead of trusting comic ID alone.
- **E2 merged (PR #137):** Provider Preview and Online Reader caches are partitioned by non-secret provider/account/surface/revision identity; page data validates the actual locator by fingerprint; live Pica credential changes reset the cached authenticated SDK session.
- `docs/CACHE_DISCIPLINE_P2E2.md` records owner, key, authoritative invalidation and scope for the critical Desktop/Web/Android long-lived caches. TTL/LRU are classified as eviction rather than authority.
- No critical provider-backed cache identified in E1/E2 can silently cross the audited account/source authority boundary.
- Remaining browser/process-memory lifetime issues are primarily observer/poller/UI lifecycle concerns and continue under P2-F.
- Detailed boundaries: `docs/CACHE_DISCIPLINE_P2E1.md`, `docs/CACHE_DISCIPLINE_P2E2.md`.

## NEXT-8 — P2-F frontend observer/poller discipline
**Status: IMPLEMENTATION_COMPLETE_REFERENCE_TRACE_OPEN**

- **F1–F8 merged (PR #138–#145):** redundant idle polling removed; broad DOM observer work is scoped to its owner or processed incrementally/coalesced.
- **F9 merged (PR #146):** WebDAV task progress reattaches after reload and self-terminates on backend terminal state.
- **F10 merged (PR #147):** Recommendation final-cycle status has one normal polling authority with bounded App fallback.
- **F11 merged (PR #148):** Onboarding readiness is event-driven; the recursive 500 ms retry loop is removed.
- **F12 merged (PR #149):** Work Identity and V5 shadow status loops keep 500/600 ms foreground cadence, use 3000 ms hidden-page waits, and wake immediately when visible.
- **F13 merged (PR #151):** focused Playwright Chromium evidence passed for both F12 pollers.
- Observed browser evidence:
  - Work Identity: hidden 3004 ms → visible wake 2 ms → foreground 504 ms.
  - V5 shadow: hidden 3004 ms → visible wake 3 ms → foreground 602 ms.
- Browser evidence confirms the intended control-flow branches but is not promoted into a user-facing latency/CPU budget.
- **External evidence gate remains:** representative low-end Windows/browser CPU+jank trace across Settings/Online/Recommendation/analysis transitions.
- No further P2-F code work should be added without a concrete trace/regression showing a remaining problem.
- Detailed boundaries: `docs/FRONTEND_OBSERVER_DISCIPLINE_P2F1.md` through `P2F8.md`, `docs/FRONTEND_POLLER_DISCIPLINE_P2F9.md` through `P2F12.md`, and `docs/FRONTEND_BROWSER_EVIDENCE_P2F13.md`.

## NEXT-9 — P2-G Android runtime hardening
**Status: PHYSICAL_DEVICE_EVIDENCE_REQUIRED — G1–G19 merged; source/build work complete, G20/P2-C3 enforcement blocked**

- **G1–G12 merged (PR #153–#164):** audited Android UI-thread Catalog/Semantic/download/settings/browse/shelf/recommendation/history/direct-open/Reader-completion I/O owners are worker-owned.
- **G13 merged (PR #165):** durable task identity is persisted independently of Activity memory; Task Center reconstructs singleton/dynamic work from exact WorkRequest UUID + WorkManager state instead of WorkInfo list order/history.
- G13 also adds the explicit Android recovery matrix required by P2-H and preserves PAUSED download identity even when an old CANCELLED WorkInfo is unavailable.
- **G14 merged (PR #166) with the official WorkManager test harness:** recovery semantics remain covered by the official AndroidX test harness; G16 updates runtime + harness from historical 2.9.1 to current WorkManager 2.12.0.
- `WorkManagerRecoveryTest` creates real delayed WorkRequests and queries real WorkInfo/unique-work history under Robolectric rather than using a hand-built scheduler fake.
- G14 covers:
  - REPLACE history reconstructs exactly one current download;
  - stale registry UUID repairs from the actual active WorkInfo;
  - deliberate PAUSED download remains reconstructible when historical WorkInfo is unavailable;
  - missing non-paused download registration does not resurrect;
  - singleton unique-work recovery selects the exact persisted current request and repairs stale UUIDs.
- All G14 requests use a long initial delay, so provider/network Worker bodies do not execute; the test targets WorkManager DB/query + app recovery authority.
- **Evidence boundary:** G14 is Activity/process-state reconstruction evidence, not a claim of Android OS force-stop/reboot coverage.
- **G15 finding:** Favorite import, Pica bootstrap and Native Recommendation persisted current singleton WorkRequest UUIDs but did not retire those UUIDs on successful completion or explicit cancel. A later restart could therefore bind Task Center to historical SUCCEEDED/CANCELLED WorkInfo.
- **G15 production correction:** explicit cancel clears singleton recovery identity immediately; successful Workers clear it only after their existing durable success boundary. PAUSED/retry/failure states retain recovery identity.
- **G15 real process-death gate:** a debug-only normal app Activity seeds real WorkManager state and keeps a debug-only probe RUNNING; the seed deliberately does not use instrumentation because Android instrumentation itself adds target-package force-stop lifecycle events. The host executes `adb shell am force-stop com.picalibrary.android.dev`, confirms process death, re-enters through the normal launcher and requires probe runCount >= 2 in a fresh app process before verification-only instrumentation checks active/PAUSED recovery state, one-card Task Center reconstruction and cancelled-history non-resurrection.
- **G15 merged (PR #169):** normal CI, direct-upgrade acceptance and the real API-35 force-stop/relaunch emulator gate all passed before merge. The OS process-death recovery gate is now accepted.
- **G16 finding 1:** PicaLibraryApp had no trim-memory handling while CoverRepository and ImageRepository could each retain up to 72 MiB of decoded Bitmaps.
- **G16 memory correction:** Application.onTrimMemory now evicts only reconstructible in-memory Bitmap LRUs at UI_HIDDEN/background pressure; encoded disk caches and durable work are untouched. Robolectric + real `am send-trim-memory ... HIDDEN` evidence cover this boundary.
- **G16 finding 2:** Android durable work still used WorkManager 2.9.1, predating Android 15 SDK/network/foreground-timeout fixes. G16 upgrades both runtime and work-testing to stable 2.12.0 while preserving the G14/G15 recovery suite.
- **G16 merged (PR #170):** normal CI, direct-upgrade, G15 force-stop regression and the API-35 HIDDEN/Doze gate all passed. Generic trim-memory and Doze defer/durable-recovery evidence is accepted; no fixed post-Doze JobScheduler dispatch SLA is claimed.
- **G17 merged (PR #171):** AndroidTaskResources provides observe-only resource tags and de-duplicated RUNNING/ENQUEUED-BLOCKED snapshots for RT-17–RT-20 without changing scheduling, concurrency or task controls.
- Current classes: provider-network, media-network, bridge-network, cpu-analysis, filesystem-heavy.
- A debug-only ADB collector writes an app-private JSON snapshot for representative-device overlap sampling; it is absent from release UI/manifest.
- **G18 merged (PR #172):** release-like benchmark target + AndroidX Macrobenchmark 1.5.0 / UiAutomator 2.4.0 compile successfully. Cold startup-to-usable-Library and idle top-level FrameTiming scenarios are checked in without thresholds.
- HomeActivity reports fully drawn only after the local Library list is usable, giving StartupTimingMetric a meaningful full-display boundary.
- CI remains build-only; GitHub emulator timing is not accepted as representative performance evidence. The physical-device runner archives device metadata, benchmarkData JSON and Perfetto traces.
- **G19 merged (PR #173):** the opt-in loaded Macrobenchmark triggers the real `重新生成手机推荐` action, requires G17 provider-network + cpu-analysis RUNNING before and after measured foreground navigation, and uses `startupMode=null` so the background WorkManager task is preserved.
- G19 source/build acceptance passed Macrobenchmark Build `36160396121`, CI `36160396044`, G15 regression `36160396042`, and G16 regression `36160396108`.
- G19 adds a benchmark-only exported resource snapshot receiver; release/debug builds do not expose it. It returns only coarse resource counts, never credentials or Provider payload.
- The prepare/run script leaves Provider/candidate configuration manual and explicit. No synthetic Worker is substituted when real recommendation load is unavailable.
- **Current hard gate:** source/build work through G19 is complete, but no valid G20/P2-C3 Android resource budget may be proposed until representative physical-device G18 idle + G19 recommendation-loaded evidence exists. Real download/Reader loaded scenarios also require explicit user-selected real inputs.
- OEM battery-manager / foreground-notification evidence and large-Catalog/long-Reader timing/jank/memory remain physical-device gates.
- Detailed boundaries: `docs/ANDROID_RUNTIME_HARDENING_P2G1.md` through `P2G12.md`, `docs/ANDROID_WORKER_RECOVERY_P2G13.md`, `docs/ANDROID_WORKMANAGER_RECOVERY_TEST_P2G14.md`, `docs/ANDROID_FORCE_STOP_RECOVERY_P2G15.md`, `docs/ANDROID_MEMORY_BACKGROUND_P2G16.md`, `docs/ANDROID_RESOURCE_OBSERVATION_P2G17.md`, `docs/ANDROID_FOREGROUND_PERFORMANCE_P2G18.md`, and `docs/ANDROID_LOADED_PERFORMANCE_P2G19.md`.

## NEXT-10 — P2-H Desktop shutdown/recovery reconciliation
**Status: DONE — H3 merged as PR #175**

- Recovery matrix reconciled and checked in.
- Global shutdown deadline + fault-isolated cleanup merged.
- Download quiesce timeout regression proves active LOCAL work is durably PAUSED before fallback exit.
- CI, Linux, macOS arm64, Windows ARM64, Docker and Android regression gates passed.
- Detailed boundary: `docs/DESKTOP_SHUTDOWN_RECOVERY_P2H3.md`.

## NEXT-11 — P2-I unified structured task diagnostics
**Status: DONE — I1/I2 merged**

- **I1 merged (PR #176):** safe read-only schema + LibraryService-owned batch + Desktop-only endpoint.
- **I2 merged (PR #177):** WebDAV, Browser Lite export, managed E-H login and software update adapters.
- Both batches passed full CI/platform/Android regression matrices.
- Additive `providerRoute` is fixed/low-cardinality only; no configured URL/host/account/path values.
- Owners without real IDs/timestamps/resource leases remain null/none rather than synthesized.
- Visual remains browser-owned with H2B runtime diagnostics; no I3 adapter is planned without a concrete diagnostic regression.
- Detailed boundaries: `docs/RUNTIME_TASK_DIAGNOSTICS_P2I1.md`, `docs/RUNTIME_TASK_DIAGNOSTICS_P2I2.md`.

## NEXT-12 — P2-L automated runtime hardening promotion gate
**Status: DONE — L1 merged as PR #178 / P2_EXIT_BLOCKED_EXTERNAL_EVIDENCE**

- PR #178 merged the workflow-dispatch gate and its implementation self-test passed (`36214176210`).
- One workflow-dispatch gate re-runs the automated runtime-hardening core on a single candidate commit.
- Desktop/Web: typecheck, syntax, full tests/build, Chromium smoke, and explicit long-task/network/large-queue/resource/diagnostic/shutdown contracts.
- Windows: build current package and run existing packaged artifact smoke.
- Android: unit/lint/release + Macrobenchmark build + G15 force-stop + G16 trim-memory/Doze durable recovery.
- Final JSON report differentiates automated PASS/FAIL from external promotion blockers.
- Automated green does **not** authorize P2 completion, G20 resource enforcement or performance budgets.
- Remaining blockers are P2-K real benchmark matrix, representative Windows/Android manual task control, Android physical G18/G19 evidence and low-end Windows/browser trace.
- Detailed boundary: `docs/P2_RUNTIME_HARDENING_GATE.md`.

## NEXT-13 — P2-J3 Desktop process startup/shutdown measurement
**Status: DONE — J3 merged as PR #179**

- Built Desktop process cold-start/shutdown harness is merged and source/harness acceptance passed.
- Fresh-home initialization remains separated from reused-home cold-process rounds.
- Instance publication, API readiness, shutdown response and shutdown→exit are machine-readable.
- Provider credentials, build time and temporary data-root path remain outside measurement/output.
- CI smoke validates harness execution only; hosted-runner timing is not promoted to a budget.
- Detailed boundary: `docs/DESKTOP_STARTUP_BENCHMARK_P2J3.md`.

## NEXT-14 — P2-J4 Desktop Chromium Home/Library measurement
**Status: DONE — PR #180**

- Keep engine startup outside the browser measurement; J3 remains the process-startup authority.
- Prepare configured synthetic local Desktop state before timing and require no successful external Provider request.
- Measure browser launch, navigation → usable Home shell, real Library-tab click → usable Library and end-to-end browser → Library intervals.
- Use local Library-query completion (`#library-count`) as part of readiness rather than DOMContentLoaded.
- Keep Playwright pinned in a temporary benchmark tool directory; no project dependency/lockfile change.
- CI proves harness executability only; no browser-performance threshold is selected.
- J4 source/harness acceptance passed CI, Desktop Browser Home Harness, Desktop Startup Harness, P2-L gate, Android Macrobenchmark Build and G15/G16 regressions before merge.
- Detailed boundary: `docs/DESKTOP_BROWSER_HOME_BENCHMARK_P2J4.md`.

## NEXT-15 — P2-J5 Desktop Chromium Detail/Shelf/Reader measurement
**Status: DONE — PR #181**

- J5 local Detail/Shelf/Reader source and harness are merged.
- Dedicated J5 Chromium, normal CI, P2-L, J3/J4, Android Macrobenchmark and G15/G16 gates all passed on the final head.
- Hosted-runner timing remains harness-only; representative Windows x64 evidence is still required for P2-K.
- Detailed boundary: `docs/DESKTOP_BROWSER_DETAIL_READER_BENCHMARK_P2J5.md`.

## NEXT-16 — P2-J6 Desktop Reader long-session retention measurement
**Status: DONE — PR #182**

- J6 Reader long-session source/harness is merged.
- Reader Long Session, P2-L, J3/J4/J5, Macrobenchmark, CI and G15/G16 gates all passed on the final head.
- Hosted heap/DOM/RAF values remain harness-only; representative Windows x64 evidence is still required for P2-K.
- Detailed boundary: `docs/DESKTOP_READER_LONG_SESSION_BENCHMARK_P2J6.md`.

## NEXT-17 — P2-J7 Desktop Recommendation generation / batch measurement
**Status: DONE — PR #184**

- J7A local managed-V3 batch-switch harness and J7B opt-in real-Provider regeneration harness are merged.
- Recommendation, P2-L, J3/J4/J5/J6, Macrobenchmark, normal CI and G15/G16 gates all passed on the final head.
- Hosted CI runs only J7A; J7B remains explicit real-Provider evidence and is never simulated.
- No Recommendation performance budget is selected.
- Detailed boundary: `docs/DESKTOP_RECOMMENDATION_BENCHMARK_P2J7.md`.

## NEXT-18 — P2-J8 Desktop active-download foreground latency
**Status: DONE — PR #186**

- J8 source/harness is merged at `97d37db7ee29279ba5cd6549ba5ab80a541f3275`.
- Final pre-merge head passed the dedicated J8 harness, P2-L, normal CI, J3–J7 regressions, Android recovery/memory gates and all experimental package workflows.
- Hosted timing remains harness-only; representative Windows x64 active-download evidence is still required for P2-K.
- Detailed boundary: `docs/DESKTOP_ACTIVE_DOWNLOAD_LATENCY_P2J8.md`.

## NEXT-19 — P2-J9 Desktop WebDAV foreground latency
**Status: DONE — PR #187**

- J9 is merged at `d90c697c08f9a009c5584989a2f41de51d9a935e`.
- Final pre-merge head passed the dedicated J9 workflow, P2-L, normal CI, J3–J8 regressions, Android recovery/memory gates and all experimental package workflows.
- Hosted timing remains harness-only; real Windows/provider evidence is still P2-K work.
- Detailed boundary: `docs/DESKTOP_WEBDAV_FOREGROUND_LATENCY_P2J9.md`.

## NEXT-20 — P2-J10 Desktop Visual indexing foreground impact
**Status: DONE — PR #188 / REAL_MODEL_EXTERNAL_EVIDENCE_REQUIRED**

- J10 source/contract harness is merged at `fd471b22280d0c67e2a9015cec9ab9190b9239cd`.
- Final pre-merge head passed the dedicated Visual contract gate, P2-L, normal CI, J3–J9 regressions, Android recovery/memory gates and all experimental package workflows.
- Automated acceptance does not claim real DINOv2 timing; explicit `--allow-model-network` representative-machine evidence remains P2-K work.
- Detailed boundary: `docs/DESKTOP_VISUAL_INDEX_FOREGROUND_P2J10.md`.

## NEXT-21 — P2-J11 Desktop overlapping-task foreground latency
**Status: DONE — PR #189**

- J11 is merged at `f954414b23ca5ca4409e9de56481593be17ad3fc`.
- Final pre-merge head passed all 18 triggered workflows.
- Hosted overlap evidence confirmed both task types covered 24/24 foreground samples, with real LOCAL writes and WebDAV requests in the same window.
- No P2-C3 concurrency capacity was selected.
- Detailed boundary: `docs/DESKTOP_OVERLAP_FOREGROUND_LATENCY_P2J11.md`.

## NEXT-22 — P2-K K1 Windows x64 reference evidence collection tooling
**Status: DONE — PR #190**

- K1 collector is merged at `7b09fa1943512c9b631b86eb52c993287832a7f1`.
- It standardizes deterministic Windows x64 evidence bundles but does not itself provide representative measurements.
- J10 real-model and J7B real-Provider collection remain explicit opt-ins/separate evidence.
- Detailed boundary: `docs/P2K_REFERENCE_EVIDENCE_K1.md`.

## NEXT-23 — P2-K K2 Android physical-device evidence session tooling
**Status: DONE — PR #191**

- K2 collector is merged at `5bb3085cb22c60bca23e98d15fbaafd2f6942324`.
- Physical G18/G19 execution remains external; CI only validates contracts.
- Detailed boundary: `docs/P2K_ANDROID_PHYSICAL_EVIDENCE_K2.md`.

## NEXT-24 — P2-K K3 Android real download / Reader physical evidence tooling
**Status: DONE — PR #192**

- K3 source/contract tooling is merged at `f5517a7c34eec06a6db66a11055ab9aa784316e7`.
- Physical real-download/Reader execution remains external.
- Detailed boundary: `docs/P2K_ANDROID_REAL_LOAD_K3.md`.

## NEXT-25 — P2-K K4 Windows/Android manual task-control and OEM acceptance
**Status: DONE — PR #193**

- Reuse the common P2-K SHA-256 manifest rather than inventing another report format.
- Record human acceptance as explicit Given/When/Then scenarios.
- Require native Windows or physical Android authority and clean commit by default.
- Require at least one evidence artifact for every PASS.
- Cover Windows long-task visibility, pause/resume, cancel and foreground usability.
- Cover Android Task Center, foreground notification, pause/resume/cancel, OEM/background behavior and foreground usability.
- Preserve human FAIL as valid evidence; do not turn it into a synthetic PASS.
- Source/contract acceptance: implementation head `f661dc9de0b5fe35db2c4e45afd10b3f965a4bdf` passed 18/18 workflows.
- Final documentation head `a46c3d5567970434301a2c28800e5937b6fd732b` also passed 18/18 workflows; merged commit is `9197e9935543c01915222ed106d492d837101b85`.
- Representative Windows/Android human execution remains external and is not implied by source completion.
- Detailed boundary: `docs/P2K_MANUAL_ACCEPTANCE_K4.md`.

## NEXT-26 — P2-K K5 evidence completeness / integrity review
**Status: DONE — PR #194**

- Reuse the existing K1/K2/K4 SHA-256 manifests and approved K3 session format; do not invent another measurement harness.
- Independently verify file hashes, exact commit, platform/device authority and required run IDs.
- Treat J7B real Provider and low-end Windows trace as explicit external evidence sidecars; J10 may be satisfied by K1 `-IncludeVisual` or an approved standalone sidecar.
- Require the nine named evidence categories before structural completeness.
- Do not choose a minimum repetition count, latency/frame/memory budget or P2-C3 concurrency capacity automatically.
- Harden K3 evidence archival so consecutive physical scenarios cannot overwrite each other or pull stale 90-minute artifacts.
- Source/contract acceptance: implementation head `ad64b2eaa40b968afae1d9fff6876a80086fa56f` passed 19/19 workflows with zero failures.
- Final documentation head `9989a47a835f442b7d7904ba9e2ec24e1f342db5` also passed 19/19 workflows; merged commit is `8d31d8a9c4f7c5a5786cbb60a01a6e267c8e2b4e`.
- Representative evidence remains external; K5 completion does not imply P2 completion.
- Detailed boundary: `docs/P2K_EVIDENCE_REVIEW_K5.md`.

## NEXT-27 — Unpublished P2 Windows/Android RC test packages
**Status: DONE — PR #195**

- Keep the public stable channel at v0.4.11; do not reserve or publish v0.4.12.
- Derive an ephemeral candidate identity `0.4.11-p2rc.<source-sha>`.
- Windows candidate must use `RcLauncher.cs` and isolate all Desktop state under `%LOCALAPPDATA%\Pica Library P2 RC`.
- Android candidate must use the side-by-side `com.picalibrary.android.dev` QA identity and must not replace the formal app.
- Reuse the existing fixed QA signing material for Android candidate continuity; do not publish or modify `android-preview`.
- Workflow permissions remain read-only; artifacts are GitHub Actions manual-QA outputs only.
- Do not weaken the updater security boundary: stable v0.4.11 must not accept unpublished `local-test` packages.
- Register public v0.4.11 as app API 2 / schema 13. Current development schema 16 must classify as `FULL_APPLICATION / SCHEMA_JUMP`; migration/rollback acceptance is separate from broad isolated RC QA.
- Windows-host full-suite execution exposed and fixed host-dependent POSIX path simulation in macOS/Linux Desktop roots and macOS managed-browser discovery; POSIX chmod semantics are explicitly skipped on Windows.
- Source/artifact acceptance: implementation head `7a66d02d1523cf4c603c4850b28e3b96aced63ef` passed all 25/25 PR workflows with zero failures.
- Dedicated RC push run `36275848212` passed 3/3 jobs and produced Windows artifact `10916927763` and Android artifact `10917522055`.
- Final documentation head `957d0cdee9b0899f575255328557e5aa4edeef6a` passed all 25/25 PR workflows and the dedicated branch-push RC run `36276530774` passed 3/3 jobs; PR #195 merged as `a6115aa2a9e60bf9e1c8a8f2e0ead9d02099a1de`.
- Detailed boundary: `docs/P2_UNPUBLISHED_RC_TEST_PACKAGES.md`.

## PARALLEL-1 — W5C PR #109
**Status: DONE**

May continue independently if:
- shell-only cache boundary remains intact;
- W5A/W5B security and read-only guarantees stay intact;
- it does not expand into user-content offline caching, remote mutation or multi-user scope;
- all existing platform gates remain green.

---

# 12. Decision / scope-change log

## 2026-09-26 — P2 unpublished dual-client RC merged and ready for representative QA

State update:
- PR #195 final documentation head `957d0cdee9b0899f575255328557e5aa4edeef6a` passed all 25/25 triggered PR workflows with zero failures.
- Final branch-push RC run `36276530774` passed 3/3 jobs and produced Windows artifact `10917613011` and Android artifact `10917238940`.
- PR #195 merged as `a6115aa2a9e60bf9e1c8a8f2e0ead9d02099a1de`.
- NEXT-27 is complete. The repository-side blocker to beginning isolated Windows/Android manual QA is removed.
- Remaining P2 blockers are representative execution/evidence: K1 Windows measurements, K2/K3 physical Android, K4 human/OEM acceptance, J7B real Provider, J10 real Visual, low-end Windows trace, then K5 human variance/budget review.
- No formal release, v0.4.12 reservation, stable OTA mutation or P2-C3 enforcement occurred.

## 2026-09-26 — P2 unpublished dual-client RC source/artifact contract accepted

State update:
- PR #195 implementation head `7a66d02d1523cf4c603c4850b28e3b96aced63ef` passed all 25/25 triggered pull-request workflows with zero failures.
- Dedicated branch-push run `36275848212` passed `contract`, `windows-rc` and `android-rc`.
- The run produced unpublished one-day manual-QA artifacts: Windows id `10916927763` (36,063,197 bytes) and Android id `10917522055` (4,110,039 bytes).
- Windows broad QA uses the isolated `%LOCALAPPDATA%\Pica Library P2 RC` root. Android QA uses `com.picalibrary.android.dev`; neither replaces stable user state by default.
- Stable `build-windows-package.ps1` remains unchanged. RC assembly lives in the dedicated `build-windows-rc-package.ps1` wrapper/repackager.
- Windows full-suite execution exposed and fixed two host-dependent POSIX path bugs; the POSIX chmod test is now explicitly non-Windows.
- Public stable remains v0.4.11. No v0.4.12 tag/release/update-channel mutation occurred.
- This is source/artifact acceptance, not representative human/physical-device evidence. Final-head validation remains required before merge.

## 2026-09-26 — K5 merged; move critical path to unpublished dual-client RC

State update:
- PR #194 final documentation head `9989a47a835f442b7d7904ba9e2ec24e1f342db5` passed 19/19 triggered workflows and merged as `8d31d8a9c4f7c5a5786cbb60a01a6e267c8e2b4e`.
- K1–K5 now cover source/contract collection and evidence reconciliation; missing representative hardware/human evidence remains external.
- The next repository-side deliverable is an unpublished manual-QA RC, not another benchmark framework.
- Windows RC is isolated from the stable Desktop data root; Android RC uses the side-by-side Dev identity.
- Stable v0.4.11 remains the public release. RC version identity is commit-derived and does not reserve v0.4.12.
- v0.4.11 is explicitly registered as schema 13. Current schema 16 is a schema jump and requires a full-application migration/rollback gate for any future formal upgrade path.
- Stable-to-RC local update bypasses are prohibited; existing updater trust rules remain unchanged.

## 2026-09-26 — P2-K5 source/review contract accepted after full automated matrix

State update:
- PR #194 implementation head `ad64b2eaa40b968afae1d9fff6876a80086fa56f` passed all 19/19 triggered workflows with zero failures.
- The passing matrix includes the dedicated K5 contract, K1/K2/K3/K4 contracts, normal CI, Desktop J3–J11 regressions, Android Macrobenchmark build, force-stop recovery, memory/background restrictions and the aggregate P2-L promotion gate.
- K5 remains a structural authority/integrity review only. It does not assert sufficient repetition, acceptable variance, a performance budget, a concurrency capacity or P2 completion.
- The acceptance documentation commit must receive its own full green matrix before merge.

## 2026-09-26 — K4 merged; K5 begins read-only evidence reconciliation

State update:
- PR #193 final documentation head `a46c3d5567970434301a2c28800e5937b6fd732b` passed 18/18 triggered workflows and merged as `9197e9935543c01915222ed106d492d837101b85`.
- K4 source/contract completion does not claim native-Windows or physical-Android human acceptance.
- K5 is introduced only to reconcile already-approved raw evidence formats before human variance/budget review; it does not run synthetic substitutes for missing hardware evidence.
- K5 independently rechecks manifest hashes, required run IDs, platform/device authority and commit coherence instead of trusting a hand-edited `complete=true`.
- K3 physical evidence collection now preserves each measured scenario in an independent result root and copies only artifacts generated by the current run, preventing later Reader collection from deleting download-loaded evidence or importing stale recent artifacts.
- P2-C3 enforcement and release budgets remain blocked until representative evidence is collected and reviewed.

## 2026-09-26 — P2-K4 source/contract accepted after full automated matrix

State update:
- PR #193 implementation head `f661dc9de0b5fe35db2c4e45afd10b3f965a4bdf` is mergeable and passed 18/18 triggered workflows.
- The passing matrix includes the dedicated K4 contract, K1/K2/K3 evidence contracts, P2-L, normal CI, Desktop J3–J11 regressions and Android runtime/build gates.
- This is not representative Windows/Android evidence and does not select budgets or capacities.
- The acceptance documentation commit must receive its own full green matrix before merge.

## 2026-09-26 — P2-K4 records human task-control/OEM acceptance without automating the verdict

State update:
- K3 Android real-load evidence tooling is merged as PR #192 at `f5517a7c34eec06a6db66a11055ab9aa784316e7`; final pre-merge head passed 17/17 workflows.
- Remaining P2-L blockers include Windows manual task-control acceptance and Android physical Task Center/foreground-notification/OEM behavior.
- K4 follows open-source Cucumber/Gherkin-style scenario semantics (Given/When/Then) for readable human acceptance steps but adds no Gherkin runtime dependency.
- Machine evidence remains the existing P2-K SHA-256 manifest. PASS requires at least one attached artifact; FAIL remains preserved evidence and blocks completeness.
- Windows evidence must be initialized on native Windows; Android evidence must use one physical non-emulator device, with hashed device identity.
- K4 does not automate subjective/perceptual verdicts, does not select budgets and does not authorize P2-C3 enforcement.

## 2026-09-26 — P2-K3 requires real Android download and Reader inputs

State update:
- K2 Android physical G18/G19 evidence tooling is merged as PR #191 at `5bb3085cb22c60bca23e98d15fbaafd2f6942324`.
- K2 intentionally leaves real download-loaded navigation and Reader-loaded interaction unresolved.
- K3 extends the existing AndroidX Macrobenchmark 1.5.0 / UiAutomator 2.4.0 plane rather than introducing synthetic media or a parallel benchmark stack.
- Download-loaded measurement is accepted only while real WorkManager `media-network` and `filesystem-heavy` resources remain RUNNING.
- Reader measurement uses a benchmark-only same-package bridge into production ReaderActivity with tester-supplied real comic/chapter IDs; the release/debug app is not made externally launchable.
- Evidence output hashes comic/chapter IDs and stores no credentials; raw pre/post Reader meminfo is retained only for later review.
- K3 tooling does not satisfy P2-K without representative physical-device execution and does not authorize P2-C3 capacities or budgets.

## 2026-09-26 — P2-K K2 pairs physical Android baseline and real loaded evidence without synthetic media

State update:
- K1 Windows x64 evidence collection tooling is merged as PR #190 at `7b09fa1943512c9b631b86eb52c993287832a7f1`; tooling merge did not create a performance verdict.
- K2 reuses the accepted G18 idle and G19 real Native Recommendation loaded Macrobenchmarks instead of creating another Android timing implementation.
- One K2 evidence session is bound to the exact git commit and one physical-device identity; emulator/generic devices, device changes and commit changes are rejected.
- The copied evidence redacts raw adb serial and retains only SHA-256 identity for same-device verification.
- G19 remains a true real-source precondition: `prepare-loaded` installs/opens the benchmark app, then a human configures the real Pica source/candidate base before `loaded`.
- CI may parse the K2 script and validate manifest contracts only. Emulator/shared-runner timings are not Android P2-K evidence.
- Explicit real download-loaded navigation, recommendation+download overlap, Reader-loaded interaction and long Reader evidence remain external requirements and may not be substituted with synthetic media.
- No P2-C3 capacity or performance budget is selected by K2.
- Detailed boundary: `docs/P2K_ANDROID_PHYSICAL_EVIDENCE_K2.md`.

## 2026-09-26 — P2-K K1 standardizes reference evidence before any budget decision

State update:
- P2-J11 is merged as PR #189 at `f954414b23ca5ca4409e9de56481593be17ad3fc`; final pre-merge head passed 18/18 workflows.
- P2-J local automation-friendly instrumentation is now complete from J1 through J11; remaining promotion evidence belongs to P2-K.
- K1 creates a Windows x64 reference collector instead of manually copying benchmark numbers into prose.
- The collector records exact commit/dirty state and machine/runtime context, runs deterministic local benchmark lanes, and builds a SHA-256 indexed evidence manifest.
- K1 deliberately does not automate J7B real Provider regeneration because it mutates the active recommendation cycle and requires explicit confirmation.
- K1 deliberately keeps J10 real model behind `-IncludeVisual` because model/CDN access is an external dependency whose cold/warm cache context must be explicit.
- A merged K1 tool is not P2-K completion. Repeated representative Windows x64, physical Android and real-provider evidence must exist before proposing budgets or P2-C3 enforcement.
- Detailed boundary: `docs/P2K_REFERENCE_EVIDENCE_K1.md`.

## 2026-09-26 — P2-J11 overlaps two real task owners before any concurrency enforcement

State update:
- J10 Visual source/contract harness is merged as PR #188 at `fd471b22280d0c67e2a9015cec9ab9190b9239cd`; final pre-merge head passed 17/17 workflows.
- The remaining local automation-friendly P2-J gap is explicit task-concurrency behavior.
- J11 combines production LOCAL download and production WebDAV sync rather than inventing generic CPU/network stress.
- Both tasks receive the same process-shared observe-only RuntimeResourceCoordinator, preserving the P2-C evidence-first rule.
- J2 requires both `local-download-runner` and `remote-storage-sync` to cover every foreground sample; J11 separately proves actual LOCAL file writes and actual WebDAV requests occurred inside the same measurement window.
- The J9 temporary open-source WebDAV tool runner is generalized by benchmark-script selection while J9 remains the default, avoiding duplicated tool-install logic.
- J11 is controlled contention evidence only. No concurrency capacity, throttling rule or latency budget is authorized until P2-K representative hardware evidence exists.
- Detailed boundary: `docs/DESKTOP_OVERLAP_FOREGROUND_LATENCY_P2J11.md`.

## 2026-09-26 — P2-J10 measures the real browser Visual worker, not a synthetic cpu-model lease

State update:
- J9 WebDAV foreground latency is merged as PR #187 at `d90c697c08f9a009c5584989a2f41de51d9a935e`; final pre-merge head passed 16/16 workflows.
- Production Visual indexing is browser-side: `web/visual-worker.js` dynamically imports Transformers.js and runs `pipeline('image-feature-extraction', 'onnx-community/dinov2-small')` in a Web Worker.
- `cpu-model` exists in the runtime resource taxonomy, but the current Visual browser worker is not an authoritative RuntimeResourceCoordinator task owner. J10 therefore must not fabricate a resource lease merely to satisfy J2 load-window semantics.
- J10 will measure browser foreground responsiveness while the actual Visual worker performs inference, using the existing Playwright browser benchmark plane.
- Model/bootstrap/download time and steady inference impact must remain distinguishable; hosted/shared-runner timing is validation evidence only.
- Official Transformers.js guidance/examples use Web Workers to keep model inference off the browser main thread, matching the production architecture already present in Pica Library.
- No Visual latency budget is selected here; representative hardware evidence remains P2-K work.

## 2026-09-26 — P2-J9 controlled local WebDAV foreground impact

State update:
- J8 active-download foreground latency is merged as PR #186 at `97d37db7ee29279ba5cd6549ba5ab80a541f3275`; its final pre-merge head passed 15/15 triggered workflows.
- The next P2-J item is WebDAV scan/sync impact on foreground API latency.
- J9 does not implement a WebDAV protocol fake. It follows the open-source `webdav-client` testing pattern and installs pinned `webdav-server@2.6.2` into an ephemeral tool directory.
- The measured workload is owned by production `RemoteStorageDesktopManager.sync()`, which acquires the existing process-shared `remote-storage-sync` resource lease.
- J2 remains the single foreground latency/window authority.
- Validity additionally requires the loopback WebDAV server to observe real requests during the measured window, preventing a stale/idle lease from counting as WebDAV load.
- The local server is workload control only; real provider/network behavior, Windows filesystem effects and performance budgets remain P2-K evidence.
- Detailed boundary: `docs/DESKTOP_WEBDAV_FOREGROUND_LATENCY_P2J9.md`.

## 2026-09-26 — P2-J8 controlled active-download foreground latency

State update:
- J7 Recommendation benchmark is merged as PR #184 at `5750a52d671c9e6db1854d84897c263cb5f26ad0`.
- J7 final head passed Recommendation `36228962705`, P2-L `36228962691`, J3 `36228962718`, J4 `36228962698`, J5 `36228962715`, J6 `36228962707`, Macrobenchmark `36228962712`, normal CI `36228962722`, G16 `36228962702`, and G15 `36228962741`.
- The parallel active-download branch had also used J7 while #184 was still open; it is deliberately rebuilt from post-#184 `main` as J8 rather than carrying duplicate task IDs forward.
- J1 already owns low-cardinality HTTP latency telemetry and J2 already owns load-window validity, so J8 reuses J2 rather than cloning measurement logic.
- J8 creates one fully local synthetic Provider fixture but runs the real LOCAL `DownloadScheduler`, `MediaRequestGate`, SQLite progress persistence and filesystem writes.
- The fixture makes no Pica/E-H/WebDAV/external network requests and exports no credentials.
- A valid J8 window requires both full J2 `local-download-runner` coverage and at least one real fixture file write during the measured interval.
- Output is machine-readable and threshold-free. Hosted CI timing remains harness validation only, and the workload is not promoted as Provider throughput evidence.
- Detailed boundary: `docs/DESKTOP_ACTIVE_DOWNLOAD_LATENCY_P2J8.md`.

## 2026-09-26 — P2-J7 Recommendation generation and batch switching are separate benchmarks

State update:
- J6 Reader long-session benchmark is merged as PR #182 at `476484fa88115f0c9c21a1ec45e57227eed25819`.
- J6 final head passed Reader Long Session `36227293068`, P2-L `36227292880`, J3 `36227293051`, J4 `36227292990`, J5 `36227293002`, Macrobenchmark `36227292839`, CI `36227292875`, G16 `36227292969`, and G15 `36227292952`.
- A parallel Recommendation benchmark originally used J6 while PR #182 was still open; after #182 landed first, that work was moved cleanly to J7 rather than allowing duplicate task IDs.
- J7 does not collapse Recommendation generation and batch switching into one timing number.
- J7A uses an isolated deterministic 72-candidate V3 cycle created through production LibraryDatabase + CycleCoordinatorV3 APIs and measures only the real managed next-batch UI transition.
- J7B is opt-in real Provider evidence. It requires a preexisting usable cycle before any Recommendation UI action, then measures confirmed `force_new` regeneration until a new cycle's cards are usable.
- J7B additionally requires structured task diagnostics to observe `recommendation-v3` using `provider-network` while generation is active. A result that completes without that observation is rejected.
- CI runs J7A only; no fake Provider workload substitutes for J7B and no hosted timing becomes a P2-K budget.
- Detailed boundary: `docs/DESKTOP_RECOMMENDATION_BENCHMARK_P2J7.md`.

## 2026-09-26 — P2-J6 Reader long-session retention harness

State update:
- J5 is merged as PR #181 at `faf06ad6267352f166c9629816920cce0e063231`.
- J5 final head passed the dedicated Detail/Reader Chromium harness, normal CI, P2-L promotion gate, J3/J4 harnesses, Android Macrobenchmark build and G15/G16 regressions.
- J6 is the next unblocked local measurement because Recommendation generation requires real Provider evidence and should not be simulated merely to fill the benchmark matrix.
- The existing J5 isolated Desktop/credential/fixture/Playwright runner gains an optional benchmark-script argument; J5 remains the default.
- J6 keeps one real Chromium Reader session alive across repeated local chapter transitions and uses CDP `HeapProfiler.collectGarbage`, `Runtime.getHeapUsage`, `Memory.getDOMCounters` and `Performance.getMetrics`.
- J6 also records chapter-switch readiness latency and controlled-scroll `requestAnimationFrame` intervals.
- CDP Runtime/DOM counters are explicitly not full browser-process RSS; RAF interval observations are explicitly not compositor telemetry.
- CI is limited to a short 6-cycle harness validation and cannot establish P2-K memory/jank budgets.
- Detailed boundary: `docs/DESKTOP_READER_LONG_SESSION_BENCHMARK_P2J6.md`.

## 2026-09-26 — P2-J5 Desktop Detail/Shelf/Reader browser measurement

State update:
- J4 is merged as PR #180 at `e70d9dc20e47fa2d6b5d7a9cdd184d4409e41881` after all source/harness/regression gates passed.
- J5 continues the browser foreground measurement plane instead of selecting a premature P2-K threshold.
- A deterministic local fixture is created through LibraryDatabase APIs before Desktop startup: 3 local comics, 1 shelf, 2 downloaded chapters and 3 local PNG pages per chapter.
- J5 measures real Chromium UI actions for Detail, Shelves, shelf contents, local Reader first chapter and next-chapter transition.
- Reader readiness requires page images to be complete with non-zero natural width, so local HTTP page serving + image decode remain inside the Reader usability boundary.
- Browser launch and Desktop engine startup are excluded from J5 timing because J4/J3 already own those measurements.
- Provider success is excluded through the same dead loopback proxy used by J4.
- CI is harness-only; representative Windows x64 J3/J4/J5 evidence remains required before P2-K budgets.
- Detailed boundary: `docs/DESKTOP_BROWSER_DETAIL_READER_BENCHMARK_P2J5.md`.

## 2026-09-25 — P2-J4 real Desktop Chromium Home/Library measurement

State update:
- J3 is merged as PR #179 at `e4112a9c9cc1a7a654d1be16c2a197a21d5feb79` after the full startup-harness/platform/P2-L/Android regression matrix passed.
- J4 keeps Desktop engine startup out of the browser timing window so J3 and J4 remain diagnostically separable.
- J4 reuses Playwright Chromium 1.63.0 in a temporary tool root; project dependencies and lockfile remain unchanged.
- The runner builds, starts an isolated headless Desktop engine, persists synthetic local settings through the real Desktop API, waits for configured restart, then starts browser measurement.
- External Provider success is not a prerequisite: the synthetic setup uses a dead loopback proxy.
- Every measured round launches a new Chromium process.
- Shell readiness requires the Home view, visible nav, non-detecting mode and non-empty `#library-count`; DOMContentLoaded alone is insufficient.
- Library readiness requires a real nav click, active Library view, populated Library count and enabled filter input.
- Reports expose launch/navigation/Library timing distributions but no P2-K threshold.
- CI is harness-only and may not promote Ubuntu hosted-runner numbers into reference Windows evidence.
- Detailed boundary: `docs/DESKTOP_BROWSER_HOME_BENCHMARK_P2J4.md`.

## 2026-09-25 — P2-J3 Desktop process cold-start measurement

State update:
- P2-L1 is merged as PR #178 and its promotion-gate self-test `36214176210` passed; automated gate availability is no longer merely a candidate.
- P2 exit remains blocked because P2-K real benchmark evidence and representative Windows/Android manual/physical evidence are still missing.
- J3 adds a repeatable process-level measurement over built `dist/desktop.js --headless`.
- One fresh-home sample is reported separately; the main comparable window is repeated new processes against the same isolated data root.
- J3 measures spawn→instance publication, spawn→identified local API readiness, shutdown POST response and shutdown→process exit.
- Reports contain raw samples plus min/median/max and environment metadata, but no performance budget.
- Provider credential environment variables are stripped from the measured child process.
- CI only runs a short `harnessValidationOnly` smoke and must not promote hosted-runner timings into P2-K thresholds.
- Browser open→usable Home/Library remains J4.
- Detailed boundary: `docs/DESKTOP_STARTUP_BENCHMARK_P2J3.md`.

## 2026-09-25 — P2-L1 automated runtime hardening promotion gate

State update:
- P2-I core Desktop structured observability is complete through I1/I2; no Visual I3 is added without a concrete diagnostic regression.
- P2-K real benchmark budgets remain blocked on representative hardware and variance evidence, so P2-L must not convert CI wall times into performance budgets.
- L1 adds a manual `P2 Runtime Hardening Promotion Gate` workflow and self-tests it on the implementation PR.
- Automated jobs cover Desktop/Web full validation + named critical runtime contracts, current Windows package smoke, Android unit/lint/release/Macrobenchmark build, G15 force-stop recovery and G16 trim-memory/Doze durable recovery.
- `write-p2-runtime-hardening-gate-report.mjs` emits one machine-readable candidate report.
- Automated all-green yields `AUTOMATED_PASS_EXTERNAL_EVIDENCE_REQUIRED`; there is intentionally no automated `P2_COMPLETE` state.
- External blockers remain explicit: P2-K real benchmark matrix, Windows manual task-control acceptance, Android physical task-control/G18-G19 performance and low-end Windows/browser CPU+jank trace.
- Detailed boundary: `docs/P2_RUNTIME_HARDENING_GATE.md`.

## 2026-09-25 — P2-I2 accepted; core Desktop structured task observability complete

State update:
- I2 is merged as PR #177 at `c7eab55f0b54d6a520aa524e50a9ab6c93258404`.
- Accepted runs: CI `36212602733`, Linux `36212602711`, macOS `36212602662`, Windows ARM64 `36212602709`, Docker `36212602678`, Macrobenchmark build `36212602738`, Android force-stop `36212602671`, Android memory/background `36212602704`.
- Core Desktop long-task diagnostics now cover both LibraryService-owned and external Desktop-owned task families through the same read-only schema/endpoint.
- Visual is intentionally not copied into Desktop task authority: browser Worker/page remains authoritative and H2B already supplies timing/profile diagnostics.
- P2-I code work is considered complete unless a concrete trace/regression demonstrates a remaining observability gap.
- Next unblocked architecture task is P2-L automated runtime-hardening gate; P2-K performance budgets remain blocked on real-hardware evidence.

## 2026-09-25 — G16 post-Doze gate corrected for OS-controlled JobScheduler timing

State update:
- I2 PR #177 exposed a G16 test-harness assumption after GitHub runners began using Android Emulator 37.1.11: the probe stayed durable through forced Doze, but the OS did not dispatch it within the old fixed 60 s post-unforce window.
- The failure was isolated to the existing G16 emulator gate; I2 Desktop code passed the other seven CI/platform gates.
- Android does not guarantee a fixed background JobScheduler dispatch latency immediately after leaving Doze, so the old 60 s requirement was stronger than the application contract.
- G16 now continues to require zero probe execution while forced idle.
- After unforce, the gate briefly observes natural background dispatch; if no dispatch occurs, it performs a normal launcher re-entry and requires the same already-seeded WorkRequest to execute.
- No `jobscheduler run -f` or equivalent forced scheduler execution is used.
- The result artifact records whether recovery was `background-auto` or `launcher-reentry`.
- Product WorkManager code and G16 resource/Doze semantics are unchanged; only the evidence harness is corrected.

## 2026-09-25 — P2-I2 external Desktop task diagnostics

State update:
- I1 is merged as PR #176 at `e4d508dea0d342f4f9b173a20520e69e8262b1b5` after the full CI/platform/Android regression matrix passed.
- I2 keeps the I1 endpoint/schema authority model and extends it through a Desktop-controller aggregation layer rather than moving external owners into LibraryService.
- External batch: WebDAV remote sync, Browser Lite export, managed E-H web login, software update.
- WebDAV maps its authoritative `syncProgress` and the existing shared `remote-storage-sync` RuntimeResourceCoordinator lease.
- Browser Lite only exposes the state/phase/completion timestamp it actually owns; missing start/update/resource metadata remains null/empty.
- E-H `opening/verifying` normalize to running and `waiting` remains waiting; only failed message is treated as sanitized lastError.
- Updater `staged` normalizes to waiting; apply/stage phases normalize to running; complete/failed stay terminal.
- I2 adds additive `providerRoute` with fixed safe labels only: `webdav`, `eh-managed-browser`, `github-release`.
- Remote API remains excluded; the existing Desktop-only endpoint is still excluded from J1 latency samples.
- Detailed boundary: `docs/RUNTIME_TASK_DIAGNOSTICS_P2I2.md`.

## 2026-09-25 — P2-I1 unified LibraryService runtime task diagnostics

State update:
- P2-H3 is merged as PR #175 at `60abf3a17516e98ab6f4bda0e63af2908e926338` after the full platform/package + Android regression matrix passed.
- P2-I begins with a read-only adapter, not a new task registry.
- `runtimeTaskDiagnostics()` maps eight LibraryService-owned logical tasks into one schema while leaving each original status method authoritative.
- `taskKey` is a stable diagnostic identity; `taskId` is null unless the underlying owner actually exposes a current run/job ID.
- Resource waiting/running state, priority and durations are correlated from RuntimeResourceCoordinator requested/started timestamps.
- LOCAL downloads remain an aggregate queue diagnostic and do not claim one comic job ID as the whole runtime identity.
- `sanitizeRuntimeDiagnosticError()` bounds and redacts URLs, absolute paths, Bearer values and common token/password/cookie/authorization key-value forms.
- New Desktop-only `GET /api/v1/desktop/runtime/tasks` is excluded from J1 latency sampling and is not added to Remote API.
- WebDAV/update/Browser Lite/E-H login/Visual browser-worker owners remain future owner-specific adapters.
- Detailed boundary: `docs/RUNTIME_TASK_DIAGNOSTICS_P2I1.md`.

## 2026-09-25 — P2-H3 Desktop shutdown fault isolation

State update:
- Recovery inventory shows the recommendation, download, WebDAV, Visual, schema-migration, Mobile Bridge and headless lifecycle requirements already have implementation/test evidence.
- The remaining concrete P2-H defect was shutdown fault isolation: `stop()` awaited an unguarded `closeEngine()` before registering its final process-exit fallback.
- H3 registers `SHUTDOWN_HARD_DEADLINE_MS = 35_000` before cleanup begins, covering the existing 30 s download-quiesce bound plus local HTTP close margin.
- `shutdownStep(...)` records one cleanup owner's failure and continues later owners instead of aborting the shutdown chain.
- Cleanup order remains Remote API → Mobile Bridge → managed E-H login → local downloads → local HTTP server → SQLite → instance lock.
- The normal short `SHUTDOWN_FINAL_HANDLE_GRACE_MS = 250` remains only after cleanup has completed/fault-isolated.
- A new behavior regression forces `quiesceLocalDownloads(20)` to time out while a real provider write is blocked and requires the LOCAL job to stay PAUSED.
- H3 does not claim same-run resume for every subsystem; documented safe-stop/restart semantics remain valid.
- Detailed boundary: `docs/DESKTOP_SHUTDOWN_RECOVERY_P2H3.md`.

## 2026-09-25 — G19 source/build accepted; Android enforcement enters physical-evidence gate

State update:
- G19 is merged as PR #173 at `529638cd1ff3ebe8c16e6ba54e8f43ea85c9a116`.
- Source/build acceptance passed Macrobenchmark Build `36160396121`, normal CI `36160396044`, G15 force-stop regression `36160396042`, and G16 memory/background regression `36160396108`.
- G17–G19 now provide the complete pre-enforcement toolchain: WorkManager resource observation, idle foreground Macrobenchmark, and an opt-in real Native Recommendation overlap Macrobenchmark.
- CI/emulator success is not promoted into a performance conclusion. The next accepted evidence must come from representative physical Android hardware.
- Required first evidence pair: G18 idle baseline + G19 real recommendation-loaded run on the same device/build context.
- Download/Reader loaded evidence must use explicit real comic/chapter inputs; synthetic media traffic remains prohibited for the promotion decision.
- G20/P2-C3 Android concurrency/resource enforcement is BLOCKED until those measurements show concrete contention and justify a policy.
- Detailed boundaries: `docs/ANDROID_FOREGROUND_PERFORMANCE_P2G18.md` and `docs/ANDROID_LOADED_PERFORMANCE_P2G19.md`.

## 2026-09-25 — P2-G19 real recommendation-loaded Android performance scenario

State update:
- G18 is merged as PR #172 after Macrobenchmark Build `36159189196`, CI `36159189211`, direct-upgrade `36159189201`, G16 regression `36159189220`, and G15 regression `36159189234` passed.
- G19 does not choose a performance/resource budget. It joins G17 resource observation with G18 FrameTiming.
- The first loaded scenario uses the real Native Recommendation trigger because it has a stable UI action and existing provider-network + cpu-analysis tags.
- The loaded test is opt-in via `picaG19Loaded=true`; it is skipped unless a tester explicitly enables it after configuring a real Pica source or synced candidate base.
- The scenario requires provider-network and cpu-analysis to both be RUNNING before and after measured navigation. A short/invalid/no-source run is rejected rather than relabeled as loaded evidence.
- Macrobenchmark `startupMode=null` is used so this non-startup benchmark does not force-stop the target before the measured interaction.
- BenchmarkResourceSnapshotReceiver exists only in the benchmark source set and returns coarse G17 resource occupancy through explicit shell broadcast result data.
- `run-android-loaded-macrobenchmark.sh prepare` installs/opens the benchmark app for manual source setup; `run` measures only the loaded recommendation method and exports performance artifacts. The script reads/exports no credentials.
- Real download + Reader scenarios remain later work because they require explicit real comic/chapter inputs; G19 will not invent fake media loads.
- Detailed boundary: `docs/ANDROID_LOADED_PERFORMANCE_P2G19.md`.

## 2026-09-25 — P2-G18 Android foreground Macrobenchmark measurement

State update:
- G17 is merged as PR #171 after CI `36149248370`, G15 force-stop regression `36149248427`, and G16 memory/background regression `36149248367` passed.
- G18 explicitly remains measurement-only. It does not replace G17 observation with concurrency enforcement.
- AndroidX Macrobenchmark is used instead of a custom jank timer.
- A release-like `benchmark` app variant is added with benchmark-only profileable/setup components; formal release/debug manifests remain unchanged.
- `coldStartupToUsableLibrary` uses StartupTimingMetric + COLD + Partial compilation for five iterations.
- HomeActivity calls `reportFullyDrawn()` once after the local Library adapter is attached, defining usable-local-Library full display without waiting for optional provider refreshes.
- `topLevelTabSwitchFrameTiming` uses FrameTimingMetric while switching Library → Recommendation → Online → Settings → Library through UiAutomator.
- CI only compiles `:app:assembleBenchmark` and `:macrobenchmark:assembleBenchmark`; GitHub emulator timings are not promoted as real performance evidence.
- `scripts/run-android-macrobenchmark.sh` is the physical-device collection entry and archives device metadata, benchmarkData JSON and Perfetto traces.
- G19 should add loaded overlap scenarios on representative hardware using G17 resource observation; G20/P2-C3 enforcement remains evidence-gated.
- Detailed boundary: `docs/ANDROID_FOREGROUND_PERFORMANCE_P2G18.md`.

## 2026-09-25 — P2-G17 Android cross-task resource observation

State update:
- G16 is merged as PR #170 after CI `36147604842`, direct-upgrade `36147604826`, G15 force-stop regression `36147604861`, and G16 memory/background gate `36147604843` all passed.
- P2-C and the runtime inventory already prohibit arbitrary concurrency limits before representative overlap/latency evidence.
- G17 therefore remains observe-only: AndroidTaskResources adds resource tags and current WorkManager snapshots, but does not cancel, delay, reprioritize or serialize jobs.
- RT-17 Native Recommendation = provider-network + cpu-analysis.
- RT-18 Pica/E-H downloads = media-network + filesystem-heavy.
- RT-19 Desktop favorites/covers import = bridge-network + filesystem-heavy.
- RT-20 Pica bootstrap = provider-network + filesystem-heavy.
- Snapshot totals de-duplicate one multi-resource WorkRequest while preserving per-resource counts.
- AndroidTaskResourcesTest uses the official WorkManager harness to verify this de-duplication.
- Debug-only AndroidResourceObservationActivity writes `p2-g17-resource-snapshot.json` for ADB collection on representative hardware and is absent from the release manifest.
- No G18/P2-C3 capacity will be chosen until resource-overlap samples are paired with foreground latency/memory evidence.
- Detailed boundary: `docs/ANDROID_RESOURCE_OBSERVATION_P2G17.md`.

## 2026-09-25 — P2-G16 Android low-memory and background restriction gate

State update:
- G15 is merged as PR #169 after the normal CI, v0.4 direct-upgrade gate and the real API-35 force-stop/relaunch emulator gate passed.
- Android memory audit found no process-wide onTrimMemory handler while CoverRepository and ImageRepository each allowed a 72 MiB decoded-Bitmap LRU.
- G16 adds Application.onTrimMemory handling that evicts only those reconstructible memory LRUs at UI_HIDDEN/background pressure; disk caches, active view references and durable WorkManager state are not deleted.
- AndroidMemoryPressureTest covers UI_HIDDEN/BACKGROUND eviction and protects against purging on a non-trim hint.
- G16 also upgrades WorkManager runtime/testing from 2.9.1 to stable 2.12.0. This crosses the Android 15 compatibility fixes for dataSync foreground timeout handling, blocked-network constraint tracking and background network execution.
- Existing durable network families remain WorkManager-owned with CONNECTED/UNMETERED constraints; no new raw service scheduler is introduced.
- The real emulator gate primes both Bitmap LRUs, sends ActivityManager HIDDEN trim in the same PID and requires both memory sizes to reach zero.
- The same API-35 emulator then enqueues a delayed network-constrained debug Worker, forces Doze past the eligibility boundary and requires zero execution while idle. After unforce, the gate first observes natural background dispatch and, if the OS has not scheduled it yet, performs a normal launcher re-entry and requires the same durable WorkRequest to execute. This validates durability/recovery without inventing a fixed JobScheduler latency SLA.
- Debug probes remain outside the release manifest.
- OEM battery managers, Android 16+ long-running Worker quota behavior, foreground-notification reconstruction on representative devices and enforceable concurrency budgets remain later evidence gates.
- Detailed boundary: `docs/ANDROID_MEMORY_BACKGROUND_P2G16.md`.

## 2026-09-25 — P2-G15 real Android force-stop recovery gate

State update:
- G14 is merged as PR #166 and validates WorkManager DB/WorkInfo reconstruction through the official test harness; it intentionally leaves real OS force-stop evidence open.
- G15 closes that named evidence gap by seeding from a debug-only **normal app Activity**, keeping a debug-only WorkManager probe actually RUNNING, then applying host-side `adb shell am force-stop`. Seed instrumentation was rejected after emulator evidence showed Android instrumentation itself force-stops the target at start/finish and would contaminate the measured boundary.
- Force-stop is treated as a real stopped-state boundary: the app is not expected to resurrect background work while stopped. After explicit launcher re-entry, the host requires a new target PID and probe runCount >= 2 before starting verification-only instrumentation, proving WorkManager reconstructed unfinished work rather than merely reading the old database row.
- G15 also fixes a recovery-identity terminal leak found during this work: Favorite import, Pica bootstrap and Native Recommendation now clear current UUIDs on explicit cancel and only after durable success, while pause/retry/failure retain them.
- The emulator scenario also preserves a deliberate PAUSED Favorite import and E-H download, retains an active Pica download, and verifies Task Center renders active/paused logical downloads exactly once.
- An explicitly cancelled Pica download remains historical CANCELLED WorkInfo but has no registry identity and must not reappear in Task Center.
- The test-only probe lives under the Android debug source set; release behavior receives only the singleton terminal-identity correction.
- CI uses `ReactiveCircus/android-emulator-runner@v2` with API 35 / x86_64 / KVM instead of a custom emulator bootstrap.
- G15 does not claim OEM low-memory/background restriction, vendor foreground-service, or physical-device performance acceptance; those remain the next P2-G gates.
- Detailed boundary: `docs/ANDROID_FORCE_STOP_RECOVERY_P2G15.md`.

## 2026-09-25 — P2-G14 official WorkManager recovery integration

State update:
- G13 is merged as PR #165 and provides durable task identity + Task Center reconstruction authority.
- G14 adds the official androidx.work:work-testing:2.9.1 artifact, matching the production WorkManager 2.9.1 runtime rather than introducing a custom scheduler fake.
- Robolectric WorkManagerRecoveryTest creates real delayed unique/tagged WorkRequests and exercises the real WorkManager database/WorkInfo query layer.
- Scenarios cover REPLACE-history de-duplication, stale registry self-repair, PAUSED recovery with missing historical WorkInfo, non-paused orphan non-resurrection, and singleton exact-current selection/repair.
- The test runs Task Center recovery methods against actual WorkInfo rows while keeping the normal Task Center poll loop paused.
- G14 does not claim to emulate am force-stop, process SIGKILL, reboot or OEM background restrictions; those remain a named device/emulator evidence gate.
- Detailed boundary: docs/ANDROID_WORKMANAGER_RECOVERY_TEST_P2G14.md.

## 2026-09-25 — P2-G13 durable WorkManager reconstruction authority

State update:
- G1–G12 are merged and close the currently audited Android UI-thread I/O remediation lane.
- TaskCenterActivity previously treated WorkInfo list position as current-attempt authority for singleton work and rendered every tag-matched historical download WorkInfo, allowing duplicate/stale cards after REPLACE/resume.
- Dynamic download PAUSED intent was durable but provider/comic/episode identity was not independently enumerable after old WorkInfo pruning.
- G13 adds MobileTaskRegistryStore: app-private recovery identity only, with no credentials, URLs or file paths.
- Favorite import, Pica bootstrap and Native Recommendation persist current WorkRequest UUID. Pica/E-H downloads persist provider/comic/episode/current UUID and keep that identity while paused.
- Download success unregisters only after page/index/catalog completion; explicit cancel unregisters immediately; retry/failure keep identity for recovery.
- Task Center reconstructs singleton work by exact UUID and dynamic downloads by registry identity + queried WorkInfo. Missing/stale UUIDs can be repaired only by an actually active same-identity WorkInfo.
- The old latest(list)=tail assumption is removed. One logical download produces at most one Task Center card.
- Robolectric MobileTaskRegistryStoreTest verifies persistence, replacement, removal and Pica/E-H identity separation.
- docs/ANDROID_WORKER_RECOVERY_P2G13.md adds the explicit recovery matrix required by P2-H; true OS kill/restart instrumentation remains the next evidence gate.
- Detailed boundary: docs/ANDROID_WORKER_RECOVERY_P2G13.md.

## 2026-09-24 — P2-G12 Reader completion evidence I/O hardening

State update:
- ReaderActivity.save() previously performed UnifiedCatalogStore.load(this) and RecommendationEvidenceStore.recordReaderComplete(...) synchronously when the current chapter first reached its final page.
- That completion branch could add a full Catalog parse plus recommendation-evidence JSON read/write to the UI-thread progress-save path.
- G12 adds recordReaderCompleteAsync(), capturing application context/current comic ID and submitting Catalog enrichment + evidence persistence to Reader's existing metadata executor.
- save() retains progress.save(), completionRecordedChapter dedupe and progress-sync scheduling, but contains no Catalog load and no direct evidence Store write.
- completionRecordedChapter is set before the background task is scheduled, preserving one completion evidence attempt per chapter across repeated save callbacks.
- Reader progress schema/cadence, chapter detection, reader_complete event schema, metadata enrichment and dirty/sync behavior are unchanged.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G12.md.

## 2026-09-24 — P2-G11 direct-open evidence I/O hardening

State update:
- MainActivity.openUnified() previously synchronously loaded UnifiedCatalogStore, looked up one comic's tags/categories, synchronously loaded/rewrote RecommendationEvidenceStore through recordDetailOpen(), and only then launched detail.
- G11 adds recordDetailOpenAsync(), using application context and MainActivity's existing requests executor for Catalog enrichment and evidence persistence.
- openUnified() now contains no Catalog Store load and no direct evidence Store write; detail Activity launch is immediate after scheduling the evidence task.
- The evidence task is not assigned to page-level pending, so ordinary tab/page cancellation does not cancel an already-recorded user interaction.
- Recommendation evidence event type/schema, author/tags/categories semantics, bounded evidence retention, dirty/sync behavior and detail Intent extras are unchanged.
- ReaderActivity reader_complete evidence remains outside G11 and is the explicit next owner-level batch.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G11.md.

## 2026-09-24 — P2-G10 History local snapshot hardening

State update:
- HistoryActivity previously executed ReadingHistoryStore.importLocalBookmarksOnce(this) before renderShell(), and renderList() synchronously reloaded ReadingHistoryStore + Unified Catalog on every page/filter/date render.
- G10 introduces HistoryData(history, catalog), Activity-held historySnapshot/catalogSnapshot, and worker-owned readHistoryData().
- onCreate() renders the shell first, schedules loadLocalHistory(true), and then schedules legacy-source import on the same single-thread worker.
- Initial bookmark migration, History JSON load and Catalog load are worker-owned; renderList() shows loading until snapshots exist, then filters only in memory and reuses catalogSnapshot for covers.
- Range/date changes no longer perform file/JSON reads.
- After WebDAV/Desktop legacy import persists rows, the same worker calls readHistoryData(false) and publishes refreshed snapshots before rerendering.
- Existing history grouping, chapter metadata, legacy labels, cover behavior and resume/open-detail controls are unchanged.
- Explicit resumeSupported() source checks and Reader/Main direct-open evidence reads remain outside G10.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G10.md.

## 2026-09-24 — P2-G9 Main Recommendation initial-state hardening

State update:
- MainActivity Recommendation previously synchronously loaded PortableRecommendationPackageStore, Unified Catalog and NativeRecommendationStore, scanned Catalog/feedback for local evidence, checked Pica availability, and when a cycle existed executed markCurrentSeen() plus another NativeRecommendation load before rendering.
- G9 introduces RecommendationPageState(portable, nativeSnapshot, canRun) and worker-owned readRecommendationPageState().
- The worker owns Portable/Catalog/NativeRecommendation file reads, Catalog evidence scan, Pica/portable availability decision, and initial markCurrentSeen() persistence/reload.
- recommendations() now renders a lightweight page/loading shell and submits the state read through the existing requests executor; valid(id) guards publication.
- renderRecommendationPage() performs no Portable/Catalog/NativeRecommendation load and no markCurrentSeen().
- Generate/Regenerate behavior, input-readiness rules, Portable guidance, recommendation cards, scores/reasons and batch contents are unchanged.
- Previous/Next batch persistence remains outside G9 as an explicit user-action path.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G9.md.

## 2026-09-24 — P2-G8 Main Bookshelves local-state hardening

State update:
- MainActivity Bookshelves previously loaded ShelfStore and RemoteConfig synchronously during page construction; renderShelves then loaded Unified Catalog synchronously for availability labels.
- WebDAV refresh failure returned to UI and loaded ShelfStore again; the success path also called an explicit UnifiedCatalogStore.reconcileLocalReferences() immediately after ShelfStore.save(), even though ShelfStore.save already performs reconciliation.
- G8 adds ShelfPageState(shelves, catalog, remote, sourceLabel, remoteConfigured) and worker-owned readLocalShelfState().
- Initial Bookshelves page renders its shell/status immediately, then loads Shelf/Catalog/config on the existing requests executor before one valid(id)-guarded publication.
- WebDAV success publishes a worker-prepared state using the Catalog already reconciled by ShelfStore.save; the redundant explicit reconcile is removed.
- WebDAV failure prepares its local fallback Shelf+Catalog state on the worker before UI publication.
- renderShelves() is Store-free and preserves shelf ordering, active shelf persistence, availability priority, refresh semantics and navigation.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G8.md.

## 2026-09-24 — P2-G7 Pica Browse render snapshot hardening

State update:
- PicaBrowseActivity already performed provider network requests and Catalog merges on its single-thread worker, but every showIds() call then reloaded Unified Catalog, E-H semantics and Tag Translation on the UI thread before drawing cards.
- G7 adds BrowseRenderState(ids, label, pages, catalog, semantics, translations) and worker-side prepareRenderState().
- Provider result paths now continue from provider merge into local render-state preparation on the same worker, then publish only the prepared state to UI.
- showIds(BrowseRenderState) contains no Catalog/Semantic/Translation Store load.
- E-H favorite-slot selection now submits render preparation to the worker instead of rendering directly from the dialog callback.
- Tag Translation scheduleUpdate callback now uses refreshLastRenderedIds(), which re-prepares the last visible result on the worker before UI publication.
- Existing single-worker ordering, destroyed guard, provider semantics, favorite writes, result ordering, translation rules and cover loading are unchanged.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G7.md.

## 2026-09-24 — P2-G6 Author Directory creator-concept hardening

State update:
- AuthorDirectoryActivity previously called AuthorConceptStore.build(this) in onCreate(), which synchronously loaded Unified Catalog, loaded E-H semantics and rebuilt creator concepts across the local catalog before the first directory frame.
- G6 renders the Author Directory shell/search immediately and schedules one Activity-local single-thread loadSnapshot() pipeline.
- The worker explicitly loads UnifiedCatalogStore + EhSemanticStore and calls AuthorConceptStore.build(catalog, semantics); AuthorConceptStore.build(this) is removed from the Activity.
- renderList() shows a lightweight loading state until the snapshot arrives. Search text changes remain local/UI-only while loading, and the published snapshot renders using the current search text.
- destroyed + loadGeneration guard snapshot publication; onDestroy() advances generation and shuts down the executor.
- Creator identity, aliases, circles/groups, focused-author grouping, 120-result cap and Author Works navigation are unchanged.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G6.md.

## 2026-09-24 — P2-G5 Main Settings summary I/O hardening

State update:
- MainActivity Settings previously built the page while synchronously loading FavoriteCacheStore, RemoteConfigStore, PicaAccountStore, NativeRecommendationStore and PhoneDownloadStore, scanning cover bytes, stat-ing every phone-download page through estimatedBytes(this), and recursively calculating StoragePolicy.usage().
- G5 introduces one worker-prepared SettingsSummary and leaves the Settings cards/buttons synchronous with lightweight loading placeholders.
- readSettingsSummary() owns the persistent JSON/Keystore/directory/stat work and reuses the already loaded PhoneDownload Snapshot for byte estimation.
- Desktop online probing remains on the existing pending Future; settingsSummaryTask is a separate page-owned Future so these state streams do not replace/cancel one another.
- Summary UI publication is guarded by serial/valid(id). settingsSummaryTask is cancelled on page switch, pause and destroy.
- Favorite action messages are not overwritten by an older summary completion.
- Settings actions, WorkManager jobs, Pica/WebDAV configuration, Task Center, Downloads, Storage and Update navigation are unchanged.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G5.md.

## 2026-09-24 — P2-G4 Main Library first-frame local-reference hardening

State update:
- MainActivity defaults to the Library tab and onResume immediately enters library().
- Before G4, library() synchronously called UnifiedCatalogStore.reconcileLocalReferences(this) before the first catalog render.
- reconcileLocalReferences is a full local-state merge: Unified Catalog load, ShelfStore merge, E-H/Favorite merge, PhoneDownloadStore merge and Catalog save.
- G4 keeps the Library search/filter/shortcuts/status/Grid shell synchronous, but moves local reconciliation into the existing requests executor.
- The worker captures the current serial generation and publishes only through runOnUiThread when valid(id) remains true.
- After the local Snapshot renders, the existing libraryRefreshedThisSession decision starts the normal asynchronous Desktop/WebDAV refresh exactly as before.
- cancelPageWork() already increments serial and cancels pending, so tab changes invalidate the in-flight local reconstruction without a second lifecycle system.
- Unified Catalog schema, local-reference authority, filtering/sorting, source labels and remote refresh semantics are unchanged.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G4.md.

## 2026-09-24 — P2-G3 Downloads persistent-index/stat hardening

State update:
- DownloadsActivity previously called PhoneDownloadStore.load(this) and PhoneDownloadStore.estimatedBytes(this) directly from renderList() on the UI thread.
- estimatedBytes(context) reloaded the complete download index and then stat-ed every page URI, so one render could parse the index twice before drawing the persistent-download list.
- Delete confirmation also executed PhoneDownloadStore.remove() synchronously on the UI thread; removal may delete many page URIs, rewrite the index and reconcile Unified Catalog.
- G3 adds one Activity-local single-thread executor and one immutable DownloadState(snapshot, bytes).
- onResume shows a loading state and schedules readDownloads(); the worker loads the index once and computes size from the same Snapshot through the new estimatedBytes(context, snapshot) overload.
- renderList() is now UI-only and performs no PhoneDownloadStore load/stat call.
- Delete confirmation dispatches deleteDownload(); remove + refreshed index/stat read run on the worker before one guarded UI publication.
- destroyed + loadGeneration prevent stale/out-of-order/destroyed Activity publications, and onDestroy() advances the generation and shuts down the executor.
- Persistent-download format, deletion semantics, Catalog reconciliation, displayed list/card behavior and navigation are unchanged.
- Audit correction: PhoneDownloadStore byte summary is in MainActivity Settings, not the default landing tab. The higher-priority default Library path synchronously runs UnifiedCatalogStore.reconcileLocalReferences(this), while Settings retains separate PhoneDownloadStore/storage summary I/O.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G3.md.

## 2026-09-24 — P2-G2 Comic Detail first-frame local-state hardening

State update:
- UnifiedComicDetailActivity is a high-frequency destination from Library, Recommendation, Download, History, Author and Browse surfaces.
- Its previous first-frame path synchronously parsed Unified Catalog in onCreate(), rebuilt Author concepts from Catalog+Semantic data, reloaded E-H semantic/translation data for tags, checked the phone-download index, and reopened Unified Catalog for each expanded same-work variant.
- G2 adds a worker-owned LocalDetailState and shows a lightweight detail loading shell immediately.
- The worker loads Catalog/Semantic snapshots once, builds Author concepts from those snapshots, derives creator/tag display, checks phone download state and loads initial E-H favorite metadata.
- Full render then consumes only prepared state; resolveSources receives the precomputed phone-download flag and existing provider probes remain asynchronous.
- workVariantEntry() now uses the already-loaded catalog snapshot rather than reopening the file per card.
- Initial E-H action rendering uses the worker-prepared favorite snapshot; remote favorite mutation refreshes that snapshot off-thread before returning to UI.
- No creator/tag/source/chapter/work-variant/favorite/shelf/recommendation semantics are intentionally changed.
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G2.md.

## 2026-09-24 — P2-G1 Author Works main-thread local-state hardening

State update:
- Android runtime audit classified Store.load/build calls by actual cost rather than moving every preference read off-thread.
- UnifiedCatalogStore.load reads/parses the complete unified-catalog JSON; EhSemanticStore.load reads/parses the complete semantic JSON; AuthorConceptStore.build(Context) invokes both and builds creator identities across the catalog.
- AuthorWorksActivity previously executed those operations repeatedly on the UI thread during onCreate(), renderWorks(), filter refreshes and the post-provider-refresh UI callback.
- G1 introduces a worker-owned LocalState. readLocalState() loads Unified Catalog once, loads E-H semantics once, builds Author concepts from the already-loaded snapshots, and selects the requested concept.
- onCreate() now renders a lightweight shell first and schedules local-state loading on the existing single-thread executor.
- renderWorks() performs no Store load or AuthorConcept build and consumes only the committed in-memory snapshots.
- Provider refresh remains on the same worker; after merges it rebuilds local state off-thread and publishes it once to the UI.
- Source-contract regression forbids AuthorConceptStore.build(this) in AuthorWorks and forbids Catalog/Semantic/AuthorConcept load/build calls inside renderWorks().
- Detailed boundary: docs/ANDROID_RUNTIME_HARDENING_P2G1.md.

## 2026-09-24 — P2-F implementation closeout / reference trace open

State update:
- PR #151 merged the F13 real-browser evidence into main.
- Chromium browser evidence passed with Work Identity 3004 ms hidden / 2 ms visible wake / 504 ms foreground and V5 shadow 3004 ms hidden / 3 ms visible wake / 602 ms foreground.
- Across F1–F13, audited frontend observer/poller paths now have explicit ownership, bounded lifecycle, scoped or incremental DOM work, and no known duplicate recurring Recommendation status authority.
- No known persistent high-frequency idle loop remains in the audited Web paths without a named owner/start/stop condition.
- CI browser timing proves control-flow behavior only. It does not substitute for a representative low-end Windows/browser CPU, jank or interaction-latency trace.
- P2-F therefore moves to IMPLEMENTATION_COMPLETE_REFERENCE_TRACE_OPEN rather than DONE.
- Further frontend rewrites are prohibited unless the external reference trace or a future regression identifies a concrete remaining hotspot.
- Main architecture work proceeds to NEXT-9 / P2-G Android runtime hardening.

## 2026-09-24 — P2-F13 real-browser cadence evidence

State update:
- F12 visibility-aware polling is now covered by focused Playwright Chromium timing evidence rather than source contracts alone.
- A minimal same-origin shell loads the real Work Identity or V5 evaluation module without the rest of the App, while only the target status endpoint is stubbed as an active task.
- Each test begins with a test-only hidden visibility state, records actual browser request timestamps, observes one hidden-delay interval, restores visibility, and then observes the next foreground interval.
- The test expects the hidden interval to reflect the F12 3000 ms branch, visibility restoration to wake promptly, and the subsequent interval to return to the existing 500/600 ms foreground cadence.
- Timing bounds are deliberately wide scheduler/control-flow assertions. CI runner timing is not a user-facing performance budget or low-end-hardware claim.
- The browser smoke runner now includes test/e2e/poller-discipline.spec.mjs and emits structured [P2-F13] timing JSON into CI logs.
- F13 changes no runtime behavior and introduces no dependency/lockfile change.
- Detailed boundary: docs/FRONTEND_BROWSER_EVIDENCE_P2F13.md.

## 2026-09-24 — P2-F12 visibility-aware analysis task polling

State update:
- Hidden-tab audit found two long-running analysis/development status loops that continued foreground-rate polling while the page was hidden: Work Identity evidence refresh (500 ms) and Recommendation V5 shadow evaluation (600 ms).
- F12 keeps those foreground cadences unchanged but extends hidden-page waits to 3000 ms.
- Each visibility-aware delay registers one temporary visibilitychange listener and resolves immediately when the document becomes visible, so returning to the page triggers the next status request without waiting for the full hidden delay.
- Existing duplicate-watcher authorities remain unchanged: scanPollGeneration for Work Identity and EVAL.runningShadow for V5 shadow evaluation.
- E-H login, updater, Recommendation build, WebDAV and Downloads are intentionally excluded because their user-control/recovery ownership differs and the audit found no safe generic throttle to apply.
- Backend task execution, task outputs, pause/resume/cancel and recovery semantics are unchanged.
- Detailed boundary: docs/FRONTEND_POLLER_DISCIPLINE_P2F12.md.

## 2026-09-24 — P2-F11 event-driven Onboarding readiness

State update:
- onboarding-v1.js previously waited 650 ms once and then retried promptWelcomeIfNeeded() every 500 ms until the App became ready or onboarding was no longer needed.
- A user remaining on Setup or leaving the disclaimer open could therefore keep a page-local readiness timer running indefinitely without any readiness change.
- F11 removes the recursive retry loop. It keeps one 650 ms initial check, observes only #setup class/hidden/style readiness changes, reuses the existing Onboarding body observer for disclaimer gate mount/unmount, and checks once when the document becomes visible again.
- At most one readiness timeout is pending. Showing the welcome or making shouldPrompt() false clears the timeout, disconnects the Setup observer and removes the visibility listener.
- writeState() also stops readiness watching immediately when a user choice makes auto-prompting unnecessary.
- Onboarding prompt criteria, state/version semantics, disclaimer/Setup gates, target steps, copy and driver.js integration are unchanged.
- Detailed boundary: docs/FRONTEND_POLLER_DISCIPLINE_P2F11.md.

## 2026-09-24 — P2-F10 single Recommendation status poll authority

State update:
- Explicit Recommendation generation previously created two concurrent recurring readers of /api/v1/recommendation-sessions/status?mode=final: Theme Help at 500 ms for progress/control UI and app.js::waitForFinalCycle() at 1 s for completion detection.
- F10 keeps Theme Help as the normal recurring authority and publishes each successful status read through the local pica-recommendation-status CustomEvent.
- App stores the latest signal and waits on status events instead of running a fixed one-second polling loop.
- Before each explicit build wait, App clears any prior snapshot and dispatches pica-recommendation-watch after the backend has accepted the build, so Theme restarts from authoritative post-start state rather than relying on its earlier capture-click poll.
- App gives Theme 750 ms for the first status and treats signals as fresh for 1500 ms; direct status API reads remain only as bounded fallback when the signal is missing/stale.
- Failure detection, final-cycle identity rules, force-new previous-cycle guard and the 120-second timeout are unchanged.
- F10 adds no persistent bus, WebSocket/SSE, new backend endpoint or new stored data.
- Detailed boundary: docs/FRONTEND_POLLER_DISCIPLINE_P2F10.md.

## 2026-09-24 — P2-F9 persistent poller lifecycle audit and WebDAV reattach

State update:
- Persistent Web pollers were inventoried by owner, start condition, stop/terminal condition and state authority.
- Downloads, Favorites sync, Browser Lite export, updater, Recommendation build, E-H login, Work Identity evidence refresh and V5 shadow evaluation already have bounded request/view/task ownership and are not changed in F9.
- WebDAV sync had a recovery gap: load() rendered one remoteStorage.syncProgress snapshot after page/script reload but did not reattach polling to a still-running durable backend sync.
- F9 adds remoteProgressActive(progress), reload reattachment, terminal auto-stop and a remoteSyncRequestPending startup-race guard.
- Pause/resume/cancel responses restart/retain polling when the returned progress is still active, and pagehide stops only the page-local timer.
- Backend sync/checkpoint semantics, polling cadence, WebDAV configuration and progress fields are unchanged.
- Detailed boundary: docs/FRONTEND_POLLER_DISCIPLINE_P2F9.md.

## 2026-09-24 — P2-F8 incremental Visual QC mutation processing

State update:
- visual-qc.js previously observed the full body subtree and, after any child mutation, reran a88EnsurePanel(), a88InstallDetailButtons() and a88InstallIndexFailureCapture() globally.
- F8 keeps one broad mutation event source because Visual detail buttons span Library/Downloaded/Shelves while QC controls live in Settings, but it removes global work from each callback.
- Added/changed element roots are accumulated in pendingRoots and processed once per animation frame.
- a88InstallDetailButtons(root) now scopes card traversal to Library/Downloaded/Shelves sections inside that root.
- QC panel and failure-capture installers run only when an added subtree is/contains the Visual Settings panel, recommendation Settings host, Visual build button or Visual status message.
- Removed-only mutations do not schedule installer work.
- Visual embedding/QC data, similarity retrieval, scoring, failure semantics, lazy-load policy and existing native detail actions are unchanged.
- Detailed boundary: docs/FRONTEND_OBSERVER_DISCIPLINE_P2F8.md.

## 2026-09-24 — P2-F7 incremental onboarding mutation processing

State update:
- onboarding-v1.js previously observed the complete body subtree and, after any child mutation, reran all 12 tour-target document queries plus the Settings-panel existence check.
- F7 promotes the tour selectors into one TOUR_TARGETS registry and makes markTourTargets(root = document) root-aware.
- The body observer now consumes mutation.addedNodes, accumulates unique roots in a Set and performs one requestAnimationFrame pass over those roots.
- The Help & Onboarding Settings panel is marked dirty only when an added subtree is/contains #a87-general-panel.
- Full-document target marking remains for bootstrap and explicit tour start/replay authority.
- Onboarding steps, target selectors, prompt/dismiss/completion semantics, driver.js integration and language behavior are unchanged.
- Detailed boundary: docs/FRONTEND_OBSERVER_DISCIPLINE_P2F7.md.

## 2026-09-24 — P2-F6 scoped Settings Hub observer

State update:
- alpha8-7-desktop-hub.js previously observed the complete document.body subtree and ran Settings-panel relocation checks after unrelated Library/Recommendation/Reader/Download DOM changes.
- Ownership audit shows dynamic Product Appearance, Support and Personalization surfaces are created under the legacy #settings root before the Hub moves them into its panels.
- The top-header language control is static and is already moved explicitly during buildSettingsHub(), so it does not justify permanent body observation.
- F6 keeps the existing requestAnimationFrame coalescing but changes the observer target from document.body to #settings.
- Later settings-owned panels still trigger relocation while unrelated app views no longer schedule Hub work.
- Hub layout, tabs, keyboard navigation, language placement, Product panels, Personalization and Maintenance behavior are unchanged.
- Detailed boundary: docs/FRONTEND_OBSERVER_DISCIPLINE_P2F6.md.

## 2026-09-24 — P2-F5 incremental Product source-entry cleanup

State update:
- alpha8-product.js performs an intentional initial scan to remove ordinary-product source-code entry points, but its dynamic body observer previously rescanned every a/button in the document after any child mutation.
- F5 keeps the initial full cleanup but changes dynamic processing to MutationObserver records + pendingSourceRoots + one requestAnimationFrame pass.
- Only mutation.addedNodes (or their parent elements for text insertions) become cleanup roots; each root is scanned only for a/button descendants.
- Source-link removal itself produces removed-only mutations, which no longer schedule another cleanup pass.
- The body observer remains the insertion event source because source entry points may be inserted by several modules; the work is now incremental rather than a full-document rescan.
- The existing source/open-source text policy, Product appearance/support behavior, personalization, update ownership and language behavior are unchanged.
- Detailed boundary: docs/FRONTEND_OBSERVER_DISCIPLINE_P2F5.md.

## 2026-09-24 — P2-F4 incremental v0.4 parity mutation processing

State update:
- v040-parity.js previously observed the entire body subtree and synchronously called full-document translateVisibleTags() plus enhanceDetailAuthor() after every child mutation.
- That path queried all .tag and [data-eh-category] elements for unrelated Library/Recommendation/Reader/Settings/status mutations and was not coalesced.
- F4 changes translateVisibleTags(root = document) into a scoped-capable primitive while preserving full-document calls for explicit translation load/language changes.
- The body observer now consumes MutationObserver records, collects only added/changed roots in a Set, and performs one requestAnimationFrame pass over those roots.
- Detail-author enhancement is marked dirty only for mutations touching #recommend-detail-content.
- Tag/category text writes are guarded by current-value equality so translation-generated DOM changes do not keep feeding unnecessary writes into the observer.
- Translation sources, canonical tag/search semantics, author identity, history and provider behavior are unchanged.
- Detailed boundary: docs/FRONTEND_OBSERVER_DISCIPLINE_P2F4.md.

## 2026-09-24 — P2-F3 one render authority per selection stream

State update:
- Library, Recommendation and Search already expose three separate selection-status DOM nodes and three separate selection-bar render functions.
- Previously every one of those three MutationObservers invoked all three render functions, so a Library selection change also recalculated Recommendation and Search selection bars, and vice versa.
- F3 registers each status selector with exactly one matching render authority.
- The observed mutation types remain childList + characterData + subtree, and selection parsing/bulk-action semantics are unchanged.
- Web UX regression requires the three selector/render pairs and forbids the former three-render callback sequence.
- F3 changes only render ownership; it does not alter selection state, result cards, bulk actions, scroll/focus behavior, task polling or the F2 scoped Settings/Downloads observers.
- Detailed boundary: docs/FRONTEND_OBSERVER_DISCIPLINE_P2F3.md.

## 2026-09-24 — P2-F2 scoped UX polish observers

State update:
- ui-polish-v5.js previously used one document.body childList+subtree MutationObserver to schedule the full dynamic Settings/Downloads polish bundle after any DOM mutation anywhere in the application.
- requestAnimationFrame coalescing limited callback count but did not fix ownership: unrelated comic cards, Recommendation, Reader and other DOM churn could still trigger all Settings/Downloads installer checks.
- F2 replaces the global observer with one #settings observer for Settings-owned installers and one #downloads observer for Download-page polish.
- Each scoped observer keeps its own animation-frame queue guard.
- Dialog backdrop-close behavior moves from scanning/attaching listeners to every dialog into one delegated body click listener, preserving dynamically inserted dialogs without requiring a global observer.
- Web UX regression forbids the body-subtree observer and per-dialog click installer while requiring both scoped observers and delegated dialog behavior.
- F2 changes observer ownership only; Settings/Downloads content, task polling, selection-status observers, Recommendation/Visual observers, scroll/focus behavior and performance budgets are unchanged.
- Detailed boundary: docs/FRONTEND_OBSERVER_DISCIPLINE_P2F2.md.

## 2026-09-24 — P2-F1 event-driven Theme decoration

State update:
- Theme decoration already had scoped MutationObservers on Recommendation/Downloads/Library/Downloaded roots, a theme-attribute observer, resize handling, visibility restoration, explicit theme application and requestAnimationFrame coalescing.
- Despite those authorities, alpha8-theme-help.js still ran setInterval(scheduleThemeDecoration, 2500) for the full page lifetime.
- Each visible active-theme tick rescanned progress elements and empty-state targets even when no UI state changed.
- F1 removes only this redundant interval and its pagehide cleanup branch.
- Recommendation build polling remains because it observes authoritative backend task state while a build is active and terminates with that task; it is not a DOM-decoration fallback.
- Existing Web UX regression now forbids the Theme interval while requiring mutation filtering, resize/visibility triggers and Recommendation polling to remain.
- F1 does not change Theme visuals, task polling cadences for other features, scroll restoration, or performance budgets.
- Detailed boundary: docs/FRONTEND_OBSERVER_DISCIPLINE_P2F1.md.

## 2026-09-24 — P2-E2 provider/account cache partition and inventory

State update:
- Critical long-lived caches/snapshots now have an explicit owner/key/invalidation/scope inventory in docs/CACHE_DISCIPLINE_P2E2.md. TTL and LRU are classified as eviction policies, not authoritative invalidation.
- Provider Preview and Online Reader caches previously keyed provider-backed state only by comic/episode/page identity, so a live Pica account change, E-H session/surface change, provider revision change or page-locator change could reuse data created under a different authority.
- ProviderService now exposes a non-secret cache scope. Pica uses a hashed configured account identity + comic revision; E-H uses selected surface + a SHA-256 session partition + comic revision. Raw credentials are not exposed.
- Preview/Online Reader page validation adds a SHA-256 fingerprint over current provider scope + actual page locator. Only the digest is persisted.
- Preview routes additionally require the page to have been prepared under the current provider scope; an old route cannot directly retrieve a previous account/session entry after an authority switch.
- Online Reader album/chapter metadata and in-flight image dedupe are provider-scope partitioned.
- Desktop Pica credential changes now clear LibraryService's cached authenticated Pica SDK instance before subsequent requests.
- Regression coverage checks Pica/E-H scope changes without secret leakage, Preview direct-route invalidation, locator invalidation, Online Reader metadata/page reload after scope change and the Pica session-reset source contract.
- E2 does not change TTL/size budgets, create an offline reader cache contract, add generic provider probes, or change Android cache formats.
- Detailed boundary: docs/CACHE_DISCIPLINE_P2E2.md.

## 2026-09-24 — P2-E1 Desktop cover cache source identity

State update:
- Desktop cover cache filenames were keyed only by `comicId`, and metadata stored only MIME type. A changed provider cover locator/revision could therefore reuse an old image indefinitely.
- The existing Android `CoverRepository` already solves the same class of problem with source/version-aware cache identity; E1 adopts that established principle for Desktop rather than introducing a different cache model.
- Desktop still owns one image/metadata slot per comic. The filename remains `SHA-256(comicId)`, while cache validity now requires a source fingerprint derived from comic/provider/remote identity, trusted `coverUrl` and provider `updatedAt`.
- Source changes atomically replace the existing slot, so cache correctness improves without accumulating historical cover versions.
- Legacy metadata without `sourceFingerprint` refreshes once. Raw cover URLs are not written to the metadata file.
- Regression coverage uses a real Library SQLite database plus injected Pica image provider and requires unchanged cache hits, URL/revision invalidation, same-URL newer-revision invalidation, and one-time legacy refresh.
- E1 does not add TTLs, memory LRU, cache-size policy, provider probes or Android changes.
- Detailed boundary: docs/CACHE_DISCIPLINE_P2E1.md.

## 2026-09-24 — P2-D8B comicSelect picture-count A/B scaling evidence

State update:
- D8A fixed the missing comic-first picture-count index, but query-plan selection alone does not justify replacing correlated counters with aggregate joins/CTEs.
- D8B adds `pnpm benchmark:comic-select-picture-count`, which creates a deterministic latest-schema SQLite fixture, copies it, removes only `idx_pictures_comic_status` from the comparison copy, and measures both variants.
- The harness measures spread single-comic `getComic()` calls plus repeated broad `listComicsForLibraryQueryBase({ scope: 'catalog' })` projections at default 500/2000/5000 comic sizes and configurable picture density.
- Output includes p50/p95/max plus descriptive without-index/indexed ratios. These values are synthetic local scaling evidence and are explicitly not release thresholds or Windows reference-machine budgets.
- A real SQLite semantic regression compares detail and broad count projections with versus without the D8A index and requires identical comic/count results.
- D8B changes no production query, count semantics, picture write path or index set. Aggregate rewrites remain evidence-gated.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D8B.md.

## 2026-09-24 — P2-D7C transactional recommendation impression batching

State update:
- Recommendation event audit found that `recommend_batch_presented` is one event per render and feedback/detail events are independent user actions, so they are not transaction-batching targets.
- The real write burst is Web `recommend_impression`: several cards in the same recommendation batch can cross the existing 50% visibility / 800 ms dwell threshold nearly simultaneously and previously produced multiple independent POSTs and autocommit SQLite writes.
- D7C adds a 25 ms Web micro-batch queue, capped at 24 events. Each event freezes its own client-observed time, app/context/cycle/batch/comic fields, zero-based rank and dedupe key before entering the queue.
- `POST /api/v1/recommendation-events/batch` accepts only `recommend_impression` events and delegates to `recordRecommendationEvents()` / D7B `recordUserEvents()`, producing one short transaction per natural burst.
- The existing single-event endpoint is unchanged. Batch-presented, like/dislike, feedback-reason and detail actions continue through their existing independent event paths.
- Batch validation preserves rank 0, caps the batch at 24, and transaction rollback prevents a metadata-invalid event from leaving a partial impression burst.
- Web batching uses `keepalive: true` and flushes pending impressions when the document becomes hidden. This reduces avoidable loss but does not create a durable offline telemetry queue.
- D7C changes write/request fan-out only; visibility/dwell thresholds, evidence granularity, dedupe semantics, ranking/serving, SQLite journal mode, performance budgets and P2-C3 enforcement remain unchanged.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D7C.md.

## 2026-09-24 — P2-D8A picture count planner index

State update:
- `comicSelect` computes known/downloaded picture counts through correlated predicates on `pictures.comic_id`.
- Existing indexes covered episode-order reads and status-first downloaded-picture scans, but there was no index whose leading column is `comic_id` for `COUNT(*) WHERE comic_id = ?`.
- Migration 16 adds `idx_pictures_comic_status(comic_id, status)` without changing `comicSelect` output or removing existing indexes.
- A real SQLite `EXPLAIN QUERY PLAN` regression requires the total-picture count to use the new index. The completed-picture count may use either the new index or the existing `idx_pictures_downloaded(status, comic_id)`, both of which cover its equality predicates.
- The migration suite separately requires the new index to exist in a fresh latest database.
- D8A intentionally avoids a larger correlated-subquery-to-aggregate-join rewrite until query scaling evidence shows it is justified across single-comic and broad Library reads.
- No count semantics, Library ordering/filtering, write paths, performance budgets or P2-C3 enforcement change.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D8A.md.

## 2026-09-24 — P2-D7B transactional shelf event batching

State update:
- Shelf add/remove routes preserved correct per-comic behavior evidence but wrote each event through an independent autocommit `recordUserEvent()` call.
- D7B adds `recordUserEvents()`, which wraps the existing single-event recorder in one synchronous `BEGIN IMMEDIATE / COMMIT / ROLLBACK` transaction.
- Shelf routes now map the same one-event-per-comic payloads into the batch API; event granularity, IDs, app/context fields, metadata safety and dedupe behavior remain unchanged.
- If one event fails validation, the event batch rolls back rather than leaving a partially recorded route action. The shelf mutation itself remains outside this event transaction exactly as before.
- No network/async work occurs inside the transaction and no unrelated requests are combined.
- D7B does not change recommendation evidence semantics, download cadence, SQLite journal mode, performance budgets or P2-C3 enforcement.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D7B.md.

## 2026-09-24 — P2-D7A download progress write read-amplification

State update:
- Download progress persistence was already throttled to 250 ms per active job, but every persisted update still executed a leading `getDownloadJob()` only to fill omitted patch fields, followed by UPDATE and a second `getDownloadJob()` for the return value.
- D7A moves omitted-field preservation into SQLite with `COALESCE`, reducing each persisted progress patch from SELECT → UPDATE → SELECT to UPDATE → SELECT.
- Partial patch behavior is preserved: unspecified fields retain stored values, explicit numeric zero remains writable, and unknown job IDs still fail through the authoritative return lookup.
- The 250 ms persistence interval, UI callback frequency, forced final persistence, download concurrency, media pacing and pause/resume/cancel semantics are unchanged.
- D7A is a read-amplification cleanup, not evidence to tighten or relax the persistence cadence; that requires J1/J2 foreground-latency evidence under real active downloads.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D7A.md.

## 2026-09-24 — P2-D6A complete Visual favorite target domain

State update:
- `visualPreferenceProfile()` and `visualIndexStatus()` were still requesting up to 10000 comics (but effectively capped at 5000) only to derive favorite IDs.
- D6A replaces those reads with the existing complete-domain `favoriteIds()` query. Taste-exclusion filtering in the preference profile and feedback-derived targets in index status remain unchanged.
- A real SQLite regression stores 10001 favorites, deliberately places the only embedded favorite outside the legacy effective 5000-row catalog prefix, and requires Visual preference evidence plus `targetCount=10001` to include it.
- Author Atlas, Style Families and Representation QC retain their wider catalog inputs because they explicitly report total-catalog, provider and favorite coverage metrics. Narrowing those inputs to embedding-bearing rows would change diagnostic/scientific semantics.
- D6A changes only favorite-ID acquisition; it does not rebuild embeddings, change Visual serving/reranking, alter coverage denominators, choose a foreground threshold or enable P2-C3 enforcement.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D6A.md.

## 2026-09-24 — P2-D5B targeted Work Identity detail relationships

State update:
- `workVariantsForComic()` previously loaded global prefixes of 10000 bindings, 5000 decisions and 5000 evidence rows and then filtered them to the current comic.
- D5B adds targeted database APIs for the current binding, all bindings of the current Canonical Work, all decisions involving the current comic, and high-confidence probable evidence involving the current comic.
- Relationship candidate binding metadata is resolved in one chunked exact-ID batch rather than per-candidate N+1 lookups.
- The existing full-catalog Work Identity V3 creator/title/cover heuristic funnel remains unchanged because it is a separate discovery semantic, not relationship-state lookup.
- Migration 15 adds `idx_work_identity_decisions_right` plus symmetric left/right probable-evidence indexes. Existing binding primary/work indexes are reused.
- Boundary regressions extend the 10001/5001 D5A fixture and add a 5001-row evidence case where the target pair is outside the global review prefix but must be returned by the current-comic targeted API.
- Source-contract tests forbid `workVariantsForComic()` from using the legacy global relationship-prefix APIs.
- D5B changes query scope only; relation precedence, KEEP_SEPARATE authority, resolver confidence, materialization execution, recommendation ranking, performance budgets and P2-C3 enforcement remain unchanged.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D5B.md.

## 2026-09-24 — P2-D5A authoritative Work Identity domains

State update:
- Work Identity review/presentation and authoritative materialization previously shared bounded decision/binding APIs: 5000 decisions and 10000 bindings.
- D5A preserves those bounded APIs for ordinary review surfaces but adds explicit `listAllWorkIdentityDecisions()` and `listAllWorkIdentityBindings()` for correctness domains.
- Materialization preview uses the complete decision domain whenever storage exceeds the bounded review list. The materialization plan always uses complete decisions and existing bindings, so its digest represents the full stored state.
- Final V3 Canonical Work ownership expansion now uses complete bindings rather than the legacy 10000-row prefix.
- A real SQLite boundary regression stores 10001 bindings and 5001 decisions and requires bounded versus authoritative reads to return 10000/10001 and 5000/5001 respectively.
- D5A intentionally does not change `workVariantsForComic()`; that detail UX needs targeted per-comic/work relationship queries rather than replacing bounded prefixes with global full-domain reads.
- Materialization execution remains disabled; resolver confidence, human authority, KEEP_SEPARATE semantics, recommendation ranking and P2-C3 enforcement are unchanged.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D5A.md.

## 2026-09-24 — P2-D4 compact Final V3 serving catalog

State update:
- Final V3 frozen serving, portable readback and serving-composition diagnostics still materialized up to 10000 comics even though each path already had explicit ranked/batch IDs.
- The ownership filter only depends on records that are physically owned, explicitly policy-owned, or current candidates; unrelated unowned catalog rows cannot affect the decision.
- D4 replaces those broad reads with exact-ID `getComicsByIds()` sets built from `recommendationOwnershipState().ownedComicIds`, policy-owned IDs and current candidate/batch IDs.
- Frozen Final V3 serving preserves its existing Canonical Work expansion: uploads belonging to an already owned canonical work are still added to the serving policy and exact-ID filter catalog.
- Batch allocator favorites now come from the dedicated `favoriteIds()` query instead of filtering a broad serving catalog.
- Recommendation generation/profile, V5 Shadow, Portable Policy inferred-signal construction and recommendation-audit bounds are explicitly unchanged.
- Regression coverage requires compact ownership filtering to equal the previous full-catalog semantics and locks serving/portable/composition paths away from the 10000-row materialization.
- D4 changes query scope only; it does not change ranking, candidate generation, ownership authority, Work Identity confidence, performance budgets or P2-C3 enforcement.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D4.md.

## 2026-09-24 — P2-D3 Library-query cost evidence and lazy author metadata

State update:
- After D2 removed the author 2N+1 query shape, ordinary Library queries still eagerly loaded the complete author-group metadata set before determining whether aliases were needed.
- D3 makes author-group loading conditional on non-empty free-text search. Normal Library render, structural filters and tag filters no longer issue the full author/alias/circle batch.
- Author facet labels on no-text paths reuse the canonical author already projected on each StoredComic; text search keeps the previous alias-aware matching semantics.
- Unit coverage requires no-text queries to avoid `listAuthors()`, while a text query that matches only an alias must still load author groups and return the comic.
- D3 adds `pnpm benchmark:library-query`, which builds real temporary SQLite libraries at 500/2000/5000 rows and records repeated ordinary/structural/tag/text query p50/p95/max scaling evidence.
- The D3 harness is synthetic local scaling evidence only. It does not set a user-facing latency threshold, Windows reference result, P2-K budget or P2-C3 capacity.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D3.md.

## 2026-09-24 — P2-D2 hot-query batching and reverse author indexes

State update:
- Shelf reads were still loading the first 5000 comics into a Map after separately reading shelf IDs. This was both an avoidable catalog-scale hot path and a correctness bug for shelf items beyond the legacy boundary.
- `recommendationRecords(comicIds)` had the same catalog-prefix materialization despite receiving an explicit small ID set.
- `listAuthors()` executed one base author query plus separate alias and circle queries per author. Because Library facet evaluation calls `listAuthors()`, this formed a 2N+1 query pattern on an ordinary foreground path.
- D2 adds chunked exact-ID comic retrieval (400 IDs per SQL chunk) that reconstructs the original request order. Shelf and recommendation-record restoration now read only requested IDs.
- Author aliases and circles are loaded in two batch queries and grouped in memory, reducing `listAuthors()` to a fixed three-query shape.
- Existing shelf indexes already match shelf membership/order reads, so no duplicate shelf index is added.
- Migration 14 adds only the missing reverse author indexes: `author_aliases(author_id, alias_display)` and `comic_authors(author_id, circle)`.
- Regression coverage extends the 5007-record boundary test to Shelf and recommendation record restoration, adds an 805-record multi-chunk exact-ID ordering test, and verifies the new indexes through the migration integration suite.
- No recommendation ranking/serving logic, latency budget or P2-C3 enforcement changes in D2.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D2.md.

## 2026-09-24 — P2-D1 full-domain correctness-cap cleanup

State update:
- The first P2-D cap audit distinguished legitimate bounded presentation/algorithmic queries from operations that claim to cover the complete authoritative library.
- Browser Lite package export previously defaulted to `listComics({ limit: 5000 })`; libraries above 5000 rows were silently truncated. The default path now uses `listAllComics()`.
- CLI CSV export and unscoped progress now use the complete catalog. Scoped `progress <comicId>` uses direct `getComic(comicId)`, preserving the P1 direct-object rule.
- CLI `prepare-library` no longer omits favorites that fall beyond the first 5000 catalog rows.
- A 5007-record unit regression crosses the legacy boundary and requires the Browser Lite package to contain the complete domain.
- Recommendation V3/V5 and recommendation-audit 5000/10000 limits are intentionally not changed in D1 because they may be algorithmic/diagnostic budgets rather than accidental SQLite pagination. Their semantics and cost require separate evidence.
- D1 is a correctness cleanup, not a claim that P2-D is complete. Hot-query/N+1/index/write-frequency audit continues.
- Detailed boundary: docs/SQLITE_QUERY_DISCIPLINE_P2D1.md.

## 2026-09-24 — P2-J2 repeatable Desktop latency scenarios

State update:
- J1 measurement infrastructure is now paired with a repeatable Desktop scenario harness rather than relying on ad-hoc manual clicking.
- The harness connects only to a loopback Desktop engine, obtains the Desktop CSRF token, warms representative foreground paths, resets the J1 window, and records three clean rounds by default.
- Foreground traffic is sequential and user-interaction-shaped rather than saturation load: status, Library facet query, shelves, downloaded listing, Reader progress, plus an automatically discovered local comic detail/chapter path where available.
- Optional comic/chapter IDs are discovered before the measured window and are not emitted in the JSON report.
- Idle windows require zero observed background-task overlap. Load windows require every requested task type to cover every foreground sample; incomplete coverage invalidates the window but does not create a performance pass/fail threshold.
- The measured workload remains authoritative in its existing scheduler/UI. J2 does not start, pause, cancel or otherwise control downloads, WebDAV, recommendation, maintenance or analysis tasks.
- Output is machine-readable and includes environment, per-round J1 profiles, task coverage and measurement-window validity. It selects no p50/p95 budget and cannot authorize P2-C3 enforcement.
- Detailed protocol: docs/HTTP_LATENCY_SCENARIO_P2J2.md.

## 2026-09-24 — P2-J1 real local HTTP latency observation

State update:
- Existing performance docs and download/Visual benchmark harnesses are synthetic/implementation-bound evidence and cannot answer whether normal Library/detail/Reader interaction slows down while heavy work runs.
- J1 adds a bounded in-memory LocalHttpLatencyRegistry at the local HTTP server boundary.
- Requests are classified only into low-cardinality route classes (`library-query`, `comic`, `reader`, `downloads`, etc.); raw URL/path, comic/episode/page IDs, query strings, bodies and credentials are never retained.
- Each sample records duration/status plus sanitized active internal task types from the P2-C resource coordinator at request start.
- Profiles separate idle vs under-load samples and summarize p50/p95/max/error count by route class and background task type.
- Data is process-memory only, bounded to 500 samples in Desktop integration, not persisted and not uploaded.
- Desktop-only `/api/v1/desktop/runtime/http-profile` exposes the profile; it is not added to Remote Web/browser-session allowlists.
- Desktop-CSRF-protected `/api/v1/desktop/runtime/http-profile/reset` clears the in-memory window for repeatable scenarios; profile/reset requests themselves are excluded from samples so diagnostics do not contaminate the measurement.
- No performance threshold is selected. J1 is measurement infrastructure; representative Windows/Android evidence is still required before P2-K budgets or P2-C3 enforcement.
- Detailed boundary: docs/HTTP_LATENCY_RUNTIME_P2J1.md.
## 2026-09-24 — P2-C2B shared Desktop resource graph

State update:
- Desktop now creates one observe-only RuntimeResourceCoordinator per engine and injects it into LibraryService and RemoteStorageDesktopManager.
- The resource diagnostics therefore cover both service tasks and WebDAV instead of presenting separate module-local views.
- Added coarse observation declarations:
  - Recommendation V3 = provider-network + cpu-analysis + sqlite-read-heavy + sqlite-write-heavy;
  - favorites sync = provider-network + sqlite-write-heavy;
  - local/GitHub download runner = media-network + filesystem-heavy + sqlite-write-heavy;
  - WebDAV sync = remote-storage-network + filesystem-heavy + sqlite-read-heavy + sqlite-write-heavy.
- Download runners are tagged `user`; the other newly added observations remain `background`. Priority is still diagnostic-only because coordinator enforcement is disabled.
- Existing DownloadScheduler/MediaRequestGate, recommendation checkpoints, favorites controls and WebDAV controls remain the execution authorities; resource observation does not replace them.
- C2B leases remain coarse task-lifetime observations. They are not suitable for C3 enforcement until pause/phase ownership and foreground latency are measured.
- Detailed boundary: docs/RUNTIME_RESOURCE_OBSERVATION_P2C2B.md.
## 2026-09-24 — P2-C2 first observe-only integration batch

State update:
- The coordinator remains in observe mode: no task waits, no task is rejected for resource pressure, and no production capacity exists yet.
- First-batch service-owned tasks now declare coarse resource leases:
  - maintenance update = provider-network + sqlite-write-heavy;
  - maintenance repair = filesystem-heavy + sqlite-read-heavy;
  - library organize = filesystem-heavy;
  - Recommendation V5 Shadow = provider-network + cpu-analysis + sqlite-write-heavy;
  - Work Identity evidence refresh = cpu-analysis + sqlite-read-heavy + sqlite-write-heavy.
- Desktop control plane adds read-only `/api/v1/desktop/runtime/resources`; this internal runtime diagnostic is not added to Remote Web/browser-session allowlists.
- Desktop idle-browser shutdown now treats active observed background tasks as work leases, so detached maintenance/analysis work is not killed merely because the last Web UI tab closes.
- Behavioral coverage holds a real maintenance Provider request open, verifies the active lease/usage snapshot, then verifies release after task completion.
- First-batch leases describe task-lifetime overlap, not physical utilization. Paused tasks currently retain an observation lease.
- Therefore C2 data may identify potentially competing task combinations, but C3 enforcement is prohibited until resource ownership is phase-aware where needed and overlap is combined with latency measurements.
- Detailed boundary: docs/RUNTIME_RESOURCE_OBSERVATION_P2C2.md.
## 2026-09-24 — P2-C1 resource coordinator foundation

State update:
- H2C PR #118 passed all gates after a transient Windows ARM64 DPAPI settings timeout was reproduced as non-deterministic: the targeted rerun passed packaged acceptance, replacement/rollback and install/uninstall.
- P2-C may now begin while H2B continues collecting real Visual timing evidence; this does not authorize choosing a Visual foreground threshold.
- C1 introduces a shared resource-class vocabulary and a coordinator with observe/enforce modes.
- The application does not enable enforcement in C1. No production resource capacity has been selected.
- Enforcement semantics are tested in isolation: atomic multi-resource acquisition, foreground/user/background ordering, cancellable waiters, idempotent release and bounded diagnostics.
- C2 will integrate existing tasks in observe-only mode to collect real overlap before C3 selects any enforceable budget.
- Detailed boundary: docs/RUNTIME_RESOURCE_COORDINATOR_P2C1.md.
- Windows ARM64 packaged acceptance timeout was hardened after two identical hosted-runner DPAPI/settings POST overruns: that native operation remains bounded at 30 seconds and now logs elapsed time; other platform acceptance bounds remain unchanged.
- Docker TLS acceptance was hardened after a transient post-readiness 502: Caddy/Pica readiness remains bounded, but the post-TLS health assertion now retries within a finite window and fails with container logs if readiness does not stabilize.
## 2026-09-24 — H2C Work Identity background runtime candidate

State update:
- The ordinary Work Identity evidence refresh no longer needs to own one synchronous HTTP request.
- A checkpointable async audit uses the same pair-evaluation logic as the synchronous baseline and yields during catalog bucketing and candidate-pair comparison.
- The service-owned task exposes loading/bucketing/comparing/persisting progress plus pause/resume/cancel.
- The Web review surface polls authoritative backend state and can reattach after the panel is recreated.
- Evidence persistence occurs only after the final cooperative checkpoint; an incomplete cancelled scan is not committed as a completed new evidence refresh.
- Tests require the async audit result to equal the synchronous result for identical input.
- Resolver semantics, confidence rules, KEEP_SEPARATE authority, automatic binding, materialization execution and recommendation serving remain unchanged.
- Remaining Work Identity runtime measurement for review/materialization-preview and full-catalog SQLite materialization stays under later P2-D/P2-C work.

## 2026-09-24 — H2B Visual analysis measurement started

State update:
- Representation QC, Author Atlas and Style Families now record bounded in-memory runtime samples with input size, parameters, outcome and duration.
- `/api/v1/desktop/visual/runtime-profile` exposes those diagnostics without triggering analysis.
- The timing registry deliberately reports `foregroundThresholdMs=null` and `MEASURE_BEFORE_THRESHOLD`; no synchronous/background decision is being invented before evidence exists.
- A deterministic `pnpm benchmark:visual-analysis` scaling harness was added for relative regression comparison. CI/shared-runner wall time is explicitly not a user-facing threshold.
- Scientific/product boundaries remain unchanged: read-only Visual evidence, no embedding rebuild, no serving activation/promotion, and no hidden execution on ordinary page open.
- H2B remains open until representative real-use timings justify either retaining synchronous execution or promoting one or more calculations to a detached task.

## 2026-09-24 — H2A V5 Shadow Retrieval runtime completed

State update:
- PR #116 passed the main CI plus Linux, macOS arm64, Windows ARM64 and Docker package gates on its final implementation head.
- The Shadow Retrieval POST now starts a detached Desktop task and returns immediately; status and pause/resume/cancel are separate authoritative endpoints.
- Retrieval checkpoints exist between bounded provider work units and between local analysis phases. Concurrent Pica/E-H/ExH provider pipelines settle at safe checkpoints before a cancellation becomes terminal.
- The Evaluation UI polls authoritative backend state, exposes real task controls and reattaches to an already-running task after the surface is recreated.
- Incomplete cancelled output is not persisted as a completed new Shadow audit run.
- Scientific/product boundaries are unchanged: explicit confirmation remains required, execution remains `MANUAL_DESKTOP_ONLY`, `servingImpact=false`, and there is no serving promotion, Visual rebuild or Canonical Work materialization.
- H2B is now next and begins with latency instrumentation rather than automatically turning every Visual analysis into a background job.

## 2026-09-24 — H1C organizer runtime merged

State update:
- PR #114 passed CI plus Linux, macOS arm64, Windows ARM64 and Docker package gates and was merged.
- `/api/v1/organize` now starts a detached LibraryService task with status and pause/resume/cancel controls.
- Organizer/materialization filesystem operations use asynchronous APIs and explicit checkpoints instead of synchronous `existsSync/cpSync/symlinkSync/writeFileSync` loops.
- CLI `organize` and `portable` now use the complete catalog instead of a 5000-comic cap.
- Portable comic replacement uses a temporary copy before publication; final index/manifest publication occurs only after the final checkpoint.
- Existing published indexes/manifests are retained until replacement is ready, including a Windows-compatible backup/restore fallback.

## 2026-09-24 — H1B maintenance update runtime merged

State update:
- PR #113 passed CI, v0.4 direct-upgrade acceptance, Linux, macOS arm64, Windows ARM64 and Docker package gates and was merged.
- Full maintenance update scans now detach from the HTTP request lifecycle and expose authoritative progress plus pause/resume/cancel.
- The scan domain is now the complete set of downloaded comic IDs queried directly from SQLite; the previous 5000-comic list cap is gone.
- Pause/cancel checkpoints run before and after each bounded Provider request, so an already-active request may finish but no next comic starts after the control action.
- Full scans remain review-first and do not auto-queue download jobs.

## 2026-09-24 — H1 maintenance hardening started

State update:
- PR #112 merged the first H1 remediation: repair scanning now performs asynchronous file stats, yields the Node event loop, and exposes scan progress hooks.
- The next H1 branch changes full maintenance update checking from a request-owned scan into a background task with authoritative status and pause/resume/cancel controls.
- Full update-scan discovery now uses the database's complete downloaded-comic ID domain rather than `listComics({ limit: 5000 })`.
- Explicit small `comicIds` update checks remain synchronous for API compatibility; the ordinary full-scan UI uses the background task path.
- Automatic queueing is intentionally not added to the full scan: findings remain reviewable before update jobs are queued.


## 2026-09-24 — W5C shell-only PWA merged

State update:
- PR #109 passed CI plus Linux, macOS arm64, Windows ARM64 and Docker package workflows and was merged.
- W5C remains intentionally shell-only: no user-content offline cache, remote mutation or multi-user expansion.
- P2 remains the critical path after this merge.

## 2026-09-24 — P2-0 runtime inventory completed

Finding:
- Long-task implementations are functionally mature in several areas, but authority is split across LibraryService in-memory state, browser Worker/page state, RemoteStorage manager state, SQLite download jobs, Android WorkManager and Android DownloadManager.
- This does not justify a single universal scheduler. P2 will standardize the task contract and add cross-task resource governance while preserving platform-native executors.
- High-priority concrete gaps were confirmed:
  - maintenance update checking is request-owned, serial and defaults to a 5000-comic domain cap;
  - repair scanning performs synchronous per-file filesystem stat work on the Node event loop;
  - organize/materialize flows perform synchronous filesystem work in foreground request paths;
  - Recommendation V5 shadow retrieval is manual/shadow-only but still request-owned;
  - Visual indexing is Worker-isolated but its control authority is browser-page-local;
  - advanced Visual/Work Identity/evaluation calculations require instrumentation before deciding whether each needs background execution;
  - Android long tasks are individually durable but do not yet share a cross-task resource budget;
  - current performance documentation is not yet a real hardware/runtime baseline.

Action:
- Remediation starts with maintenance/runtime hardening (RT-07 through RT-10), then background analysis tasks, resource arbitration and performance instrumentation.
- Detailed evidence and remediation order are tracked in `docs/RUNTIME_INVENTORY_P2.md`.

## 2026-09-24 — Reconciled architecture/runtime work with the active multi-platform plan

Decision:
- Restore **P2 Architecture & Runtime Hardening** as the current critical engineering priority.
- Preserve existing repository naming: W5A session, W5B read-only shell, current PR #109 = W5C shell-only PWA.
- Do not retroactively rename W5C to onboarding.
- Add operator-friendly authorization as W5D.
- Treat user-content offline caching as a separate later security problem, not as an automatic consequence of “PWA”.
- Keep Linux/macOS/Windows ARM64 as experimental until their real-device/distribution gates pass.
- Keep Server/Docker as operator preview until provider/soak/provenance/multi-user questions are resolved.

Reason:
Recent work correctly advanced multi-platform and Remote Web foundations, but progress reporting had begun to underrepresent the earlier architecture/runtime optimization work. This reconciliation makes the full task package explicit so later development cannot drift into “add more platforms/features” while leaving runtime hardening and real performance validation unfinished.


## NEXT-28 — Android RC UX / performance corrective batch
**Status: RELEASE-SCOPE IMPLEMENTED — A3/A5 deeper follow-ups remain in the broader project backlog; final release validation is tracked by NEXT-32**

Source: representative Android RC testing after NEXT-27 dual-client candidate packaging. These findings are product/runtime defects or gaps, not a new release scope. Public stable remains v0.4.11; the current isolated RC remains valid for continued user testing while this batch is developed.

### A. Runtime feedback and incremental refresh
- **A1 Library refresh progress:** make refresh visibly enter a running state immediately; expose meaningful phases such as checking Desktop, comparing favorites, syncing shelves, checking remote storage and reconciling local references. Avoid a silent background Future with only a final rerender.
- **A2 Work-variant progress:** "同一作品" must distinguish checking/running/completed/failed states. The user must not have to infer completion from a count that suddenly appears.
- **A3 Author-work progress:** strengthen local/online discovery feedback so a partially rendered author page is not visually mistaken for a completed scan.
- **A4 Quick favorite reconciliation on Android:** stop calling full `PicaClient.favoritesAll()` for every recommendation cycle. Reuse the mature Desktop quick-sync semantics: inspect newest page/count, find stable overlap with the known snapshot, apply bounded deltas, and fall back to full scan only when count/order/overlap cannot be reconciled or a periodic full audit is due.
- **A5 Library refresh decomposition:** separate "check for changes", "apply remote delta" and "local reference reconciliation". Do not treat every visible refresh as authority to re-read every remote page and rewrite the entire local catalog.
- Acceptance: ordinary no-change refresh/recommendation generation should use bounded newest-page checks rather than full favorite pagination; full sync remains an explicit safety fallback.

### B. Library/detail interaction
- **B1 Detail page count:** surface authoritative known page count on the comic detail header when available; preserve "unknown" instead of inventing a value.
- **B2 Favorite-order sort:** add a real favorite-order/rank field and Library sort modes based on collection order. Do not reuse comic `updatedAt` as a proxy for favorite time/order.
- **B3 Shared collection selection mode:** Library and Shelf share one long-press multi-select interaction through the common collection adapter. Required primitives: enter/exit selection mode, select/deselect item, select all, clear all and contextual batch actions.
- **B4 Batch actions:** Library selection must support add-to-shelf and cancel-favorite where provider capability allows it; Shelf selection must support remove-from-shelf and add-to-another-shelf without forking a second selection implementation.

### C. Recommendation composition and controls
- **C1 Batch author diversity:** review the current 12-item allocator. Existing per-batch author cap is insufficient because counters reset for each batch.
- **C2 Cycle exposure:** add cycle-level author exposure cap/decay across all batches in one recommendation cycle, while preserving an explicit Session/TARGET exception when the user intentionally requests an author.
- **C3 Detail recommendation controls:** redesign the detail-page "推荐/调节" entry so positive controls ("更多类似", positive author/tag intent, Session target where appropriate) are visible alongside negative/suppression/ownership semantics. Do not label an almost entirely negative menu as the complete recommendation control surface.
- Acceptance: one strong author cannot repeatedly dominate consecutive 12-item batches under default mode; semantic facts such as owned/seen/duplicate/temp hide stay separate from taste feedback.

### D. Recommendation-control UI state
- **D1 Preserve nested facet scroll:** changing a 0–10 slider, BLOCK state or Session target must not jump the active subcategory to its first row.
- **D2 Avoid full-profile reload for a row edit:** current `onStopTrackingTouch -> setLocalControl -> loadAsync()` reloads policy, whole Unified Catalog and inferred profile, then destroys/recreates all nested scroll views. Replace ordinary row edits with local state mutation/rebind where possible; reserve full profile rebuild for structural changes.
- Acceptance: the edited row stays in place and remains visible after a preference change; no whole-catalog read is required merely to persist one slider value.

### E. Onboarding expansion
- **E1 Keep the existing VSpot interaction model**, but treat the current two-stage navigation tour as a skeleton.
- **E2 After the affected product flows stabilize**, expand onboarding to task-oriented walkthroughs: create/manage shelf, add comics, generate a first recommendation cycle, Like/Dislike, 0–10 tuning, BLOCK/temporary suppression, Session intent, recommendation sync, Visual/style enablement and strength, task/progress UI, download and Reader entry points.
- Acceptance: defer detailed tour coordinates/tags until the underlying controls in A–D are stable, avoiding churn from documenting moving UI.

### Implementation order
1. A4/A5 incremental favorite/library reconciliation.
2. A1/A2/A3 visible task feedback.
3. D1/D2 preference-editor state/performance.
4. B1/B2 detail and sort data gaps.
5. B3/B4 shared selection mode.
6. C1/C2/C3 recommendation diversity and control IA.
7. E1/E2 onboarding expansion after UI stabilization.

### Release boundary
- Do not mutate v0.4.11 Release assets, stable OTA metadata or `android-preview` while this corrective batch is under development.
- Do not publish a new formal package until the corrective branch has automated coverage and a fresh dual-client RC is intentionally requested.
- Current RC testing may continue in parallel; new tester findings should be appended to NEXT-28 rather than spawning unrelated ad-hoc fixes.


## 2026-09-27 — NEXT-28 Android RC corrective batch started

State update:
- Created branch `fix/android-rc-ux-performance-batch` and Draft PR #197 from the accepted P2 RC packaging head.
- Recorded all nine representative Android RC findings before implementation so continued testing can append to the same corrective batch.
- A4 first implementation is in place: Recommendation generation now uses newest-page Pica favorite reconciliation, bounded overlap search for small append-only changes, 24-hour periodic full audit, and safe full-pagination fallback for ambiguous count/order/removal cases. Ordinary unchanged cycles no longer require `favoritesAll()`.
- D1/D2 first implementation is in place: 0–10 and BLOCK edits update policy state in place instead of reloading the whole Unified Catalog/inferred profile; nested facet scroll positions are retained across structural rerenders; Session-target changes no longer rebuild the full page.
- B1 is implemented: authoritative `knownPictures` is displayed as page count on comic detail when known.
- B2 is implemented at the data/UI layer: `favoriteRank` is kept separately from comic `updatedAt`, with “最近收藏 / 最早收藏” sort modes.
- C1/C2 first implementation is in place: default batch author exposure starts at 2, cycle-level author exposure is bounded across batches, and only an explicit AUTHOR Session TARGET receives a controlled relaxation.
- C3 first implementation is in place: detail recommendation controls now expose positive author actions (“更多推荐此作者 / 本次想看此作者”) alongside detailed tuning, LESS/BLOCK, ownership/exposure and temporary-suppression actions.
- A1/A2 first implementation is in place: Library refresh exposes visible phases and disables the refresh control while running; same-work resolution explicitly shows a checking state. A3 author-work completion prominence remains open.
- Initial CI found two implementation-contract issues only: ambiguous `NestedScrollView.setOnScrollChangeListener` overload and a legacy test that pinned the refresh button local variable. Both were corrected on the branch; a fresh full matrix is queued on head `554421eaca993428810fbdb47df0180dbfa2980a`.
- B3/B4 shared multi-select, A5 deeper Desktop/library incremental decomposition, A3 author completion prominence and E onboarding expansion remain open.
- Current public/RC release assets are untouched; the user's existing isolated RC remains the active manual-test package.


## 2026-09-27 — NEXT-28 B3/B4 + E onboarding implementation

State update:
- B3/B4 shared collection selection is implemented on the corrective branch using Android contextual `ActionMode` over the existing shared `UnifiedComicCollectionAdapter`; no second Library/Shelf adapter was introduced.
- Long-press on either Library or Shelf enters selection mode. Normal taps toggle selection while the mode is active.
- Context actions include visible-count selection, clear selection, add selected works to a shelf, remove selected works from the current shelf, and cancel favorites from Library.
- Shelf batch membership uses `ShelfStore.setMemberships(...)` so one batch performs one snapshot load/save/reconciliation rather than one complete persistence cycle per comic.
- Library batch unfavorite is Provider-aware: Pica uses the existing confirmed remote favorite mutation and then updates the favorite cache in one batch; E-H remote favorite removal uses the existing E-H/desktop-relay mutation while E-H local favorite provenance is removed separately. Failed remote items remain represented as failures instead of being silently cleared locally.
- E1/E2 onboarding is expanded from a navigation skeleton into a versioned task workflow. `OnboardingStore.CURRENT_VERSION` is now 2 so users who completed the old skeleton can receive the richer guide once in the first version that ships it.
- The VSpot flow now covers: bottom navigation -> create/manage shelves and long-press batch selection -> visible Library refresh -> generate/rebuild a phone recommendation cycle -> profile/adjust entry -> Settings -> Recommendation profile -> 0–10/BLOCK/Session controls -> explicit recommendation sync -> Visual mode -> Visual strength.
- Recommendation-style onboarding uses stable tagged controls in `RecommendationStyleActivity`; automatic Desktop Visual status refresh is suppressed while the spotlight tour is active so target Views are not destroyed under the overlay.
- English, Simplified Chinese and Japanese onboarding resources were extended together.
- Existing P2 RC/stable release assets remain untouched. Full CI/Android matrix is queued on the current corrective head; the latest code head is `e1c898ad1525ae2750b56e6440c7a2f49b37b10f` after adding visible batch-unfavorite progress.

## NEXT-29 — Windows/Web RC connection-state + onboarding corrective batch
**Status: IMPLEMENTATION_COMPLETE — W1/W2/W3 implemented; later onboarding/display regressions were corrected under NEXT-30; final release validation is tracked by NEXT-32**

Source: representative Windows/Web RC testing after NEXT-27 packaging while Android NEXT-28 testing continues.

### W1 — E-H connection feedback and managed-login return
- Add E-H / ExH to the same visible connection-status surface that already exposes Pica/WebDAV/LAN state.
- Separate “managed web login (automatic capture/verification)” from “manual official-site link (no automatic callback)” in copy and behavior.
- Managed login must expose opening / waiting / verifying / complete / failed states, refresh the saved account status on completion, surface a clear success/failure toast, and make a best-effort focus return to the Pica Library window after the managed browser closes.
- Connection check must verify an existing E-H session rather than treating “cookies are stored” as equivalent to “currently usable”.

### W2 — Favorites sync false local-engine error
- Decouple Desktop-engine reachability from downstream module initialization. A failure in recommendation/session/profile/library-query bootstrap must not collapse the entire Web UI into Browser Lite mode.
- Before rejecting Sync Favorites for “no local engine”, perform a bounded local-engine health probe and recover stale frontend state if /api/v1/status is reachable.
- Preserve degraded feature reporting: a failed optional module should be reported as that module’s failure while Library sync remains available.

### W3 — Web onboarding v2
- Promote Web onboarding from navigation-only coverage to a task-oriented workflow aligned with Android v2.
- Cover at minimum: Library sync and progress semantics; Shelves creation; recommendation generation/batches; recommendation profile/manual tuning; Visual mode/strength; E-H connection state; Desktop/Android connection; update/help replay.
- Increment the Web onboarding version so users who completed v1 receive the richer v2 tour once.
- Keep the existing driver.js implementation and observer discipline; extend targets/steps rather than replacing the framework.

### RC boundary
- Keep PR #197 draft until the full Web/Desktop + Android matrix passes.
- Produce a fresh unpublished isolated Windows/Web RC plus side-by-side Android RC from the same validated source SHA.
- Do not mutate v0.4.11 Release assets or stable OTA metadata.

## 2026-09-30 — NEXT-29 Web onboarding v2 manual-QA finding: hidden target / wrong panel

Observed on the fresh Windows/Web corrective RC during the Web onboarding v2 tour:
- At step 10/18, “画风接入模式”, the spotlight popover appears detached in the upper-left corner while Settings still visibly has “基本设置” active.
- The intended target `#visual-rerank-mode` belongs to the “推荐与画风” panel and is therefore hidden at that moment.

Root-cause assessment:
- `onboarding-v1.js` resolves tour targets by DOM presence only. `#visual-rerank-mode` remains queryable even when its parent Settings panel is hidden.
- The transition into the recommendation Settings panel relies on a previous-step synthetic `.click()` plus a fixed 140 ms delay before `driver.moveNext()`; it does not verify that `#a87-recommendations-panel` is actually active/visible before entering the Visual step.
- Therefore a stale/failed panel transition can advance the tour with a hidden target. Driver then has no usable visible geometry and renders the popover as an effectively unanchored top-left card.
- The same structural risk applies to later cross-panel onboarding steps such as Connections and Software Update.

Required correction before the next Web RC:
- Cross-view/cross-panel steps must explicitly activate the owning view/panel and wait on a visible-target readiness predicate before advancing.
- A hidden DOM node must never count as a valid tour target; target readiness must require rendered/visible geometry.
- Replace fixed timing assumptions with state-based readiness (`panel.active && !panel.hidden`, target visible, non-zero bounding box).
- Add browser/E2E coverage that asserts each task-oriented onboarding step is anchored to a visible element and that the expected Settings hub panel is active at Visual, Connections and Software Update steps.
- Do not alter the current manual-test RC retroactively; treat this as a recorded NEXT-29 follow-up finding.


## 2026-09-30 — NEXT-29 Web onboarding v2 full late-step audit (steps 9–18)

Manual QA reported that multiple steps after the Visual onboarding step no longer match the visible Settings section. A full source audit confirms this is a sequence/state-machine defect rather than one isolated popover-position bug.

### Step-by-step audit
- **9/18 — 推荐与画风 tab:** target is the visible Settings Hub sidebar tab. The step is structurally addressable, but its transition pattern is unsafe: it combines `advanceOnClick: true` with an `onNextClick` handler that programmatically clicks the same active target and then calls `moveNext()` after a fixed 140 ms.
- **10/18 — 画风接入模式:** target `#visual-rerank-mode` belongs to `#a87-recommendations-panel`. If the prior panel activation has not completed/stuck, the node still exists in DOM while hidden. The vendored Driver target resolver only uses `document.querySelector`; it does not require visibility/non-zero geometry. Result: a hidden target is accepted and the popover becomes effectively unanchored (observed top-left).
- **11/18 — 画风影响强度:** same failure class as step 10 because `#visual-strength` is in the same Recommendations panel.
- **12/18 — 连接与同步 tab:** sidebar target itself is visible, but it repeats the same unsafe `advanceOnClick + synthetic click + fixed-delay moveNext` transition pattern as step 9.
- **13/18 — 连接状态:** target `#a83-connections` is not owned by the Connections panel in the current hub. `alpha8-connections.js` inserts it relative to `#settings-form`; after Settings Hub migration it lands in / remains associated with **General**. Thus a tour that has just activated Connections is structurally pointing at a hidden General target.
- **14/18 — E-H 登录方式:** guaranteed ownership mismatch. `alpha8-7-desktop-hub.js` explicitly moves `#settings-eh-account` into **General** (`panels.get('general').appendChild(ehAccount)`), while the onboarding sequence remains on Connections.
- **15/18 — 手机直接读取电脑内容:** `#settings-mobile-bridge` is correctly owned by **Connections**. This step can align only if the Connections transition survived steps 12–14; otherwise it inherits stale panel state.
- **16/18 — 语言与地区:** the previous Mobile step explicitly calls `openSettingsPanel('general')` before advancing, so this target is conceptually correct, but it still depends on the same fixed-delay transition style rather than a readiness assertion.
- **17/18 — 软件更新:** the previous Language step clicks the Software sidebar tab before advancing. The target is the sidebar tab itself, so it is generally addressable, but the tutorial does not verify that `#a87-software-panel` is active/visible or spotlight an actual update control.
- **18/18 — 完成:** no anchored target; no ownership issue.

### Additional Driver integration defect
The vendored Driver supports both `advanceOnClick` and custom `onNextClick`. For steps 1/4/6/8/9/12 the current tour sets `advanceOnClick: true` while `onNextClick` programmatically invokes `.click()` on the same highlighted element. The Driver's document click listener treats clicks inside the active element as `activeElementClick` and can re-enter the same next-step callback. Browser click-in-progress suppression prevents infinite native activation but the nested callback can still schedule an additional delayed `moveNext()`, creating an intermittent double-advance / step-skip risk. This is a separate sequencing defect from hidden-target geometry.

### Required redesign before next Web RC
- Treat onboarding as an explicit state machine: every step declares the owning top-level view and Settings Hub panel.
- Before highlighting a target, activate the owner and wait until **owner active + target visible + non-zero bounding rect**.
- Replace Driver's current existence-only target readiness for this tour; hidden DOM nodes must be treated as unavailable.
- Remove the mixed `advanceOnClick + programmatic click + fixed 140 ms` pattern. Use one transition authority only.
- Reorder General-vs-Connections content to match actual product ownership: E-H account is intentionally General; connection-summary ownership must be made explicit instead of assumed.
- Add Playwright coverage for the entire 18-step sequence, asserting at each step: active index/title, active top-level view, active Settings panel when applicable, target visibility, non-zero bounding box, and no unexpected index skip after one Next action.
- Specifically gate steps 10, 11, 13, 14, 15, 16 and 17 because these cross panel boundaries or depend on dynamic panel relocation.

Current RC remains manual-QA evidence only; no code fix is applied in this audit commit.


## 2026-09-30 — NEXT-29 Web Library display controls missing: competing DOM owners

Manual QA finding:
- The Web Library no longer visibly exposes the expected display controls (cover grid / compact list and grid-size small / medium / large), even though the underlying view-switch functionality still exists.

Source audit:
- The controls are still present in `web/index.html`: `#view-grid`, `#view-list` and `.grid-size-controls`.
- `web/app.js` still binds them normally through `setLibraryView(...)` and `setGridSize(...)`; this is not a feature-removal regression.
- Two independent DOM-rewrite layers currently claim ownership of the exact same controls:
  1. `ui-polish-v5.js::installLibraryToolbar()` promotes `#view-grid`, `#view-list`, `.grid-size-controls` and the cover toggle into the visible `.ux-toolbar-primary`.
  2. `v040-parity.js::installLibraryParity()` moves those same controls into the collapsed `.v040-library-more` (“更多筛选与显示”) disclosure.
- `v040-parity.js` is dynamically imported from `eh-account.js`, while `ui-polish-v5.js` is loaded as a separate static module. Their effective initialization order is therefore not a stable single-owner contract.
- If UI polish runs first and parity runs later, parity removes the display controls from the visible primary toolbar and nests them under the collapsed “更多筛选与显示” disclosure. `ui-polish-v5.js` does not observe/reconcile Library toolbar mutations and its `data-ux-polished` guard prevents a normal second install pass.
- The language-change path is more dangerous: `v040-parity.js` removes `.v040-library-more` and recreates it on `pica-language-change`. If display controls are children of that disclosure at removal time, they can be removed from the DOM with the disclosure; subsequent re-install cannot recover nodes that no longer exist.

Required correction:
- Establish exactly one DOM owner for Library display controls. The modern visible Library toolbar should own grid/list and grid-size controls; the parity layer must not relocate them.
- `v040-parity.js` should be limited to provider/parity additions and must not move controls already owned by the modern toolbar.
- Language refresh must update labels in place rather than remove a container that may own live controls.
- Add E2E assertions that after startup and after each language switch:
  - `#view-grid` and `#view-list` are connected and visible;
  - `.grid-size-controls` is connected and visible in grid mode;
  - one click changes the rendered Library mode;
  - no duplicate or competing “display controls” owner exists.
- Current manual-test RC is unchanged; this is recorded as another NEXT-29 Web corrective finding.


## NEXT-30 — Cross-client interaction hierarchy / UI simplification
**Status: IMPLEMENTATION_COMPLETE — U1/U2/U3 implemented with automated contracts; final release-intent validation is tracked by NEXT-32**

Source: manual QA comparison of the fresh Windows/Web and Android RCs.

### U1 — Windows/Web action hierarchy
- Reduce permanent button density without hiding core capabilities.
- Library: keep grid/list mode directly visible; move grid-size and cover-loading options into one display disclosure; keep search/scope/apply as primary; retain advanced filters and batch organization as separate secondary disclosures.
- Establish one DOM owner for Library display controls. Remove the v040 parity layer's authority to relocate grid/list/size/cover controls.
- Recommendation page: keep the primary recommendation action visible; move destructive/rare restart and secondary display controls out of the primary action cluster where appropriate.
- Settings: reduce top-level section count and align feature ownership with the user's mental model. Merge Maintenance + Software Update into one section, move unified connection health into Connections & Sync, keep account credentials in General, and collapse local runtime/network utilities instead of showing every control at once.
- Avoid a visual redesign that changes product semantics; this pass is information architecture + progressive disclosure.

### U2 — Android selection-mode bottom action bar
- Replace the ActionMode overflow-menu dependency after long-press selection.
- While collection selection is active, the normal four-destination bottom navigation is temporarily replaced by a contextual action bar.
- Required directly visible actions: Finish/selected count, Select all, Clear, Add to shelf, and Unfavorite (Library) or Remove from shelf (Shelf).
- Exiting selection restores the normal bottom navigation without rerendering the collection.
- Back should exit selection before leaving the screen.
- The shared Library/Shelf selection controller remains the single selection state owner.

### U3 — Web onboarding realignment after UI stabilization
- Rebuild onboarding transitions around explicit view/panel ownership and visible-target readiness after U1 is complete.
- Remove the mixed Driver `advanceOnClick + synthetic click + fixed-delay moveNext` pattern.
- Full E2E tour must assert one-step-at-a-time progression, active view/panel, visible target geometry, and no hidden target anchoring.

### Release boundary
- Keep v0.4.11 and stable OTA untouched.
- Do not produce another RC until U1/U2/U3 automated gates are green.

## NEXT-31 — Universal Web/Desktop Upgrade Assistant
**Status: PASS — universal full-application contract implemented; v0.4.11 entry path tracked separately in NEXT-32**

Goal:
- Make the Web/Desktop “one-click update” entry remain usable across ordinary incremental releases, database-schema jumps, updater replacement and major architecture changes.
- The user must not need to manually download/extract/replace the application tree merely because the next release requires a full application package.
- User data remains external authority: database, shelves, history, settings, encrypted credentials, downloads, packs and other Desktop state are never treated as application payload.

Architecture:
- Keep existing manifest-based incremental updater as the fast path.
- When the latest stable Release has no compatible incremental asset but has the verified Windows x64 full package, `/api/v1/update/prepare-latest` downloads and stages the full application automatically.
- Full application archives are SHA-256 verified against the official GitHub Release and must not contain user-data roots/SQLite payloads.
- A full package accepted for one-click use must itself contain both `app/updater.js` and `app/full-upgrader.js`, preserving the same upgrade capability for the next release.
- The installed stable baseline also registers a persistent copy under `runtime-state/upgrade-assistant` (default Windows path: `%LOCALAPPDATA%\Pica Library\runtime-state\upgrade-assistant`) containing the bundled Node runtime, `full-upgrader.js` and hash-bound metadata. Full replacement copies from this fixed external authority into a per-update bootstrap before shutdown, so the helper is both discoverable between releases and never self-replaced while executing.
- Before full replacement, the bundled Node runtime and `full-upgrader.js` are copied under the external Desktop runtime-state update directory. The bootstrap therefore runs outside the application tree and can replace the updater/runtime/application itself.
- Full replacement waits for the old process to exit, snapshots configuration plus SQLite/WAL/SHM, moves the old application tree to a sibling backup, installs the staged tree, launches the target, and verifies `/api/v1/capabilities`.
- Failed startup/migration health automatically restores the old application tree and the pre-upgrade user-state snapshot, then relaunches the old version.
- Automatic full upgrade fails closed if Desktop user data or the selected Library directory is located inside the application tree.

Web UX:
- One primary “one-click check & update” action covers incremental and full-application upgrades.
- Full-package/manual replacement instructions remain only as a fallback when a Release lacks an automatically verifiable full package.
- After `/api/v1/update/apply`, the current page polls the local capabilities endpoint; once the target version is healthy it calls `window.location.reload()` automatically.
- Do not finish on “wait for restart” / “please refresh” copy. A changed localhost port is handled by the detached full-upgrader opening the new loopback URL as a fallback.

Release compatibility boundary:
- Public v0.4.11 predates the detached full-upgrader and cannot gain that helper retroactively. However, it already supports verified source-scoped incremental updates. NEXT-32 therefore keeps the first target inside that existing compatibility boundary: App API 2, schema 13 → 14, and byte-identical `app/updater.js`. If final artifact acceptance confirms those conditions, v0.4.11 can install the first NEXT-31-capable stable build through its existing Web one-click path; the Upgrade Assistant remains a fallback rather than the primary path.
- Once the first stable build containing NEXT-31 is installed, future Windows x64 stable upgrades must preserve the universal assistant contract.

Acceptance before release:
1. Type-check, Web syntax, unit/integration tests and real-browser smoke PASS.
2. Windows artifact contains both update helpers.
3. A Windows replacement acceptance exercises an external bootstrap against an older application tree while reusing an external user-data root, and verifies target health plus data preservation.
4. Full-package rejection tests cover embedded user data and missing universal helper.
5. Formal Release assets still provide SHA256SUMS / provenance; stable OTA must never bypass official-asset verification.


## 2026-09-30 — NEXT-31 Universal Upgrade Assistant acceptance
**Status: PASS — release candidate contract implemented and validated**

Validated source:
- `038da317dc76e6b9e28650eb8f485d14b6d1a8d8`

Behavior now implemented:
- Web/Desktop exposes one primary one-click update path for both normal incremental releases and verified full Windows application replacements.
- Update discovery preserves the historical response shape for incremental updates and adds `oneClick + assetName + assetUrl` only when an official full Windows package is actually available for automatic replacement.
- Full packages are verified against the official GitHub Release / SHA-256 before extraction.
- Full-package staging rejects user-data roots, SQLite payloads, unsafe paths, missing launcher/runtime/Desktop entry, and missing `app/updater.js` or `app/full-upgrader.js`.
- The current runtime + `full-upgrader.js` are copied to an external bootstrap directory under Desktop runtime state before shutdown, so updater/runtime/application replacement does not self-lock the old application tree.
- Full replacement snapshots Desktop configuration/credentials plus SQLite/WAL/SHM, replaces only the application tree, launches the target version, validates `/api/v1/capabilities`, and automatically restores old application + pre-upgrade state if target startup/migration health fails.
- Automatic full upgrade fails closed when Desktop user data or the configured Library directory is inside the application tree.
- Web waits for the target version and automatically reloads via `window.location.reload()`; the update monitor independently reloads on backend version change. A changed localhost port is handled by the detached helper opening the healthy new loopback URL.
- Manual full-package replacement guidance is retained only as a fallback when a Release does not expose a verifiable automatic full asset.

Acceptance evidence:
- CI Web/Desktop type-check, Web syntax, full unit/integration suite: PASS.
- Real-browser Web smoke: PASS.
- Android CI: PASS.
- v0.4 Direct Upgrade Acceptance / Desktop data-preservation and schema contracts: PASS.
- P2 Runtime Hardening Promotion Gate: PASS.
- Dedicated unpublished RC contract: PASS.
- Dedicated Android RC unit/lint/signing/package verification: PASS.
- Dedicated Windows RC repository preflight + artifact smoke: PASS.
- Dedicated Windows real full-replacement acceptance: PASS. The test launches the checksum-pinned older Windows package, creates external user state, runs the detached universal bootstrap, replaces the entire application tree with the candidate, verifies candidate version/schema/source SHA, confirms external config and Library database remain intact, and requires the normal pre-migration DB backup when schema advances.

Compatibility boundary:
- Public v0.4.11 predates NEXT-31 and cannot acquire `full-upgrader` before updating. The release-preparation solution is to use v0.4.11's already-shipped incremental updater for the first hop, provided the final stable package remains App API 2 / schema 14 and does not replace `app/updater.js`. That source-scoped incremental package installs `app/full-upgrader.js` as part of the new baseline. Upgrade Assistant/full-package replacement remains the recovery fallback until the published-release acceptance is proven.
- After users install the first stable release containing NEXT-31, future Windows x64 stable schema jumps, updater replacements and major application-tree changes must preserve this universal one-click contract.

Stable v0.4.11 Release assets and stable OTA metadata remain untouched.


## NEXT-32 — Next stable release scope / v0.4.11 bridge / support-provider reconciliation
**Status: DONE — v0.5.0 / Android v55 published and release transaction verified; broader project backlog remains open**

Publication authority: [v0.5.0 Release](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.5.0), 2026-10-01 04:46:04 UTC; source `bec7f9f31828e8c57e0a2c103b6b1206c22c37cf`; [publish run 36815096800](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/36815096800). The post-release reconnect commits on main are not included in these immutable published assets.

### Why this entry exists
The next stable release must not be treated as equivalent to “finish every open item in this log”.

The original 2026-09-30 pre-release reconciliation recorded three different scopes (historical counts, not current branch distances):

1. public stable `v0.4.11`;
2. current `main`, which is **1058 commits ahead of v0.4.11** and already contains a large body of unreleased architecture/runtime, evidence tooling and experimental-platform work;
3. PR #197, which is a later corrective/release-preparation layer on top of `main` and is currently **121 commits ahead of main** at this reconciliation point.

Therefore P1/P2/P3/P4/W5/P6 remain authoritative project tracks after the next stable release. Their PARTIAL / IN_PROGRESS / PLANNED / DEFERRED items are not silently converted into release blockers or marked DONE merely because a stable package is being prepared.

### R1 — Support provider migration
Decision:
- All current user-facing sponsorship/support entry points migrate from AFDIAN / 爱发电 to **AZZ / 爱赞助**.
- Canonical support URL: `https://azz.net/PicaLibrary`.
- Web, Android, GitHub Funding, README/guides, localization resources and their tests must move together.
- Sponsorship remains voluntary and must never gate product features, content or access.

Implementation:
- support UI/docs migration is committed on PR #197;
- final validation must include a repository scan proving no active AFDIAN endpoint remains.

### R2 — Preserve direct one-click upgrade eligibility from public v0.4.11
Public v0.4.11 authority:
- App API: 2;
- database schema: 13;
- existing Web updater supports a source-scoped stable incremental package when App API is unchanged, the schema advances by at most one step and `app/updater.js` itself is not replaced.

Release-preparation audit found that unreleased schema 14/15/16 changes are all additive indexes and no public stable release has shipped those migration numbers. They are therefore consolidated into one schema-14 migration containing the same indexes.

Expected next-stable compatibility:
- v0.4.11 schema 13 -> candidate schema 14;
- App API 2 -> 2;
- compatibility decision: `INCREMENTAL / COMPATIBLE`;
- `app/full-upgrader.js` may be added by the incremental package;
- `app/updater.js` must remain byte-compatible for the v0.4.11 direct path.

Release requirement:
- the formal Release should publish a verified
  `Pica-Library-v<TARGET>-update-from-v0.4.11.zip`;
- v0.4.11 users should be able to press the existing Web one-click update action once and enter the new stable baseline without manually downloading the Upgrade Assistant;
- after that transition, the installed baseline contains the Universal Upgrade Assistant and future incompatible schema/architecture changes can use verified full-application replacement.
- first startup of that new baseline must materialize the persistent assistant at `runtime-state/upgrade-assistant`; acceptance requires its runtime/helper bytes to match the installed package and `assistant.json` to bind product version + source SHA + SHA-256.

Fallback:
- keep the v0.4.11 Upgrade Assistant/full-package path in the Release as a recovery/exception path until the real published v0.4.11 -> target one-click acceptance passes;
- do not claim one-click compatibility if the final artifact changes `app/updater.js`, changes App API, exceeds schema 14, or fails official Release verification.

### R3 — Project backlog vs next-stable release scope
The following remain project-wide tracks and are **not automatically required to be closed for this release**:

- P1 remaining correctness follow-ups (P1-E/P1-F/P1-G);
- P2 long-task/resource/database/cache/runtime hardening items that still require representative evidence or later enforcement decisions;
- P2-K real-hardware/performance evidence and budgets;
- P3 shared-core regression obligations;
- P4 Linux/macOS/Windows ARM64 experimental support;
- W5D-W5H Remote Web onboarding, weak-network/offline/write/multi-user work;
- P6 signing/reputation, performance promotion and longer-term release-governance work.

The next stable release may contain already-implemented runtime/internal improvements from these tracks because they are present in the production source tree, while the track itself remains open. Release notes should distinguish:
- user-facing stable features/fixes;
- internal runtime/performance hardening;
- experimental or unsupported platform work that is **not** being promoted to formal support.

### R4 — Historical release gates, completed by the v0.5.0 publication
The publication transaction completed the following gates; they are retained as the release contract, not listed as current blockers:
1. AZZ migration passes Web/Android/localization tests and old support endpoints are absent from active surfaces.
2. v0.4.11 -> target source-scoped incremental package is generated from the real public v0.4.11 Windows ZIP and proves schema 13 -> 14 plus unchanged legacy `app/updater.js`; after the upgraded target starts, the external persistent assistant under `runtime-state/upgrade-assistant` must also be present and hash-bound to that target.
3. The final version number / Android versionCode are stamped once release scope is frozen.
4. Windows and Android formal candidates are built from one final source SHA and pass the release-intent matrix.
5. The formal Release carries full Windows package, source-scoped v0.4.11 incremental package, one-time Upgrade Assistant fallback, SHA256/provenance, Android production APK/update metadata and release notes.
6. Stable OTA/latest pointers are changed only after the uploaded assets are verified.

This NEXT-32 entry is a release-scope reconciliation. It does not supersede or delete earlier task families.


## 2026-09-30 — NEXT-32 persistent upgrade-assistant registration

State update:
- Added a fixed external upgrade-assistant authority under Desktop `runtime-state/upgrade-assistant` (default Windows path `%LOCALAPPDATA%\Pica Library\runtime-state\upgrade-assistant`).
- The new stable baseline registers the bundled Node runtime and `app/full-upgrader.js` there on startup and writes `assistant.json` with product version, source SHA and SHA-256 identities.
- Full-application replacement no longer copies its detached bootstrap directly from the mutable application tree. It first refreshes/verifies the persistent external assistant, then copies that verified external runtime/helper into the transaction-specific `updates/bootstrap-<id>` directory before the old application exits.
- This preserves two distinct safety roles: a stable discoverable assistant location across releases, plus an immutable per-update bootstrap that is never self-replaced while running.
- The v0.4.11 incremental acceptance now additionally requires that after the candidate starts, the persistent assistant exists, matches the installed runtime/helper byte-for-byte, and is bound to the candidate version/source SHA.
- Ordinary startup remains fail-open if persistent-assistant registration cannot be refreshed, so the application remains usable; an actual full-application upgrade remains fail-closed if the assistant cannot be prepared and verified.
- Stable v0.4.11 Release assets/OTA remain untouched. Final published-release acceptance under NEXT-32 is still required after target version stamping and formal asset upload.


## 2026-09-30 — NEXT-32 unpublished migration history reconciliation

State update:
- The schema-13 -> 14 release bridge remains unchanged for public v0.4.11 users.
- A separate development/RC compatibility audit found that testers who had already run unpublished schema 14/15/16 builds could retain private `schema_migrations` rows 15/16 after the release-preparation consolidation to schema 14.
- Those rows would not block current startup, but they could incorrectly reserve future stable migration numbers and cause a later real schema 15/16 migration to be skipped on those RC-only databases.
- Added a strict reconciliation path that activates only when the migration names exactly match the never-published P2 index migrations (`p2d2_author_reverse_lookup_indexes`, `p2d5b_work_identity_detail_indexes`, `p2d8a_picture_comic_status_index`).
- Before reconciliation, LibraryDatabase checkpoints WAL and writes `library.db.pre-unreleased-schema-reconcile.bak`.
- Reconciliation replays the consolidated schema-14 index bundle idempotently, replaces only the recognized unpublished migration metadata with `post_v0411_index_bundle`, and leaves all ordinary application/user rows untouched.
- Unknown or future migration names are never rewritten by this compatibility path.
- Added an integration regression that preserves a sentinel RC row, verifies the recovery backup retains the old 14/15/16 history, verifies the live DB ends at schema 14, and verifies the bundled indexes are present.


## 2026-09-30 — NEXT-32 generic release tooling and v0.5.0 formal candidate

State update:
- Windows stable packaging no longer requires adding one hard-coded branch for every future semantic version. Stable `X.Y.Z` package naming is generic.
- A release may explicitly request reuse of a checksum-pinned prior launcher through `PICA_WINDOWS_LAUNCHER_BASE_VERSION` + `PICA_WINDOWS_LAUNCHER_BASE_SHA256`. The current v0.5.0 bridge pins public v0.4.11 so its launcher remains byte-identical for the old incremental updater. Future releases that use verified full-application replacement may omit this override and allow a launcher change.
- Added `scripts/build-upgrade-assistant.ts` / `pnpm build:upgrade-assistant` as the reusable fallback-assistant generator. It binds source version, target version, full-package SHA-256, target source SHA and target database schema into the existing audited PowerShell replacement/rollback implementation.
- Added unit coverage for the generic Windows packaging contract and Upgrade Assistant generator, including the v0.4.11 -> v0.5.0 source label and source-SHA mismatch rejection.
- Added `.github/workflows/v050-release-candidate.yml` as an unpublished, non-publishing release-intent workflow:
  - temporary Desktop stamp: v0.5.0;
  - Android production-identity candidate: versionCode 55 / versionName 0.5.0;
  - checksum-pinned public v0.4.11 Windows baseline;
  - formal-layout full Windows package;
  - source-scoped `Pica-Library-v0.5.0-update-from-v0.4.11.zip`;
  - actual public-v0.4.11 updater replacement acceptance;
  - checksum-bound `Pica-Library-v0.5.0-upgrade-assistant-from-v0.4.11.zip`;
  - signed Android candidate using the existing production signing identity;
  - artifact-only publication to GitHub Actions.
- The candidate workflow has no `gh release create`, no stable tag mutation, no `android-preview` upload and no OTA/latest update. A dedicated unit contract locks that boundary.
- Formal repository version stamping and public Release remain blocked until the v0.5.0 formal candidate and the normal release-intent matrix pass.


## 2026-09-30 — NEXT-32 permanent v0.5.0 release stamp

State update:
- Repository Desktop version is permanently stamped to `0.5.0`; Android defaults are permanently stamped to versionCode `55` / versionName `0.5.0`.
- The v0.5.0 candidate workflow no longer mutates `package.json` temporarily; it now verifies the permanent release identity before packaging.
- Historical v0.4.x contract tests now preserve their compatibility baselines without forcing the current repository to remain at v0.4.11.
- The old P2 unpublished RC generator is restored to its historical/manual branch scope and no longer auto-runs from the v0.5.0 release branch.
- Public docs, quick-start guides, Android guide, Desktop guide and Windows distribution guide now describe v0.4.11 → v0.5.0 in-product one-click upgrade as the normal path, with the generated Upgrade Assistant as recovery fallback.
- No stable Release, `latest`, or Android OTA pointer has been changed by this stamp commit.
- Final release authority requires a fresh all-green matrix and v0.5.0 formal candidate built from the exact final stamped source SHA.


## 2026-10-01 — POST-v0.5.0 update reconnect stabilization

State update:
- Field report after the v0.5.0 publication: the Windows update itself completed successfully, but the Web update page attempted its automatic refresh too early; a manual browser refresh shortly afterward connected successfully.
- Root cause boundary: the old Web client treats the first successful target-version `/api/v1/capabilities` response as sufficient to reload. The local HTTP server can begin listening before Desktop finishes the rest of its startup path, leaving a narrow readiness race.
- Server-side compatibility fix: Desktop now exposes `startupReady=false` while the engine is still completing startup. `/api/v1/capabilities` returns HTTP 503 only during that explicit state and returns the normal capability payload after instance publication. This means the already-released v0.5.0 Web client will also wait longer when upgrading into the next build, even though its JavaScript cannot be changed retroactively.
- Client-side hardening for subsequent upgrades: reconnect now probes both target-version capabilities and a no-cache Web shell, requires a 1.5-second continuous stabilization window, and only then reloads.
- The final reconnect failure copy now tells users to wait briefly and refresh the current page before reopening the application.
- No v0.5.0 Release asset, tag, OTA pointer, database schema, updater package format or version stamp is changed by this branch. The fix is isolated for the next patch release candidate.

## NEXT-33 — Post-v0.5.0 isolated RC and evidence-ready handoff
**Status: PARTIAL — automated installable-package gates passed at `454e9fef1a04`; representative physical/manual evidence remains pending; UNRELEASED**

Scope:
- Keep main's existing reconnect fix; add real-Chromium regression coverage for startup 503, a transient shell failure resetting the stability window, wrong version, non-HTML shell and network loss.
- Preserve the historical 0.4.11 P2 RC workflow. Its hard-coded baseline cannot build current 0.5.0 metadata; add `post-stable-rc-packages.yml` and a guarded `-PostStable` builder mode instead.
- Use source-bound `0.5.0-postrc.<12-char-sha>` application metadata, a checksum-pinned public v0.5.0 Windows launcher baseline and a new `%LOCALAPPDATA%\Pica Library Post Stable RC` root. Do not read/copy/migrate stable or historical P2 RC user data.
- Android remains the fixed-certificate `com.picalibrary.android.dev` side-by-side identity. Stop on signature/version incompatibility; do not uninstall the user's Dev app or copy its data.
- PR events run the non-secret contract only. Trusted branch/manual runs build and verify both installables. A machine-readable `RC_STATUS.json` distinguishes contract-only from package-ready and always keeps manual/physical QA pending.
- No stable version bump, release/tag/OTA change, production database operation or local deployment is authorized by this lane.

Acceptance:
1. Type, Web, unit/integration and Chromium regression checks pass.
2. Trusted CI uploads source/hash-bound Windows and Android artifacts; skipped jobs do not count as package PASS.
3. Isolated Windows artifact smoke and released-v0.5.0 full-replacement acceptance preserve the temporary external test data. This does not bypass stable-to-RC OTA validation and is not user-machine evidence.
4. Representative restart/reconnect behavior and Android device acceptance remain separate manual gates.

Representative evidence still required before K5 variance/budget review:
- Windows K1;
- Android K2;
- Android K3 real download;
- Android K3 real Reader;
- Windows K4 manual/recovery;
- Android K4 manual/OEM;
- J7B real Provider;
- J10 real Visual;
- low-end Windows CPU/jank trace.

Verified historical package evidence: [run 37492489884](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/37492489884), exact source `454e9fef1a04a5fdbc17227af2fe755e52c6fbd7`, completed successfully; contract, Windows RC, Android RC and artifact summary jobs all succeeded. The run's artifact API lists no remaining downloads as of 2026-10-12. Do not relabel an old package as the local NEXT-34/35/37 implementation or claim the documentation-only head was built.

K5 tooling completion permits at most `READY_FOR_HUMAN_VARIANCE_AND_BUDGET_REVIEW` after valid evidence reconciliation, not automatic P2 completion or concurrency enforcement. Detailed operator boundary: [POST_STABLE_RC_READINESS.md](docs/POST_STABLE_RC_READINESS.md).

## NEXT-34 — Optional preference-aware collection-map view (#199)
**Status: PARTIAL — Desktop/Web display projection implemented and locally tested; Windows package/human acceptance pending; LOCAL ONLY / UNRELEASED**

Source: [issue #199](https://github.com/Saber-Alter-Lily/pica-library/issues/199), opened 2026-10-03 UTC.

- Local implementation selects the reporter's opt-in BLOCK/LESS display alternative, with independent switches and default-off objective view. A separate manual exclusion list is not implemented.
- Preserve the default objective collection view and clearly expose the selected view/filter.
- Do not mutate favorites, embeddings, original analysis inputs, recommendation policy, feedback or sync state when toggling the view.
- Automated synthetic-fixture tests cover original snapshot counts/denominators/IDs, empty/error/legacy states, browser-local refresh persistence, immutable projection and read-only service/GET behavior. Filtered views cannot use the old objective PDF export.
- Local source: `codex/issue199-200-preference-discovery@e12d48839d0ad1ac86964c14cdc0164a5ebfe0a0`, based on the separate PR #203 readiness candidate; this source is NOT part of the current GitHub documentation commit.
- Required next gate: fresh frozen dependency installation/remote CI, an isolated Windows package, and human objective → BLOCK → LESS → both → objective acceptance without production mutation. See [evidence and limitations](docs/UNVERIFIED_PROGRESS_20261012.md#next-3435--issues-199200-local-implementation).
- Registration is not closure of the issue or authorization to change recommendation science.

## NEXT-35 — Sparse-tag and interest-explanation discovery (#200)
**Status: PARTIAL — full-local-catalog discovery and evidence wording implemented locally; explanation/taxonomy/cross-client work remains open; LOCAL ONLY / UNRELEASED**

Source: [issue #200](https://github.com/Saber-Alter-Lily/pica-library/issues/200), opened 2026-10-03 UTC, including the reporter's taxonomy suggestion.

- Separate sparse/coarse Provider tags, collection-frequency summaries and explicit/inferred personal interest in the UI and audit evidence; a collection count is not an interest label by itself.
- Reproduce the reported manual-tuning burden with a bounded, user-authorized audit export; do not silently inspect or mutate production databases.
- Assess explanation, unknown-evidence handling and opt-in taxonomy normalization before any recommendation-weight change.
- An external taxonomy suggestion is a design input, not permission to scrape/import it. Evaluate licensing, provenance, term mapping, updates and user control before choosing a source.
- Acceptance must preserve existing explicit preferences, avoid fabricated inferred interest and demonstrate whether the agreed change reduces unnecessary manual adjustments.
- Local implementation searches the complete local catalog before capping results, uses simplified/traditional and existing-alias matching for discovery only, preserves raw preference keys and retains staged edits across searches. Default/mobile bounded snapshots and ranking/matching semantics remain unchanged.
- Local automated evidence at `e12d48839d0a`: TypeScript PASS; Web syntax 38/38; unit/integration 226 files / 1231 PASS + 1 existing skip; headless Edge 28/28; Rollup and bundled OpenCC MIT/Apache notices PASS. Frozen lockfile-only check is not a fresh dependency installation.
- Still unverified/unimplemented: actual tuning-burden reduction, artist/style-vs-tag explanations, missing-evidence/opt-in annotation design, versioned cross-client alias migration, Android full-discovery parity and external taxonomy licensing/mapping. No Moegirl import or neural-model change.
- Windows packaging, Android native/device acceptance and remote CI for this local implementation were NOT RUN; PR #203's earlier CI must not be reused as their evidence.

## 2026-10-06 — Post-release task reconciliation

- Reconciled the current release state against GitHub Release, workflow jobs/artifacts, open PRs/issues and current-main source. Historical implementation notes remain intact.
- NEXT-32 publication is DONE; NEXT-33 contains unreleased packaging/reconnect acceptance. NEXT-34/#199 and NEXT-35/#200 are tracked but not claimed fixed.
- This change does not close PR #196 or import its divergent branch. A3/A5 residual work needs a separately reviewed current-main change.
- Validation outcomes belong to the exact reviewed source/CI run; no CI success is a substitute for the nine external evidence categories above.

## NEXT-36 — External reader behavior analysis and bounded adaptation design

**Status: PARTIAL — isolated static analysis/inventory completed; reference-runtime validation pending; no feature integration claim**

- Reference: user-provided MH-ARK 0.4.3.3. Complete APK/DEX/Smali/native capture was audited locally; high-level decompilation remains PARTIAL and is not original rebuildable source.
- Reader analysis verified 5 JNI classes / 27 bindings and 48 configuration fields. Its 27 passing tests are analysis-design-model tests, not Android runtime tests.
- The feature inventory contains 14 feature cards, 51 evidence groups and 142 source anchors. The 115 selected protected inputs remained unchanged at that phase; this is not a claim that all recovered code was behaviorally verified.
- Target APK execution, runtime/performance/network/format compatibility and all 28 inventory QA scenarios are still pending.
- Learning priorities: per-comic reading presets, adjustable gestures and split/spread display; later evaluate local directory/CBZ reading and comic/chapter cache control. These are design candidates, not accepted release scope or completed features.
- Existing multi-WebDAV, categorized cache, preloading and library filtering should be reused, not rebuilt. Do not copy unsafe original-file deletion semantics or describe a privacy lock as proven encryption.
- Third-party code, libraries, resources, APKs and decompilation outputs remain local isolated analysis material. Any Pica change must be independently implemented and separately verified; this documentation update uploads none of those materials.

Acceptance still required:

1. Confirm the chosen Pica source baseline against current main before implementation.
2. Define only a small user-visible slice, original-page progress identity and non-destructive fallback.
3. Verify target reference behavior where needed; treat unavailable runtime evidence as unknown.
4. Complete the slice's own build/integration/device/data-preservation gates. NEXT-37 is the only local implementation slice so far.

## NEXT-37 — Android phone-local double-tap and zoom options

**Status: PARTIAL — local implementation + targeted tests PASS; full app/package/device gates PENDING; LOCAL ONLY / UNRELEASED**

Local authority:

- Branch `codex/android-reader-gesture-polish`; base `e12d48839d0ad1ac86964c14cdc0164a5ebfe0a0`, not asserted to be latest main.
- Seven changed/new source/test files remain uncommitted locally. No implementation push, merge, APK installation or release is performed by this record.

Implemented:

- Reader → 阅读设置 → 手势与放大（仅此手机）.
- Phone-local double-tap enable/disable, default enabled; selectable 1.5× / 2× / 3×, default 2×.
- Disabling double-tap removes tap-confirmation waiting; pinch zoom stays available.
- Existing/rebound page holders use current settings without chapter reload, reading-progress reset or zoom reset.
- Scrollable Chinese/English/Japanese options; existing ReaderSource, cache, progress, portable settings and sync contracts are unchanged.

Evidence:

- 28/28 targeted tests PASS, zero failures/skips: settings 5, options 4, zoom 9, existing ReaderPolicy regression 10 (**18 new tests**, not 28 new tests).
- Isolated SDK-free Java/Robolectric 4.17 harness compiles the repository settings/options/zoom classes directly against API 35; JDK 21 / harness Gradle 9.0.0.
- This is NOT a full Android AGP/CI build, and does not establish ReaderActivity integration. Project build/signing/version settings are unchanged.
- `git diff --check` PASS; all seven file hashes match the local validation record at this reconciliation. Production data/application, provider, recommendation and sync state are untouched.

Acceptance still required:

1. Review/rebase against current main without losing the local issue work.
2. Full Android build, lint and Dev APK verification; the earlier local test run lacked an Android SDK.
3. ReaderActivity integration and physical-device touch QA: immediate single tap when disabled, selected double-tap scale, pinch/pan, gesture cancellation and parent-scroll/page conflicts.
4. Settings persistence after relaunch, recycling/rebind, active-page updates and orientation; unchanged chapter/progress/cache/source/sync behavior.
5. Human acceptance before any merge or release. Do not infer package/device PASS from the 28 targeted tests.

## 2026-10-12 — Conversation progress recorded, documentation only

- Reconciled NEXT-33 against the exact successful historical run; kept its manual/physical gates and missing current artifact downloads explicit.
- Advanced NEXT-34/35 from design registration to **local implementation / PARTIAL**, not issue closure or released behavior.
- Registered NEXT-36 static reference analysis and NEXT-37 local Reader gesture slice separately, with independent evidence levels and remaining gates.
- Documentation is updated on existing Draft PR #203 only. The PR remains unmerged; the current source implementations and private analysis remain local.
- No application-source upload, version/signing/schema/model change, release/tag/OTA transaction, production-data operation or deployment is authorized.
- The documentation-only commit skips automatic push/PR CI. Prior checks remain bound to their exact implementation SHA; no new application validation is claimed.

## NEXT-38 — Consolidated issue/source/reader acceptance candidate

**Status: IN_PROGRESS / UNRELEASED — isolated implementation and automated integration; physical/provider acceptance PENDING**

- Authorized on 2026-10-21, including the explicit one-round exception for the DPAPI-blocked Local Memory coordination lock. No coordinator secret/identity is changed.
- Independent checkout/branch `codex/next-acceptance-sources-jm`; original Reader dirty worktree remains preserved. The latest PR #203 documentation is reconciled without dropping its historical evidence limits.
- NEXT-34: retain default-off BLOCK/LESS display projection and current automated regressions; no recommendation/data mutation or issue closure.
- NEXT-35: retain Desktop full-catalog discovery; add Android search-only folding/aliases, explicit staged Save/Undo, rotation retention and collection-vs-interest wording. Taxonomy import, model changes, actual tuning-burden proof and versioned cross-client alias migration remain open.
- NEXT-37: integrate the phone-local gesture slice into the full app; no borrowed reference-APK code/assets. Device touch/OEM acceptance remains pending even after compilation.
- [Issue #204](https://github.com/Saber-Alter-Lily/pica-library/issues/204): opt-in JM account favorites using maintained MIT SDK v1.1.12; verified-account bounded preview/confirm, additive import, cancellation, metadata completeness and explicit enrichment; native Android and Desktop search/Reader routes.
- Source registry preserves Pica/EH IDs, rejects unknown prefixes and exposes capabilities. It is a compiled extension seam, not a completed third-party plugin ecosystem. Automatic JM candidate recall and native JM phone-download/sync are not claimed.
- Current evidence/limits, upstream licenses, package gates and consolidated device checklist: [NEXT_ACCEPTANCE_EXECUTION.md](docs/NEXT_ACCEPTANCE_EXECUTION.md), [JM_SOURCE_ADAPTER_ACCEPTANCE.md](docs/JM_SOURCE_ADAPTER_ACCEPTANCE.md).
- Local final automated baseline: Desktop 228 files, 1245 PASS + 1 existing skip; TypeScript and Web 39/39; Edge browser 29/29; Android 34 files / 151 PASS, lint, Dev build and Release R8 build PASS. Android AtomicFile host semantics and upstream R8 warnings are documented; these checks do not establish real-device/provider acceptance.
- The user separately authorized candidate-branch push, Draft PR and existing-secret CI signing. Remote/package results must still be recorded against their own source SHA; no local debug signature may be supplied as an existing-Dev upgrade substitute.
- Candidate branch CI/package construction only. No production app/database/credential/Visual/sync operation, local deployment, main merge, formal version/tag/Release/OTA change, automatic issue response or closure.

## NEXT-39 — After consolidated acceptance

**Status: PLANNED, not implemented by NEXT-38**

- Decide source-repository/manifest trust, source enable/disable/update lifecycle and legal/distribution policy before dynamic extensions.
- Add bounded JM recommendation retrieval only after real metadata/profile evidence and a separate recommendation review; never synthesize Like/style labels from imported favorites.
- Native JM progress/proxy and complete locale parity; NEXT-40 separately implements and validates the native download slice. Further source adapters use the registry and maintained upstreams, not one-off protocol copies.
- Preserve all unrelated P2/W5/NEXT-28 performance, onboarding, author-progress and device evidence backlog above; this candidate does not declare them complete.

## NEXT-40 — Native JM explicit downloads and offline Reader

**Status: IN_PROGRESS / UNRELEASED — source implementation; fresh exact-source automated/package gates and real-device/provider acceptance PENDING**

- Continued on 2026-10-22 after explicit permission to bypass the still-failing DPAPI coordination claim for this isolated development/build round. No memory identity or secret is repaired or replaced.
- Base: previous frozen NEXT-38 candidate `0549bc5e271d936c656cd9c6bdf6baa7e13b5681`, Draft PR #205. Keep the prior handoff ZIP unchanged.
- Scope: explicit JM single/all-chapter downloads via the maintained SDK, existing WorkManager resource tags and task center, Wi-Fi constraints, pause/resume/cancel, durable checksum-verified page checkpoints, and the existing phone-download Reader/index.
- Complete-chapter publication only: interrupted/failed chapters are retained for resume outside the readable index. Invalid source/chapter/page identity, non-image content and changed login binding fail closed. Logout/account switching never deletes previously completed local downloads.
- Same-comic jobs use unique WorkManager identity and a local write lock; duplicate KEEP requests cannot relabel the actual queued chapter. A job carries only a non-secret session binding, never a password or cookie.
- JM search results open the common detail screen; JM chapter/all-download controls are added there. JM account/favorites controls must not incorrectly redirect users to Pica login.
- No database-schema, recommendation-ranker/recall, Visual/embedding, sync-protocol, stable-version/tag/Release/OTA or production-state change. No automatic deployment or manual testing requested now.
- Remaining acceptance and exact evidence: [JM_NATIVE_DOWNLOAD_ACCEPTANCE.md](docs/JM_NATIVE_DOWNLOAD_ACCEPTANCE.md). NEXT-40 does not complete the rest of NEXT-39 or close #199/#200/#204.

Post-build evidence for NEXT-40: frozen source `43d9c2bc5a789994973703fe84408e8824962d5c`, candidate run `39759492930`, 3/3 PASS. Actual Android JUnit 35 files / 167 PASS; original fixed-signature Dev code 56 and downloaded Windows isolation/runtime checks verified. Full handoff `PICA_JM_OFFLINE_NEXT_ACCEPTANCE_20261022_43d9c2bc5a78.zip`, SHA-256 `36a20d49e464964562d29a931d22c762f4951f7949bbade7af5c596204b7c382`. These results advance NEXT-40 to AUTOMATED_CANDIDATE_READY / HUMAN_PROVIDER_QA_PENDING, not release or issue closure.

## NEXT-41 — Native JM source-screen locale and operation feedback

**Status: IN_PROGRESS / UNRELEASED — source implementation; fresh exact-source automated/package and human/provider gates PENDING**

- Authorized 2026-10-22 by a new explicit one-round exception to the DPAPI-blocked coordination claim. Base `43d9c2bc5a789994973703fe84408e8824962d5c`; local branch `codex/jm-source-ux-20261022`, existing Draft PR #205 candidate ref only. Prior source/Reader worktrees and frozen packages remain intact.
- Keep the source UI and SDK architecture. Add 68 semantic source-screen resources in zh-CN/en/ja; source titles/authors remain unmodified content. Distinct status, progress, success, empty, cancellation, failure and recreation messages replace generic failure text.
- Gate all conflicting buttons/IME actions, including logout/enrichment/detail controls. Only scan/enrichment can be cancelled; cancelled or destroyed requests cannot expose late import previews/navigation. Failed account switch refreshes identity instead of keeping the old label.
- Search failures retain the last successful page; pagination binds to its submitted query. Recreation stores bounded visible metadata/input only, never passwords or preview tokens, and never auto-replays an import. Incomplete/expired scans require fresh explicit confirmation. Import/enrichment retain the existing additive collection semantics and maximum-20 enrichment bound.
- Add synthetic Robolectric UI and three-locale resource-format tests; rerun exact-source Android and Desktop/Web/source/browser/package gates. CI-only candidate versionCode becomes 57 under the same Dev identity and fixed certificate; no private key download.
- No production account/data, database schema, ranker/recall, Visual/embedding, sync protocol, installed app, stable version/tag/Release/OTA or deployment change. No new manual testing requested. Full-app localization, JM native proxy/progress, automatic recall and dynamic extensions remain open.
- Evidence levels and deferred consolidated checklist: [JM_SOURCE_UI_ACCEPTANCE.md](docs/JM_SOURCE_UI_ACCEPTANCE.md). No #199/#200/#204 closure and no claim that automated UI fixtures establish real-device/provider acceptance.

## NEXT-42 — Daily UX simplification and separate daily/advanced guides

**Status: FIRST_SLICE_IMPLEMENTED / UNRELEASED — local automated gates; fresh exact-source Android/CI/package and human gates must be recorded separately.**

- New user authorization on 2026-10-22: isolated development/build despite DPAPI claim failure, then a separate authorization for a new Draft branch/PR and Actions using existing signing Secrets. No DPAPI identity or secret repair and no private-key download.
- Base `e3c0ff365153555511f396321be6cdb63c981384`; branch `codex/ux-tags-dual-onboarding-20261022`. Preserve prior candidate branches, handoffs and installed data.
- Web daily guide: seven practical steps plus completion; advanced guide: seven independently replayable chapters. Android daily no longer auto-chains into advanced settings; eight offline advanced chapters support explicit navigation/read markers and recreation.
- zh-CN/en/ja guide text. Reading state is not configuration state. v2 completion/dismissal and automatic-prompt preference are respected. Guides never auto-run account, sync, download, deletion, update or model actions.
- Browser regressions exposed a real Driver final-animation callback omission and a fast-Skip progress race. Explicit idempotent cleanup restores the original view/settings/disclosures; progress is captured before animation. Android target polling is bounded and stops on destroyed activities.
- Existing adjustments stay primary; full search/sliders and evidence/recompute/diagnostic tools become opt-in. Policy IDs, weights, current serving behavior, data schema, frozen Visual and sync protocol are unchanged.
- Two complete user handbooks: [daily](docs/DAILY_USE_GUIDE.zh-CN.md), [advanced](docs/ADVANCED_FEATURES_GUIDE.zh-CN.md). Native guides and actual owner-navigation tests accompany the documentation; this is not docs-only work.
- **Not implemented here:** selected-tag gating, private per-work tags, provider-tag rule mappings, visual reference sets and automatic Save-and-apply. Do not present proposed controls as available; NEXT-35/#200 remains partial. The next slice must gate profile/recall/ranking/reasons and Android offline semantics together.
- Candidate-only Actions versionCode 58 under the same Dev identity/fixed certificate. No stable version/tag/Release/OTA, main merge, official database or local installation change. Device/provider acceptance is deferred to the next consolidated test.
- Final local source: 1,261 Desktop assertions PASS (zero skipped), 29/29 isolated Edge browser tests PASS, 41/41 Web syntax PASS, TypeScript and Rollup PASS. Native advanced Skip/target failure was also separated from daily dismissal during final review. Fresh remote Android/build/package evidence is recorded post-build; this entry does not claim physical acceptance.
- First head `bdc7c4161601…`: unpublished build 3/3, 193 Android tests and independent Windows/APK checks PASS. The broader Windows gate failed before testing because the 100-item Release listing was empty; 30-item pages and direct v0.4.11 lookup verified the releases still existed. Corrected only the gate's bounded pagination and accepted-release filtering; retained its fail-closed assertions. Android force-stop passed its unchanged single retry. Rebuild all final installables on the corrected source SHA; do not relabel first-head packages or claim human acceptance.

## NEXT-43 — Functional tag scope and private concepts across Desktop/Android

**Status: IMPLEMENTED_IN_ISOLATED_CANDIDATE / AUTOMATION_AND_PACKAGE_EVIDENCE_SEPARATE / HUMAN_QA_PENDING. Not released or deployed.**

- Continues NEXT-42 on the same stacked Draft #206. The user explicitly authorized continuing the isolated tag/private-label/paired recommendation development and existing Actions build. Local coordination returned NOT_FOUND on resume; no project identity/secret was guessed, repaired or reprovisioned. Work continues under the explicit bounded exception.
- Prior NEXT-42 exact `ba8d043f0eb3…` CI has settled: 34 successful checks and 4 conditional skips, no failures. Its frozen ZIP is retained unchanged. Those results are not reused as evidence for this new source.
- Added optional nested tag schema v1; no DB migration/outer-policy reset. Default ALL, selectable allowlist, provider-scoped raw identities, unique-favorite coverage groups, immutable raw metadata.
- Added manual per-work private concepts and ANY raw-tag mappings with stable IDs, strict size limits, independent participation and safe text rendering. No private alias is sent as a provider keyword. Manual labels are not classifiers. Automatic JM online recall and Visual reference sets remain outside this slice.
- Gated Final V3 profile/intent/provider requests/soft feedback/fandom allocation and V5 timescales, Shadow channels/ranker, plus mobile native/offline behavior. Safety/BLOCK still inspect original facts. Frozen ranker weights, Visual modes/models/vectors are unchanged.
- Web/Android editors stage Save/Undo with bounded 100-row pages and 50-row binding pickers. Desktop explicit Save-and-regenerate preserves old usable cycles on failure and marks a stale tag baseline. Android scheme changes transparently rebase cached candidates rather than retaining opaque old tag ordering/reasons; no new retrieval on Save.
- Scheme synchronizes with a three-way whole-scheme conflict choice. Legacy omission preserves new settings; unresolved conflicts apply no other mutations or recomputation. Stale acknowledgement cannot erase newer local edits.
- Updated daily/advanced handbooks and zh-CN/en/ja in-app chapters. Main, stable versions, tags/Releases, OTA and installed official/RC data are not touched. Candidate-only fixed-signature Dev versionCode 59; keys remain in Actions.
- Synthetic regression additions cover scope/defaults, source identities, raw-fact preservation, private matching, CAS/conflicts/legacy clients, actual provider-route compilation, Android cache/queue/evidence, and actual-browser lazy/paged/staged/private/CAS/narrow-layout flows. Exact final counts, source SHA, Actions, artifact/signature hashes and remaining physical/provider gates are recorded in the new handoff validation, not inferred from an older green build.
- Initial `1f6c4fae6bad…` CI correctly stopped on an obsolete first-slice guide assertion requiring tags to remain unavailable, and a missing explicit Android `JSONException` import. Updated the guide assertion to verify real tag navigation plus explicit no-auto-visual/no-fact-rewrite/cache-only boundaries; retained the Visual caution and all gate tasks. Added the missing import without changing build requirements. Exact-source rerun and packages are required; the failed head is not an accepted artifact.
- Android then compiled and ran all 205 tests. One new CAS test compared the whole read-time snapshot, including the default SessionIntent timestamp freshly synthesized by each getter; it was not a persistent write. Its assertion now compares the complete persisted preference map, including snapshot/base, dirty flag and mutation ID, which directly checks the no-write contract. No production code/gate was relaxed for this test correction; rebuild and retain the failed-run evidence separately.
- Final route audit found two additional input leaks: legacy V3 cluster allocation and V5 semantic diversity still had raw tag inputs. Both now receive the personal view without changing frozen weights or returned facts. The audit also established that EH display values omit raw namespaces: scope/directory/mappings now use the existing lossless sidecar when present. Paired catalog/candidates add optional public `providerRawTags`; Android keeps them separate from display tags, consumes them via a read-only semantic adapter, and sends public facts back with catalog evidence. Missing legacy namespaces remain unknown. No credential/auth protocol, SQLite schema, raw display facts or Visual asset is changed. Added Desktop/Android namespace and portable round-trip regressions; earlier green artifacts are not relabeled as this final source.

## NEXT-44 — AI-assisted tag-profile export / preview / apply / undo

**Status: PREVIOUS_SLICE_AUTOMATED_AND_PACKAGE_GATES_PASS / HUMAN_AI_PROVIDER_QA_PENDING. Frozen source 9ff972e50446; unreleased, undeployed.**

- User authorized the first AI-assisted file-exchange slice and explicitly allowed isolated development/build despite the continuing DPAPI coordination failure. No memory identity or secret was repaired. Continue the existing Draft #206, not main.
- Desktop/Web exports a bounded ZIP with instructions, exact source-ID vocabulary, privacy-filtered current scheme, editable JSON result template and SHA manifest. Counts and local titles/work IDs/manual bindings default off. Preferences and private names remain sensitive; no automatic AI upload or account/history/image/embedding export.
- JSON results accept only bounded participation/private-label operations; unknown fields/IDs, namespaces invented by AI, scripts/SQL/ZIP, invalid bindings and conflicting/expired baseline reject the whole import. Locally retained baseline is the authority, not hashes asserted by the file.
- Paged text-only preview writes no tag settings. Explicit apply plus persistent undo metadata use one SQLite savepoint; no migration. Saving and starting regeneration are separate choices/outcomes. Subsequent local/mobile tag-scheme edits block stale apply/undo. Late audit narrowed conflict detection to the tag scheme: unrelated controls, feedback and sync no longer invalidate AI files/undo; commit still CAS-checks the latest policy revision and preserves those unrelated fields. Added a full export → intervening controls/feedback → preview → apply → more controls → undo preservation regression.
- First version is a same-installation AI round trip (four retained exports / 30 days; process-local previews / 30 minutes), not archival backup, community-profile installation or cross-installation migration.
- Android receives the confirmed scheme using unchanged existing tag sync. No Android file parser/picker is introduced; zh/en/ja guides explicitly explain the Desktop path. Candidate-only fixed-signature Dev versionCode 60; private keys remain in Actions.
- Added synthetic domain and actual loopback/CSRF HTTP tests, browser export/preview/cancel/confirm/undo/XSS/size/draft regressions and privacy instructions. Exact final source/run/installable digests and remaining manual gates belong in the new handoff; prior `f3fe4b95fb02` artifacts remain frozen and are not relabeled.

Post-build NEXT-44 evidence: `9ff972e50446b40445c9c54e24350f8ce9ef312b`, trusted run `39909777945` 3/3 SUCCESS, PR rollup 37 SUCCESS + 4 conditional SKIPPED. Local Windows 1291 PASS + 1 POSIX-only SKIP; Linux 1289 PASS + 3 Windows-only SKIP; the matrix covers all 1292 assertions. Real Edge 39/39, Android JUnit 207/207 and fixed-signature Dev code 60 PASS. Downloaded Windows ZIP verified privacy/preview/apply/replay and restart-persistent undo with synthetic hidden bindings. Handoff `PICA_AI_TAG_PROFILE_EXCHANGE_ACCEPTANCE_20261022_9ff972e50446.zip`, SHA-256 `a950d22b0a925500e867ad8ca9149b5c835be8e47cdcbf8b4d455c43021f1ae8`. Real AI/provider/device acceptance is still pending; no source/metadata write to formal data or deployment.

## NEXT-45 — Modular local-first reader foundation and one-click module compatibility

**Status: IMPLEMENTED_IN_ISOLATED_CANDIDATE / EXACT_HEAD_GATES_RECORDED_SEPARATELY / HUMAN_QA_PENDING. Unreleased, undeployed.**

- User established the long-term product objective: a local reader/library without included comic bodies, optional external sources, maintainable modules (tags, gestures, recommendation and others), maintained open-source reuse and a single update action. Full requirements and remaining work are authoritative in [MODULAR_LOCAL_READER_ARCHITECTURE.md](docs/MODULAR_LOCAL_READER_ARCHITECTURE.md); this first foundation does not redefine the complete objective as done.
- Explicit isolated development/build/Draft continuation permission despite the DPAPI-blocked claim. No identity/secret change, official data, main merge, tag/Release, stable OTA or installation/deployment.
- Extracted `src/tags/policy.ts` as a pure domain independent of storage, sources and recommendation. Existing schema/IDs/matching behavior stay unchanged; the V5 path is a compatibility re-export. Consumers use the neutral path. Installed TypeScript compiler AST checks enforce this first boundary and pure source-routing metadata; no new architecture framework/parser was built.
- `ProviderRegistry` owns compiled source aliases, namespaces and page schemes from versioned adapter descriptors; inspection is I/O-free, duplicate/incompatible registrations are atomic failures and unknown IDs/pages cannot fall through to an unrelated account. This is not a downloadable extension loader or completed arbitrary-provider/storage support.
- Added bounded public module API metadata to capabilities and all Desktop package builders. Incremental builders/staging bind metadata to the actual target; malformed/false/undeclared/removal and noncanonical-case cases reject. API mismatches require the existing one-click full-application route. Existing global API/schema, official SHA verification, legacy incremental updater and protected-data boundaries remain intact; `src/update/updater.ts` is unchanged. The separate full-application recovery helper is hardened as described below.
- Audit found that "configured" still depended on Pica credentials, although E-H access could bypass the setup page. Added explicit zh-CN/en/ja local-only setup, credential-backend-free config save, source-free relaunch and no automatic online recommendation cycle. Active-download library-folder guard is retained. Editing Pica now preserves JM/EH/all WebDAV-target credentials, not just a partial hand-maintained list.
- Ordinary storage/profile/public-proxy settings after local setup no longer require Pica credentials either. Partial Pica logins still fail validation; authenticated proxies use the existing secure backend. Empty local settings do not create a synthetic credential file. The real artifact gate exercises both initial local setup and subsequent ordinary settings before restart.
- Three-language real Edge local-only setup tests PASS with empty account/password and no source login/search/sync/recommendation-generation request. Added synthetic module contract/routing/payload tests and an actual Windows local-only save/relaunch/no-credential artifact gate. Candidate-only fixed-signature Dev versionCode 61; signing keys stay in Actions.
- The first complete local suite correctly caught a real CLI startup regression: an extensionless `modules/contracts` import resolved same-basename JSON instead of TypeScript in the existing TSX CLI runtime. Renamed the JSON to `runtime-contracts.json`; retained the CLI tests unchanged and verified their actual child-process startup. A new full suite is required, not a waived failure. Added a frozen legacy contract floor so future target declarations cannot redefine old-package compatibility.
- First pushed source `17f80c9006ad…` passed 1311 Windows assertions + 1 existing POSIX skip and 42 real Edge cases. Linux package run `39928226156` then correctly exposed a stale credential-lifecycle assertion: it conflated saved library configuration with a live provider session. Linux now separately requires local config to survive and session-only `picaAccount.configured` to clear; macOS/Windows secure-store gates also assert the provider-specific field. Existing plaintext/file checks remain. Rebuild final packages on the corrected source; do not relabel the first head as accepted.
- Next `0fb175610144…` trusted run `39928718756` failed its first Chinese Chromium local-setup case: the test clicked navigation while same-URL reload was still committing. It now explicitly awaits the new document's DOM readiness and localized connected mode before the unchanged navigation/no-source-write assertions. No added retry, timeout increase or skipped case. Final exact-source CI/packages are required; first-head artifacts/results are not promoted.
- Source `1d7c181e0738…` passed trusted run `39930043669`, 42 browser cases and packaged local/tag checks, but independent actual full-package **forced-health-failure rollback failed** with Windows `EPERM` removing the new application tree. The previous application backup was retained in an owned synthetic fixture; no official data was accessed. The exact lock holder was not proven. Recovery now first requests graceful authenticated loopback shutdown, awaits PID fallback exit and uses Node's bounded file-removal retries. Backup existence is checked before any installed-tree removal; post-health reporting/cleanup failure must not undo a healthy installation. Four focused safety tests and a real forced-failure CI scenario are added. New exact-source packages and both successful/full-failed recovery gates must pass before handoff; the green `1d7…` packages are not accepted.
- Maintained primary references: Suwayomi source host/client boundary, Mihon content-free reader position, Komga separate config/content, already-pinned MIT JM SDK, installed TypeScript compiler API. No competitor/reference-APK code/assets or new arbitrary loader is imported.
- Existing arbitrary archive import declaration remains false. Physical gestures, real providers, AI-returned files, native parity and published upgrade acceptance remain open. Exact source/run/hash evidence belongs in the post-build handoff, not an old green CI.

## NEXT-46 — Continue toward the complete modular reader objective

**Status: REQUIRED / NOT IMPLEMENTED BY NEXT-45.**

- Source-independent local identity and safe folder/CBZ ingestion, page/chapter inventory, progress retention, missing-media handling; do not advertise CBR/PDF until implemented and verified.
- Source enable/disable/remove and trust/update lifecycle, optional source-runtime packaging, stable arbitrary-source namespaces and native parity; review maintained extension hosts before adopting one.
- Recommendation retrieval/policy/ranking/generation/delivery ports; native pure tag and gesture domains separated from persistence/UI; cross-client golden/event-level tests and physical gesture evidence.
- Re-run the exact prior accepted Windows/Dev upgrade and rollback matrix as each module changes. Keep independent data roots and fixed Android signing continuity; no automatic uninstall/data migration or stable OTA operation.
- Consolidated real-device/provider/AI UX acceptance after integration. Keep #199/#200/#204 and all earlier P2/W5/NEXT evidence holds open until their actual criteria are met.

## NEXT-47 — Source-owned cover transport without Pica coupling

**Status: IMPLEMENTED_IN_ISOLATED_CANDIDATE / EXACT_HEAD_GATES_PENDING / REAL_PROVIDER_QA_PENDING. Not released or deployed.**

- Continues NEXT-46 from frozen `4230e66c3c86b470d17b9d463e55c649b60c380f`; previous complete handoff `PICA_MODULAR_LOCAL_READER_ACCEPTANCE_20261023_4230e66c3c86.zip`, SHA256 `b736ef3f76b2dcb76a4b2f645cccce147bdf82eaada69c2b33d4aa6717aa58fc`, remains unchanged. Prior engineering gates passed but full objective remains open.
- The prior static finding is confirmed: ProviderService sent all non-EH covers through PicaProvider.fetchPage and its login. Extracted existing Axios media code and pure URL/MIME policy into `src/media`, retaining the old library policy entry as compatibility re-export. Pica still owns its API/auth; JM public covers have their own credential-free media path without Pica/JM login or a JVM request. Cover routing uses the compiled source registry; unsupported routes never silently fall back to Pica.
- Retains URL/redirect/body/MIME boundaries, adds a total20s HTTP redirect-chain deadline, explicit proxy handling, no inherited API auth/header defaults and sanitized Axios errors. Pica/JM compiled adapter patch versions1.0.1; interface API1 remains compatible. This is not an untrusted-plugin/DNS egress sandbox claim.
- Corrected cover cache source identity to include account/session scope, serialize per-comic writers and reject changed-source results after asynchronous network or cached-file reads. No raw identity/URL is persisted in metadata. Existing cache entries refresh once; user library/feedback/downloads are not migrated.
- Added neutral-media/AST tests and actual local HTTP coverage with no Pica account; includes simultaneous cache readers and account changes during network/disk I/O. Added an actual Windows ZIP gate using only a synthetic PNG and a deny-all-except-fixture loopback proxy, retaining full success/forced-failure upgrade gates. Native code unchanged except candidate versionCode62 for fixed-signature continuity.
- Local ingestion is not claimed complete. Inspected Mihon's official local-source structure and recorded the next source-independent identity, bounded preview/copy, safe archive and progress-preservation requirements in `docs/SOURCE_MEDIA_BOUNDARY.md`. Existing local Reader/ZIP implementation is reused; no competitor/reference-APK code or new decompressor imported. CSV source/cover lossiness must be addressed before it can be an ingestion authority.
- No official profile, source credentials, production embeddings/mode, main merge, tag/Release, stable OTA, private-key download or deployment. Exact-source automated and actual-package results belong in the next handoff. Physical/native/provider/AI and source lifecycle/trust holds remain open.
- Pre-handoff review of first NEXT-47 source `e1b147f` added standard AbortSignal cancellation alongside Axios timeout so the deadline also covers connection establishment. The actual Windows fixture now deliberately withholds image response headers/body and requires the backend to terminate it. This is a bounded-operation gate, not a CI timing/performance-budget claim; the final source must be rebuilt and reverified.
- The actual archive gate at `33d2a2c` (run39942005009, Windows job120377444374) failed on the new JM-cover response while legacy/local gates passed. Static trace confirmed another real coupling: Desktop `applyCredentials` returned on null credentials before applying a saved public proxy. A source-free install saved proxy settings but did not use them. Extracted pure connection-environment construction; public proxy now applies without any credential file/Pica login, while secure proxy credentials remain separate. Added real Axios loopback-proxy and configuration regressions; retained actual response diagnostics and the failed source log. Rebuild exact head; do not accept or relabel33d2a2c.
