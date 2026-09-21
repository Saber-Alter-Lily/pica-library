# Pica Library 快速开始

当前稳定版：**v0.4.7**。第一次使用 Windows 版通常只需要完成下载安装、首次设置、同步书库和按需配置推荐。

## 01 下载与解压

从 [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases/latest) 下载当前稳定版 Windows 完整包。

v0.4.7 对应：

`Pica-Library-v0.4.7-windows-x64.zip`

完整解压到普通文件夹，不要直接在压缩软件中运行。

## 02 第一次启动

双击 `Pica Library.exe`。首次启动会在浏览器中打开本地设置页面。

按需完成：

- Pica 账号登录或注册；
- 漫画保存目录；
- 下载方式；
- HTTP/HTTPS 代理。

代理默认不需要填写，只有当前网络环境确实需要代理访问在线来源时再配置。

Windows 可执行文件当前未进行商业代码签名，因此 SmartScreen 可能显示提示。请先确认文件来自项目官方 GitHub Release，并核对 SHA-256 后再决定是否运行。

## 03 建立统一漫画库

完成账号配置后，可以同步收藏并建立本地漫画库。

漫画库可以统一整理：

- Pica；
- E-Hentai / ExHentai；
- Desktop 本地内容；
- Android；
- WebDAV；
- 已下载内容。

支持按标题、作者、标签、分类、Provider、存储位置等条件筛选。

## 04 使用推荐

推荐会结合长期收藏、最近行为、显式偏好和当前会话意图。

进入 **设置 → 推荐与画风** 可以查看推荐画像和人工调整。

人工偏好使用 **0–10 档**：

- **5/10**：中性；
- 高于 5：希望更多看到；
- 低于 5：希望减少；
- 也可以直接屏蔽；
- 可以设置“本次想看”等临时意图。

即使还没有足够收藏数据，也可以先手动配置最初的推荐偏好。

画风推荐是可选独立模块，关闭后不会影响常规推荐。

## 05 在线浏览、下载与阅读

在线页面支持 Pica、E-Hentai / ExHentai 的搜索、详情、收藏和阅读等能力。

把作品加入下载任务后，可以查看进度、暂停、继续或重试。下载完成后可在本机阅读。

阅读器支持：

- 左到右；
- 右到左；
- 纵向连续；
- 章节切换；
- 阅读进度保存；
- 从历史记录继续阅读。

## 06 连接 Android

Desktop 打开 **设置 → 连接与同步**，Android 打开 **设置 → 管理连接**。

配对后 Android 可以直接读取 Desktop 已下载漫画，不需要重复下载；两端也可以同步可移植书库、推荐基础数据、人工偏好和主题包。

Desktop 与 Android 的推荐可以独立运行，同步不会强制两端当前推荐批次完全一致。

## 07 支持项目

Desktop：**设置 → 基本设置 → 支持项目**

Android：**设置 → 支持项目**

可以进入爱发电或 GitHub 项目主页。支持完全自愿，不会解锁额外功能、内容或访问权限。

## 08 软件更新

Windows 打开 **设置 → 软件更新**。

已有 **v0.4.0** 的用户直接升级到当前最新版即可：

- 从 v0.4.7 Release 下载 `Pica-Library-v0.4.7-upgrade-assistant.zip`；
- 解压后运行 `Upgrade-Pica-Library-v0.4.7.cmd`；
- 无需安装任何中间版本。

升级助手会校验官方完整包、保护 `%LOCALAPPDATA%\\Pica Library`、备份旧程序和数据库、替换程序并执行健康检查；失败时自动回滚。

Android 已有 v42 / 0.4.0 用户可直接通过应用内更新链升级到 v50 / 0.4.7，无需安装中间版本。

应用程序文件与用户数据目录彼此独立。升级不需要卸载，也不需要重新导入数据库、书架、历史或设置；不要为了升级删除 `%LOCALAPPDATA%\\Pica Library`。

## 09 需要进一步说明时

- [Desktop / Web 使用说明](desktop-guide.zh-CN.md)
- [Android 使用说明](android-guide.zh-CN.md)
- [Windows 分发与升级](windows-distribution.zh-CN.md)
- [版本日志](../PROJECT_LOG.md)
- [使用边界与免责声明](../DISCLAIMER.md)
