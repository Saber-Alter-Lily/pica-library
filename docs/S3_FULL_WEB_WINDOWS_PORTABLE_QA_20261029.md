# S3 CORE-LIB-04b-02/03｜旧正式完整 Web 与 Windows x64 无来源实体 QA（2026-10-29）

**工作位置**：[Draft PR #239](https://github.com/Saber-Alter-Lily/pica-library/pull/239)，分支 `codex/s3-full-web-assets-20261029`，叠加已通过旧 Web 初始化门禁的 [Draft #238](https://github.com/Saber-Alter-Lily/pica-library/pull/238)。本技术交付仅为 source-only、unpublished 的隔离工程候选。正式 `main`、v0.5.0 Release、OTA、Android 签名、真实书库/账号/凭据均未改动。

## 为什么需要这一轮

原 `web/index.html` 有**完整**首页、书库、书架、阅读器、设置，原 `web/app.js` 负责初始化、书库分面、书架 CRUD、Reader 与设置操作。此前独立 Core 的 QA HTML 只有原 Reader DOM 片段，虽然本地 SQLite/书架/Reader 已可运行，但不能证明原用户完整网页在没有 `ProviderService` 的环境可工作。因此本轮优先复用原 UI、原 API、原数据库及既有 Node/esbuild/Playwright，而不是创造另一套前端/Reader。

## 已落地的正式代码与 QA 组成

1. **原全网页资源图**：新增 `scripts/stage-offline-full-web-qa.ts`。取现有 `web/index.html` 的所有原视图和经审核顶层入口（`app.js`、`info-tip-v1.js`、`alpha7-cloud.js`、`ui-polish-v5.js`），用仓库已有 TypeScript AST 递归跟踪 ES 模块静态/已审核动态 import。CSS/图标源于原文件，不自写第二套页面。排除单独加载的 Pica/E-H/JM 登录/来源管理启动 JS、站点特定源逻辑与非必要 AI 推理 Worker。临时目录必须在 OS Temp 内且不存在；源文件需非软链、非重复硬链接，文件哈希回读，原 HTML 完整性/五个视图检查。
2. **真实前端启动依赖修复**：原 `web/app.js` 的 `analyzeVisualSamples` 改为显式点击画风分析任务后惰性 `import('./visual-runtime.js')`，不在普通本地阅读启动时下载模型或创建 Worker。加载到原应用内的 Host Library 函数继续复用，排除其重复顶层初始化。原 `post()` 仅在临时 QA 入口注入元标签时增加 `x-pica-qa-csrf`；正式旧 Desktop 路径不变。
3. **严格本机 HTTP**：`src/offline-core/full-web-qa-assets.ts` 在开放端口前对 staged manifest 的文件名、内容大小、SHA256 和已有审计入口全量验证；没有任意路径/站点 JS 授权。原 `qa-http.ts` 在旧随机 `/qa/<token>` 的 Cookie 认证后，才允许同一 loopback 地址加载完整原 `index.html`、静态资源和旧 `/status`、`/capabilities`、`/authors`、`/comics`、`/library/query`、`/shelves`、`/reader`。无来源 Query 限为本地 `local:<64hex>`；原首页所需 5000 项窗口只在**明确 full-Web QA** 允许，原 Reader QA 保持最多 100。原 CSRF/同源/Host 防护保留，无 Cookie/跨源写入失败。
4. **实体原 UI**：`scripts/qa-offline-browser-harness.ts` 的 `PICA_QA_FULL_WEB=1` 使用同一真实物理 Core/SQLite/已审核原网页，而非新的 mock 应用。旧 Reader-only QA 启动器保持默认不变。
5. **Windows x64 官方 Node ZIP 两种模式**：沿用 `scripts/build-windows-offline-portable-qa.ts` / `verify-windows-offline-portable-qa.ts`、原 `.cmd` 启动器、固定 Node 24.15.0 x64 官方归档 SHA256 `cc5149eabd53779ce1e7bdc5401643622d0c7e6800ade18928a767e940bb0e62`、Node/AdmZip/项目许可文件清单；新增明确 `--full-web` 模式，保留无参数时旧 Reader-only 模式。两套 ZIP 只在 Actions 临时 OS 目录生成，禁止上传可执行包。ZIP 物理解压后由**随包 `runtime/node.exe`** 执行原 catalogue/Reader/书架 HTTP、Host/CSRF、全原网页静态资源、进度及书架在完整临时 CMD/Node 进程树退出后重新恢复。

## 真实通过的证据与早期失败

- 初期准确捕获原网页单独加载 `host-library.js` 与主 `app.js` 重复初始化、以及 `visual-worker.js` 使用动态 `runtime.libraryUrl` 进入不允许的 AI/外部源加载；没有把未知动态导入放行，而是去掉重复的独立入口并仅在用户显式发起画风任务后加载原推理模块。早期 CI FAIL 原样保留。
- [实际原完整网页资源闭包双系统专项 #40868559838](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40868559838)：SUCCESS。
- [原完整网页 protected HTTP、SQLite、原 Reader 回归双平台 #40869094570](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40869094570)：SUCCESS。
- [原正式完整网页 Chromium 真实 E2E + 双平台专项 #40869551499](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40869551499)：**3 JOBS SUCCESS**。Chromium 从原 UI 实际进入首页/本地库，筛选合成漫画、创建书架、访问真实 Reader/设置，检测页面脚本错误与非本机请求。
- [同代码完整 Android/Web/Desktop #40869749947](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40869749947)：SUCCESS；后续 Windows ZIP 增补提交的全 CI 应按精确新 HEAD 另核。
- [Windows 官方 Node 实际 extracted Portable QA 双变体 #40870550859](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40870550859) 在精确代码 `28bd5d07ef7f9d59b19ff936be93652bacfd8164` 上 **Reader-only 与 Full-Web 两项均 SUCCESS**；双变体的真实目录隔离、官方运行时 SHA、原 SQLite/网页路径、书架/阅读进度重启、无源规则均按工作流验证。
- 精确 Windows 双变体代码的 [完整 Android/Web/Desktop CI #40870561582](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40870561582) 在此文初次编写时**尚未完成**，不得把以前绿色 run 冒称此 SHA 成功。

## 当前仍不可宣称

**完整原网页在隔离 QA 进程实际可用 ≠ 正式 Windows 主程序已不包含来源 SDK，也 ≠ 用户可无痛一键升级**。

正式 `src/desktop/main.ts` 仍构造旧 `LibraryService`，生产 `src/library/server.ts` 仍强制实例化 `ProviderService` 及在线推荐/下载相关服务。WebDAV UI 目前只证明原页面与无账号状态显示，其真实用户网盘配置、同步、权限/秘密安全及离线能力还没有在生产无源安装包逐项完成。当前 Windows QA 的 `.cmd` 不是签名桌面 launcher 或原升级助手。

**下一阻断优先级 CORE-LIB-04c**：沿原 Core 业务 API 和这次确实运作的完整 Web/UI/SQLite，拆出真正正式 Windows 启动 composition（可选择纯核心或附加可信来源），明确处理主配置、保存目录、导入文件系统权限、原 WebDAV 与下载/推荐子模块失效语义；对完整可安装程序物理源码/依赖闭包、单实例与生命周期做真实 Windows 验证。然后是 Android source-free APK + Service/Binder、可信来源签名/装卸与受控升级、老 v0.5.0 数据/偏好/漫画和一键升级/回滚、手机 UI 真机及原 42+新增12 案例集中验收。

**所有 G1–G4 仍 OPEN；不可合并或发布**。#232/#233 是分叉的书架实现，当前主工作依赖 #233，正式集成前需做差异裁决。外部来源不自动免除发行者版权/法律/网站条款义务。
