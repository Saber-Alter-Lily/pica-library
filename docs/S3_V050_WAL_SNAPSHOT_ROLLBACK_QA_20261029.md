# S3 CORE-LIB-04c-02b-02｜v0.5.0 一致性备份与安全回滚原理验证（2026-10-29）

**分支：** `codex/s3-v050-snapshot-rollback-qa-20261029`；**交付：** [Draft #243](https://github.com/Saber-Alter-Lily/pica-library/pull/243)，叠加 [Draft #242](https://github.com/Saber-Alter-Lily/pica-library/pull/242) 的旧资料只读预检。当前正式 `main` SHA `095d6910c34e00824e03b08a30af0ce4e708137e`（v0.5.0）未更改；没有 Release、OTA、真实资料读取/复制/迁移、账号访问或签名操作。

## 为什么不能直接复制 library.db

旧客户端以 SQLite 保持漫画身份、下载、书架、阅读历史和画像信息。存在 `library.db-wal` 时，部分已提交数据可能尚未检查点写回主数据库文件。复制单一 `library.db` 不等于一致性备份；复制 WAL/SHM 文件也不能在任意运行时保证同一时刻的资料集合。

本阶段使用项目固定的 Node 24.15.0 内置 `node:sqlite` 的 `backup(sourceDb, destination)`，基于 SQLite Online Backup API 获得一致性数据库快照；**不开发第二套 SQLite 引擎、不重复实现数据库迁移**。为兼容当前 Vite 5，采用原 `LibraryDatabase` 已使用的 `createRequire(import.meta.url)('node:sqlite')` 入口，而非添加第三方依赖。

## 真实实现范围（只有合成样本）

- `src/desktop/legacy-profile-snapshot-qa.ts` 固定要求显式 OS Temp 根 `pica-v050-rollback-qa-*` 和精确 sentinel `.pica-v050-rollback-fixture-v1`，只查看其下的 `profile/`，写入仅限先前不存在的 `snapshot/`、`restored/`。没有默认 profile 搜索或面向用户的 CLI/UI/自动更新调用。
- 旧 `config/config.json` 必须是现有 schemaVersion 1，`libraryDirectory` 必须指向这个独立合成 `profile/data`。真实外置路径、锁文件（即便看起来 stale）、未审核路径、软链接/硬链接、设备文件、过大/过深文件、已存在快照/恢复目标直接拒绝。与 #242 的只读预检互相独立，**#242 对 WAL 仍保守返回 REVIEW_REQUIRED**。
- 核心数据库先记录主文件和 WAL 的 SHA-256。未发现 WAL 时使用只读 `immutable=1` 文件 URI，避免 SQLite 因 WAL-mode 头而创建空 `-wal`/ `-shm`；发现真实 WAL 时改用只读 SQLite Online Backup 将已提交帧纳入目标快照。仅对新备份目标设置 `journal_mode=DELETE` 和执行完整 `PRAGMA integrity_check`，然后再次核对源主 DB 与 WAL 的内容哈希/大小。原 `-shm` 属临时锁共享内存，不能当作可恢复资料复制。
- 在合成 profile 内，原 config、虚拟加密 `credentials.dat`、WebDAV 与 source-host 配置、下载漫画图片、缓存、packs 和 `runtime-state/personalization` 作为不解析的**不透明字节文件**保存并逐文件 SHA-256 核对；不记录敏感内容到报告。保留零字节用户文件。旧 `logs`、`runtime-state/upgrade-assistant`、`updates` 与 instance 元数据不打包，manifest 明确列出排除项；这些旧的可执行文件不可静默恢复。
- `manifest.json` 记录相对路径、大小、SHA、SQLite 备份标志和明确的 `crossFileAtomicityProven:false`。只有调用方持有正确 manifest SHA 时才会先对**全部快照文件**做校验，随后独占创建新的 `restored/` 并复制，最后再次运行数据库完整性检查。快照有任一篡改、父目录软链接或目标已有时均不允许恢复，绝不删除或覆盖 `profile/`。
- 此演练限 **240 文件 / 单文件 64 MiB / 总计 192 MiB** 的合成案例；它不是可以直接用于真实用户大书库的容量设置，也未证明 SQLite 与全部非数据库媒体文件之间的应用级跨文件原子性。原 App 应先停止写入并记录正式事务边界。

## 工程与真实失败记录

- [旧版只读预检 #40884355745](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40884355745) Linux/Windows SUCCESS，仍不执行任何备份操作。
- [首轮 WAL 备份测试 #40894619522](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40894619522) 失败于 Vite 5 的 `node:sqlite` ESM 解析；已复用原项目 `createRequire`。
- [第二轮 #40894856666](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40894856666) 实际暴露旧 checkpointed WAL-mode 的只读连接可能额外创建空 WAL，已为无 WAL 时添加 SQLite immutable URI，并**保留**严格源 sidecar 比较，不能忽略状态变化。
- [基础 WAL/回滚双平台 #40895318054](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40895318054)：**Linux + Windows 两项 SUCCESS**，包括真实未检查点 WAL 数据纳入、恢复后行读取、原书架/阅读记录/虚拟账号文件、篡改拒绝及禁止访问真实根。
- 后续进一步加固零字节用户文件、短写重试、阶段性 SHA、禁止软链接父目录及 `crossFileAtomicityProven:false` 证据，**精确最终源码以 [#40895722435](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40895722435) 专项和相应完整 Android/Web/Desktop CI 为准**。本文首次写入时尚未核实其最终状态，不借用先前绿色测试来声明最新更改已通过。

## 不能提前关闭的真实迁移与发布缺口

1. 需要对真实 v0.5.0 发行时的**完整历史 schema、用户磁盘布局与外置目录**建立独立版本样本。合成旧版结构不等于原发行版的完整取证。
2. 需要应用级“停止后台任务/关闭所有连接/冻结写入”与一致性媒体快照、受保护目录、完整性验收、Windows DPAPI/凭据引用、远端 WebDAV 同步状态，以及大容量/磁盘不足/杀进程/断电恢复。
3. 真正用户备份应有明确同意和强加密/OS 安全保存位置、来源签名/manifest 信任根、保留旧安装版本与一键回滚路径；**本演练并未提供这一生产能力**。
4. 真正纯核心 Windows 启动目前仅在 OS Temp owned fixture + 原 C# Launcher 的独立二进制中验收；还未授权接管正式原安装/默认 Profile。Android source-free Service/Binder APK、可信插件分发与撤销、手机 UI/引导/布局实机 G1 以及全部 42+新增12 例最终产品验收仍待完成。
5. #232 和 #233 是不同书架实现分支，正式集成前需审查差异并选版。

**G1、G2、G3、G4 均 OPEN；所有 PR 均 Draft，未合并正式 main、未发布/OTA、未操作真实用户资料。**
