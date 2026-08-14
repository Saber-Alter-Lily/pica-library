# Update Package Spec v1

## Manifest

ZIP 根必须包含 `update-manifest.json`，字段为：

- `manifestVersion`: 必须为 1。
- `packageType`: `incremental` 或仅预发布可用的 `local-test`。
- `sourceVersionRange`: 当前实现要求精确版本或精确 OR 列表。
- `sourceSha`: 可选但本地验收包必须绑定完整 40 位来源 SHA。
- `targetVersion`, `targetSourceSha`。
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

## 暂存、应用和回滚

主进程验证并解压到独立 staging，用户显式点击“更新并重启”后才生成 instruction 并启动外部 updater。updater 等主进程退出，备份所有受影响应用文件，替换/删除，再启动目标版并通过 `/api/v1/capabilities` 校验目标版本。

健康检查失败时恢复备份、移除本次新增文件、恢复删除项并重启旧版。Library DB、DPAPI 凭据、书架、阅读进度、下载、设置和漫画目录从不进入替换集合。新程序迁移数据库前另建 migration backup。

`requiresFullInstall: true` 时只显示完整安装提示和 GitHub Release 入口，禁止危险的部分应用。
