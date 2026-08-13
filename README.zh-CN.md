简体中文 | [English](README.md)

# Pica Library

> 当前稳定版本仍为 `v0.1.2`；`v0.1.3` Browser Lite 引导更新正在审核中。

## Browser Lite

Browser Lite 可直接在浏览器中查看已导出的漫画库数据，无需在网页中输入 Pica 账号或密码。

1. 从 [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases) 下载并打开 Pica Library Windows 版。
2. 完成首次设置并准备好漫画库。
3. 打开“设置 → Browser Lite → 导出 Browser Lite 数据包”。
4. 在 Browser Lite 中导入 `pica-library-bundle.json`。

完整数据包可包含已准备好的漫画库、作者信息和推荐结果；仍兼容现有 CSV / JSON 文件。

一个面向大量 Pica 收藏的本地漫画库管理、发现与下载工具。

## Windows 一键使用

当前稳定版本为 `v0.1.2`，包含完整简体中文界面和双语首次启动向导。

1. 打开 [GitHub Releases](https://github.com/Saber-Alter-Lily/pica-library/releases)。
2. 下载 `Pica-Library-v0.1.2-windows-x64.zip`。
3. 完整解压 ZIP，不要直接在压缩软件中运行。
4. 双击 `Pica Library.exe`。
5. 按首次启动向导完成设置。

无需安装 Node.js、npm、pnpm 或 Git；无需使用命令行，也无需管理员权限。

## 主要功能

- **漫画库管理：**同步或导入收藏，按标签和归一作者筛选。
- **个性化推荐：**根据收藏中的作者、社团、标签和分类偏好发现作品。
- **下载任务管理：**统一队列、进度、重试、暂停和继续。
- **下载恢复：**保留持久化进度，避免长期连载作品每次全部重下。
- **库维护：**检查更新、修复缺失文件并审核作者别名。
- **Browser Lite：**仅在浏览器中导入数据包进行轻量查看，不需要账号密码。
- **GitHub Runner：**供高级用户在自己的私有仓库中执行短批次任务。

## 数据与凭据

Windows 版本默认把可变数据放在 `%LOCALAPPDATA%\Pica Library`，与解压后的程序目录分离。账号和密码只用于连接 Pica 服务，并使用当前 Windows 用户的 DPAPI 加密保存。保存后的密码不会在设置页面显示，也不会写入普通配置、SQLite 数据库、Bundle、日志或发布 ZIP。

本地服务默认只监听回环地址。代理为可选项，仅接受 HTTP/HTTPS 代理地址。详细说明见 [Windows 一键版使用指南](docs/windows-distribution.zh-CN.md)。

## 使用边界

仅下载你有权访问的内容，不要重新分发下载内容。Pica Library 是独立维护的开源项目；上游来源和许可证见 [UPSTREAM.md](UPSTREAM.md)、[NOTICE.md](NOTICE.md) 与 [LICENSE](LICENSE)。

架构与审核记录位于 [docs/architecture.md](docs/architecture.md) 和 [docs/audit](docs/audit)。
