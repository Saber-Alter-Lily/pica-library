# S3 CORE-LIB-03a | 正式 Desktop 本地导入接口复用无源核心（2026-10-29）

**状态：** Draft [#234](https://github.com/Saber-Alter-Lily/pica-library/pull/234)，基于独立 Draft #233；尚未合并 `main`、没有用户数据迁移、安装、Release 或 OTA。

## 本轮代码（正式业务，而非第二套 Reader）

- 复用原有 `src/local-library/ingestion.ts`：文件夹/CBZ 扫描、容量与路径保护、SHA256 身份、预览 token、二次确认和本地 SQLite 库存。**没有创建第二套数据库、解析器、推荐器或 Reader**。
- 原 `src/library/server.ts` 生产 `POST /api/v1/desktop/local-import/{preview,confirm,cancel}` 改为委托 `src/library/core-local-import.ts`。该模块只使用 `LocalLibraryIngestion` 的 TypeScript 类型端口，无 `ProviderService/LibraryService` 或任何具体漫画站点 import。
- **信任边界保留：** Web 只能发送 `kind`/`token`；实际文件路径仅由受信任的本机文件选择器获得；源路径、Provider 元数据和账户字段从未通过 HTTP 进入导入器；本机未配置、无原生选择器、headless 和并发选择被拒绝。取消仍不保存，确认 token 单次使用，错误反馈码保持。
- 实际无源 `src/offline-core/qa-cli.ts` 的显式本地 `--path + --confirm` 导入现在也使用相同控制器的 `previewChosen/confirm`；`scripts/build-offline-core-candidate.ts` 强制物理无源 ESM 包闭包包含该生产中立端口，仍禁止 SDK/Host/desktop 反向渗透。
- `test/unit/core-local-import.test.ts` 新增真实 SQLite 的确认/取消/复用保护、路径注入和 source 字段拒绝、缺失原生选择器和 headless、文件对话框并发、路由匹配测试。既有正式 Desktop `test/unit/local-library-http.test.ts` 仍做真正 HTTP/CSRF/封面/阅读功能回归。
- Linux/Windows 的专用 S3 工作流和 Windows 官方 Node x64 Portable ZIP 流程扩展到本 Draft 分支；仍只保留不可执行元数据，不上传候选二进制。

## 验收要求（需精确 SHA 与真实 Actions）

1. TypeScript 编译全过；真实 Desktop HTTP 导入、CSRF 和本机选择器负向测试通过。
2. `core-local-import` 真实 SQLite 预览/确认/取消/碰撞测试通过。
3. 构建中的 `sourceInputs` 存在真实中立控制器，且禁止具体源/Host/desktop 的运行时依赖。
4. Linux + Windows 真实子进程和真实 Chromium 的专项工作流成功；Windows Portable 官方 Node 解压/启动/重启成功。
5. Android + Web/Desktop 全量 CI 对**最新精确可执行代码**完成成功，不能挪用前一 Draft 的绿色结果。

本文件在首次提交时，新的 CI 仍未全部完成，不声明上述所有项目通过；参见后续 PR 检查记录。

## 阻断项与后续 CORE-LIB-03b / CORE-LIB-04

- **下一优先级**：旧 Windows 选择文件夹、打开目录以及本地设置读写的受限平台能力端口；检查既有 WebDAV 业务是否可与具体站点来源完全隔离。目标是原完整首页/书库/书架/Reader/设置可在零 `ProviderService` 启动的 Windows 主程序运行。
- 目前 production `src/library/server.ts` 仍会实例化旧 `ProviderService/LibraryService`，仅一个 HTTP 端口剥离不能代替完整 Core/Provider 分包，也不能把 QA ZIP 作为正式客户端。
- Android 真正来源独立 Service/Binder 与源中立 APK、可信插件签名/受保护安装根、正式 v0.5.0 用户数据和升级回滚、Android UX 真机验收及两个客户端产品验收均未通过。
- **发布关口 G1–G4 全部 OPEN；不发布新版、不改 OTA，不自动操作账号、下载目录或个人库**。第三方来源的法律/版权/使用条款责任不能通过“用户自己安装来源”自动排除。
