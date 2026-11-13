# P2：真实用户宿主互操作门禁（未发布）

## 运行后证据补记（冻结源码，原失败与执行前快照保留）

`8045754b88c81cd692018915a2dfe779700d0ebd`/PR215：[真实Host40453173182](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40453173182)、job122020358508 PASS；[常规CI40453179583](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40453179583)双job PASS。原始976字节artifact ZIP SHA256 `04dfb6548fbf886ecc15bc3aabfada092382e22ec22ab5a94d37c1bc5a50bb00`及唯一result.json SHA256 `9472c18250cea4c67a480531e63fa99bc2a0525ac030fefd333065ebf94e88be`均已独立核验。两册元数据均实际为-1，取页后为2；八个固定操作、四页正文、明确保存、撤销和Host退出、全新Node进程离线四页/进度保留全部通过。

Web56/56、Vitest2612PASS/14skip/330文件、真实Chromium61PASS；Android testDebugUnitTest/lintDebug/assembleRelease完成，现有CI不导出原生案例总数，故不编造。JM SDK R8 stack-map警告保留，不称零警告。没有固定私钥或发布。32成员工程复核ZIP SHA256 `753276df83d85412c40ac818aa4850469e000d6ad4c3c9e6006dbf09ce42bdde`，另经.NET验证31/31 payload哈希。不是第二真实平台、Windows GUI或Android真机验收。

本补记在后续本地书目分支记录，不改变PR215冻结源码或原安装包，不借此声称后续原生书目代码已经通过该CI。

## 范围与授权

用户已允许新独立Draft及临时云端互操作验证：固定Suwayomi v2.4.2366，仅使用合成图片/CBZ；不安装第三方源、不访问真实平台、不签发安装包、不合并/发布/OTA/部署，本机不启动Java、应用或监听。沿用已批准的目标持续隔离开发例外；Local Memory只读路由仍NOT_FOUND，未猜身份/重置DPAPI。

独立分支`codex/source-host-interop-20261026`基于已验证T3源码`5f4b7ead0fcd4faff0974450adf65bdc910717f2`。PR214/T3、PR213/Dev88和正式安装不改。初版仅增加门禁；真实运行随后暴露的应用协议缺口及最小修正在下文单列。数据库schema、版本、依赖和固定签名均不改；仓库常规调试CI如自动触发，须与固定签名/发布区分并遵循本轮实际授权。

用户已补充确认允许既有常规CI构建并用临时debug证书签名调试APK；禁止固定私钥/签名Secrets、改Dev版本或发布安装包。专用Host任务仍无Android构建/签名，不把调试构建当成新验收安装包。

## 复用与原包绑定

- 使用[Suwayomi官方v2.4.2366](https://github.com/Suwayomi/Suwayomi-Server/releases/tag/v2.4.2366)，固定源码40bc5da57820324ed0ae724cbbc020cc4673b594；官方JAR182952426字节，SHA256 af9feb20af9d7ebe9e30769e6c6ebc7fc7ab1c447388d42e0280b1da5fe07bfd。只在临时runner下载/执行，不进入Pica包或artifact。
- 已核对27份官方固定Git blob：协议、启动/配置、内置Local Source、章节未知页数及Java21目标；来源清单/字节哈希在`_validation/source-host-interop-20261026`。原实现不复制进应用；根许可MPL-2.0不等于对所有内嵌组件重新许可。
- 复用应用现有`SourceHostConnections/Inspector`、固定八个GraphQL操作、`HostedLibraryReader`、`PreviewCacheManager`、既有调度/资源协调、`LocalLibraryIngestion`和`ReaderService`。不写第二个宿主、阅读器或下载器，不用自造GraphQL/图片响应冒充真实接口。
- Suwayomi内置Local Source的来源ID是字符串`0`，不是Pica ID。官方`ChapterType.sourceOrder`与数据类`index`的转换已追踪；不能仅因名字不同就修补协议或放宽页面归属校验。

## 有限工程场景（仍属于既有SRC/CORE案例，不增加42项产品全集）

| 场景 | 必须实际证明 |
| --- | --- |
| H1 运行身份与隔离 | 官方JAR长度/哈希、当前Git源码、独立net namespace；仅lo接口、无外部路由；只停止本次spawn且命令行绑定JAR/私有root的子进程 |
| H2 用户连接边界 | 保存/启用/状态无请求；显式检查真实aboutServer与内置来源列表，无账号继承、默认外部内容或扩展安装 |
| H3 真实协议与范围 | 八个既有固定操作全部到达真实宿主；library-read不能替代source-search-read；另行选择一个已列出的来源 |
| H4 阅读 | 自建文件夹和CBZ各一册、每册两张不同合成图；由原Reader访问真实宿主页面，逐页SHA核对顺序与内容，记录独立进度 |
| H5 明确本地保存 | 未确认本地复制必须拒绝；明确确认后由同一调度/导入器发布完整本地副本，不调用宿主下载队列或收藏操作 |
| H6 断源与持久化 | 禁用撤销旧会话，确认宿主进程退出；另启全新Node进程、原本地Reader/SQLite，四页与页码仍正确，无Host请求或缓存冒充副本 |

## 运行与失败边界

专用workflow只允许精确公共仓库/分支、非PR入口，contents:read，Java21/Node24；下载在隔离测试前完成。真实Java和客户端同处无外部接口/路由的Linux网络namespace，关闭CEF/托盘/浏览器/自动更新/扩展仓库。只用上游支持的属性，不修补JAR或伪造版本/响应。本机入口在读取参数文件、TS/应用加载前拒绝。

仅上传小型`result.json`及失败时最多16KiB宿主启动尾部；不上传JAR、图片/CBZ、数据库、配置或用户内容/凭据。测试保留错误步骤、源码、真实操作计数与独立离线结果。发现失败先读该次证据；同根因至多两轮有依据修正，之后路线评审，不改弱门禁或原样重复启动。

## 不能由本门禁宣布完成的事项

这是**真实宿主 + 合成内置来源 + 生产服务模块链路**，不是第二个真实漫画平台、Windows成品GUI、Android真机或任意扩展兼容证明。完整持久化原生在线目录、私人标签/收藏/跨端同步与后台任务恢复仍未完成。公开分发信任、真机/OEM、AI/标签/同步体验和P6集中候选继续开放。用户不需要代替开发者执行这批工程测试。

当前状态：真实运行已执行并发现协议缺口，下节保留精确失败证据；修正后H1..H6仍须完整重新证明，不借用T3或Dev88绿灯。

## 首轮实际运行保留

源码112038ff83e159402dbd128ce4ee7eb6e376158f/[运行40450507601](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40450507601)在约28秒内失败：源码/类型门禁和官方JAR长度/SHA通过，但入口调用`tsx/esm/api`，锁定的tsx4.7.0并未导出该较新API，worker/Java尚未运行，无运行结果artifact。这是入口夹具缺陷，不能称真实Host或Provider失败，也不能计互操作通过。完整完成job日志已保存。

第一次有证据的修正仅改入口：使用同一已锁定tsx4.7.0公开`tsx/cli`和极小TS入口，不升级依赖、不在本地加载Host/app代码。一次本地字面量CLI探针被原守卫拒绝，unit-3为194PASS/1FAIL、3条TCP_CLIENT标签；记录不含目的地，不能据标签断言它们是真实TCP还是IPC，不放宽守卫。已改为只核对公开导出/安装路径及Node语法解析，不执行CLI；真正CLI/worker仍只在云端namespace运行。Java/Pica未在本机启动。新源码运行须重新证明H1..H6，原失败不改判。

## 第二轮：实际Host暴露未知页数适配缺口

源码`02a72e293b698f432f7435ebfbb73f17cd5b5c74`/[运行40451709011](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40451709011)，job122015711588：官方原包、仅lo网络namespace、真实启动/检查/来源列举/搜索通过，CBZ的`PicaHostPrepareManga`返回后在`hostChapter → hostInteger(pageCount)`失败，尚未取正文。下载的原始result.json和job日志保留，宿主受控退出；不是整项PASS。

对照固定上游[ChapterTable.kt](https://github.com/Suwayomi/Suwayomi-Server/blob/40bc5da57820324ed0ae724cbbc020cc4673b594/server/src/main/kotlin/suwayomi/tachidesk/manga/model/table/ChapterTable.kt)的`page_count.default(-1)`，Git blob `f6fd7be8a37a3dba07c13c99a442d98e69824085`、SHA256 `97b4ddd2062282d2d7be2ef7d72405a8780005c4cdf1d41acc8544c1c425d714`。桌面及Android原解析器错误拒绝“正文尚未加载、页数未知”的合法值。离线unit-5保留196PASS/3FAIL、0边界事件，三项新增反例准确复现；不删除失败记录。

应用最小修正：两端元数据仅额外接受并保留整数-1，不把未知伪造成0或已知页数。实际取页仍要求正数、非空完整列表、数量一致、同章节身份和逐页路径，其他负数/字符串/小数/越界值仍拒绝。Android首读过滤同步允许Host的-1等待显式取页，不放开本地空章节；回归覆盖解析、取页、原Reader接线及原有归属拒绝。新增原生测试只在获准的既有云端debug CI执行，本机不运行Java。没有新Reader/下载器/依赖、数据库迁移或Dev版本变动。

证据夹具同时只在真实ready后标记`realUpstreamRuntime=true`，保留原运行结果不改写；记录自建两册元数据-1到正文2页的数值变化，不替换真实HTTP响应。修正后的精确源码完整Host及Android CI结果尚待新运行。

最终本地纯源码unit-7：199PASS/0FAIL、13个实际文件、0边界事件；完整types-4及最终worker-6类型检查通过/0事件。原生新增4项测试未在本机执行，须由新源码云端CI证明，不能借用02a72e2常规CI40451713301双job通过。
