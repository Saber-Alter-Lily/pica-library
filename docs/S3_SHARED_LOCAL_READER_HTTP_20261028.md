# S3 CORE-HTTP｜共享原有本地 Reader HTTP GET 路由（2026-10-28）

**状态：Draft PR #227 / 工程重构，尚未发布。** 基于 #226 已通过双系统的实际零来源本地核心，继续缩小正式 Desktop 与纯 Core 的实现差异；不改 main、正式 v0.5.0、用户原库、Android APK、OTA 或 Release。

## 实际耦合点及改动

原 src/library/server.ts 既构造有来源/账号等依赖的 LibraryService/ProviderService，又直接内联本地 Reader 的章节、章节页、图片、最近进度 GET URL 解析。纯核心虽然能无来源读取文件夹/CBZ，却无法不加载这个完整 HTTP Server 来获得同一 Web Reader 的入口。

本批把**原有 GET 执行部分**抽到 src/reader/local-http-read.ts：仅 import type ReaderService（运行时零导入），接收已由调用方完成认证的 URL pathname 和 ReaderService 的狭窄只读端口，返回 JSON 数据或图片二进制/缓存策略。路径不变：

- GET /api/v1/reader/comics/:comicId/chapters
- GET /api/v1/reader/comics/:comicId/chapters/:episodeId
- GET /api/v1/reader/pictures/:pictureId
- GET /api/v1/reader/progress

原 server.ts 仍负责现有请求来源、CSRF/安全、HTTP 状态码和响应写入，图片保留原有 MIME、content-length、x-content-type-options=nosniff、local 前缀 no-store / 历史其它文件 3600s 等行为；对未知路径返回 null，由旧服务继续判断。**POST progress、用户行为事件、export ZIP/CBZ、open-default 均保持原来的代码和权限检查，没有迁移/改写。**

现在隔离的 src/offline-core/qa-cli.ts 也经同一 localReaderGet 函数读取章节、图片和最近进度，消除了先前 QA 入口与生产 HTTP GET 的两份独立执行逻辑；现有 ReaderService/SQLite/CBZ 导入器从未复制。

## 测试证据

- test/unit/local-reader-http-read.test.ts 验证旧 URL 及 percent 解码、JSON/图片、local/legacy 缓存头策略、非目标在线/Host/签名路由不被误接管、错误编码 fail-closed 和实际 AST 导入边。原有 source-free bundle 构建器 now requires src/reader/local-http-read.ts in the compiled output.
- 在最新 [S3 跨系统 #40821561989](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40821561989)，精确代码 34b5705030d69e3b13db483ba2c3654bd1ea1d95，**Linux 5 文件/30 项 PASS、Windows 5 文件/30 项 PASS，两端 TS 校验通过**。还实际执行此前本地文件夹/CBZ/图片与阅读进度跨进程验证。
- [完整项目 CI #40821583070](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40821583070) 记录时仍执行中/NOT_VERIFIED；专项通过不代表 Windows 原服务 HTTP 全链路与 Android 正式客户端验收完毕。

## 未关闭的阶段门禁

| 条目 | 状态 |
|---|---|
| CORE-HTTP-01 本地 GET 路由复用，依赖中立、旧契约回归 | 隔离 Draft + 双平台专项 PASS |
| CORE-HTTP-02 在无来源 Windows 服务中真实启动同一 UI 和 HTTP 原路由 | **NOT_IMPLEMENTED** |
| CORE-HTTP-03 现有 Desktop main/server 脱离 LibraryService/ProviderService 来源依赖 | **NOT_IMPLEMENTED** |
| CORE-HTTP-04 稳定 Windows 安装/更新及旧用户账号/下载/阅读无痛迁移 | **NOT_VERIFIED** |
| CORE-HTTP-05 Android 来源独立进程 + 纯核心 APK | **NOT_IMPLEMENTED** |
| G1–G4 / NEW-SRC-01 / 正式发布 | **OPEN** |

下一实施方向：围绕现有 Web Reader 契约继续将可复用的只读路由与源相关启动组合分离，并以可实际启动、可回滚且不触碰旧用户目录的 Windows 实体测试候选验证。禁止把抽出本地 GET 函数冒充完整版 Windows 纯核心或认为任何第三方用户自行加源都自动免责。
