简体中文 | [English](README.en.md)

# Pica Library

**Windows & Android 本地优先漫画库、阅读器与下载管理器。**

支持 **PicACG / Pica、E-Hentai / ExHentai、WebDAV**，把在线发现、收藏、书库、下载、阅读、推荐和跨端访问集中到一套工具里。

**[下载最新版](https://github.com/Saber-Alter-Lily/pica-library/releases/latest)** · [快速开始](docs/quick-start.zh-CN.md) · [Android 使用说明](docs/android-guide.zh-CN.md) · [版本日志](PROJECT_LOG.md)

Windows 10/11 x64 · Android · Local-first · Open Source

## v0.5.1 本次更新

- **书库**：在搜索下方打开筛选、排序或订阅更新；再次点「随机重排」才改变顺序。
- **订阅**：从详情订阅作者，用封面浏览待看作品。阅读相应章节或手动标记才消除这条提醒。
- **推荐与阅读**：同一轮分六页浏览，优先混合熟悉和陌生作者；Android 优化多章节目录、窄屏操作和深浅色布局。
- [Windows v0.5.1 更新说明](docs/V051_RELEASE_NOTES.md) · [Windows x64](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.5.1/Pica-Library-v0.5.1-windows-x64.zip) · [Android v57 正式 APK](https://github.com/Saber-Alter-Lily/pica-library/releases/download/android-preview/Pica-Library-Android-v57.apk)

## 主要功能

### 统一书库

- 把 Pica、E-H、Desktop、Android 与 WebDAV 内容集中到同一书库中查看。
- 支持标题、作者、标签、分类、来源、收藏和下载状态筛选。
- 支持书架、阅读历史、继续阅读、列表和多档网格显示。
- 作品详情可以查看同一作品的其他版本，方便对比标题、作者、页数、来源和收藏 / 下载状态。

### 在线发现

- **Pica**：登录、注册、搜索、分类、排行、收藏、在线阅读和下载。
- **E-Hentai / ExHentai**：搜索、详情、收藏、在线阅读、下载、热门与高级筛选。
- E-H 标签支持中文显示与中文搜索辅助。

### 推荐

- 根据收藏和使用行为生成个性化推荐。
- 支持 0–10 人工调整、减少推荐、屏蔽、本次想看和反馈。
- 支持批次切换和推荐依据。
- 画风推荐可以单独开启或关闭，不影响普通推荐。
- Desktop 与 Android 都可以独立运行推荐，配对后可同步推荐偏好。

### 阅读与下载

- 支持本地漫画、Desktop 已下载内容、WebDAV、Pica 在线和 E-H 在线阅读。
- 阅读器支持左右翻页、纵向连续阅读、章节切换、进度保存和续读。
- 下载任务支持进度显示、暂停 / 继续、失败恢复和持久化队列。
- Android 可本地下载，也可配对后直接读取电脑已下载漫画。

### 跨端与存储

- Desktop ↔ Android 可在局域网配对。
- 支持 WebDAV 作为远程存储和备用阅读来源。
- 支持多个 WebDAV 配置、远端同步和移动端切换。
- 支持主题包、明暗模式和个性化外观。

### 更新与维护

- Windows 支持应用内更新、本地更新 ZIP 和更新回滚。
- Android 支持应用内检查并安装官方 APK 更新。
- 提供缓存、日志、导出、修复和存储管理入口。

## 安装与更新

仍在 v0.4.11？先按 [v0.5.0 的升级说明](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.5.0) 进入 v0.5.0，再使用本次升级包。不要将跨版本增量 ZIP 混用。

正式版本统一发布在 [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases)。

### Windows

新用户下载并完整解压：

[Pica-Library-v0.5.1-windows-x64.zip](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.5.1/Pica-Library-v0.5.1-windows-x64.zip)

已装 v0.5.0 请在「软件更新」点「一键检查并更新」。对应增量包为 `Pica-Library-v0.5.1-update-from-v0.5.0.zip`；备用助手在同一 Release。不要删除数据目录。

### Android

正式包为 **v57 / 0.5.1.1**。在「设置 → 软件更新」检查更新，可保留数据覆盖 v56，不要卸载。书库封面不再遮挡，打开详情即可开始或继续阅读；在线书单成功翻页回到顶部，返回详情之前的书单时保留位置。[Android 更新说明](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/android-preview)。独立 Dev 包不是正式版的升级起点。

Android APK 不通过应用商店分发，请只从本仓库正式 Release 下载。

## 本地优先与安全

- 书库、书架、历史和设置默认保存在本机或用户选择的 WebDAV。
- 用户数据与程序文件分离，更新不会把个人数据库当作应用文件覆盖。
- Windows 凭据使用当前 Windows 用户保护机制；Android 敏感会话使用 Android Keystore。
- 正式 Release 提供 SHA-256 和 Android 签名校验信息。

## 支持项目

Pica Library 免费、开源。可通过 [爱赞助](https://azz.net/PicaLibrary) 自愿支持维护。

赞助不会解锁额外功能、内容或下载权限。

## 使用边界

Pica Library 是本地优先的个人数字内容管理工具，本身不销售、托管或重新分发漫画内容。请确保账号使用、访问、下载、保存、阅读和备份符合所在地法律法规、平台条款及授权范围。

完整说明见 [DISCLAIMER.md](DISCLAIMER.md)。

## 文档

[快速开始](docs/quick-start.zh-CN.md) · [Desktop / Web](docs/desktop-guide.zh-CN.md) · [Android](docs/android-guide.zh-CN.md) · [Windows 分发](docs/windows-distribution.zh-CN.md) · [版本日志](PROJECT_LOG.md)

## 致谢

CLI 能力基于上游 `pica-cli` 工作继续演进。详见 [UPSTREAM.md](UPSTREAM.md)。
