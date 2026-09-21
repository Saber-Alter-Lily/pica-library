简体中文 | [English](README.en.md)

# Pica Library

**Windows & Android 本地优先漫画库、阅读器与下载管理器。**

支持 **PicACG / Pica、E-Hentai / ExHentai、WebDAV**，覆盖漫画发现、收藏、统一书库、下载、阅读、推荐与 Desktop ↔ Android 跨端访问。

**[下载最新版](https://github.com/Saber-Alter-Lily/pica-library/releases/latest)** · [快速开始](docs/quick-start.zh-CN.md) · [Android 使用说明](docs/android-guide.zh-CN.md) · [版本日志](PROJECT_LOG.md)

Windows 10/11 x64 · Android · Local-first · Open Source

## v0.4.4 本次更新

- **网页端支持项目真正进入设置中心**：修复 Desktop Settings Hub 重组时漏搬“支持项目”的问题；现在打开设置后即可在“基本设置”看到爱发电与 GitHub。
- **网页端外观入口同步修复**：基础明暗模式也会正确进入“外观与个性化”，不再跟随旧 Settings 容器一起被隐藏。
- **真实浏览器验收**：CI 现在会用 Chromium 打开设置中心，直接断言支持卡和基础外观在重组后的可见 DOM 中存在。
- **升级**：Windows v0.4.1 / v0.4.2 / v0.4.3 均可直接软件内升级到 v0.4.4；v0.4.0 使用 v0.4.4 升级助手直达；Android 对齐到 versionCode 46 / 0.4.4。

完整版本演变见 [PROJECT_LOG.md](PROJECT_LOG.md)。

## 主要功能

### 统一书库

- Pica、E-H、Desktop、本机、Android 与 WebDAV 状态统一到同一漫画记录。
- 支持标题、作者、标签、分类、Provider、存储位置与在线可读状态筛选。
- 支持书架、阅读历史、继续阅读、列表 / 多档网格显示。
- 作者使用 canonical name / alias / circle / provider binding 归一，详情页可继续浏览同作者跨来源作品。

### 在线发现与账号

- **Pica**：登录、注册、搜索、分类、排行、收藏与同步。
- **E-Hentai**：公开搜索、详情、在线阅读、下载、Latest / Popular / Favorites / Watched / Toplists 与高级筛选。
- **ExHentai**：作为 E-H 账号下的可选扩展；不可访问时不会阻塞 E-H 或推荐。
- E-H 支持官方网页登录；Windows 使用 DPAPI、Android 使用 Android Keystore 保护会话信息。

### 中文标签与跨来源语义

- E-H 保留原生 `namespace:value` canonical tag，中文仅作为显示与反查层。
- 接入 EhTagTranslation，支持中文标签显示与中文搜索辅助。
- Pica 与 E-H 标签在可确认时映射到统一兴趣概念，但保留各 Provider 最合适的召回语法。

### 推荐

- Pica 与 E-H 收藏共同构建长期兴趣画像，并保留最近行为、显式偏好和推荐依据。
- 两个 Provider 独立召回，再进行统一排序、去重与批次分配。
- 支持推荐画像、人工调整、显式反馈、批次切换和可解释推荐依据。
- 画风推荐作为独立模块，可完全关闭；关闭时不影响常规推荐。
- Desktop 与 Android 可独立运行推荐；配对后同步可移植偏好与推荐基础数据，不强制同步当前批次 / Session。

### 阅读与下载

- 支持 Android 本地、Desktop 已下载、WebDAV、Pica 在线与 E-H 在线阅读。
- 阅读器支持左到右、右到左、纵向连续阅读、章节切换、进度保存与续读。
- 阅读历史按漫画聚合，同时保留具体章节和页码。
- 下载任务支持持久化队列、并发控制、失败恢复、暂停 / 继续与完成记录。
- Android 可本地下载，也可配对后直接读取 Desktop 已下载漫画。

### 存储、多端与个性化

- 支持多个 WebDAV 目标、选择性上传、远端删除、切换与移动端后备访问。
- Desktop ↔ Android 配对后可共享可移植书库 / 推荐基础与访问 Desktop 内容。
- 支持 `.pica-theme` 主题包创建、导入与跨端同步；两端当前启用主题彼此独立。
- Reader 缓存、预加载、下载目录与存储策略均可独立配置。

### 更新与维护

- Windows 支持兼容增量更新、官方 Release 检查、本地更新 ZIP 与更新回滚。
- v0.4.1 / v0.4.2 / v0.4.3 → v0.4.4 可直接使用软件内增量更新；仍为 v0.4.0 时，使用 v0.4.4 Release 中的 **Windows 升级助手** 可直接跨代升级到 v0.4.4，无需安装中间版本。
- Android 使用官方更新元数据进行 APK 原地升级，并校验版本、包名、SHA-256 与签名身份。
- 提供日志、文件修复、缓存、导出与诊断入口。

## 平台能力

| 能力 | Windows / Web | Android |
| --- | --- | --- |
| 统一书库、筛选、书架 | ✓ | ✓ |
| Pica / E-H 在线 | ✓ | ✓ |
| ExH 可选扩展 | ✓ | ✓ |
| 推荐画像与人工调整 | ✓ | ✓ |
| 画风推荐 | ✓ | ✓ |
| 阅读历史与续读 | ✓ | ✓ |
| 在线阅读 | ✓ | ✓ |
| 本地下载 | 主下载端 | ✓ |
| 读取 Desktop 已下载内容 | 本机 | 配对后直接读取 |
| 多 WebDAV | 配置 / 同步 / 管理 | 读取 / 切换 / 后备 |
| 主题包 | 创建 / 导入 / 同步 | 接收 / 使用 |
| 应用更新 | 增量 / 完整包助手 | 官方 APK 原地升级 |

## 安装与更新

正式版本统一发布在 [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases)。

### Windows

下载并完整解压 `Pica-Library-vX.Y.Z-windows-x64.zip`，运行 `Pica Library.exe`。

用户数据与程序目录分离。兼容版本使用：

`设置 → 软件更新 → 检查并更新（兼容时自动）`

**v0.4.1 / v0.4.2 / v0.4.3 → v0.4.4** 可直接使用软件内更新。仍停留在 **v0.4.0** 的用户可下载 `Pica-Library-v0.4.4-upgrade-assistant.zip`，解压后双击 `Upgrade-Pica-Library-v0.4.4.cmd` 直接升级到 v0.4.4；助手会保护 `%LOCALAPPDATA%\Pica Library`，并自动完成校验、备份、替换、健康检查与失败回滚。

### Android

Android APK 不通过应用商店分发，请只使用本仓库正式 Release。现有 v42 / 0.4.0、v43 / 0.4.1 与 v44 / 0.4.2 均可通过应用内更新链直接原地升级到 v46 / 0.4.4。

## 本地优先与安全

- 数据库、书架、历史和设置默认保存在本机或用户指定的 WebDAV。
- Windows 凭据使用当前 Windows 用户的 DPAPI；Android 敏感会话使用 Android Keystore。
- 用户数据与程序文件分离，升级不会把个人数据库当作应用文件覆盖。
- 官方 Release 提供 SHA-256、签名身份与构建透明度信息。
- 主题包仅包含受控数据和图片资源，不执行任意脚本。

## 支持项目

Pica Library 免费、开源。可通过 [爱发电](https://afdian.com/a/PicaLibrary) 自愿支持维护。

赞助不会解锁额外功能、内容或下载权限，也不会影响免费版本的完整使用。

## 使用边界

Pica Library 是本地优先的个人数字内容管理工具，本身不销售、托管或重新分发漫画内容。请确保账号使用、访问、下载、保存、阅读和备份符合所在地法律法规、平台条款及授权范围。

完整说明见 [DISCLAIMER.md](DISCLAIMER.md)。

## 文档

[快速开始](docs/quick-start.zh-CN.md) · [Desktop / Web](docs/desktop-guide.zh-CN.md) · [Android](docs/android-guide.zh-CN.md) · [Windows 分发](docs/windows-distribution.zh-CN.md) · [版本日志](PROJECT_LOG.md) · [架构](docs/architecture.md)

## 开发

```bash
pnpm install --frozen-lockfile
pnpm type:check
pnpm web:check
pnpm test
pnpm build
```

Android 工程位于 `mobile/android-alpha2`。官方 Android 发布签名私钥不存放在仓库中。

## 致谢

CLI 能力基于上游 `pica-cli` 工作继续演进。详见 [UPSTREAM.md](UPSTREAM.md)。

---

请只下载和保存你有权访问的内容，不要重新分发漫画文件。
