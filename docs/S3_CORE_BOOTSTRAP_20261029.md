# S3 CORE-LIB-04a｜正式 Desktop 状态、作者与能力声明接口的无源启动基础（2026-10-29）

**分支 / Draft：** `codex/s3-core-bootstrap-20261029` / [#237](https://github.com/Saber-Alter-Lily/pica-library/pull/237)，叠加已通过 CI 的 [CORE-LIB-03c #236](https://github.com/Saber-Alter-Lily/pica-library/pull/236)。正式 v0.5.0、`main`、Android 正式签名、用户数据库/下载/设置、OTA 与 Release 均未变更。

## 从正式代码中提取真实初始化接口

| 原正式 URL | 旧实现 | 本轮共同端口 |
|---|---|---|
| `GET /api/v1/status` | 原 `src/library/server.ts` 直接读取 SQLite summary/reconcile、同步进度 | `coreBootstrapStatus(database, favoritesSyncProgress)`；生产值/字段不变 |
| `GET /api/v1/authors` | 原 `database.listAuthors()` | `coreBootstrapAuthors(database)`，使用同一旧作者身份/别名/编辑状态 |
| `GET /api/v1/capabilities` | 原 `appCapabilities` + 具体 Provider status/module/source policy | `coreBootstrapCapabilities({kind:'provider-enabled',...})`，保留全部旧值和结构 |

新 `src/library/core-bootstrap-read.ts` 仅运行时导入项目已有 `PRODUCT_VERSION` 与 `appCapabilities`，通过 `import type` 获得旧 `LibraryDatabase` 的读端口，不创建来源实例，不操作源账户，不发起网络或复制用户数据库。

同一类型安全的 `kind:'source-free'` 分支仅为已真正具备的本地目录/书架/Reader 声明能力：具体 Provider 状态为空、来源列表为空、收藏远端修改和在线推荐/画像/预览默认不可用；不能通过 UI 误报为“所有来源已安装”。它未实现在线模块/推荐替代算法。

## 实际无源实体与安全控制

- 原 `src/offline-core/qa-http.ts` 在现有随机一次性入口、HttpOnly Cookie/固定 Loopback Host、CSP/同源/CSRF 框架之后，现在同时提供**原正式路径**的 `status/authors/capabilities` GET，而不是 `offline-qa` 自定义替身。未经 cookie 验证依旧 403。仅处理 Disposable Sentinel SQLite，不读取 v0.5.0 用户目录。
- `scripts/build-offline-core-candidate.ts` 的物理 `esbuild` 输入闭包强制包含 `src/library/core-bootstrap-read.ts`、`src/app-capabilities.ts`、`src/version.ts` 与 `src/modules/contracts.ts`；仍禁止 `src/sdk`、`src/providers`、Desktop/Host/在线 Reader 等运行时导入。没有允许外部来源代码加入。
- 项目正式 `src/version.ts` 引用根 `package.json` 的版本元数据，触发原无源构建“只能有 AdmZip 依赖”的严格检查。**首轮真正失败**：[Linux/Windows #40858854790](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40858854790)、[Windows Portable #40858861108](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40858861108) 明确拒绝 `package.json`；并非来源 SDK 意外混入。
- 修复提交 `812755988c30f34da87245b2a296626ffebe649c` 精确只允许**项目根 `package.json`** 作为原版本号的静态元数据，要求实际 `src/version.ts` 同时存在，允许的第三方可执行代码仍**只有已审计 AdmZip**；其它 npm、其它 JSON/二进制及 Host 继续报错。同步添加测试核对。
- [修后 Windows x64 官方 Node Portable ZIP #40859105359](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40859105359) **SUCCESS**：真实 ZIP/启动器、官方 Node SHA、受控进程及原 Reader/书架等重启路径均按工作流通过。可执行包只在 CI 临时目录产生，不上传给用户。
- [最新 Linux/Windows 真实 source-free 核心及 Chromium #40859128504](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40859128504) 在初始记录时 Linux 已 PASS、Windows/Chromium 仍在运行；[完整 Android/Web/Desktop CI #40859135753](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40859135753) 仍待最终判定，**不预设通过**。

## 需要继续的真正完整 Windows 产品工作

分析原 `web/app.js` 的 `detect()`，旧正式 UI 除上述 3 项还主动访问 `/api/v1/desktop/status`、`/api/v1/comics`、`/api/v1/library/query`、`/api/v1/recommendation-sessions/status?mode=final` 等；以往无源 QA Web 仅装配原 Reader 片段，不装配完整首页。即使本轮三个启动接口可调用，也**不意味着**正式完整 Web 首页已能够从无源核心展示。

**CORE-LIB-04b 优先级：** 复用原 `web/index.html`、`web/app.js` 和语言/样式模块，在 core-only 能力关闭在线来源/推荐时仍能完整打开首页、书库、书架、Reader、设置和受限 WebDAV；不复制完整 UI 另一份，也不得通过合成“正在推荐”或虚假 API 响应绕过真实功能缺失。需做实际 Chromium 可见/交互测试、Windows Portable 启动同一网页资产、严格排查静态资源闭包和网络请求白名单。

**CORE-LIB-04c：** 原 `src/desktop/main.ts`、`src/library/server.ts` 真实进程组合不再强制构建 `LibraryService/ProviderService`，单一完整本地服务，兼容已有数据库/偏好/阅读记录；真正检查生产安装包从可执行图中清除来源 SDK。

其后才是可信签名来源安装与更新撤销、Android 隔离 Service/Binder + 无源核心 APK、旧 v0.5.0 无痛升级/回滚、真实设备/用户所有历史用例的集中验收。

**不可错误关闭：** G1/G2/G3/G4 全部 OPEN；#232 与 #233 是不同实现的书架重构竞争分支，当前连续集成开发依赖 #233，合并前需要单独冲突审阅；没有合并 main 或正式发布。
