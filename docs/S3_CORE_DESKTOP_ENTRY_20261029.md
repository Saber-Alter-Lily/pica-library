# S3 CORE-LIB-04c-02a｜独立无来源 Desktop 入口与 Windows 原生选择器（2026-10-29）

**开发位置：** [Draft PR #241](https://github.com/Saber-Alter-Lily/pica-library/pull/241)。正式 main、v0.5.0 Release、OTA、安装文件及现有用户数据均未修改。

## 目标和复用架构

前期已证明原正式完整 Web、SQLite、Reader、Shelf 和本地导入可由无来源 Node 核心实际运行，但旧 Desktop 默认入口仍会静态加载 LibraryService/ProviderService。本轮只分离物理启动入口，复用原有实例锁、独立核心业务组合、TypeScript/esbuild、原 Windows C# Launcher、已审核的完整网页和官方 Node 打包流程，没有创建第二套书库/阅读器。

## 实际实现

- src/offline-core/qa-ownership.ts 抽出旧 QA CLI 的精确 sentinel/SQLite 所有权校验，新增真实 OS Temp 根限制；未初始化的目录、软链接、非独占数据库以及正式用户 profile 均拒绝。
- src/desktop/core-preview-main.ts 是单独的可执行启动路径，不导入旧 LibraryService、ProviderService、Pica/E-H/JM SDK、来源 Host、用户账号、更新器或文件系统打开器。仅复用已验证的 createCoreLocalRuntime、原全网页受控 HTTP 与原 InstanceLock。Windows 非正常终止时通过已有的验证旧 PID 已死亡机制回收 stale lock，而不是无条件删除。
- scripts/build-offline-core-candidate.ts 增加第二种 desktop-core-preview 实体构建，保留 Node 内置、已审计 AdmZip 和项目根版本元数据的严格白名单；src/desktop 目录只允许该预览入口及旧 InstanceLock，所有具体来源代码继续拦截。
- 真正的 packaging/windows/Launcher.cs 保持默认 app/desktop.js 不变。仅首参数 --source-free-preview 时选择 app/desktop-core-preview.mjs，并将剩余参数转交新入口；目标文件缺失不得悄悄回退到旧 SDK 程序。
- 现有 Windows 官方 Node x64 Portable QA 的 Full-Web 临时变体，增加从原 C# 编译的 Pica-Library-Core-Preview.exe 和物理独立、无 SDK 的 desktop-core-preview.mjs。旧 Reader-only ZIP 保持不变，使用官方 Node 24.15.0 的固定 SHA-256 验证。所有 ZIP 仅在 CI OS Temp 中生成和销毁，不上传可安装/可执行产物。
- Windows ZIP 校验器实际使用原 C# Launcher 显式启动预览进程，检查受控 loopback/Cookie、原完整网页、本地 SQLite 与来源脚本不被提供；退出清理仅尝试本次实例实际发布的 PID，不能结束其它 Node 进程。

## CI、真实失败和修正

- [独立入口 Linux/Windows #40881540640](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40881540640)：SUCCESS。涵盖物理依赖图、真实独立 Node 启动、单实例、重启、原书库与页面、未授权根拒绝。
- 首轮 #40881093945 中缺失 sentinel 的 ENOENT 未归一为预期拒绝；修复了错误响应但没有放宽安全校验。
- 次轮 #40881269714 暴露 Windows 直接终止 Node 会绕过 SIGTERM 清理、留下锁；通过原 InstanceLock 死 PID 验证后回收锁，不能盲删。
- [首轮 Windows native + Reader/Full-Web 双 ZIP #40881936384](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40881936384)：Reader-only SUCCESS，Full-Web 的测试进程清理遇 EPERM，故未通过。本轮修订为等待精确受测 PID 死亡和短暂文件句柄释放；新的 [#40882450092](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40882450092) 必须读取最终结果后才能判定。
- 生产 Android/Web/Desktop [#40882462037](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40882462037) 也需按本次可执行 HEAD 独立确认。历史成功结果不能替代。

## 剩余正式产品关口

**新入口目前仅接受显式、已初始化、位于 OS Temp 的测试书库；不承认它已能直接迁移/启动真实 v0.5.0 用户目录。** 独立可执行图确实可以不加载来源 SDK，但完整的正式 Windows 默认运行/升级仍未切换。后续 CORE-LIB-04c-02b 应先做旧 v0.5.0 真实备份/只读盘点与回滚契约，再实现正式新用户 source-free profile、设置/本地导入/受限 WebDAV 能力，并用原生安装器组合测试整条启动链；之后再做可信签名的来源包加载、更新和撤销，Android source-free Service/Binder/APK、用户数据无痛升级和真机视觉验收。

**G1–G4 全部 OPEN。当前 PR 保持 Draft，不合并 main，不生成 Release/OTA。**