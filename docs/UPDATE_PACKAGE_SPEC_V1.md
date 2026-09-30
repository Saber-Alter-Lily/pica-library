# Update Package Spec v1

## Manifest

ZIP 根必须包含 `update-manifest.json`，字段为：

- `manifestVersion`: 必须为 1。
- `packageType`: `incremental` 或仅预发布可用的 `local-test`。
- `sourceVersionRange`: 当前实现要求精确版本或精确 OR 列表。
- `sourceSha`: 可选但本地验收包必须绑定完整 40 位来源 SHA。
- `targetVersion`, `targetSourceSha`。
- `targetPlatform`, `targetArch`：新包必须成对声明。平台为 `windows|macos|linux`，架构为 `x64|arm64`。为兼容历史发布，缺失这两个字段的 v1 Manifest 只允许解释为 `windows-x64`。
- `appApiVersion`, `databaseSchemaVersion`。
- `requiresFullInstall`。
- `files[]`: `path`, `sha256`, `size`，可选 `category`。
- `deletions[]`。

`SOURCE_SHA.txt` 必须是声明文件，且内容等于 `targetSourceSha`。

## 路径与数据规则

路径统一为 `/`。拒绝绝对路径、盘符、UNC、空段、`.`、`..`、ADS 冒号、尾随点/空格以及安装根逃逸。仅允许 `app/`、`web/`、`licenses/` 和少量已声明根文件。

更新包严禁数据库、SQLite/WAL、凭据、设置、缓存、预览、下载、日志和 Browser Lite 快照。updater 或运行时改变时使用完整安装包；updater 自替换不得伪装成增量包。

## 验证

每个 payload 必须恰好声明一次，字节数和 SHA-256 必须一致，不允许未声明项。稳定版 `incremental` 还必须通过 HTTPS 获取精确 GitHub Release tag，核对同名资产的 GitHub digest 或官方 `SHA256SUMS.txt`；失败时 fail closed，且不降低 TLS。

`local-test` 只在来源和目标版本都含 dev/alpha/beta/rc 标记时接受；稳定版必须拒绝。

兼容性检查使用当前构建自身的 App API 与数据库 Schema：App API 必须保持相同；数据库 Schema 允许保持不变或前进一个有序迁移版本。API 变化、Schema 降级或跨越多个 Schema 版本必须声明 `requiresFullInstall: true`，否则更新包在暂存前即被拒绝。删除项与替换项使用相同的路径、用户数据禁区和 updater 自更新规则。

## Release 资产命名与旧客户端兼容

新客户端优先使用同时绑定来源版本和目标平台的名称：

`Pica-Library-v<target>-<platform>-<arch>-update-from-v<source>.zip`

例如：

`Pica-Library-v0.5.1-windows-x64-update-from-v0.5.0.zip`

Windows x64 为保持旧客户端连续升级，仍可同时发布历史来源作用域别名：

`Pica-Library-v<target>-update-from-v<source>.zip`

以及在确有旧版兼容需求时保留更早的通用名称：

`Pica-Library-v<target>-update.zip`

这些历史通用名称在协议上**只代表 windows-x64**。Linux/macOS 或其他架构不得 fallback 到它们；它们只能接受与自身 target 精确匹配的目标作用域资产。这样即使同一个 GitHub Release 同时存在多个平台包，也不会跨平台误装。

当一个新版本与 public v0.4.0 不满足增量兼容条件时，**不得发布会被 v0.4.0 旧 updater 误识别的通用 `-update.zip`**。只发布完整 Windows 包时，v0.4.0 会进入其已实现的 `full-install` 路径并显示官方 Release 入口；这比发布一个随后必然在 source/schema 校验阶段失败的通用增量包更安全。

目标/来源作用域命名都不是绕过 Manifest 校验：包内部 `sourceVersionRange`、`targetPlatform`、`targetArch` 仍必须匹配，官方 Release digest/SHA-256 校验仍必须通过。Manifest v1 不升版，是为了让旧 Windows updater 安全忽略新增 target 字段；无 target 字段的历史包则只在 windows-x64 上继续兼容。

## 暂存、应用和回滚

主进程验证并解压到独立 staging，用户显式点击“更新并重启”后才生成 instruction 并启动外部 updater。updater 等主进程退出，备份所有受影响应用文件，替换/删除，再启动目标版并通过 `/api/v1/capabilities` 校验目标版本。

健康检查失败时恢复备份、移除本次新增文件、恢复删除项并重启旧版。Library DB、DPAPI 凭据、书架、阅读进度、下载、设置和漫画目录从不进入替换集合。新程序迁移数据库前另建 migration backup。

`requiresFullInstall: true` 的 Manifest v1 增量包仍然**禁止部分应用**；它不能通过把 `requiresFullInstall` 设为 true 来绕过 Schema/API/updater 边界。对于安装了 Universal Upgrade Assistant 的 Windows x64 客户端，Web 更新控制器可以改走独立的 **verified full-application replacement path**：从同一正式 GitHub Release 下载 `Pica-Library-v<target>-windows-x64.zip`，核验 Release digest / `SHA256SUMS.txt`，在应用目录外暂存并启动 detached `full-upgrader`，然后整体替换应用树。若正式 Release 缺少可验证完整包，则仍回退为手工完整安装提示。

完整应用路径与 Manifest v1 增量协议是两条不同路径：完整 Windows ZIP 不伪装成增量 ZIP，也不要求包含 `update-manifest.json`。完整包必须至少包含 `Pica Library.exe`、`runtime/node.exe`、`app/desktop.js`、`app/updater.js`、`app/full-upgrader.js` 和 `SOURCE_SHA.txt`；不得包含数据库、凭据、设置、缓存、下载、日志等用户数据。当前 helper 复制到外部 Desktop runtime-state 后才允许旧程序退出和整树替换，因此 helper/runtime 自身也能随完整包升级。

## Universal full-application replacement

正式 Windows x64 客户端在进入完整应用路径时必须：

1. 只接受官方稳定 Release 中精确命名的 Windows x64 完整包，并验证 SHA-256；
2. 将完整包解压到用户数据根下的独立 staging，而不是旧应用目录；
3. 在旧进程退出前，把当前 bundled Node runtime 与 `app/full-upgrader.js` 复制到应用目录之外的 bootstrap；
4. 确认 Desktop user-data root 与配置的 Library directory 均不位于应用树内，否则 fail closed；
5. 等旧进程完全退出后，建立配置/凭据和 SQLite/WAL/SHM 安全快照，再备份旧应用树并复制新应用树；
6. 启动目标版本并通过 `/api/v1/capabilities` 核对目标版本；Schema 提升仍由数据库自身的 pre-migration backup 机制负责；
7. 健康检查失败时停止候选、恢复旧应用树与升级前安全快照，并重新启动旧版；
8. 健康检查成功后才删除临时应用备份/安全快照；
9. Web 页面必须自动重连目标版本并刷新，不能把“请手动刷新/等待重启”作为正常完成状态。

每一个可被该路径接受的完整 Windows 包都必须继续携带 `app/full-upgrader.js`，这是后续版本仍可一键跨越 Schema/架构更新的持续性契约。

历史客户端无法被未来代码反向赋予该能力。首个包含 Universal Upgrade Assistant 的稳定版之前的 public 客户端仍需要其已经发布/随下一版提供的一次性完整升级助手进入新基线；从新基线开始，后续正式 Windows x64 大版本更新沿用上述路径。

## Schema authority

`databaseSchemaVersion` 必须来自 SQLite migration 的唯一权威 `latestMigrationVersion`，不得再维护一个手写的平行 schema 常量。发布 Gate 必须断言 `DATABASE_SCHEMA_VERSION === latestMigrationVersion`。历史 public v0.4.0 实际已执行 migration 9，但旧 capabilities 常量仍为 8；该漂移只作为兼容性历史记录，不得复制到后续版本。
