简体中文 | [English](README.en.md)

# Pica Library

把 Pica 收藏同步成一个可持续维护的本地漫画库，并在同一个产品里完成整理、推荐、下载、阅读与多端同步。

**Windows 10/11 x64 · Android Preview · 当前源码重新开放。**

## 当前版本

- **Windows / Desktop：v0.3.8**
- **Android Preview：v35 · 0.1.0-alpha8.8-account-auth-theme-decouple**
- **当前公开源码：Alpha8.8**

## Alpha8.8

- **GitHub 账号本人认证**：个性化装扮不再依赖“输入公开用户名并查询 Star”，改为 GitHub Device Flow 登录当前账号，再调用认证用户的 Star 接口验证 `Saber-Alter-Lily/pica-library`。客户端只长期保存 GitHub 用户名、不可变 user ID 和验证时间，不保存 OAuth access token。
- **真实授权验收已通过**：使用正式 GitHub App Client ID 完成真实 Device Flow，认证账号为 `Saber-Alter-Lily`，认证后的当前用户 Star 检查返回 HTTP 204。
- **主题跨端解耦**：Desktop 仍可把 `.pica-theme` 方案与资源包同步到 Android，但不再同步 `activeThemeId`。电脑和手机可分别选择各自当前主题，例如电脑使用“远坂凛”，手机使用“Pica Violet · 星漫”。
- **版本化开屏免责声明**：Desktop/Web 与 Android 首次运行会显示开源工具使用提示；确认状态只保存在当前设备，免责声明版本升级时才再次提示。Windows 包同时包含完整 `DISCLAIMER.md`。
- **延续 Alpha8.7**：统一设置中心、个性化布局优化、已结束下载任务默认收起、代理感知更新链路继续保留。

### 下载

Windows v0.3.8 与 Android v35 通过原有应用内更新通道提供。优先使用软件内 **设置 → 软件更新**；Android 使用原 Preview 更新入口。

## 主要功能

- **漫画库**：同步收藏，按作者、标签、分类和书架筛选与整理。
- **个性化推荐**：根据收藏画像生成分批推荐和推荐理由；收藏后当前推荐不会被清空。
- **在线浏览**：收藏、搜索、分类和 **24 小时 / 7 天 / 30 天** 排行。
- **下载与阅读**：统一管理下载任务、阅读进度与本地缓存。
- **Desktop ↔ Android**：手机可直接读取电脑已下载漫画，并同步主题方案与部分状态；两端当前主题彼此独立。
- **WebDAV**：电脑离线时可作为移动端后备阅读来源。
- **软件更新**：Desktop 具备 GitHub Release API + Release 文件回退链路；Android Preview 校验版本、SHA-256、包名与固定签名证书后安装。

## 个性化装扮

官方构建中的装扮入口是一个社区 Star 奖励，而不是付费功能：

1. 给本仓库一个 Star。
2. 在 Desktop 或 Android 个性化页面选择“使用 GitHub 账号登录并验证”。
3. 在 GitHub Device Flow 页面确认授权。
4. Pica Library 读取当前登录账号身份，并检查该账号是否已 Star 本仓库。
5. 验证成功后，本机保存账号身份证明；OAuth access token 不持久化。
6. Desktop 可创建、导入和同步 `.pica-theme` 方案；Desktop 与 Android 分别保存自己的当前主题。

## 使用提示

Pica Library 是开源、本地优先的个人数字内容管理工具。项目本身不销售、托管或重新分发漫画内容。使用者需要自行确保账号使用、内容访问、下载、保存、阅读和备份符合所在地法律法规、平台条款以及版权或其他授权范围。完整说明见 [DISCLAIMER.md](DISCLAIMER.md)。

## 开源与安全

当前应用源码重新公开。发布仓库不会包含 Android 官方签名私钥或 keystore、账号密码、CI secrets、本地数据库、漫画下载内容或用户缓存。用户数据默认保存在本机；Windows 凭据使用当前 Windows 用户的 DPAPI 保护。官方发布产物仍通过固定签名、SHA-256 和构建透明度信息进行校验。

## 开始使用

1. 下载完整 Windows ZIP 并完整解压。
2. 双击 `Pica Library.exe`。
3. 阅读并确认版本化使用提示。
4. 完成账号、可选代理和漫画保存目录设置。
5. 同步收藏并开始使用。
6. Android 端通过 Desktop 提供的配对信息连接。

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
