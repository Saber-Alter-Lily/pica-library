简体中文 | [English](README.en.md)

# Pica Library

把 Pica 收藏同步成一个可持续维护的本地漫画库，并在同一个界面里完成整理、推荐、下载和阅读。

**Windows 10/11 x64 · 解压即用 · 数据默认保存在本机。**

### 直接下载

- **新用户 / 完整安装：**[Pica-Library-v0.3.0-windows-x64.zip](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.0/Pica-Library-v0.3.0-windows-x64.zip)
- **v0.2.0 手动升级包：**[Pica-Library-v0.3.0-update.zip](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.0/Pica-Library-v0.3.0-update.zip)
- [查看 v0.3.0 Release 页面](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.3.0)

![Pica Library 漫画库使用示意](docs/assets/screenshots/v0.3.0/02-library-guide.png)

## 开始使用

1. 下载上面的 **完整安装包** `Pica-Library-v0.3.0-windows-x64.zip`。
2. **完整解压** ZIP，不要直接在压缩软件中运行。
3. 双击 `Pica Library.exe`。
4. 按首次设置填写账号、可选代理和保存目录。
5. 同步收藏，开始使用。

更详细的首次使用步骤见 [快速开始](docs/quick-start.zh-CN.md)。

## 主要功能

- **漫画库：**同步收藏，按作者、标签、分类和书架筛选与整理。
- **个性化推荐：**根据自己的收藏画像生成推荐，显示推荐理由，可换一批或重新生成。
- **收藏图鉴：**把长期收藏整理成作品/IP、作者和语义兴趣画像，并可导出结果卡。
- **下载与阅读：**统一管理下载队列、失败重试和阅读进度，支持内置 Web Reader。
- **维护与更新：**检查内容更新、修复缺失文件，并在应用内安装兼容的官方更新。

### 个性化推荐

![Pica Library 推荐使用示意](docs/assets/screenshots/v0.3.0/03-recommendations-guide.png)

推荐来自本地收藏画像。每轮分批浏览，可以换一批，也可以重新生成新的推荐轮次。

### 收藏图鉴

![Pica Library 收藏图鉴使用示意](docs/assets/screenshots/v0.3.0/04-atlas-guide.png)

收藏图鉴把作品/IP、作者和长期语义偏好整理成本地图谱，并支持导出结果卡 PDF。

## 从旧版本升级

- **v0.2.0 → v0.3.0：**优先打开 **库维护 → 软件更新 → 一键检查并更新**。
- 如果自动读取 GitHub Release 失败，直接下载 [Pica-Library-v0.3.0-update.zip](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.0/Pica-Library-v0.3.0-update.zip)，然后在更新页拖入或手动选择该 ZIP。
- **v0.1.x：**请下载 [完整 Windows 安装包](https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.3.0/Pica-Library-v0.3.0-windows-x64.zip) 重新解压。

![Pica Library 软件更新示意](docs/assets/screenshots/v0.3.0/05-update-guide.png)

用户数据库、收藏和下载内容位于独立数据目录；兼容更新不会因为替换应用文件而删除这些数据。

## 数据与安全

- 数据默认保存在本机。
- 账号凭据使用当前 Windows 用户的 DPAPI 加密保存。
- 本地服务只监听 `127.0.0.1`。
- Pica 密码不会写入数据库、导出包或发布文件。

## 更多

[快速开始](docs/quick-start.zh-CN.md) · [Windows 使用指南](docs/windows-distribution.zh-CN.md) · [开发与架构](docs/architecture.md) · [Issue](https://github.com/Saber-Alter-Lily/pica-library/issues) · [LICENSE](LICENSE) · [UPSTREAM](UPSTREAM.md)

请只下载你有权访问的内容，不要重新分发漫画文件。
