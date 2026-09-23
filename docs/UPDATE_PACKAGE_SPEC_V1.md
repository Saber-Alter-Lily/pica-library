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

`requiresFullInstall: true` 时只显示完整安装提示和 GitHub Release 入口，禁止危险的部分应用。

## Schema authority

`databaseSchemaVersion` 必须来自 SQLite migration 的唯一权威 `latestMigrationVersion`，不得再维护一个手写的平行 schema 常量。发布 Gate 必须断言 `DATABASE_SCHEMA_VERSION === latestMigrationVersion`。历史 public v0.4.0 实际已执行 migration 9，但旧 capabilities 常量仍为 8；该漂移只作为兼容性历史记录，不得复制到后续版本。
