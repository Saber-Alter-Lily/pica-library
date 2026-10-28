# S3｜签名来源工作进程安装、启停与回滚（2026-10-28）

**工作状态：Draft PR #221 中的隔离实现；不属于正式版、真实来源或已通过的 G2/G3。**

继承链：S1 [#218](https://github.com/Saber-Alter-Lily/pica-library/pull/218) → S2 [#219](https://github.com/Saber-Alter-Lily/pica-library/pull/219) → S3 独立工作进程 [#220](https://github.com/Saber-Alter-Lily/pica-library/pull/220) → **签名生命周期 [#221](https://github.com/Saber-Alter-Lily/pica-library/pull/221)**。上述 Draft 都未合并 main、未修改 Release/OTA、用户账号、漫画或数据库。

## 目标与现有组件复用

现有 `EcosystemPackStore` 明确只允许 `LOCAL_UNSIGNED` 资源包，不能让普通用户资源清单变为可执行插件。继续复用其“清单固定字段、内容哈希、按版本保留”的模式，但**独立创建受控来源工作进程目录**。来源下载地址、任意 JavaScript/JAR/APK、安装脚本、可执行清单入口、远程代码仓库或 CLI 从不被这个组件自动解析或执行。

本批复用：Node 内置 `crypto`（Ed25519）、`fs` / `path`、已测试的 `TrustedSourceProcess`、`OnlineReaderService` 的来源端口和缓存租约。没有添加第三方依赖，没有复制 Mihon/Suwayomi 的可执行插件加载机制。

## 实现与信任根

`src/source-extensions/signed-worker-store.ts`：

- **来源身份和签名**：发布者只签固定 UTF-8 域分隔消息（schema v1、sourceId、version、size、SHA-256）。强制 Ed25519，完整验证签名，包必须是单个 `worker.cjs`。签名公钥由**受信任的应用本体明确提供**，不读取待安装来源自带的密钥或信任声明。仅供受控应用供应方编译接入，不能把用户填入的任意密钥视为可信。
- **安装**：验证签名和内容大小（≤1 MiB）、哈希；仅写入固定 `versions/<version>/worker.cjs` 和 `release.json`，采用 staging 目录和重命名创建版本目录。已存在版本只能重新检验，不得覆盖。安装不激活、不自动启动、不访问网络或用户书库。
- **读取时再次校验**：明确拒绝 symlink / hardlink、未知多余文件、签名错、内容变更、版本/来源错；对悬空符号链接也不当作不存在，防止绕过版本和激活状态检查。
- **激活/停用**：显式指定已签名版本，先比对 `active.json` 修订号；关闭旧运行时并拒绝挂起操作；写入私有临时指针后同目录原子重命名。安装/重启从不自动启用一个此前未启用的新版本。失效不会悄悄重连。
- **回滚**：保留已安装旧签名版本，用相同的 `activate` 安全验证和修订号门禁显式切回。没有后台静默降级、没有跳过验证的“紧急恢复”。
- **运行**：`openActive` 再次验证已签名文件，并经原 `TrustedSourceProcess` 启动；采用启动 token + 状态修订检查拒绝激活变更后的迟到启动。已有 Reader 的缓存前来源身份、权限和进程租约校验保持不变。

## 测试和阶段证据

`test/unit/signed-worker-lifecycle.test.ts` 使用运行时一次性生成的 Ed25519 密钥，私钥不提交仓库、不写入测试工件，受控 worker 完全是原有无账号、无网络的 `test/fixtures/s3-trusted-worker.cjs`。

验收覆盖：未签名/伪造签名/其他公钥拒绝、加密哈希损坏、恶意路径/非法版本、追加文件/悬空 symlink、安装不启用、固定版本不可覆盖、显式启用→完整 Reader 章节/图片/进度链、真实 worker 关闭/挂起图片撤销、旧版回滚、过期修订拒绝、跨进程实例重读状态、模拟激活重命名失败仍保留旧状态、Windows 只读文件/进程句柄清理。独立 Linux+Windows 工作流及全量 CI 按 **精确源码 SHA** 判断，未得到新源码双平台成功前状态为 **PENDING**，不得引用 PR #220 的通过代替本批。

| 出口 | 状态与后续工作 |
|---|---|
| S3-SIGN-01：清单公钥与 Ed25519 验签 | Draft 已实现；待精确 CI |
| S3-LIFE-01：分代安装、不自动启用 | Draft 已实现；待精确 CI |
| S3-LIFE-02：启停、挂起取消、回滚 | Draft 已实现；待精确 CI |
| S3-LIFE-03：Linux/Windows 真实 worker 测试 | Draft CI 在运行；待双平台结果 |
| S3-PKG-01：正式 Windows 私有安装根、权限和签名公钥轮换 | **NOT_IMPLEMENTED** |
| S3-SANDBOX-01：OS 子进程权限隔离及恶意 worker 的安全证明 | **NOT_IMPLEMENTED** |
| S3-AND-01：Android Binder/AIDL 与来源运行权限隔离 | **NOT_IMPLEMENTED** |
| S3-SRC-01：真实 Pica/E-H/JM 独立适配且官方 Core 不带其 SDK | **NOT_IMPLEMENTED** |
| S3-OLD-01：v0.5.0 老账号、书库、下载、阅读进度和一键升级回滚 | **NOT_VERIFIED** |

## 不得越过的安全限制

这是**单进程写入者、受信任安装根和受信任发布者**的工程原型，不是生产级多进程事务，也不是操作系统沙箱：Node worker 在宿主用户权限下运行；发布文件写入后可能被同权限程序改动；验证与 `fork` 之间尚不能消除所有 TOCTOU 风险；多文件动态依赖、密钥轮换、OS ACL、正式签名发行、Windows 锁定安装目录与 Android 隔离进程尚未完成。原子指针替换不等于跨断电的全部目录元数据持久性证明。

**下一工程切口**：先通过精确双平台测试并冻结 signed worker V1，随后只在独立开发安装包中从签名组件仓库组合一个实际来源适配器，做好用户明示授权/凭据代理，进而物理移除内置 SDK，并对正式签名包、原用户数据升级及故障回滚逐项验收。可选 Suwayomi 不作为本地漫画或 WebDAV 阅读的强制依赖。
