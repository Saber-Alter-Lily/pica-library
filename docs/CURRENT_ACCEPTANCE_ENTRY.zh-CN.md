# 当前集中验收入口

## 冻结的旧安装候选

`PICA_MODULAR_READER_CONSOLIDATED_ACCEPTANCE_20261024_9e879d3aa703_r2.zip`

SHA-256：`77c664ba48f824fea40d9e103853c8e172e2faf52a99fdae21eea6d5a518ddf3`。源码 `9e879d3aa7030d1fc49a92354f54bba0bd610074`，Android Dev82。它保持原样，不包含后续阅读器可靠性修复，不能改名充当新版。

## 本轮独立 Draft 候选

分支 `codex/reader-reliability-integration-20261025` 叠加在原冻结基线上；不修改 PR206，不合并 main，不发布、不改正式 OTA、不自动部署。新包必须由该分支的精确源码 CI 构建并校验后，才可提供给用户。CI 状态、实际源码 SHA、安装包 SHA 和固定签名证书以同轮独立验收回执为准，不能借用旧绿灯。

本轮包含账号可选/本地阅读引导、Web 输入/视口/进度模块修复，以及实例取得所有权后才初始化资料的保护。未完成恢复实现与新增 ZIP64 依赖不在候选中；不将其当作验收前置，也不删除原分支上的长期工作。

Windows 新包仍使用 `%LOCALAPPDATA%\Pica Library Post Stable RC` 隔离目录。完整解压到独立程序目录，准备测试后再自行启动；不覆盖正式程序，不复制正式数据库。Android 保留 `com.picalibrary.android.dev` 与既有固定签名，本轮构建权威为 Dev83；签名/版本拒绝时停止，不卸载、清数据或强行降级。本文不发布开发机绝对路径或私人配置。

## 阅读与数据边界

本地漫画无需账号或来源。在线来源由用户自行选择，软件不提供漫画内容。日常/高级引导可按需使用；推荐、画风和高级诊断不是阅读前置。不要上传 Cookie、密码、配对码、凭据、整库或漫画正文。

真实设备、浏览器、来源、手势、AI 返回方案、同步、实际覆盖升级/保留与质量验收仍分开记录“通过/失败/未执行/不适用”。自动测试或源码哈希不替代人工验收。完整中立来源、信任、原生/同步、资产来源与恢复等长期目标仍 OPEN。

本轮模块：[输入](WEB_READER_INPUT_MODULE.md)、[视口](WEB_READER_VIEWPORT_MODULE.md)、[进度](READER_PROGRESS_MODULE.md)、[整合范围](READER_RELIABILITY_INTEGRATION.md)。既有完整分组清单见 [NEXT_CONCENTRATED_ACCEPTANCE_CHECKLIST.zh-CN.md](NEXT_CONCENTRATED_ACCEPTANCE_CHECKLIST.zh-CN.md)。
