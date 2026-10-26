# 当前集中验收入口

## 当前权威状态 — 2026-10-26

先读[总推进与验收账本](LOCAL_READER_DELIVERY_LEDGER.zh-CN.md)。它统一阶段、42 个案例、精确源码和剩余缺口；下面 Dev82/83 是保留的历史记录，不再作为当前构建指引。

- 最近云端已执行源码为 PR212 / 6efc865fd229660f77929ebe2018b494fc198995；运行 40305007546 已结束且整体失败，不是等待构建。六个事务均在最终非预期外联断言失败，仍需请求归因，不能改记 PASS。
- 后续本地修复为229330e85657f6fdee54d5ec5620c91330b74ccb：[翻译请求边界](SOURCE_IDLE_TRANSLATION_FIX.md)。默认启动外联已在完整脚本离线复现并修复，54项定向回归/类型/Web语法通过；未推送或云端重验，不能据此改判 PR212 结果。
- 用户已确认旧版首次可用独立迁移入口，此后仍在软件内一键更新。路线固定复用现有新helper；不能使用旧PowerShell fallback代替。T1/T2已有本地实现，T3真实分发/Windows迁移仍NOT_RUN。具体证据见总账本，不要现在运行迁移助手。
- 当前本地源码7a81e12f53685a1edfc221c97f92766906bd1ae1，接通Desktop自选Host选章→单独保存许可→现有队列/资源配额→本地库存→同一Reader。可在Host面板看进度/取消/读完整副本；初始浏览不授权保存，任务不持久化或重启自联网。统一下载入口投影、Android和成品实联仍缺，native明确false；没有新扩展引擎、schema或默认内容目录。
- 当前源码31文件/453项组合定向回归、完整类型及Web54语法通过；新增服务17项、实际UI惰性DOM8项，12轮离线边界审计0事件。临时SQLite/合成图片证明完整副本断源重开和进度；并非浏览器/Windows成品/真实Host证据。新增实际HTTP用例仅已编写/类型检查，可信实包迁移、真实旧版首跳及Host互操作未执行，不是已交付安装包，也不是让用户现在测试；旧版原始失败不变。
- 最近完整封存的 Windows/Android 安装产物属于 PR211 / e9b08b418c2fdbc55dbf499afb74f7b927b12434 / Dev87。它仅是 PARTIAL 审阅候选，不含尚未完成的完整接源和旧正式版恢复结论，不能改名充当新源码包。
- 本轮有上述本地边界修复与文档/证据，没有生成新安装包、提升 Android 版本或更改签名。用户暂不开始新一轮测试；不覆盖 G 盘、正式程序或正式资料。
- 正式 v0.5.0、main、Release、OTA 和旧冻结候选保持不变。后续只交付一个明确源码和能力矩阵的集中候选；下载诊断中的合成夹具不可安装。

## 历史记录 — 冻结的 Dev82 安装候选

`PICA_MODULAR_READER_CONSOLIDATED_ACCEPTANCE_20261024_9e879d3aa703_r2.zip`

SHA-256：`77c664ba48f824fea40d9e103853c8e172e2faf52a99fdae21eea6d5a518ddf3`。源码 `9e879d3aa7030d1fc49a92354f54bba0bd610074`，Android Dev82。它保持原样，不包含后续阅读器可靠性修复，不能改名充当新版。

## 历史记录 — Dev83 独立 Draft 候选

分支 `codex/reader-reliability-integration-20261025` 叠加在原冻结基线上；不修改 PR206，不合并 main，不发布、不改正式 OTA、不自动部署。新包必须由该分支的精确源码 CI 构建并校验后，才可提供给用户。CI 状态、实际源码 SHA、安装包 SHA 和固定签名证书以同轮独立验收回执为准，不能借用旧绿灯。

本轮包含账号可选/本地阅读引导、Web 输入/视口/进度模块修复，以及实例取得所有权后才初始化资料的保护。未完成恢复实现与新增 ZIP64 依赖不在候选中；不将其当作验收前置，也不删除原分支上的长期工作。

Windows 新包仍使用 `%LOCALAPPDATA%\Pica Library Post Stable RC` 隔离目录。完整解压到独立程序目录，准备测试后再自行启动；不覆盖正式程序，不复制正式数据库。Android 保留 `com.picalibrary.android.dev` 与既有固定签名，本轮构建权威为 Dev83；签名/版本拒绝时停止，不卸载、清数据或强行降级。本文不发布开发机绝对路径或私人配置。

## 阅读与数据边界

本地漫画无需账号或来源。在线来源由用户自行选择，软件不提供漫画内容。日常/高级引导可按需使用；推荐、画风和高级诊断不是阅读前置。不要上传 Cookie、密码、配对码、凭据、整库或漫画正文。

真实设备、浏览器、来源、手势、AI 返回方案、同步、实际覆盖升级/保留与质量验收仍分开记录“通过/失败/未执行/不适用”。自动测试或源码哈希不替代人工验收。完整中立来源、信任、原生/同步、资产来源与恢复等长期目标仍 OPEN。

本轮模块：[输入](WEB_READER_INPUT_MODULE.md)、[视口](WEB_READER_VIEWPORT_MODULE.md)、[进度](READER_PROGRESS_MODULE.md)、[整合范围](READER_RELIABILITY_INTEGRATION.md)。既有完整分组清单见 [NEXT_CONCENTRATED_ACCEPTANCE_CHECKLIST.zh-CN.md](NEXT_CONCENTRATED_ACCEPTANCE_CHECKLIST.zh-CN.md)。
