# Pica Library Android 使用说明

> 当前版本：**Android Preview v38 · Alpha8.11**。Android 版本**未上架任何应用商店**，请仅从本仓库 GitHub Release 下载 APK。

![Android 页面说明](https://raw.githubusercontent.com/Saber-Alter-Lily/pica-library/c55c4f39171874a7fa800803a5a3cf979defd0ab/docs/assets/android-overview-final.png)

## 1. 下载与安装

1. 打开 [Android Preview Release](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/android-preview)。
2. 下载 `Pica-Library-Android-Preview.apk`。
3. 在手机上打开 APK，并按系统提示允许本次安装。
4. 首次启动阅读并确认使用提示后进入应用。

不要从不明网盘、群文件或第三方下载站获取 APK。官方 Preview 会使用固定签名，并在更新时校验包名、版本、SHA-256 和签名身份。

## 2. 底部四个主入口

- **书库**：查看本地、收藏、历史和已下载内容。
- **推荐**：浏览个性化推荐。
- **在线**：访问在线搜索、分类、排行等功能。
- **连接**：管理 Desktop 配对、WebDAV、Pica 账号、外观、存储和软件更新。

## 3. 连接电脑

手机和电脑在同一局域网时：

1. Desktop 打开移动端连接功能。
2. Android 进入 **连接 → 管理连接**。
3. 选择局域网电脑并完成配对。

配对后，手机可以直接访问电脑已经下载的漫画和本地资源，避免重复下载。连接状态会显示当前在线的电脑名称。

## 4. WebDAV 与 Pica 账号

- **WebDAV**：可以配置为电脑离线时的备用阅读来源。
- **Pica 账号**：用于需要在线账号能力的页面和功能。

这些入口都集中在 **连接与设置** 页面中，状态会直接显示为已配置、可连接或可用。

## 5. 外观

进入 **连接 → 外观设置** 可以选择：

- 跟随系统；
- 浅色；
- 深色。

基础明暗模式可以直接使用。

## 6. 个性化装扮

Android 可以使用本机已有主题包，也可以在与 Desktop 配对后同步可用主题包。若某项主题功能需要额外验证，请按应用内提示完成。主题包可以同步，但当前主题仍由手机独立选择。

## 7. 阅读电脑已下载内容

Android 的重点能力之一是直接读取 Desktop 已经下载的漫画：

- 不需要手机重新下载同一漫画；
- 局域网连接时优先读取 Desktop 本地资源；
- WebDAV 可作为备用来源；
- 手机上可以继续阅读并保留自己的使用体验。

## 8. 下载与存储

在 **连接 → 存储与下载** 中可以进入缓存与下载任务相关页面。Android 软件更新会调用系统安装流程，并在安装前校验更新包。

如果下载更新时短暂显示“等待系统下载服务”，通常是 Android 系统 DownloadManager 正在排队；稍候或重新开始任务即可。

## 9. 软件更新

进入 **连接 → 软件更新** 检查新版本。

Android Preview 更新包来自本仓库的 `android-preview` Release，安装前会检查：

- versionCode / versionName；
- APK SHA-256；
- 应用包名；
- 固定官方签名证书。

## 10. 数据与使用说明

Pica Library 是开源、本地优先的个人数字内容管理工具，不销售、托管或重新分发漫画内容。用户需要自行确保账号使用、访问、下载、保存和阅读行为符合所在地法律法规、平台条款以及版权或其他授权范围。

完整说明见 [DISCLAIMER.md](../DISCLAIMER.md)。

---

[返回 README](../README.md) · [Desktop / Web 使用说明](desktop-guide.zh-CN.md)
