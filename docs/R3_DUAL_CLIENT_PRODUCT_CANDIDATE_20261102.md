# Pica Library | R3 双端完整产品安装候选（2026-11-02）

> **交付目标：**把已有完整 Windows 与 Android 客户端放进同一个未发布的产品候选流程，提供可直接安装、体验全部旧功能的 QA 包。不得把原完整客户端错误标记为物理无源正式版。稳定版 `main` / v0.5.0 / OTA / 正式数据保持不变。

## 本批可实际拿到什么

| 候选 | 交付入口 | 产品范围 | 用户数据边界 |
| --- | --- | --- | --- |
| Windows 完整原产品 RC | [Post-stable Isolated RC Packages](https://github.com/Saber-Alter-Lily/pica-library/actions/workflows/post-stable-rc-packages.yml) 的 `Pica-Library-Post-Stable-RC-Windows` | 原全量桌面/Web：书库、在线、推荐、Visual、设置、Reader、下载、同步及已有更新 UI | `%LOCALAPPDATA%\\Pica Library Post Stable RC`，不读取旧正式目录 |
| Android 完整原产品 RC | 同一工作流的 `Pica-Library-Post-Stable-RC-Android` | 原四标签导航、完整书库/推荐/在线/设置、交互引导、Reader、下载任务和远程能力 | `com.picalibrary.android.dev`，独立于稳定版 `com.picalibrary.android` |
| 来源物理外置的 Android 工程候选 | 原 [CI](https://github.com/Saber-Alter-Lily/pica-library/actions/workflows/ci.yml) 的 `source-free-local-qa` 和 `r2-source-free-user-host-android-qa` | 无 INTERNET 阅读器 + 同签名可卸载 Host；真实官方 Suwayomi 内置来源已在 Android35 E2E 通过 | 两个独立 QA applicationId，不是完整原产品 UI，不可当作 v0.5.0 直接升级 |

以上是**两条不同验收线**：原完整产品用于快速发现 R3 真实 UX/功能缺口；无源模块组合继续验证未来架构。不能因为同时有三个 Android APK 就声称单 APK 正式迁移已完成。

## 完整客户端的单批交付

继续使用已经成熟的 `.github/workflows/post-stable-rc-packages.yml`，**不编写第二套打包工具**。本次将它的 trusted push 接入唯一集成分支；只有更新本交接文件、打包脚本或工作流自身时触发，而非每次提交都重新制造 RC。可按需在 GitHub Actions 显式手动运行。

- 源码固定：以该工作流实际 `GITHUB_SHA` 为唯一真相。Windows x64 使用发布的 v0.5.0 基线 ZIP + 原 RC Launcher / 原完整 Web，现成 PowerShell 路由会进行临时全量替换、启动、配置持久化验收。保留原更新助手与正式数据隔离。
- Android 使用现有 `:app` 完整产品、JUnit/lint、预览签名及 `com.picalibrary.android.dev` 安装身份；如果 GitHub QA 签名凭据不存在、SHA 不符或安装包元数据不匹配，明确 FAIL，**不得绕过**。不改生产 applicationId 或 versionCode。
- 仅当 `contract`、`windows-rc`、`android-rc` 都成功且上传 artifact 后，`RC_STATUS.json` 才可称为 `INSTALLABLE_ARTIFACTS_READY_MANUAL_QA_PENDING`；合同绿灯或已有历史安装包不能替代本次交付。
- 安装包只保留 3 天，使用时按同一个 SHA 和 `SHA256SUMS.txt` 配对；不发 Release、Tag、OTA，不将用户本机真实书库复制给 CI。

## R3 第一轮实际体验验收（从产品而不是接口出发）

只收集会影响日常使用的 P0/P1，截图与失败步骤需对应候选 `SOURCE_SHA.txt`：

1. **Android 360/393/480dp、中文/英文/日文、默认字号及放大字体**：四大标签切换、返回、书库搜索/长按选择底栏、设置、在线来源入口；不存在覆盖、被裁切、点击无反馈或整屏黑屏。
2. **八章新手引导**：必须从设置入口能够逐章在真实控件上展示 Spotlight，允许跳过，未完成真实操作不得假写业务成功；不接受纯文字内容当作交互引导。
3. **书库到阅读器**：本地 CBZ/文件夹、历史、书架、同一内容跳转、页数、阅读进度与重启续读；Windows/Android 两端沿用原有模型，不能新建一份。
4. **推荐与任务**：批次翻页不重算、负反馈不混入下一批、已收藏不重复召回；Visual 可关闭；约 1500 本的读取/推荐过程可见进度、取消、恢复，无 UI 黑屏或长时间阻塞。
5. **标签与同步**：#199 的 BLOCK/LESS 仅影响显示；#200 保持原始键与客观收藏计数；LAN/WebDAV/离线同步的状态清晰且不会静默改动数据。

## R4 先行准备（严格不触碰生产数据）

此次完整 Windows RC 继续执行既有 `test-windows-universal-full-upgrade.ps1`：在**临时模拟资料**下由公开 v0.5.0 ZIP 启动并做完整替换验证，属于升级可行性工程证据，不属于用户真实数据迁移验收。Android 用原固定预览证书检查软件包身份/签名，不是 v0.5.0 正式包同身份更新。以后正式迁移必须独立满足备份、只读预检、数据一致性与失败回滚。

**本批结束条件：**同一 SHA 的 Windows 和 Android 完整安装包确实上传，`RC_STATUS.json` 报成功，再进入实机 G1。R2 物理无源最终包、第三方真实站点、G3 正式旧用户迁移、G4 发布批准仍 OPEN。不因 CI 绿灯自动发版。

## 首次交付构建修正记录

- 提交 `4e90d64f` 启动的 [工作流 #41586827522](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41586827522) 在 `contract` 阶段因旧测试硬编码 `retention-days: 1` 而失败；Windows/Android 包装任务因此被跳过，**该轮无完整客户端包**。
- 本次仅对齐既有短期 artifact 合同到 **3 天**，同步说明，不改任何签名检查、发布条件、正式版本或生产目录。后续执行以新的 exact-SHA 完整工作流为准；旧失败和新成功必须分开记录。

## 构建速度调整（与本轮双端交付相关）

初版完整 Windows RC 在打包前重复运行全套 `pnpm test`，尽管已有常规 CI 完成。现在 Windows 打包阶段只保留包/回滚/Windows PowerShell 合同的定向 Vitest，继续运行 `pnpm type:check`、`pnpm web:check`，**绝不删除** Windows 原生 ZIP 解压启动、端口冲突、持久化和 v0.5.0 基线完整替换验收。Android 仍保留 JUnit、Lint、包身份和签名检查。工程包仍须等待此变更自身 exact-SHA CI 验收，不能继承之前旧 SHA 的成功状态。

## Windows 完整替换打包阻断与修正（2026-11-02）

- [构建 #41587857309](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41587857309) 的合同与 Android 完整 QA 均成功，Windows 在临时完整程序组装时被旧版 Launcher 复用保护中止：`Launcher source changed since accepted stable package; a full install is required`。这是**实际新架构与旧版增量复用约束不兼容**，不是 Windows 语法或用户资料故障。未生成该轮 Windows 候选。
- 当前变更只在 `-PostStable` **独立、完整替换 RC** 路径中临时禁止尝试继承公开版的旧 Launcher；继续使用本仓库当前 Launcher 编译成全量暂存包，并在最终独立 RC 中照常重新编译 `RcLauncher.cs`。这两个旧版复用环境变量在 `finally` 中恢复。普通生产 `scripts/build-windows-package.ps1` 本身及其正式旧版 Launcher 哈希锁**一字未改**，标准增量升级仍必须遵守原规则。
- 仍先校验公开 v0.5.0 ZIP 的固定 SHA-256；新 RC 只上传独立 ZIP，最终强制验证完整包原生启动、端口冲突、进度和本地数据持久化，并进行已有的合成 v0.5.0 完整替换/回滚。不能据此推断老用户真实数据迁移 PASS。

## R3 原完整 Android 推荐与书库窄屏用户流程

- 原 HomeActivity 推荐页之前在主线程直接读取 NativeRecommendationStore、PortableRecommendationPackageStore、RecommendationPolicyStore 和 UnifiedCatalogStore，且切换上一批/下一批同步写入存储，1500 部书库下存在主线程卡顿风险。本批沿用已有原生单线程 Executor，把初次载入/本机策略投影/候选读取/批次移动与历史标记转为顺序后台处理。用户进入推荐页立即见到加载状态；翻批次有可见反馈、同一时间不启动多次写入；离开当前页面后不把过期结果画回新页面。现有推荐算法、负反馈策略、缓存身份、生成任务和书库没有更换。
- 原书库标题和四个操作在 360/393dp 或翻译后会挤在同一行，本批直接复用原 HomeActivity 标题行，窄屏/四个动作时改为上下两行；推荐卡片封面旁原三按钮改为第一行喜欢/不喜欢、第二行调节偏好，所有入口保留，无新界面框架。
- 同时修正旧 Web/CLI CI 对 Post-stable RC 工件保留期 1 天的硬编码，明确此流水线允许 3 天，User-Host 7 天，其余保持 1 天。旧 [Web CI 失败 #41588408104](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41588408104) 只证明合同断言与实际构建设置不一致，新 HEAD 必须重新验证 Android 编译、Web/desktop、实际布局截图后才能算通过。
- 仍未完成实体手机 360/393/480dp、多语言缩放、真实 1500 本卡顿定量及所有旧正式资料迁移；G1–G4 原有边界不减项。


## R3 Android 原完整产品接入现有独立 Host（2026-11-02：代码已接入，待完整实测）

- 原 `:local-app` 的 `BoundSourceClient`、`LocalReaderActivity`、`ExternalReaderActivity`、`ExternalImportActivity`、`LocalCopy` **物理移动到唯一共享 Android Library `:signed-reader`**；`:local-app` 与原完整 `:app` 同时依赖此模块。继续复用 `:source-bridge` AIDL、`:reader-view` 的唯一 `ReaderScreenActivity` 和 `:local-storage` 的同一个 `LocalComicStore`。没有复制两个 Reader、不新增网站 SDK/HTTP 客户端、不增加源运行时。
- 完整原 `:app` 的 **在线 → 独立来源组件·工程候选** 入口仅在 Debug/QA 构建可见；点击时校验同签名，跳到用户单独安装的 `:user-host-app`，显式传递目标 reader applicationId。Host 只允许 `com.picalibrary.android.localcore.qa` 或 `com.picalibrary.android.dev` 两个预定 QA 目标，且逐个检查两个导出目标 Activity 的平台签名级权限和导出标志。默认没有源 APK 时不会联网，也不会改变旧账户；正式生产版不额外暴露未完成入口。
- 用户在独立 Host 中**主动连接 Suwayomi、选择来源和作品**，Host 把图片 FD 经已存在的 Binder 传入当前完整原应用的共享 ReaderScreenActivity；确认保存的单章写入**当前原应用自己**的 `LocalComicStore`。导入后“阅读已保存的本地副本”在完整原产品中使用原 `ReaderActivity`，仅无源 QA 壳保留 `LocalReaderActivity`。不会复制到另一个 QA APK 的书库。
- 新版完整产品 manifest 注册受 `BIND_SOURCE` signature 权限约束的来源阅读/导入入口和 Host 包可见性。旧来源仍在原完整 `:app` 内，本批**不能**宣称 Android 已完成物理无源最终产品；旧正式版包身份和签名未修改。后续需用同一 Android35 实测“完整原 Home → Host → 本机原书库 → 断源后原 Reader 继续读”，并进行生产签名所有权和旧版数据迁移核查。

### R3 实机自动化新增：原完整产品的真实官方 Host 闭环

在现有 Android 35 模拟器及同一个官方 Suwayomi v2.4.2366 自带 Local Source（两页自建测试 CBZ）上，追加一条**原完整 Android app** 的实际用户流程：四标签 Home 的 Debug 独立来源入口 → 同签名来源 APK → 主动授权 → 上游作品搜索 → 共享原 ReaderScreenActivity 第二页 → 单章确认 → 写入**原完整 app 私有 LocalComicStore**、逐页 PNG 字节校验 → 点击本地副本打开原产品 `ReaderActivity` → 断开并停止 Host → 原 Home 列表重新找到作品 → 原 Reader 离线打开。测试检查的是实际 Android Activity/安装身份和真实上游图片，不是 mock 假象。新增屏幕及 `real-upstream-host-proof.json`；仅在该 exact-SHA 模拟器 PASS 才能把本项标记为工程通过。旧单独无源 Reader 的全部 R2 流程继续保留；原完整 app 的物理无源改造与 v0.5.0 签名迁移仍未完成。


### 同签名双 APK 完整产品 QA 交付（2026-11-02）

此前原完整 Android Dev APK 与来源 Host APK 分别从 Post-stable RC 和普通 CI 构建，前者使用固定预览证书、后者使用临时 Debug 证书，**不能把它们作为一对可互通的真实用户安装包**。已将现有 Post-stable RC 打包扩展为**同一次构建签署两 APK**：不新增签名密钥、不改变稳定版来源与证书，仍只在现有受信 CI 密钥环境中启用。

- `user-host-app/build.gradle` 复用完整 `:app` 的 `ANDROID_PREVIEW_KEYSTORE_PATH` / `ANDROID_PREVIEW_KEYSTORE_PASSWORD` 配置、`pica-preview` Alias；未提供 CI 凭据时继续用原默认 Debug signer，S3 模拟器流程不改。
- 现有 `post-stable-rc-packages.yml` 的 Android job 同一次执行 `:app:assembleDebug :user-host-app:assembleDebug`，核验 **两者均为固定预览证书 SHA256 `64fb87dc7d8bd6bc7b2cec92cc8c83fad3afe8cfb07591a2e53d53cbd3ab2f9d`**；来源 APK 独立 package `com.picalibrary.android.userhost.qa` / versionCode 1，必须声明签名级 Binder 绑定权限和 INTERNET，但不能请求摄像头/广域读写/安装其他 APK 权限。
- 同一 `Pica-Library-Post-Stable-RC-Android` GitHub Actions 工件新增第二文件 `Pica-Library-Post-Stable-RC-User-Host.apk`，带 `HOST_CERTIFICATE_SHA256.txt`、来源包元数据及两 APK 的 `SHA256SUMS.txt`。先安装完整 Dev，再选择安装独立 Host；同一个浏览器来源仍需要显式 Host 地址、授权、选来源。无第三方站点 SDK，也不额外创建用户数据。
- 该 QA 配对依旧不能原地升级正式 v0.5.0，也不能与历史由不同 Debug signer 签名的 Host/Reader QA 混用。安装遇到签名冲突时**必须报告而不是卸载旧应用以绕过**；真实物理设备和 G2/G3/G4 仍开放。最终结论必须以新精确 SHA 的两 APK 证书/上传工件和原完整用户流程为依据。
