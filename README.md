简体中文 | [English](README.en.md)

# Pica Library

**收藏整理 · 个性发现 · 增量下载 · 本地阅读 · 多端同步**

Pica Library 是一个面向长期漫画收藏的本地优先管理工具：在 Windows 上整理、搜索、推荐、下载和阅读漫画，并通过 Android 直接访问电脑已经下载的内容。

**Windows 10/11 x64 · Android Preview · 开源 · 免费**

[下载 Windows v0.3.12](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.3.12) · [下载 Android Preview v39](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/android-preview) · [提交 Issue](https://github.com/Saber-Alter-Lily/pica-library/issues)

> Android 版本目前**未上架任何应用商店**，请仅从本仓库 GitHub Release 下载 APK。

## 能做什么

- **漫画库与收藏整理**：同步收藏，按作者、标签、分类、书架等方式整理长期收藏。
- **搜索、发现与推荐**：在本地库和在线内容中搜索，并根据收藏画像生成个性化推荐。
- **持久化下载队列**：下载任务支持持续管理、失败恢复和状态保留；已结束任务默认收起。
- **本地阅读**：已下载漫画集中管理，直接从本地进入阅读。
- **Desktop ↔ Android**：手机与电脑配对后，可直接读取电脑已经下载的漫画，避免重复下载。
- **WebDAV 后备访问**：电脑离线时可作为移动端备用内容来源。
- **个性化装扮**：支持 `.pica-theme` 主题包，Desktop 可创建、导入并同步到 Android；两端可独立选择当前主题。
- **安全更新**：Desktop 支持应用内增量更新；Android Preview 会校验版本、SHA-256、包名和固定签名证书。

## Desktop / Web

![Pica Library Desktop / Web 页面说明](https://raw.githubusercontent.com/Saber-Alter-Lily/pica-library/c55c4f39171874a7fa800803a5a3cf979defd0ab/docs/assets/desktop-overview-final.png)

Windows Desktop 提供完整的漫画库、书架、发现、收藏图鉴、下载任务、已下载内容和统一设置中心。手机配对、WebDAV、主题、存储、维护和软件更新都集中在设置中管理。

**[查看 Desktop / Web 详细使用说明 →](docs/desktop-guide.zh-CN.md)**

## Android

![Pica Library Android 使用指南](https://raw.githubusercontent.com/Saber-Alter-Lily/pica-library/c55c4f39171874a7fa800803a5a3cf979defd0ab/docs/assets/android-overview-final.png)

Android 端以 **书库 / 推荐 / 在线 / 连接** 四个主入口组织功能。配对 Desktop 后可直接读取电脑本地漫画；也可配置 WebDAV、Pica 账号、外观和软件更新。

**[查看 Android 详细使用说明 →](docs/android-guide.zh-CN.md)**

## 多端逻辑

| 能力 | Desktop / Web | Android |
| --- | --- | --- |
| 收藏与漫画库管理 | ✅ | ✅ |
| 推荐 / 在线浏览 | ✅ | ✅ |
| 下载任务管理 | ✅ 主下载端 | ✅ 移动端任务与更新 |
| 读取 Desktop 已下载漫画 | 本机 | ✅ 配对后直接读取 |
| WebDAV | ✅ 配置 / 提供连接信息 | ✅ 后备访问 |
| 主题包 | ✅ 创建 / 导入 / 同步 | ✅ 接收 / 使用 |
| 当前启用主题 | 本机独立 | 本机独立 |

主题包可以跨端同步，但 **Desktop 与 Android 不强制使用同一个当前主题**。

## 下载与更新

### Windows

- [v0.3.12 完整包](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.12/Pica-Library-v0.3.12-windows-x64.zip)
- [v0.3.12 增量更新包](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.12/Pica-Library-v0.3.12-update.zip)

v0.3.12 已实测支持官方 **v0.3.11 → v0.3.12** 增量升级与故障回滚。

v0.3.0–v0.3.10 用户请先手动应用 [v0.3.11 增量包](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.3.11)，再检查更新；也可备份数据后使用 v0.3.12 完整包。不要将 v0.3.12 增量包直接应用到不支持的旧版。

Desktop 用户优先使用 **设置 → 软件更新**。

新增双端账号引导与显式注册、网页在线阅读、已下载漫画的网盘状态及选择性上传/云端删除。注册依赖第三方服务；真实注册和各 WebDAV 服务兼容性尚未实测。网盘删除不影响本地下载，不支持安全目录锁的服务会拒绝删除。

### Android

从 [Android Preview Release](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/android-preview) 下载 `Pica-Library-Android-Preview.apk`。

Android Preview **未上架应用商店**。请不要从不明网盘、群文件或第三方下载站获取 APK。

## 本地优先与安全

- 用户数据默认保存在本机。
- Windows 凭据使用当前 Windows 用户的 DPAPI 保护。
- 官方发布提供 SHA-256 与构建透明度信息。
- Android Preview 使用固定官方签名身份。
- GitHub OAuth access token 不持久化保存。
- 主题包仅允许受控的数据与图片资源，不执行任意脚本或可执行代码。

## 使用说明

Pica Library 是开源、本地优先的个人数字内容管理工具。项目本身不销售、托管或重新分发漫画内容。用户需要自行确保账号使用、内容访问、下载、保存、阅读和备份符合所在地法律法规、平台条款以及版权或其他授权范围。

完整说明见 [DISCLAIMER.md](DISCLAIMER.md)。

## 开始使用

- [Desktop / Web 使用说明](docs/desktop-guide.zh-CN.md)
- [Android 使用说明](docs/android-guide.zh-CN.md)
- [快速开始](docs/quick-start.zh-CN.md)
- [Windows 分发说明](docs/windows-distribution.zh-CN.md)
- [开发与架构](docs/architecture.md)

## 开发

```bash
pnpm install --frozen-lockfile
pnpm web:check
pnpm build
pnpm test:unit
```

Android 工程位于 `mobile/android-alpha2`。官方 Android APK 的发布签名私钥不在仓库内。

## 致谢

Pica Library 的 CLI 能力基于上游 `pica-cli` 工作继续演进。详见 [UPSTREAM.md](UPSTREAM.md)。

---

**请只下载和保存你有权访问的内容，不要重新分发漫画文件。**
