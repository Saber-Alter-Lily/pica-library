简体中文 | [English](windows-distribution.md)

# Windows 一键版使用指南

## 导出 Browser Lite 数据包

准备好漫画库后，打开“设置 → Browser Lite”，点击“导出 Browser Lite 数据包”。保留默认文件名 `pica-library-bundle.json`，然后在 Browser Lite 网页中选择这个文件。网页无需也不会要求填写 Pica 账号或密码。

## 下载与启动

1. 从项目的 [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases) 下载 `Pica-Library-v0.1.2-windows-x64.zip`。
2. 完整解压到一个新文件夹，不要直接在压缩软件中运行。
3. 双击 `Pica Library.exe`。
4. 浏览器将自动打开首次启动向导；填写 Pica 账号和密码，选择漫画保存目录与下载模式，可按需填写 HTTP/HTTPS 代理。

无需系统 Node.js、npm、pnpm、Git、命令行或管理员权限。

## SmartScreen 提示

当前 Windows 可执行文件未进行代码签名，首次运行时 Windows SmartScreen 可能显示提示。请先确认文件来自项目的官方 GitHub Release，并核对 SHA-256。确认来源与校验值无误后，可在提示中查看详细信息并决定是否运行。无需也不应全局关闭 Defender 或 SmartScreen。

## 数据与凭据

默认数据位置是 `%LOCALAPPDATA%\Pica Library`：

- `config/`：非敏感设置和受 DPAPI 保护的凭据。
- `data/`：SQLite 漫画库与下载内容。
- `cache/`：本地缓存。
- `logs/`：经过脱敏的诊断日志。
- `runtime-state/`：单实例锁与当前本地地址。

密码使用当前 Windows 用户的 DPAPI 加密；如果 DPAPI 不可用，程序不会退回明文保存。设置页不会显示已保存密码。普通配置、SQLite 数据库、日志、Browser Lite 数据包和发布 ZIP 均不保存明文账号密码。

代理默认关闭，仅接受 HTTP/HTTPS 代理地址。代理中的用户名与密码同样进入 DPAPI 凭据存储，并从普通配置和日志中移除。

## 设置与退出

在“设置”中可以修改账号、密码、漫画保存目录、下载模式和代理，测试连接，打开数据或日志目录，并查看版本。若有正在进行的下载任务，需先暂停或完成任务，才能更改漫画保存目录。

请选择“退出 Pica Library”来停止本地服务。关闭浏览器标签页不会自动退出程序。

## 升级

程序文件与可变数据相互分离。升级时把新版 ZIP 解压到新目录并运行其中的程序，不要覆盖正在运行的旧目录；默认情况下，原有数据库、配置、缓存和下载不会被删除。发布说明另有迁移要求时，以发布说明为准。

## 校验 SHA-256

从同一官方 Release 下载 `SHA256SUMS.txt`，然后在 PowerShell 中运行：

```powershell
Get-FileHash .\Pica-Library-v0.1.2-windows-x64.zip -Algorithm SHA256
```

将完整校验值与发布页提供的值逐字比较，一致后再解压运行。
