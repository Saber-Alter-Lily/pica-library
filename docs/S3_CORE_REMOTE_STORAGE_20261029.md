# S3 CORE-LIB-03b｜正式 Desktop WebDAV 命令与状态移入来源无关端口（2026-10-29）

**工作分支/PR**：`codex/s3-core-remote-storage-20261029` / [Draft #235](https://github.com/Saber-Alter-Lily/pica-library/pull/235)，叠加已通过全量 CI 的 CORE-LIB-03a [#234](https://github.com/Saber-Alter-Lily/pica-library/pull/234)。不合并 `main`、不发布、不改用户资料、正式账户、签名、Release 或 OTA。

## 已实施：直接重用原管理器，不重做 WebDAV 或 SQLite

- 原 WebDAV 与网盘实现已经集中在 `src/remote-storage/desktop-manager.ts`、既有 Provider、`RemoteLibrarySyncService` 和 `RuntimeResourceCoordinator`。本轮不修改其 WebDAV 请求、远端同步、下载凭据、租约、取消状态、选中作品、目标隔离或明确远端删除确认的实现。
- 新建 `src/remote-storage/core-action-port.ts`：仅以 `import type` 引用 `RemoteStorageDesktopManager`；所有运行时行为均为外部调用时注入原有 manager。保留 `save`、`sync`、`pause-sync`、`resume-sync`、`cancel-sync`、`delete-remote` 以及原 status 兼容投影。未知动作原样落回 Desktop 普通设置路径；缺失 manager 显式拒绝。
- 真正的 `src/desktop/main.ts` 原 `desktop.save` 大块 WebDAV 操作现调用共享接口，`desktop.status.remoteStorage` 也使用共享投影。**不添加 API、不默认联网、不自动启用来源**；原受控 `POST /api/v1/desktop/settings`、Host/CSRF 会话和 `RemoteStorageDesktopManager` 的 CredentialStore/远端 generation/scope/确认仍为唯一权威。
- 该代码为跨模块的正式生产调用链提取，不是套新的 QA 小应用；还不能从生产主程序物理删除 `LibraryService/ProviderService`。

## 测试与真实失败（保留记录）

- 新 `test/unit/core-remote-storage-port.test.ts` 以临时 SQLite + `MemoryCredentialStore` + 原 `RemoteStorageDesktopManager` 验证保存网盘设置、公开 registry 不存账号密码、公开 status 投影、原动作派发、暂停恢复取消及删除确认异常；静态检查仅 type-import，非 runtime import。
- 完全沿用已有 `test/unit/remote-multi-target.test.ts`、`remote-selected-copies.test.ts`、`webdav-123pan-compat.test.ts`，覆盖既有多目标选择、来源数据与网盘副本分离、123 盘兼容。独立 `s3-core-storage-qa.yml` 在 Linux + Windows 分别执行类型检查及共 **29 项**测试。实际 CI 最终状态以工作流为准。
- **首轮确实失败**：[CI #40853704332](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40853704332) TypeScript TS2322：新 `CoreRemoteDispatch` 返回类型写为 `unknown`，不能赋给原 `DesktopServerController.save` 要求的 `Record<string,unknown>`。修复后保留原结构化响应合同，没有改运行逻辑或跳过检查，修复提交 `ab4137b4448924f46a9bebf1c8911b6838179b5e`。
- [修复后专项 #40853863903](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40853863903) 和 [完整 Android/Web/Desktop CI #40853872527](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40853872527)：在本文初始写入时仍有任务运行；**不提前标注完整 SUCCESS**。代码 SHA 与文档 SHA 必须区分。

## 后续固定路线与未通过的门禁

- CORE-LIB-03c：把现有本地配置、原生 `choose-folder` / 受限 `open-directory` 及其他独立平台功能通过明确能力端口组合；不允许接受任意远端提交的绝对路径和启动程序。
- CORE-LIB-04：以**原 Windows 正式完整页面**（首页、书库/书架、Reader、设置及本地/WebDAV）和同一正式数据库为目标实现真实 core-only 组合，实体打包闭包不得含具体 Provider SDK；不要继续用独立 QA Reader 替代产品。
- 继续受控来源签名发行/撤销/权限隔离，Android source-free APK + 原生 Service/Binder，正式 v0.5.0 的书库/账号/记忆/下载/一键更新和回滚、Android 真实设备及原 42+新增12 项产品验收。
- **G1/G2/G3/G4 全部 OPEN**。工程回归绿灯不等于完整用户产品满意度或正式可发布。开放插件框架不能自动消除应用法律/站点条款/版权责任。
