# R2｜Android 物理无源核心与用户自管 Host APK 候选

日期：2026-11-02。唯一主干 Draft PR #284。**这是研发 QA 组合，不是替换 v0.5.0 的正式更新。**

## 真实代码复用

- `:local-core`：原 `ReaderContent`、原图像/导入策略和身份算法，不复制第三方阅读器。
- `:local-storage`：原本地作品清单、CBZ/文件夹导入、书架、阅读历史、用户独立存储。
- `:reader-view`：原 `ReaderScreenActivity`、图片加载、页面手势和进度；**没有第二个 Reader**。
- `:local-app`：原本已隔离的 Reader/本地书库 Android UI，原 Gradle 模块不改变包身份、无 `INTERNET`，无内置来源或 Host。
- `:user-host-core`：从原 `:app` **移动** HostProtocol/HostEndpoint/HostJson/HostHttp/HostSourceManager/HostConfigStore/HostSavedBooks/HostOfflineSaver/SourceHttpConnection 和公共 SourceAccessPolicy；资源 `host_source_operations.json` 也从原 app 移到库中。它不依赖 `:app`、哔咔/JM 等 Provider SDK 或 WebView；Host 的作品、章节、图片使用已有 `ReaderContent`。
- `:user-host-app`：独立 applicationId `com.picalibrary.android.userhost.qa`，Gradle 直接把 `:local-app/src/main/java` 当作**共享源码**，复用原导入、书库、书架、历史和 Reader；新增可选的用户 Host 页面与 HostReaderActivity 薄适配。仅此 APK 请求 `INTERNET`，使用现有 HostEndpoint 允许明确授权的 HTTP 私有 LAN/loopback，其他 Host 路径遵循 HTTPS/权限限制。
- 原 `:app` 仍保留 Android v0.5.0 之后完整产品行为及来源，原 HostReaderSource 只在 app 边界把 `ReaderContent` 兼容转换为 `BridgeClient`，旧用户数据库、账号、下载、签名、升级均未修改。**原 app 尚不是完全无源正式版本。**

## 用户路径与验收要求

| 用户路径 | 实现 | 验收门槛 |
| --- | --- | --- |
| 完全无源 Android APK | `:local-app` | 原离线书库与 Reader 流程，DEX 禁止 Host/站点代码、Manifest 无 INTERNET |
| 可选 Host Android APK | `:user-host-app` | 安装包独立、不包含 Pica/EH/JM SDK/账号；默认无会话；同一 Reader 仍能导入 CBZ 并离线阅读 |
| 用户主动联网 | HostBrowserActivity → `:user-host-core` | 保存名称/URL/认证方式（不存密码）→ 显式启用+授权 → 列出 Host 来源 → 选定来源 → 搜索 → 原 Reader 阅读 |
| 明确保存章节 | `HostOfflineSaver` → 原 LocalComicStore | 仅复制选定章节到 app 私有书库；完成后可脱离 Host 阅读；无自动保存全部 Host 收藏 |
| 后续隔离与升级 | G1–G4 | 真实手机 UI、真实 Suwayomi Host/插件在线实验、Android 来源独立安装/撤销边界、旧 v0.5.0 升级/回滚、官方签名尚未验收 |

## 证据与限制

- 自动化：保留现有 Android 35 模拟器，并扩展为**三安装包**：纯本地 QA、原完整应用 Dev、物理无站点 SDK 的可选 Host QA。测试只调用系统 SAF、原 Reader、本地读页及显式 Host 配置入口；模拟器没有用户真实漫画服务账号。
- 构建：原 CI 同时验证单独 Host APK 的应用 ID、权限与 DEX，若混入 Pica/EH/JM 账户或站点 SDK 则失败。包未签名、独立隔离 QA，仅随限时 CI Artifact 提供，不进入 Release/OTA。
- 尤其注意：GitHub Actions 的构建成功 **不等于**真实公共来源登录、网络可用或真实插件许可证合规。Breeze/VeneraNext/Delta 的架构比较见 `R2_OPEN_SOURCE_COMPATIBILITY_DECISION_20261102.md`；未复制其非兼容或许可不明的源码。
- 当前 R1 原双端自动化已通过，但 G1 真实设备体验、R2 真实外部源/撤销和来源信任、G3 旧版无痛升级、G4 发布批准均保持 OPEN；记录实际 CI 状态后才能表述为工程 PASS。

最终发布仍需把上述模块整合为**原产品的统一 Android 安装/升级路径**，不能把独立 QA companion 误当成对现有 v0.5.0 用户的无痛升级。

## 实体 Host → Reader → 断开后离线阅读的端到端验收（新增）

既有 Android 35 模拟器流程现在还包含**原生 HTTP 传输级**样本，使用 Python 标准库在 GitHub Runner 本机启动只监听 127.0.0.1 的合成 Suwayomi 2.4 GraphQL 端点，并通过 adb reverse 与独立 Host APK 通信。这不是页面 mock、Robolectric，也不下载外部漫画源。测试按用户操作执行：

1. 原独立 Host APK 启动时保持未连接；用户在实际 Native UI 填 Host URL、保存、授权启用；验证没有隐式请求；
2. 明确连接后通过原 HostHttp/HostProtocol 获取服务器状态和源列表，用户选择测试源，真实 HTTP 搜索漫画；
3. 实际 HostSourceManager 准备章节/页并取得 PNG，交给同一 ReaderScreenActivity 翻至第二页；
4. 用户明确选择保存单章，原 HostOfflineSaver → LocalComicStore 复制两页到本 APP 的私有书库，读取真实文件校验 PNG 字节；
5. 断开 Host 会话、返回原本地书库，在仍不连接 Host 的情况下用原 Reader 打开该章节。

完整 ADB、截图、UI 树、Host 请求操作列表和文件一致性证据随原 s3-local-emulator Action 上传（测试失败则记录 FAIL，不跳过）。**合成 Host PASS 不代表真实公共来源可用、授权或法律合规；实机 G1、真实多来源及签名 G2、旧版升级 G3、Release G4 仍 OPEN。**

## 同签名跨进程 API 合约（R2 当前候选，未获正式验收）

- `:source-bridge` 使用 Android 标准 AIDL `ISourceEndpoint`；`protocolVersion() == 1` 是 Host/Reader 独立安装与升级的明确兼容边界；版本不匹配不得尝试读取章节。
- `:user-host-app` 仅在独立 Host 进程内运行已有 `HostSourceManager` 及固定 Suwayomi 操作；导出 `ExternalSourceService`，权限 `com.picalibrary.android.remote.BIND_SOURCE` 为 `signature`。Service 每次 Binder 调用核实 caller UID 与签名，仅返回已授权的 opaque chapter/page IDs、会话 scope 和 ParcelFileDescriptor 流。
- 无 `INTERNET` 权限的 `:local-app` 保持原来 LocalComicStore、ShelfLedger、ReaderScreenActivity 和 ReaderProgressLedger；新增 `BoundSourceClient` 延迟绑定 Host，`ExternalReaderActivity` 在原 Reader 上展示远端图片，`ExternalImportActivity` 在原书库内显式选择并保存单章，服务不写入 Reader 私有目录。
- 本方案当前只用于同签名第一方 Host companion 与源中立 Reader 的工程候选；它不是任意用户下载的第三方 APK 执行权限，也未验证真实 Source SDK、源站许可证、旧 v0.5.0 签名延续或正式升级。当前 exact-head 实机与 Android 35 端到端验收仍 OPEN。
