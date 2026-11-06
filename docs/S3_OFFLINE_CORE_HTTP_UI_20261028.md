# S3 CORE-HTTP-UI｜无来源本地核心的真实浏览器阅读验证（2026-10-28）

**版本线：Draft PR #228，叠加 #227。正式 main/v0.5.0/Release/OTA/Android 安装签名/用户数据库未改。** 这一批只在一次性 QA 目录运行无来源 Node 核心，不是正式 Windows 启动器、完整桌面 Web UI 或 Android APK。

## 已实现：同一 Reader 和真实浏览器

- `src/offline-core/qa-http.ts`：仅由含严格 QA sentinel 的独立本地核心通过 `serve --root ABS` 明确启动；固定绑定 `127.0.0.1` 的随机端口，不启动在线源、Host、推荐、账户、插件或更新器。
- 实际复用 `src/reader/local-http-read.ts`，提供既有 GET `/api/v1/reader/comics/:id/chapters`、单章节、`pictures/:id` 和 `/api/v1/reader/progress`。只有 QA 专用本地 catalogue 投影与旧 `ReaderService.saveProgress` 的受保护 POST；数据库和漫画图片读取逻辑完全共用旧实现。保留本地图片 `?v=<SHA-256>` 修订参数、MIME、content-length、no-store 和 nosniff。
- `web/index.html` 中原 `section#reader` 节点在测试时按原文截取并组合，保留旧 Reader 顶栏、章节侧栏、页面容器和控件；网页使用既有 `styles.css`、`alpha8-6.css`、`ui-polish-v5.css`，脚本 `web/offline-core-reader-qa.js` **直接导入既有** `reader-viewport.js`、`reader-input.js`、`reader-progress.js`、`reader-settings.js`。仅添加只读测试书库选取与页面状态接线。旧 `web/app.js` 和正式 setup、推荐、下载、来源界面未被替换或复制。
- 安全限定：256 位随机能力入口 `/qa/:secret`，HttpOnly+SameSite=Strict 会话 Cookie；固定 Host 必须与实际回环监听端口匹配且远端只能是 loopback；拒绝跨站 Sec-Fetch-Site；写入进度需当前 Origin 与单独 256 位 CSRF token；静态只允许 9 个已审计的脚本、样式、logo 资源；CSP、禁止嵌入、无 Referer、无 CORS、no-store；不得访问其他任何在线来源/第三方 API。
- QA 目录必须事先不存在并显式 `init --confirm-disposable`；`serve` 前再次验证 QA sentinel 和数据库文件，不碰正式用户资料；浏览器只有测试目录已有本地文件夹/CBZ 和原有 Reader 状态。源码依赖闭包仍由 esbuild metafile 校验，禁止 Pica/E-H/JM SDK、Desktop、Host、在线 Reader/ProviderService 混入单个本地核心 ESM。无用户可下载的二进制工件。

## 实际证据

- `test/unit/offline-core-http-ui.test.ts`：真实构建 ESM、启动不同 Node 进程，使用合成 PNG 文件夹；浏览器入口 Cookie 和原 Reader HTML；本地收藏、章节、图片完整字节、`?v`；写入及读回同一阅读进度；无 Session、CSRF、伪造 Host、跨站头、越界页码和非目标来源路径均拒绝。原有 CBZ/文件夹/SQLite 重启测试继续运行。
- [S3 实体专项 #40826346306](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40826346306) **SUCCESS**（精确代码 `87f142b305fd051f8006d94ad23e46f44c49e794`）：Linux 6 文件/31/31，Windows 6 文件/31/31，TS 两平台通过。
- 在同一 Actions 中额外运行真实 Playwright Chromium 1.63.0：[browser-ui-qa](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40826346306) **SUCCESS 1/1**。`test/e2e/offline-core-reader.spec.mjs` 实际进入 Web Reader、加载已有图片、切换单页、键盘翻页、持久化到 SQLite、整页重载再读回，并检查无前端异常与外部 URL 请求。测试工件/照片全为短期合成数据，不使用个人书库。
- 当前代码的 [全项目 CI #40826350952](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40826350952) 在编写时仍在运行，不能提前判定全绿。后续必须以实际 SHA 与 Android/Web/Desktop 最终作业结论为准。

## 阶段门禁

| 工作项 | 状态 |
|---|---|
| S3-CORE-HTTP-01 本地核心保留旧 Reader API + 隔离本机安全边界 | **QA PASS** |
| S3-CORE-HTTP-02 原 Reader DOM/CSS/翻页/进度真实浏览器操作 | **Chromium QA PASS** |
| S3-CORE-HTTP-03 全功能正式 Windows Web UI 在零来源时运行 | **NOT_IMPLEMENTED**，当前只有只读 QA 入口 |
| S3-CORE-HTTP-04 Windows 纯核心正式 ZIP/启动器和许可证、安全升级 | **NOT_IMPLEMENTED** |
| S3-CORE-HTTP-05 受保护签名来源安装、独立升级与服务 ACL | **NOT_IMPLEMENTED** |
| S3-CORE-HTTP-06 Android 物理无源 APK、Binder/Service | **NOT_IMPLEMENTED** |
| S3-CORE-HTTP-07 v0.5.0 旧书库/账号/下载/阅读进度迁移+一键更新/故障回滚 | **NOT_VERIFIED** |
| G1 手机 UX、G2 生产来源外置、G3 升级、G4 发布 | **OPEN** |

下一步按原优先级先**缩小完整桌面 Web 状态管理和来源服务的耦合**，在保持本地书库/CBZ/WebDAV 与既有 UI 一致的前提下让完整 Windows 核心真正不启动 ProviderService；之后才是生产信任根、官方 Windows 安装包和 Android 隔离组件，均需旧版无痛升级及真机验收。**不得把临时 Node 回环服务称为生产 OS 沙箱、正式用户版或完整 G2 PASS。**
