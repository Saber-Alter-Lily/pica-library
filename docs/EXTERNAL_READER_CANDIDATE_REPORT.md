# Windows 外部 CBZ 阅读器候选报告

调研日期：2026-08-14。仅研究，不下载、不捆绑、不背书第三方二进制。包体积来自官方 Release/API 或官方 HEAD，可能随版本变化。

| 候选 | 仓库 / 许可证 | Windows、CBZ、便携 | 打开文件 | 当前维护与 x64 包体积 | 分发含义 |
| --- | --- | --- | --- | --- | --- |
| YACReader | [YACReader/yacreader](https://github.com/YACReader/yacreader)，GPL-3.0 | Windows；CBZ/ZIP；官方安装包，当前未提供独立 portable 资产 | `YACReader/main.cpp` 处理 `argc/argv`；亦可走系统文件关联 | 10.2.0，2026-08-08；Windows x64 60,765,616 B | 功能完整但包较大；若未来捆绑需单独许可证/NOTICE 审批 |
| OpenComic | [ollm/OpenComic](https://github.com/ollm/OpenComic)，GPL-3.0 | Windows；CBZ/ZIP；明确提供 portable、folder-portable | 启动脚本读取 `process.argv`；可直接传文件/系统关联 | 1.6.5，2025-10-31；portable EXE 167,225,092 B；仓库 2026-08 仍活跃 | Electron 体积最大；真正 folder portable 可选，但不适合当前小包目标 |
| SumatraPDF | [sumatrapdfreader/sumatrapdf](https://github.com/sumatrapdfreader/sumatrapdf)，(A)GPLv3/GPL-3.0 仓库标识 | Windows；CBZ/CBR；官方 portable ZIP，单 EXE、不写注册表 | 官方程序接受文件路径参数，Windows 文件关联成熟 | 3.6.1，2026-04-06；64-bit portable ZIP 10,031,830 B；仓库持续更新 | 最轻量，适合“用默认阅读器打开”；仍不应在未审批时捆绑 |

结论：当前 `ExternalReaderAdapter` 应继续使用 Windows 默认文件关联，保持供应链和许可证中立。若以后提供“推荐下载”，优先评估 SumatraPDF 的轻量性与 YACReader 的漫画体验；任何自动下载、内置或再分发都需要独立安全、哈希、来源和许可证审批。

主要来源：[YACReader 官方下载](https://www.yacreader.com/downloads)、[OpenComic 仓库与发行格式](https://github.com/ollm/OpenComic)、[OpenComic 便携版说明](https://opencomic.app/docs/installation/version-differences/)、[SumatraPDF 仓库](https://github.com/sumatrapdfreader/sumatrapdf)、[SumatraPDF 官方下载](https://www.sumatrapdfreader.org/download-free-pdf-viewer)。
