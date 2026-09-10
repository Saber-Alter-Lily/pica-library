简体中文 | [English](README.en.md)

# Pica Library

把 Pica 收藏同步成一个可持续维护的本地漫画库，并在同一个产品里完成整理、推荐、下载、阅读与多端同步。

**Windows 10/11 x64 · Android Preview · 当前源码重新开放。**

## 当前版本

- **Windows / Desktop：v0.3.7**
- **Android Preview：v34 · 0.1.0-alpha8.7.1-star-401-hotfix**
- **当前公开源码：Alpha8.7.1**

### 下载

- [Windows v0.3.7 完整包](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.7/Pica-Library-v0.3.7-windows-x64.zip)
- [Windows v0.3.7 更新包](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.7/Pica-Library-v0.3.7-update.zip)
- [Windows v0.3.7 Release](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.3.7)
- [Android Preview Release](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/android-preview)

Windows v0.3.7 增量更新包已验证支持从 **v0.3.3 / v0.3.4 / v0.3.5 / v0.3.6** 直接升级。优先使用应用内 **设置 → 软件更新**。

## Alpha8.7.1 Hotfix

- **修复真实客户端 Star HTTP 401**：GitHub 当前对匿名“仓库 stargazers 列表”请求返回 `401 Requires authentication`；Desktop 与 Android 会继续走“该用户名公开的 starred repositories”路径确认 Star，不再把第一条接口的 401 当成验证失败。
- **Desktop 网络回退**：公开 GitHub GET 经应用代理得到 401/403/407/429 时，可安全尝试一次原生直连；带 Authorization 或 Cookie 的请求不会使用这条回退。
- **双路径验证**：Star 验证保留仓库 stargazers + 用户 starred repositories 两条独立路径；任一路径确认即可写入本地 Star 凭证。
- **发布验收修正**：正式发布门禁已在完全不带 Authorization 的条件下真实复现第一条接口 HTTP 401，并由第二条匿名接口返回 200、确认 `Saber-Alter-Lily/pica-library` 后才允许发布。

## Alpha8.7

这一版集中处理真实客户端验收中暴露出的桌面信息架构、下载队列和 Star 验证问题：

- **Star 验证修复**：Desktop 与 Android 不再调用错误的 `/users/{user}/starred/{repo}` 路径，改为读取 GitHub 的公开 Star 信息；Alpha8.7.1 又针对 GitHub 当前的匿名 stargazers 401 行为增加了用户 Star 列表回退。
- **桌面设置中心重构**：原来的“库维护”和“设置”合并为一个 **设置** 入口，内部按 **基本设置 / 连接与同步 / 外观与个性化 / 下载与存储 / 维护工具 / 软件更新** 六个目录组织，逻辑与手机端“连接与设置”尽量对齐。
- **个性化排版重构**：Star 解锁区与 Theme Studio 使用完整内容宽度；用户名、验证操作和主题制作区改为响应式布局，不再被挤压成窄列。
- **下载任务收敛**：下载页默认收起 `COMPLETED` 和 `CANCELLED` 历史任务，只展示仍需处理的队列；`FAILED` 保留以便重试，并提供“显示已结束任务”开关。历史数据库记录不删除。
- **延续 v0.3.5 更新修复**：GitHub 更新、Release 下载与 Desktop Star 请求继续复用 Pica Library 配置的 HTTP/HTTPS 代理，本机回环请求保持直连；旧的“更新完成”状态不会污染新的检查结果。
- **主题数据保留**：内置 **Pica Violet · 星漫** 与已有自定义主题继续使用原本的本地主题存储，升级不清空。

## Alpha8.6

这一版重新回到当前源码开放模式，同时完成个性化装扮第一阶段：

- **GitHub Star 解锁个性化装扮**：与打赏无关；官方构建验证公开 Star 状态后在本机长期记住。
- **Pica Violet · 星漫**：Star 解锁后立即可用的官方默认主题。
- **Theme Studio**：输入一句主题描述、加入角色/风格参考图，导出 AI Creator Kit；AI 返回 `.pica-theme` 后拖回 Desktop 即可校验、应用，并同步到已配对手机。
- **数据型 Theme Pack**：主题只允许受控 JSON 和 PNG/JPG/WebP 资源，不执行脚本、HTML、字体或二进制代码。
- **统一品牌图标**：Desktop/Web 与 Android 使用同一套二次元品牌图标。
- **Android 顶栏优化**：推荐页刷新和在线页账号使用紧凑图标操作；底栏固定为 **书库 / 推荐 / 在线 / 连接**。

## 主要功能

- **漫画库**：同步收藏，按作者、标签、分类和书架筛选与整理。
- **个性化推荐**：根据收藏画像生成分批推荐和推荐理由；收藏后当前推荐不会被清空。
- **在线浏览**：收藏、搜索、分类和 **24 小时 / 7 天 / 30 天** 排行。
- **下载与阅读**：统一管理下载任务、阅读进度与本地缓存。
- **Desktop ↔ Android**：手机可直接读取电脑已下载漫画，并同步主题与部分状态。
- **WebDAV**：电脑离线时可作为移动端后备阅读来源。
- **软件更新**：Desktop 具备 GitHub Release API + Release 文件回退链路；Android Preview 校验版本、SHA-256、包名与固定签名证书后安装。

## 个性化装扮

官方构建中的装扮入口是一个社区 Star 奖励，而不是付费功能：

1. 给本仓库一个 Star。
2. 在 Desktop 或 Android 个性化页面输入 GitHub 用户名并验证。
3. 验证通过后立即使用 **Pica Violet · 星漫**。
4. Desktop Theme Studio 可导出 AI Creator Kit，自制 `.pica-theme`。
5. Desktop 与 Android 配对后，可把 Star 凭证和当前主题同步到手机。

## 开源与安全

当前应用源码重新公开。发布仓库不会包含 Android 官方签名私钥或 keystore、账号密码、CI secrets、本地数据库、漫画下载内容或用户缓存。用户数据默认保存在本机；Windows 凭据使用当前 Windows 用户的 DPAPI 保护。官方发布产物仍通过固定签名、SHA-256 和构建透明度信息进行校验。

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
