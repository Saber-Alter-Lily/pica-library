简体中文 | [English](README.en.md)

# Pica Library

把 Pica 收藏同步成一个可持续维护的本地漫画库，并在同一个产品里完成整理、推荐、下载、阅读与多端同步。

**Windows 10/11 x64 · Android Preview · 当前源码重新开放。**

## 当前版本

- **Windows / Desktop：v0.3.6**
- **Android Preview：v33 · 0.1.0-alpha8.7-settings-star-fix**
- **当前公开源码：Alpha8.7**

### 下载

- [Windows v0.3.6 完整包](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.6/Pica-Library-v0.3.6-windows-x64.zip)
- [Windows v0.3.6 更新包](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.6/Pica-Library-v0.3.6-update.zip)
- [Windows v0.3.6 Release](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.3.6)
- [Android Preview Release](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/android-preview)

Windows v0.3.6 更新包已验证支持从 **v0.3.3 / v0.3.4** 直接升级。优先使用应用内 **设置 → 软件更新**。如果 v0.3.3 所在网络必须依赖应用内代理才能访问 GitHub，则旧版更新器本身可能无法发现 v0.3.6；这种情况下需使用一次完整 v0.3.6 ZIP，之后更新器会复用应用配置的 HTTP/HTTPS 代理。

## Alpha8.7 Hotfix

这一版优先修复更新与个性化装扮的阻断问题：

- **Desktop 更新代理修复**：GitHub API、Release 下载与 GitHub Star 验证会复用 Pica Library 中配置的 HTTP/HTTPS 代理，本机回环请求保持直连。
- **更新状态修复**：新的更新检查会清除旧的成功状态，不再同时显示“官方通道失败”和历史“更新完成”；后端升级成功后网页会重新载入新版本。
- **Android 个性化装扮修复**：真实页面入口统一改用 GitHub Star 权限，不再被旧 Supporter Entitlement 错误拦截。
- **Android Star 验证入口**：可在手机直接输入 GitHub 用户名验证，也可从已配对 Desktop 同步 Star 凭证与主题。
- **主题数据保留**：内置 **Pica Violet · 星漫** 与已存在的自定义主题继续使用原本的本地主题存储，不因本次升级清空。

## Alpha8.6

这一版重新回到当前源码开放模式，同时完成个性化装扮第一阶段：

- **GitHub Star 解锁个性化装扮**：与打赏无关；官方构建验证公开 Star 状态后在本机长期记住。
- **Pica Violet · 星漫**：Star 解锁后立即可用的官方默认主题。
- **Theme Studio**：输入一句主题描述、加入角色/风格参考图，导出 AI Creator Kit；AI 返回 `.pica-theme` 后拖回 Desktop 即可校验、应用，并同步到已配对手机。
- **数据型 Theme Pack**：主题只允许受控 JSON 和 PNG/JPG/WebP 资源，不执行脚本、HTML、字体或二进制代码。
- **统一品牌图标**：Desktop/Web 与 Android 使用同一套二次元品牌图标。
- **界面修复**：Desktop 顶栏不再让主题人物图遮挡语言/连接控件；主题文件选择器不再一次点击弹两次。
- **Android 顶栏优化**：推荐页刷新和在线页账号改为紧凑 48dp 图标操作；底栏仍固定为 **书库 / 推荐 / 在线 / 连接**。

## 主要功能

- **漫画库**：同步收藏，按作者、标签、分类和书架筛选与整理。
- **个性化推荐**：根据收藏画像生成分批推荐和推荐理由；收藏后当前推荐不会被清空。
- **在线浏览**：收藏、搜索、分类和 **24 小时 / 7 天 / 30 天** 排行。
- **下载与阅读**：统一管理下载任务、阅读进度与本地缓存。
- **Desktop ↔ Android**：手机可直接读取电脑已下载漫画，并同步主题与部分状态。
- **WebDAV**：电脑离线时可作为移动端后备阅读来源。
- **软件更新**：Desktop 具备 GitHub Release API + Release 文件回退链路；Android Preview 校验版本、SHA-256、包名与固定签名证书后安装。

## 个性化装扮

官方构建中的装扮入口是一个社区 Star 奖励，而不是付费功能。当前 V1 流程：

1. 给本仓库一个 Star。
2. 在 Desktop 或 Android 个性化页面输入 GitHub 用户名并验证。
3. 验证通过后立即使用 **Pica Violet · 星漫**。
4. Desktop Theme Studio 可导出 AI Creator Kit，自制 `.pica-theme`。
5. Desktop 与 Android 配对后，可把 Star 凭证和当前主题同步到手机。

源码中可以看到完整验证逻辑；官方签名构建保留上述产品规则，fork 当然可以按照开源许可证自行修改。

## 开源与安全

当前应用源码重新公开。发布仓库不会包含：

- Android 官方签名私钥或 keystore；
- 账号、密码、支付凭据或 CI secrets；
- 本地数据库、漫画下载内容或用户缓存。

用户数据默认保存在本机；Windows 凭据使用当前 Windows 用户的 DPAPI 保护。官方发布产物仍通过固定签名、SHA-256 和构建透明度信息进行校验。

## 开始使用

1. 下载完整 Windows ZIP 并完整解压。
2. 双击 `Pica Library.exe`。
3. 完成账号、可选代理和漫画保存目录设置。
4. 同步收藏并开始使用。
5. Android 端通过 Desktop 提供的配对信息连接。

更详细的首次使用步骤见 [快速开始](docs/quick-start.zh-CN.md)。

## 开发

```bash
pnpm install --frozen-lockfile
pnpm web:check
pnpm build
pnpm test:unit
```

Android 工程位于 `mobile/android-alpha2`。官方 Android APK 的发布签名私钥不在仓库内。

## 更多

[快速开始](docs/quick-start.zh-CN.md) · [Windows 使用指南](docs/windows-distribution.zh-CN.md) · [开发与架构](docs/architecture.md) · [Issue](https://github.com/Saber-Alter-Lily/pica-library/issues) · [LICENSE](LICENSE) · [UPSTREAM](UPSTREAM.md)

请只下载你有权访问的内容，不要重新分发漫画文件。
