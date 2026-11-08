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

## 同一预览证书的 Android 清洁原产品交付（2026-11-03）

在原 `Post-stable Isolated RC Packages` Android job 内**复用**同一 Gradle 构建和固定的 `pica-preview` 签名，同时生成三份用途明确的独立 APK：历史完整 Dev（`com.picalibrary.android.dev`）、真正从原 `:app` 源码构建且经 R8 缩减的四标签清洁版（`com.picalibrary.android.cleanqa`）、来源唯一且可卸载的 Host（`com.picalibrary.android.userhost.qa`）。三者的实际 `apksigner` SHA-256 必须相同且等于现有受信 QA 证书，包身份分别核验；原 Dev 不被改造成清洁版，旧用户资料/正式签名不接触。

无内置源的物理审核 **不复制另一套规则**：把已通过的 R8 + APK DEX 检查抽至 `scripts/verify-android-clean-source-apk.py`，供 `r3-android-clean-source-qa.yml` 与原固定签名 RC 两处调用。只要 `PicaClient/EhClient/JmClientManager` 或 JM 第三方 runtime 仍出现在实际映射/DEX，直接停止上传清洁 QA 工件，不得“菜单隐藏即通过”。现有原 Windows 安装替换、Android JUnit/Lint、QA 签名、源 APK 权限与 SHA/状态文件检查原样保留。

**下载选择**：要验证清洁版，只配套安装 `Pica-Library-Post-Stable-RC-Clean-Android.apk` + `Pica-Library-Post-Stable-RC-User-Host.apk`，均必须取自同一 Actions 工件；不自动安装漫画源、不要求用户登陆任何源、不删旧版以绕过签名冲突。原完整 Dev 可独立作旧功能对照，但不要与清洁版混淆。仅当前实际构建/签名/DEX 审核成功，才能称候选包已交付；后续仍需真实手机 G1、正式签名/来源 G2、v0.5.0 无损迁移 G3 和发布 G4。


### 2026-11-03 source-neutral complete-product handoff

The latest source-neutral build is an **original full four-tab Android client**, not the separate limited Reader-only QA app. Its strict R8/actual DEX audit completed successfully twice: [#41627761091](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41627761091) at `8d277f66`, and [#41630242922](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41630242922) at `3be9087c`. Actual `source_leaks: []` and `direct_forbidden: []` confirm no specified Pica/E-H/JM provider implementation or third-party JM runtime survived in `com.picalibrary.android.cleanqa`. The full Dev comparison still retains legacy providers, deliberately distinct from the clean candidate.

The trusted fixed-QA-signer three-APK builder had already [passed #41629522115](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41629522115) at `75f21129`; **that earlier artifact does not include** later improvements to the real eight-chapter onboarding source tags and read-only clean QA update screen. This document change triggers a **new same-source triple-APK + Windows isolated QA package build** from the latest integrated source. The existing Gradle, certificate equality, R8/DEX physical removal, SHA256 and Windows startup/replacement gates all remain in force. Do not infer success or post a link until the new exact-HEAD job has completed and uploaded files.

The real Android35 **clean original full-product** scenario is [#41629188552](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41629188552), built after the mixed Debug/clean variant dependency fix, and includes original Home → local CBZ import and restart → official Suwayomi Local Source → independent signed Host → original source-bound Reader → exact-byte chapter import → Host shutdown → original Home offline reading. Only its actual terminal log can close this functional engineering subgate. G1 manual handset/Windows UX, G2 final production signature/second lawful source, G3 real v0.5.0 lossless migration & rollback and G4 explicit official release approval stay OPEN. No stable app install identity, production account/profile, release or OTA has been touched.


### R3 mobile recommendation-profile display and locale QA (2026-11-03)

A focused **original Android full-product** UX batch is implemented at [`c87e5937`](https://github.com/Saber-Alter-Lily/pica-library/commit/c87e593738ef306a9e497dc855279f9af28f85ce), reusing the existing `RecommendationProfileActivity`, `RecommendationPolicyStore`, `RecommendationLocalProfile` and `LocalizedText`. It does not add a second recommendation model, network request, tag-policy database or reader.

- The original mobile profile header, load/failure state, runtime/evidence/composition/Visual labels and source-category names now have explicit zh-CN/en/ja UI strings, with a two-line title and a minimum-width Back action for small screens.
- Two **default-off, local-only display checkboxes** hide saved persistent `BLOCK` and optional `LESS` preference controls from the **existing original top-ten lifetime profile presentation**. Compare exact type + normalized key using the original mobile tag registry; session controls do not hide lifetime data.
- A switch updates only the visible rows and keeps the original ordering, coverage/support counts, percentage denominators, profile, preferences and recommendation cycle unchanged. No rank-11+ backfill, data migration, model execution, source access or sync.
- The state persists only in a private on-device display preference. It does **not** imply Issue #200's broader tag-taxonomy question is solved, or that Desktop atlas filtering (#199) has been physically accepted on Android.

**Manual G1 walkthrough to perform on the *new exact-HEAD signed clean-Android QA artifact* (not older APKs):**
1. On a disposable device, open original Home → recommendation/profile in **Chinese, English and Japanese**, at representative **360/393/480dp** widths and one enlarged-font setting; verify back/title never overlap and the advanced guide's Profile targets still land.
2. With an imported/local profile or synced candidate reservoir present, record the first ten original interest rows, support counts and ordering. Switch hide `BLOCK`, then hide `LESS`; confirm matching persistent targets disappear only from the view and count of hidden rows is shown, with no lower-ranked replacement.
3. Reopen the screen/app: filter choice is retained, **raw favorite totals, other profile panels, stored policy controls and recommendation batch are untouched**. Turn both filters off and recover the original top ten unchanged.
4. Verify the source-neutral original app still uses the same local/Reader/Host flow, that the optional source-only Host stays a separate signed APK, and that old production v0.5.0 is not upgraded or reset by this QA install.

At source commit `c87e5937`, the strict [R3 clean-source physical APK job](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41635722298) is **SUCCESS**. Full CI and device/user G1 are **independent checks**; this document update deliberately requests one new **post-stable signed QA pair + Windows RC** via the existing bounded package workflow. Do not report package readiness until its *own* exact-head `contract/windows-rc/android-rc/artifact-summary` have succeeded and uploaded the actual ZIPs. R1–R4 product-level gates remain OPEN.

## R3 1,500 部书架的原版 Android 产品性能收口（2026-11-04）

**实际产品问题：** 原 `HomeActivity.shelves()` 每次进入/切换书架都在 Android 主线程同步读取完整 `portable-shelves-v1.json` 和 `unified-catalog-v1.json`，为当前书架遍历所有成员，且在已配对时每次重绘又触发 Desktop 同步，成功后 `show()` 再次调用 `shelves()`，存在自动重复同步链。对约 1,500 部书库尤其不利；此前首页书库和推荐已移至后台线程，但书架遗漏了相同优化。

**本批产品修复：** 复用现成 `libraryWorker` 和原 `ShelfLedger` / `UnifiedCatalogStore` / `UnifiedComicCollectionAdapter` / `RecyclerView`，让首次打开、切换书架和整理已有作品列表全部后台读取；打开时可见加载状态，页面离开后旧读取结果不能覆盖新页面。创建/改名/删除书架以及批量加入、移出书架的全量 JSON/目录写入也改为原后台队列执行，点击即时显示保存反馈，成功后再刷新可视状态。已配对情况下只在本次 Home 生命周期的首次书架进入自动同步一次；用户明确修改书架时仍保持原同步路径。未更换数据 Schema、同步冲突规则、漫画身份、阅读器或书架页 UI 模型。

**实际模拟器工程负载：** 扩展现有 Android35 原完整清洁 App E2E（非第二套工具）：在既有 `.cleanqa` QA 私有目录最后阶段注入 1,500 个合成目录条目与一个 1,500 项书架、一个 5 项书架（使用原始 `portable-shelves-v1.json` schema 2 和 `unified-catalog-v1.json` schema 4）。操作真实 `HomeActivity` 的书架入口、1,500 ↔ 5 项切换、返回书库，保存真实截图和各操作观察耗时。真实原本地漫画、账号及用户电脑不接触；测试仅使用零封面合成条目，不等同真实 1,500 部漫画和图片缓存的设备负载，因此 **G1 真实手机/正式资料、K3 p95/帧/ANR 预算仍 OPEN**。

**验收：** Android35 `S3 Android local Reader real emulator flow` 与当前 PR 的原 CI 需要在相同新 HEAD 实际通过才标 `ENGINEERING_VERIFIED`；先前的工程通过不能继承到这次修改。若有 UI 控件/读写错误，记录并修复实际失败，不放松原阅读器和来源撤销关口。

### 大书架编辑的原子写入（同批数据保护收口）

审查上述 1,500 项书架真实编辑路径时同时发现，共享 `ShelfLedger.save()` 仍使用历史的“写 `.tmp` → 删除原 `portable-shelves-v1.json` → 重命名 `.tmp`”三步；在后两步之间发生磁盘错误或异常终止时，用户可能失去原有书架文件。旧版载入异常还会静默返回空书架，使后续创建操作可能覆盖现有资料。

改为直接复用 Android `AtomicFile`（同项目 PhoneDownloadStore 已使用的成熟系统组件）进行 commit/rollback；从原 schema 2 的书架 JSON 读取，保留先前有效文件，支持 `.bak` 回退，遇到损坏文件或遗留孤立 `.tmp` 时拒绝写入并保留原字节。正式书架入口已能显示读取失败；不自动清除、不重新生成空目录。专用回归复用现有 Robolectric 环境，覆盖旧数据原子改写、损坏拒绝与中断残留。实际完成状态仍以新 SHA 的 Android CI 结果为准。

### Android35 1,500-item QA fixture correction (2026-11-04)

At exact source `a5e804e5`, 30 checks succeeded and one intentionally skipped; the only failed run was the **last** Android35 S3 flow [#41840983361](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41840983361). All earlier real S3 CBZ/Reader/official Suwayomi/Binder/clean-to-clean and legacy-to-clean upgrade subflows passed. The new large-shelf step FAILED **before opening Shelves** because `adb shell -T run-as ... sh -c "cat > files/..."` caused the shell-level redirect to run outside the application identity; the target relative `files/` directory was not found. This did not demonstrate any slowdown, corrupt Android app data, or failing shelf UI.

The same existing Android35 driver now writes bounded JSON to the disposable original application's actual private file using Android's existing `run-as <package> tee /data/user/0/<package>/files/<filename>` (no shell redirect), reads back exact bytes before resuming Home, and selects the large shelf explicitly if another previously active shelf was selected. This is **synthetic test-fixture IO only**, with no new app protocol or production-data access. The 1,500-item UI outcome remains unverified until the next exact-head real emulator run completes.

## R3 大书库滚动位置隔离与切换（2026-11-04）

在上一轮原版 Android35 实体 UI 工程验收中，真实 `HomeActivity` + 原 `RecyclerView` 已用 1,500 条合成作品成功完成大书架 → 5 条小书架 → 大书架 → 书库：[exact `bab0f898` #41845126489](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41845126489) **PASS**，所有该 HEAD 的 30 个工作流均成功（另 1 个按 PR 设计跳过）。这证明基本交互没有卡死，但**不能**证明真实 1,500 本带封面作品的帧/内存预算。

新发现原代码的具体体验缺陷：`HomeActivity` 将普通书库和所有书架的 `RecyclerView` 阅读位置都写进 `tabListPosition[0]`。用户在大书架滚动到后面的作品，再切换一个书架或返回普通书库，可能错误跳到之前另一个页面的位置。原本 `show()` 在触发页切换前会抓取当前 Viewport，但 `activeShelfId` 通常已经变成新书架，使以 activeShelfId 判断旧列表身份不准确。

修复复用原 `LinearLayoutManager.scrollToPositionWithOffset`、现有四 Tab 位置数组及同一 `RecyclerView`：增加仅 HomeActivity 生命周期内的每书架独立滚动位置映射，使用**实际已渲染的书架 ID**保存滚动；加载中的书架不覆盖普通书库位置；进入另一书架恢复它自己的位置。未持久化多书架位置到用户数据库、未修改推荐/同步/来源/阅读器。

延长**同一现有** Android35 1,500 项场景，在大书架内实际滑动并读取可见书名，切换至 5 项书架后返回，检查前次大书架可见作品恢复且没有跳到第 1 本，随后返回普通书库。记录原截图和用时。仅有新 SHA 实际 Android35 成功才能标工程通过；G1 实机和带真实封面/漫画的规模负载仍单独待验收。

## R3 Android original UI: reuse existing nine-scenario locale/width matrix (2026-11-04)

Original Android G1 has a separately tracked layout/translation requirement: 360/393/480dp, Simplified Chinese/English/Japanese, light/dark and 1.0/1.3/1.5 system font scales. The repository **already contains** `s1-android-locale-matrix.yml`, `scripts/run-s1-android-locale-matrix.sh`, and `S1AndroidLocaleMatrixTest.java` for nine carefully selected real Android35 emulator scenarios and seven original app pages. These workflows were configured for an old recovery branch, so the current unified Draft branch did not automatically receive fresh exact-HEAD evidence.

This batch **reuses** the existing workflow, instrumentation UI, screenshots and layout checks; it only allows the unified integration branch to trigger that matrix and adds original `HomeActivity.java` as a relevant path. It does not invent a new screenshot framework, Reader implementation, UI hierarchy, manual acceptance status or production build. The Debug APK is the historical original product (`com.picalibrary.android.dev`), **not** the source-neutral `.cleanqa` physical boundary; that is verified independently. The matrix may reveal genuine layout defects; it cannot close physical handset G1 by itself.

PASS requires actual nine-case runtime result and surviving captured images for the new commit. Any failed scenario remains OPEN until its root cause is resolved; do not mark the old recovery-branch screenshot pass as current integration acceptance.

## R3 九场景矩阵覆盖原 Android 四大主标签（2026-11-04）

此前 [九场景 UI 运行 #41851438528](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/41851438528) 已成功，但只覆盖原 `AdvancedGuide`, `AccountSources`, `Downloads`, `RecommendationStyle`, `RemoteStorage`, `Pairing`, `TagParticipation` 七个功能页，不包括用户真正频繁访问的四大主导航。因此不能用这轮成功声称原 Android 首页布局已被覆盖。

扩展**已有**的 `S1AndroidLocaleMatrixTest`/`run-s1-android-locale-matrix.sh`，不新建 Activity、Reader 或测试工具：每个原九场景（zh-CN/en/ja、亮/暗、360/393/480dp、1.0/1.3/1.5 字体）额外运行同一个原 `HomeActivity` 的四个 `tab` 入口，验证真实底部导航的可见触摸区域，及每页真实控件：书库的书架/本地导入、推荐生成、在线 Host、设置语言。保留原非黑屏、无系统弹窗遮挡、实际 App 所属前台窗口以及真实 PNG 证据要求。UI 截图仍只来自隔离的 `.dev`，不等同 `.cleanqa` 真机验收。

新版矩阵总计 **9 × 11 = 99 个原应用页面场景**，仍为旧脚本、旧 instrumentation 框架和同一 GitHub workflow；不创建新截图平台或重复执行媒体下载。新集成 HEAD 的原 Android35 工作流必须完整 SUCCESS 才能标工程通过；仍需使用物理手机验证 G1 手势、系统字体与 OEM 行为。

## R3 original Android first-frame duplicate-render and clean-QA update prompt (2026-11-04)

Inspection of the original four-tab `HomeActivity` found that `onCreate()` calls `renderShell(); show()`, then Android immediately invokes `onResume()` and unconditionally calls `show()` a second time. The first render schedules its own Library/Recommendation JSON scan, rescinds the first `serial` identity, and starts another scan. On a larger catalog this repeats expensive work at cold startup and can momentarily expose two independent loading states. Returning from Reader/Settings **does** require refresh and must remain unchanged.

Small production-path fix: the existing instance skips only the `onResume()` redraw immediately following its own `onCreate()` initial `show()`, then restores all normal redraws on later resumes and explicit tab/intent navigation. This uses the same original asynchronous store workers and does not change catalog JSON/schema/reader/history. In the explicitly source-neutral isolated QA app, the legacy formal OTA auto-prompt/check is suppressed because `UpdateActivity` already deliberately disables production updates there; normal production/Dev update checks remain intact.

Original 99-page-screen (nine scenario) locale matrix and existing Android35 Reader/Host/real-signer upgrade workflows are reused for regression. These updates must not be called verified until an exact source commit's CI and UI flows finish successfully.

## R3 实机验收候选重新打包｜2026-11-08｜单一集成分支

**触发目标：**以 R2/R3/R4 当前已审查的产品源 `b510f123c73b` 为代码基线，使用已有 `post-stable-rc-packages.yml` 产生一组完整 Windows/Android **未发布手动 QA 候选**。本次文档更新只记录已验证的工程边界并触发既有打包流程；不会合并 main、发布 Release、签正式更新、上传用户资料或部署 OTA。正式稳定版仍是 v0.5.0。

- [R3 完整无源 Android 产品与可选 Host #42468821974](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42468821974)：同一源 `b510f123` 第二次执行 **SUCCESS**；原四标签无站点 SDK 的 APK 和独立可选 Host 经 Android R8/DEX/权限与签名兼容审查。临时两 APK 工程证据与原完整 Dev 产品候选不可混称。
- [R4 公开 v0.5.0 同正式包名/签名原位升级 #42468821963](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42468821963)：同一源第二次执行 **SUCCESS**。真实旧版 APK 在 Android35 中建立临时书架、深色模式和推荐反馈设置，经 Android PackageManager 覆盖至无站点 SDK 的 v56 后保留；重启、独立同签名 Host 书签页往返、原书架重读均通过。未上传生产包名升级 APK，未触碰用户真实资料。
- [综合 Web/Source 验收 #42468825866](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42468825866)：第二次执行 **SUCCESS**。Android35 完整 Host → 原书库 → 原 Reader 真实 UI 场景 [#42468822037](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42468822037) 在本次打包准备时**仍未取得最终判定**；不能以其他工作流绿色代替。
- 本次新的完整 Windows/Android RC 包必须由**本提交自身**的 push 构建产生，以该工作流的 `windows-rc`、`android-rc`、`RC_STATUS.json` 及 SHA-256 清单为准；PR 事件只执行合同、跳过打包，不代表已产出安装包。Windows 只能写入独立 `Pica Library Post Stable RC` 目录；Android 使用独立 `.dev` 包名。它们用于真实 UI 手工测试，不是物理无源正式发布包，更不可用于覆盖真实 v0.5.0 资料。

**接下来的人工 G1 验收**：在实体 Windows 与代表性 Android 手机上，以同一组候选记录首页、书库导入/书架、Reader 续读、三语/放大字体、推荐/画风长任务可见进度与取消、1500 部带真实封面库的前台响应。来源 G2 须以自行管理的可信 Suwayomi Host 和实际获准的扩展完成真实章节/图片→原 Reader→自愿离线保存→撤销后可读；已有三扩展 JAR 注册并不等于站点内容读取。G3 真实用户备份/差异/回滚及 G4 正式发布仍 OPEN。

### S3 源书签→离线导入闭环修复及重新制作候选（2026-11-08）

[Android35 本轮复跑 #42468822037](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42468822037) **真实结论为 FAIL**，不是此前 504：已经由原无网络书库进入独立签名 Host 在线书签、在相同原 Reader 读取第 2 页并保留进度（这些步骤 PASS），但 Reader 返回后上一次搜索结果不会自动保留，原“保存到 Reader 书库”按钮随之消失，因而无法从书签直接自愿导入离线章节。

本批**真实产品补齐**：在独立 Host 的已保存作品行加入“从书签保存章节到阅读器书库”操作，复用 `HostSourceManager.locateAndResumeSavedBook` 中的原来源身份核验、签名 Binder 及**已有**的 `ExternalImportActivity` 章节选择与单章确认，不重新搜索，不增第二套 Reader/下载器/数据库。离线/错误 Host/未授权来源时按钮按已有 `canLocateSaved` 保持禁用，书签本身与已导入作品互不删除。

扩展**同一 S3 Android35 真实 UI 流程**：书签→原 Reader 第 2 页→回到书签→新导入按钮→用户选择一章并确认→对比两页图片字节→Host 撤销后原书库离线继续。该变更必须由**新 HEAD** 完整测试通过才能称为工程验收通过。为免陈旧候选误用于实机，本次修改继续触发已有未发布 Windows/Android RC 打包，而非发布正式版或覆盖用户数据。
