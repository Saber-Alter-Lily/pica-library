简体中文 | [English](windows-distribution.md)

# Windows 一键版使用指南

> 当前稳定版：**v0.5.0**。

## 下载与启动

1. 从项目的 [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases/latest) 下载当前稳定版 Windows 完整包；v0.5.0 对应 `Pica-Library-v0.5.0-windows-x64.zip`。
2. 完整解压到一个普通文件夹，不要直接在压缩软件中运行。
3. 双击 `Pica Library.exe`。
4. 浏览器会自动打开本地设置页面；按需配置账号、漫画保存目录、下载方式与 HTTP/HTTPS 代理。

无需系统 Node.js、npm、pnpm、Git、命令行或管理员权限。

## SmartScreen 提示

当前 Windows 可执行文件未进行商业代码签名，首次运行时 Windows SmartScreen 可能显示提示。请先确认文件来自项目官方 GitHub Release，并核对 SHA-256。确认来源与校验值无误后，再决定是否运行。

无需也不应为了运行 Pica Library 全局关闭 Defender 或 SmartScreen。

## 数据与凭据

默认用户数据位置是 `%LOCALAPPDATA%\\Pica Library`：

- `config/`：非敏感设置和受 DPAPI 保护的凭据；
- `data/`：SQLite 漫画库及相关持久化数据；
- `cache/`：本地缓存；
- `logs/`：经过脱敏的诊断日志；
- `runtime-state/`：单实例锁、本地服务状态以及 `upgrade-assistant/` 外置升级助手。

密码使用当前 Windows 用户的 DPAPI 加密；如果 DPAPI 不可用，程序不会退回明文保存。普通配置、SQLite 数据库、日志、导出数据和发布 ZIP 不保存明文账号密码。

代理默认关闭，仅在需要时配置 HTTP/HTTPS 代理。代理凭据同样进入受保护凭据存储。

## 设置中心

Desktop 设置中心当前分为：

- **基本设置**：账号、基础参数与支持项目；
- **推荐与画风**：推荐画像、0–10 人工调整、画风与推荐同步；
- **连接与同步**：Android 配对、WebDAV 与远程访问；
- **外观与个性化**：明暗模式与主题包；
- **下载与存储**：下载目录、缓存和存储策略；
- **维护工具**：修复、日志、导出及高级维护；
- **软件更新**：官方更新、本地更新 ZIP、校验、应用和回滚。

关闭最后一个浏览器标签页后，仅当没有已配对 Android 设备需要 Mobile Bridge 时，空闲 Desktop Node 才会在短暂宽限期后退出；已有手机配对时后台会继续保留。需要明确完全停止本地服务时，请使用应用内退出入口。

## Browser Lite

如需使用 Browser Lite，可在设置中的相关高级入口导出 Browser Lite 数据包。Browser Lite 不需要也不会接收 Pica 账号或密码。

## 升级

打开 **设置 → 维护工具 → 软件更新**。

### 推荐路径：v0.4.11 → v0.5.0

public v0.4.11 用户直接点击 **一键检查并更新**。正式 Release 提供来源限定增量包：

`Pica-Library-v0.5.0-update-from-v0.4.11.zip`

旧版会使用自己已经发布的 updater 完成校验和替换，数据库从 schema 13 升到 14；升级后的 v0.5.0 会自动启动并重新连接网页。

v0.5.0 首次启动后会在：

`%LOCALAPPDATA%\Pica Library\runtime-state\upgrade-assistant\`

注册当前 Node runtime、`full-upgrader.js` 和 `assistant.json`。后续遇到 Schema 跳跃、updater 自替换或整个程序树需要更换时，应用会从该外置位置准备一次性 bootstrap，再替换旧程序，因此仍可继续使用网页的一键更新入口。

### 备用 Upgrade Assistant

如果软件内更新通道异常，可从同一 v0.5.0 Release 下载：

`Pica-Library-v0.5.0-upgrade-assistant-from-v0.4.11.zip`

解压后运行其中的 `Upgrade-Pica-Library-v0.5.0.cmd`。备用助手会固定校验目标完整包 SHA-256、SOURCE_SHA 和数据库版本，保护用户数据并在失败时回滚。

### 手动替换

手动替换仍可作为最后备用方案：完全退出旧版，把新版完整 ZIP 解压到新目录后运行。

**不要删除 `%LOCALAPPDATA%\Pica Library`。** 数据库、书架、阅读历史、设置、账号凭据与已下载内容位于独立用户数据目录，不需要卸载或重新导入。

如果漫画保存目录位于旧程序目录内部，自动完整升级会拒绝执行并提示先迁移数据。

## 校验 SHA-256

从同一官方 Release 下载 `SHA256SUMS.txt`，然后在 PowerShell 中运行：

```powershell
Get-FileHash .\Pica-Library-v0.5.0-windows-x64.zip -Algorithm SHA256
```

将完整校验值与官方 Release 提供的值逐字比较，一致后再解压运行。
