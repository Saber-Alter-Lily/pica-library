# Pica Library 项目版本日志

本文件只记录版本的核心能力演变，不记录纯文案、微小样式和一次性修复。

## v0.4.0 — 多来源与统一语义

- Pica 从唯一在线来源升级为多来源架构。
- E-Hentai 成为第二个核心 Provider，支持公开搜索、详情、在线阅读、下载和云收藏。
- ExHentai 保留为 E-H 账号下的可选能力；状态探测失败不影响 E-H 和推荐。
- E-H 标签保留 namespaced canonical identity，并接入 EhTagTranslation 中文显示和中文反查。
- Pica 与 E-H 收藏共同构成推荐画像；不同 Provider 保留各自最适合的召回语法。
- E-H 增加 Latest、Popular、Favorites、Watched、Categories、Toplists 和高级筛选。
- E-H 云收藏升级到 10 个原生收藏槽，并保留分类名与 note 数据。
- 书库筛选重构为“存储位置”和“内容 Provider”两个正交维度。
- 建立统一作者 Concept / Provider Binding；详情页支持作者目录和跨来源作者作品。
- 恢复阅读历史，并升级为 session ledger；支持时间范围、指定日期和具体页码恢复。
- Android 主导航稳定为“书库 / 推荐 / 在线 / 设置”。
- Web/Desktop 对齐 Android 的多来源、E-H 浏览、作者导航、阅读历史和 Provider 筛选逻辑。

## v0.3.14 — 多 WebDAV 与移动端成熟化基线

- 支持多个 WebDAV 目标并切换当前远程存储。
- Android 形成独立 Dev / 正式包身份和正式更新链。
- Desktop 与 Android 的本地数据继续与程序版本分离。
- 阅读、存储、主题、账号与更新入口进一步统一到产品化页面。

## v0.3.9 — GitHub Star 验证稳定化

- 修正 GitHub Star API 的 HTTP 204 成功判定。
- 个性化能力的 Star 状态验证不再把成功响应当失败。

## v0.3.8 — 账号与个性化解耦

- GitHub Device Flow 进入正式账号路径。
- Desktop 与 Android 的当前主题选择解耦；主题包可以同步，但不强制两端启用同一主题。
- E-H / Pica 等后续 Provider 账号架构开始从单站按钮向统一账号与来源中心演进。

## v0.3.5 — 应用内更新稳定化

- Windows 更新器补齐代理和官方 Release 下载兼容。
- 修复失败后仍显示“更新完成”等错误状态。
- 本地 ZIP 更新、官方检查、下载校验、应用与重启形成同一更新流程。

## v0.3.0 — 统一书库

- 从单纯下载工具升级为以漫画为中心的统一书库。
- 收藏、下载、书架、Desktop、本地和 WebDAV 状态开始收敛到同一 comic record。
- 增加后端 Library Query / facet，筛选结果、计数和批量操作使用同一查询语义。
- 推荐、在线发现和阅读不再各自维护独立漫画身份。

## v0.2.x — Desktop 本地优先架构

- 建立 SQLite 本地资料库、收藏同步、作者规范化、标签和分类索引。
- 增加持久化下载队列、并发控制、失败恢复和本地阅读。
- 增加书架、下载状态、维护任务、Web UI 与 Desktop bridge。
- 建立官方增量更新包、更新 manifest、回滚和发布校验基础设施。

## v0.1.x — 项目起点

- 基于上游 `pica-cli` 能力建立 Pica 登录、搜索、收藏读取和下载基础。
- 从命令行下载流程逐步扩展为长期收藏管理项目。
