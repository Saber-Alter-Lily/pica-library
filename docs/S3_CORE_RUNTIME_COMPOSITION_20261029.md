# S3 CORE-LIB-04c-01｜原 Desktop 与无源 Core 共用正式本地服务组合（2026-10-29）

**开发位置**：[Draft PR #240](https://github.com/Saber-Alter-Lily/pica-library/pull/240)，叠加已经完成真实 Windows x64 完整 Web/Reader 双 Portable 的 [Draft #239](https://github.com/Saber-Alter-Lily/pica-library/pull/239)。此阶段依然未更改 `main`、v0.5.0 Release、OTA、现有用户目录、账号、签名与升级助手。当前不构造第二套漫画库、Reader、推荐或 WebDAV。

## 真实的生产架构改动

原生产 `src/library/server.ts` 与独立 `src/offline-core/qa-cli.ts` 分别零散地构造同一 `LibraryQueryService`、`ShelfService`、`ReaderService`、`LocalLibraryIngestion`，虽然调用的是同一旧实现，但在未来要让真实 Desktop 可不启动 `ProviderService` 时容易分歧。

新增 `src/library/core-runtime-composition.ts`：
- `createCoreLibraryPorts(database)` 只生成原 `LibraryQueryService`、`ShelfService`，持有同一个 `LibraryDatabase`，不导入具体 Provider/Host。
- `createCoreLocalRuntime({database,dataDir,externalFileOpener?})` 继续创建原 `ReaderService` 和 `CoreLocalImportController(new LocalLibraryIngestion(...))`；无 `ExternalFileOpener` 时 Reader 的操作系统打开行为原样拒绝。只有**可信 Desktop 主进程**可以显式注入已有 `ExternalReaderAdapter`，不可由来源插件或 HTTP 传入程序/文件路径。
- 模块运行时 import 仅原本地业务服务和原本地导入，不实例化 `LibraryService/ProviderService`、具体 Pica/E-H/JM SDK、签名 Host 或网络来源。

**真实生产调用链** `src/library/server.ts` 改为使用这个工厂构造全部原本地业务对象，然后再按旧有完整 Desktop 模式构造 Provider 相关组件，所有原 HTTP 路由/旧 JSON/Shelf 事件与本地 Reader 仍沿用同一对象。生产仍保留 `ProviderService` 作为旧全源 Desktop 的依赖，未宣称生产无源化完成。

**物理无源调用链** `src/offline-core/qa-cli.ts` 现在也使用同一 `createCoreLocalRuntime`，本机导入和 Reader 不再额外构造服务。受控 `qa-http.ts` 可以直接接收相同 composition 的 `libraryQueries/shelfService`；测试直接以数据库建 HTTP 时用 `createCoreLibraryPorts` 作为兼容注入，避免同一个 HTTP 入口复制业务查询/书架服务逻辑。

`scripts/build-offline-core-candidate.ts` 强制新的源中立工厂确实出现在物理 esbuild ESM 输入图，继续按原禁入规则拒绝 `src/providers`、`src/sdk`、`src/source-hosts`、`src/desktop` 与在线 Reader。

## 工程验收与实际回归

- 新 `test/unit/core-runtime-composition.test.ts` 用真实临时 SQLite + 合成 PNG 走原本地预览/确认→漫画目录→Reader 章节→Shelf create/add→真实 `LibraryQueryService` 结果；验证未修改原始图片、不注入 OS opener 时拒绝、注入可信 opener 后仍必须归属于当前 Library 根、源中立 TypeScript AST 导入闭包。
- 首轮 Windows 测试准确捕获 Windows Runner 的 8.3 短路径 `C:\Users\RUNNER~1` 与 `realpath.native` 归一化长路径 `C:\Users\runneradmin` 比对误判。此为新测试的期望问题，旧 Reader 的真实安全文件路径归属和规范化没有修改。修订提交 `d77a422cca1a7c116f80b5821eea2a37f3db0cec` 改为比较原 `fs.realpathSync.native(owned)`，未跳过测试/放宽 OS 文件访问。
- [Linux/Windows 原 Full-Web+Reader 双 Portable ZIP #40872173806](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40872173806) 于本文件初始登记时已 **SUCCESS**，从官方固定 SHA256 Node 实体启动/解压/重启恢复两种原网页/阅读器构型。
- [修订后 Linux/Windows 实际无源 ESM+Chromium #40872173707](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40872173707)、[完整原网页实际 Chromium #40872173639](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40872173639)、[Android/Web/Desktop 完整 CI #40872182323](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40872182323) 按精确修复 SHA 等待最终状态；不能凭某一专项的 PASS 提前将整项 G2 关闭。
- [上一轮 CORE-LIB-04b-03 双变体 Windows Zip #40870550859](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40870550859) 与其对应的 [Android/Web/Desktop 全量 CI #40870561582](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40870561582) 均已 SUCCESS，是本轮共用组合改造的受控基线。

## 依然存在的生产启动阻断

这个 slice 的实质是**同一个正式本地业务 composition 已为完整 Desktop 和无源物理 Core 共同使用**，但仍不是一个真实可覆盖老用户 v0.5.0 的完整无源安装包。

- 原 `src/desktop/main.ts` 的 `startEngine` 依然调用 `new LibraryService(database, dataDir,...)`，然后构造 Host/账户/推荐、WebDAV 与更新环境。
- 原生产 `src/library/server.ts` 依然调用 `options.service.providerService()`，并初始化在线 Reader、预览、视觉服务与 recommendation session。它还在若干显式来源/维护/同步路由中直接调用 `options.service`。
- 所以真正 `CORE-LIB-04c-02` 必须通过独立、可关闭的 Provider runtime factory / 独立服务 port 接口，让原**生产**入口在 `kind:'source-free'` 时无需创建任何具体来源对象，即实际替换 `LibraryService/ProviderService` 的强制启动，而不是复制另一套 Server 或伪造在线接口。
- 在不接触正式用户数据前应先做完整 Windows 进程和 OS 路径/文件锁/多实例/升级预检、原 `web/index.html` 和已有 WebDAV 受控平台服务的组合验收。签名插件生命周期和真实 source SDK 移除、Android 无源APK/Service/Binder、v0.5.0 老库/账号/历史/下载安全升级与回滚、G1 真机视觉以及原 42+12 案例仍待做。#232/#233 为分叉的书架实现，应单独裁决再合并。

**G1–G4 均 OPEN**；所有这批 PR 保持 Draft、未合并、未发布、未更新 OTA。
