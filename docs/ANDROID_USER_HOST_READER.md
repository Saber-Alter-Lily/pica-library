# Android 用户自选 Host：未发布实现契约

应用源码：`cc92217a614666c15ca6b4e1e91f39e87165fd7a`；本地分支：`codex/android-user-host-recovery-20261026`。包含前段`ffa54e2`接线及下述异常清理，不新增功能。总进度仍以[交付账本](LOCAL_READER_DELIVERY_LEDGER.zh-CN.md)为准，7阶段/42案例不变。

## 当前证据，不是安装说明

当前Node协议/资源契约13项通过，组合485 PASS / 0 FAIL / 0 skipped（33文件），完整TypeScript与Web56/56语法通过；4次离线边界审计0事件。独立验证目录中的Apache-2.0 `java-parser@3.0.1`解析252个Java文件无语法错误，它**不是Java编译器**，没有引入应用依赖。

新增38项Android/JUnit/Robolectric测试、3项共享导入器测试，**尚未编译或执行**。Android build/lint/原生测试、SDK35、实际Host、真机、同源码安装包均NOT_RUN；不能借用旧CI。没有本地Java、应用、浏览器、监听、正式资料访问或迁移，没有推送/云端构建/版本更新/发布/OTA/部署。当前证据：`_validation/android-user-host-recovery-20261026`；原接线快照和ZIP保留，不冒充当前源码。

有界审查发现worker只捕获Exception：合成OutOfMemoryError会绕过启动会话清理和UI busy解除。当前仅给这两处补清理，并新增“清除未就绪会话后可另行授权”“UI退出busy后可明确重试”的原生用例；不生成真实内存压力，也不声称已证明真实低内存/进程崩溃恢复。这些原生断言仍待云端执行。

状态：`LOCAL_SOURCE_AND_NODE_GATES_PASS / ANDROID_COMPILE_RUNTIME_NOT_RUN / REAL_HOST_NOT_RUN / FULL_OBJECTIVE_OPEN`。

## 后续成品的用户路径

“账号与来源”→ 我的外部Host → 自行填址并保存（保持停用）→ 明确启用（不联网）→ 另行授权并输入本次认证 → 列出用户宿主已安装的来源 → 明确确认一个 → 手动搜索/选书 → 原Reader阅读。

离线另走“选择一章保存到本地…”→ 选择实际章节 → 单独勾选本地复制许可 → 接收并完整校验 → 原本地书库/Reader。仅处理所选一章，不修改宿主收藏、阅读进度或下载队列。手机直接连接用户Host，不是Desktop Relay；在线需要Host在线，本地完整副本不需要Host。

软件不提供漫画内容、默认宿主/目录/源仓库，不安装/执行外部扩展。搜索、取章节/页面可能在**用户宿主**写元数据/缓存或触发其同步，已明示，不冒称完全只读。产品定位不是法律免责保证。

## 复用与边界

- 复用既有Suwayomi v2.4.2366 / `40bc5da57820324ed0ae724cbbc020cc4673b594`的八份固定操作，与Desktop逐字漂移检查；不是任意GraphQL或URL代理。来源signed64 ID用字符串，图书/章节/页面均查归属。
- 复用`ReaderSource/ReaderSourceFactory`、`ReaderActivity/ReaderImages/ReaderProgress`。未知来源仍拒绝，不落回Pica/Desktop。历史明确标记`host`；失效会话只预填搜索词、要求重新授权，不自动联网。Host-only ID不进入尚不支持它的portable推荐证据协议；不修改ranker/sync算法。
- 旧`SourceAccessPolicy.Permit`实现通用`Access`端口，旧三源ID/epoch/配置不变；Host用自己的短会话实现同一请求/短提交端口。复用`HttpURLConnection/SourceHttpConnection`，正常TLS、不跟跳转、拒绝全局cookie，认证只由本次会话传入，不取平台凭据。Android无公开Authenticator getter，故禁止自有原生源码注册全局Authenticator，并以源码门禁防止引入；不使用反射/隐藏API或更改全局处理器。这是受控应用的边界，不是对任意第三方进程内代码的沙箱保证。
- 配置文件只存八个元数据字段，原子写入/回读；默认未配置/停用，损坏保留并拒绝、不自动重置。保存、启用、状态查询无网络。
- 凭据仅本进程15分钟会话，输入禁自动保存/填充，启动/销毁清空；不写Intent/Bundle/文件/导出/同步。清引用不是取证级擦除。Basic只可HTTPS或手机自身loopback；明文私有LAN另行许可且禁Basic。
- JSON有UTF8、深度、重复键、尾随内容守卫；非法Unicode身份拒绝。权限变更/到期/结束取消请求、拒绝迟到发布，保留已提交副本/本机历史。
- `LocalComicImporter.prepareRasterPages`复用原文件夹/CBZ的有界复制核心；`LocalComicStore`复用generation、AtomicFile manifest、图片解码和本地Reader。没有第二套队列、SQLite表或Reader。副本identity按设备/原作品/章节隔离，进度与在线分离；失败/取消保留旧代际，重存原子发布新代际，不声称跨进程CAS。

## 有意保留的限制与下一步

手机是单章前台保存，不支持后台续传/持久任务恢复/整库下载；离开正在操作的页面或结束会话会中止。限2000页、20MiB/页、512MiB/副本；临时缓存不算离线副本。在线引用为有界会话（128本、20本章节缓存、32已准备章节），进程重启或被移出后需重新搜索；**完整持久化原生Host在线书库/私人标签/收藏/跨端同步尚未完成**。

下一门禁先验证这一个源码，不继续加功能：获准新Draft/临时云端编译、运行Android新增及既有测试/lint/Dev构建，再做同源码Windows/Android成品和真实Host/第二来源。旧正式版迁移T3、P0-R1及其他实机门禁照旧，冻结PR212/Dev87不动。新云端授权未答复前不推送/dispatch；本机不启动Java/应用/浏览器/监听/迁移。当前不要求用户测试，无新安装包。
