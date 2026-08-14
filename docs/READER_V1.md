# Reader v1

内置 Web Reader 只读取已下载并登记在 Library DB 的图片，支持连续纵向、单页、双页、LTR、RTL、适应宽度/高度、全屏，以及方向键/PageUp/PageDown。未下载章节返回明确提示，不会因打开 Reader 而在线抓取整章。

图片 ID 先解析到数据库记录，再做文件存在、类型和 realpath 根约束；任意路径、`..` 和 symlink 逃逸均被拒绝。浏览器响应不泄露 `localPath`。

阅读进度按 comic/episode/page 持久化并按更新时间排序。再次打开漫画优先恢复最近阅读章节和页码；页码必须位于已下载页范围。

CBZ 导出按零填充页序写入图片，不嵌入账号、token、Cookie 或路径元数据。导出位于 Library 根的 `exports/cbz`。默认阅读器通过 `explorer.exe` 与独立参数数组打开，子进程环境经过脱敏；不拼接 shell 字符串。

本轮不内置任意本地 CBZ/ZIP 临时导入，以避免在 path traversal、解压上限和临时资源清理完成前扩大攻击面；这不影响核心下载漫画 Reader 和 CBZ 互操作。
