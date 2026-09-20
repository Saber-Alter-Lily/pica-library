简体中文 | [English](README.en.md)

# Pica Library

Pica Library 是一个面向长期漫画收藏的本地优先管理、发现、下载与阅读工具。

Windows 负责完整管理与下载。Android 负责移动阅读、在线发现和远程访问。Web/Desktop 与 Android 使用一致的内容来源、收藏画像、推荐语义和阅读逻辑，但按各自屏幕重新组织交互。

## v0.4.1 本次更新

- **Android 顶层导航**：书库、推荐、在线、设置统一在同一主页面切换；在线与设置不再触发明显的 Activity 跳转。
- **Android 流畅度**：推荐画像、人工调整改为后台读取；推荐证据、Portable 候选与策略状态加入缓存，减少重复 JSON 与整库读取。
- **推荐批次**：Desktop 复用同一 cycle 的冻结候选快照；Android 只重绘当前 12 本，上一批 / 下一批切换显著减负。
- **画风推荐**：作为独立可开关模块；关闭时不影响常规推荐。提供轻度、标准、强三档影响强度。
- **画风索引**：保留现有 DINOv2 Patch Mean 索引，并为后续版本在同一次推理中附加 compact CLS / Patch Mean 双视图数据。
- **阅读体验**：章节末尾提供明确的下一章入口；阅读历史按漫画聚合，保留章节进度与封面。
- **移动端层级**：折叠分组、子分组和具体选项使用不同字号、颜色与背景，减少层级混淆。
- **正式分发**：Windows 从 v0.4.0 升级 v0.4.1 采用完整应用替换，用户数据目录保持独立并保留；Android 正式包升级到 versionCode 43，包名与签名保持不变。

完整版本演变见 [PROJECT_LOG.md](PROJECT_LOG.md)。

## 主要功能

### 书库

- **书库 → 搜索**：按标题、作者、标签和分类查找已纳入书库的漫画。
- **书库 → 筛选**：按本机、Desktop、WebDAV、在线可读状态和内容来源筛选。
- **书库 → 作者 / 标签 / 分类**：使用统一 facet 筛选，不按站点重复显示同一条目。
- **书库 → 书架**：建立本地分组；删除书架不会删除漫画文件或远端收藏。
- **书库 → 阅读历史**：按今天、7 天、30 天、全部或指定日期查看并继续阅读。
- **书库 → 显示**：列表与多档网格独立切换。

### 在线

- **在线 → 全部来源**：同时发现 Pica 与 E-H 内容；ExH 可用时作为额外扩展。
- **在线 → Pica**：搜索、收藏、排行榜和分类。
- **在线 → E-Hentai**：游客即可搜索和阅读公开 Gallery。
- **在线 → E-H 浏览**：最新、热门、云收藏、关注、分类和 Toplists。
- **在线 → E-H 筛选**：分类、语言、包含/排除标签、评分和页数。
- **在线 → ExHentai**：入口和能力检测始终保留；当前不可访问不会阻塞 E-H 或推荐。

### 中文标签与语义

- **E-H 标签显示**：使用 EhTagTranslation 提供中文显示和中文反查。
- **E-H 数据层**：始终保存 `namespace:value` canonical tag；中文不是数据身份。
- **跨来源语义**：Pica tag 与 E-H namespaced tag 在可确认时映射到统一兴趣概念。
- **搜索召回**：Pica 使用自身关键词；E-H 使用 namespaced exact-tag 查询。

### 推荐

- **推荐 → 画像**：Pica 云收藏与 E-H 云收藏共同构建长期兴趣画像。
- **推荐 → 候选**：分别从 Pica 和 E-H 召回；ExH 仅在可用时补充。
- **推荐 → 排序**：保留可解释的 intent、来源证据和既有 ranker 约束。
- **推荐 → 批次**：上一批、下一批和 seen cycle 独立管理。

### 漫画详情与作者

- **详情 → 收藏**：Pica 使用 Pica 收藏；E-H 支持本地收藏和 10 个 E-H 云收藏槽。
- **详情 → 书架**：直接加入或移出一个或多个书架。
- **详情 → 来源与副本**：查看在线来源、手机、Desktop 和 WebDAV 副本。
- **详情 → 作者**：先进入归一作者目录，再进入该作者的跨来源作品列表。
- **作者归一**：保留 canonical name、别名、circle 和 provider binding；E-H `artist:` 与 `group:` 不强制合并。

### 阅读

- **阅读器 → 来源**：支持手机已下载、Desktop 已下载、WebDAV、Pica 在线和 E-H 在线。
- **阅读器 → 模式**：左到右、右到左和纵向连续阅读。
- **阅读器 → 进度**：本地先保存；可用时再同步 Desktop / WebDAV 便携进度。
- **阅读器 → 历史**：按阅读 session 记录，而不是把最后书签冒充完整历史。
- **历史 → 继续阅读**：恢复具体章节和页码；来源失效时回到详情重新选择。

### 下载与存储

- **下载任务**：持久化队列、并发控制、失败恢复和已完成任务管理。
- **Android 下载**：支持移动端本地下载；也可直接读取 Desktop 已下载内容。
- **WebDAV**：支持远程目录、选择性上传、远端删除和移动端后备访问。
- **多 WebDAV**：可保存多个远程目标并切换当前目标。
- **缓存与预加载**：Reader 图片缓存和预加载参数可独立调整。

### 账号与来源

- **Pica 账号**：登录、注册和收藏同步。
- **E-H 账号**：官方网页登录为主；手动会话导入为高级方式。
- **E-H 会话**：Windows 使用 DPAPI；Android 使用 Android Keystore AES-GCM。
- **ExH 状态**：显示当前可用、当前不可访问、暂无法确认或待检查；不把一次失败写成永久权限结论。

### 多端与个性化

- **Desktop ↔ Android**：配对后手机可读取电脑已经下载的漫画。
- **主题包**：支持 `.pica-theme` 创建、导入和跨端同步。
- **当前主题**：Desktop 与 Android 独立选择，不强制同步当前启用状态。
- **设置 → 存储与下载**：统一管理本地目录、WebDAV、缓存和下载策略。
- **设置 → 软件更新**：Windows 支持官方增量更新和本地更新 ZIP；Android 使用官方 APK 更新元数据。

## 平台能力

| 能力 | Windows / Web | Android |
| --- | --- | --- |
| 统一书库、筛选、书架 | 是 | 是 |
| Pica 在线 | 是 | 是 |
| E-Hentai 在线 | 是 | 是 |
| ExH 可选扩展 | 是 | 是 |
| 双来源推荐画像 | 是 | 是 |
| 作者归一与作品导航 | 是 | 是 |
| 阅读历史 | 是 | 是 |
| 在线阅读 | 是 | 是 |
| 本地下载 | 主下载端 | 是 |
| 读取 Desktop 已下载内容 | 本机 | 配对后直接读取 |
| WebDAV | 配置、同步、管理 | 读取、切换、后备访问 |
| 主题包 | 创建、导入、同步 | 接收、使用 |
| 应用内更新 | 增量 ZIP | 官方 APK |

## 安装与更新

正式版本统一发布在 [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases)。

### Windows

解压完整 ZIP 后运行。用户数据与程序版本分离，更新程序不会把个人数据库当作应用文件覆盖。

已安装用户优先使用：

`设置 → 软件更新 → 检查并更新`

也可将官方 `Pica-Library-vX.Y.Z-update.zip` 拖入本地更新区。

### Android

Android APK 未上架应用商店。请只从本仓库正式 Release 获取。

正式 APK 使用固定签名身份；更新流程会校验版本、包名、SHA-256 和签名证书。

## 本地优先与安全

- 用户数据库、书架、历史和配置默认保存在本机或用户指定的 WebDAV。
- Windows 敏感凭据使用当前 Windows 用户的 DPAPI 保护。
- Android E-H 会话使用 Android Keystore AES-GCM 保护。
- E-H canonical tag 与中文显示层分离，翻译更新不会改写内容身份。
- 主题包只允许受控数据与图片资源，不执行任意脚本或可执行代码。
- 官方发布提供 SHA-256、签名身份和构建透明度信息。

## 使用边界

Pica Library 是开源、本地优先的个人数字内容管理工具。项目本身不销售、托管或重新分发漫画内容。

用户需要自行确保账号使用、内容访问、下载、保存、阅读和备份符合所在地法律法规、平台条款及授权范围。

完整说明见 [DISCLAIMER.md](DISCLAIMER.md)。

## 文档

- [项目版本日志](PROJECT_LOG.md)
- [快速开始](docs/quick-start.zh-CN.md)
- [Desktop / Web 使用说明](docs/desktop-guide.zh-CN.md)
- [Android 使用说明](docs/android-guide.zh-CN.md)
- [Windows 分发说明](docs/windows-distribution.zh-CN.md)
- [开发与架构](docs/architecture.md)

## 开发

```bash
pnpm install --frozen-lockfile
pnpm type:check
pnpm web:check
pnpm test
pnpm build
```

Android 工程位于 `mobile/android-alpha2`。官方 Android 发布签名私钥不在仓库内。

## 致谢

CLI 能力基于上游 `pica-cli` 工作继续演进。详见 [UPSTREAM.md](UPSTREAM.md)。

---

请只下载和保存你有权访问的内容，不要重新分发漫画文件。
