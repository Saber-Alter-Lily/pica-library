## S1-03 已有真实截图发现的字号适配问题（2026-10-27，修复代码待复拍）

- 已实际下载解包并查看 [Android35 第0/3/5/7章截图 #12787147081](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40620663666/artifacts/12787147081)：**150% Android 字体、360dp 中文浅色的来源页**，“本机外部漫画源”一行标题的最后一个“源”孤行，右侧解释也被两列宽度挤成长段。这是可见的布局质量问题，不能以 VSpot 的10/10 功能测试掩盖。
- 限定修复既有 `SettingsRow.row`：当有状态且 `fontScale>=1.3`、`screenWidthDp<=480` 时改为标题/状态上下排列并保留右侧可点击箭头；普通字体及宽屏继续走既有等权有界两列，不在视觉层重写来源字段。加 Robolectric 360dp 放大字体/600dp 宽屏结构与测量断言；视觉工作流追踪共享布局变化。
- **新修复尚需用同屏100%/150%截图验证没有新的遮挡、过长高度或交互问题**，不能在源码提交时标记其已修复通过。正式版、来源授权、阅读数据与实际业务操作不受该 UI 薄片触及。

## S1-04 新增三章实页聚光（2026-10-27，结果待本次运行）

- 延续已通过的第0/3/5/7章（[Android35 run #40620663666](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40620663666)，10/10 Instrumentation，18张实际PNG），新增第1章人工偏好（标签范围、**禁用的**保存控件）、第4章WebDAV（已配置目标、网盘类型）、第6章本机推荐画像（运行状态、证据卡）的**真实Activity+VSpot**截图。继续复用现有 VSpotView 和 Instrumentation；每章只展示/切换高亮/跳过，禁止实际保存、登录、连接网盘、运行推荐或修改用户数据。
- 为第1章补保存按钮导览前/跳过后的禁用状态断言；第4、6章的控件在实际数据加载完成前不得假显示聚光。工作流仅合成 Debug 包，100%/150%字体，中文/浅色/360dp；目标每档15张，**合计30张仍是预期而非已通过**。任何失败需保留原日志。
- 第2章五步画风引导、三语言深浅/物理手机/其他尺寸仍未完成，G1=NOT_ACCEPTED；旧42+新12验收不改判。

## S1-04 新增独立无副作用引导验证（待运行）

- 延续已确认为 PASS 的第0和第5章真实聚光，新增第3章（扫描和手动配对按钮）与第7章（更新状态和手动检查按钮）的独立 Android Instrumentation。复用原生 ActivityMonitor 和 VSpot；只读高亮+截图+跳过，不执行扫码、配对、更新、下载或安装。第7章额外对比导览前后状态均为只读预览。
- Android 35/360dp/中文/浅色，100%和150%字体，目标截图数从10增加至18（每档9张）。目标数量不是结果，**新源码模拟器与完整 CI 还未验证**。真人设备、其余章节和全 UI/字体矩阵持续 OPEN。
- 保留历史失败；不改变 v0.5.0/main/Release/OTA 或用户资料。

## 2026-10-27 S1 checkpoint — actual source `079b9e37`, CI regression repair (pending rerun)

- [Exact-head real emulator run #40609472634](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40609472634) **SUCCESS**: 100% and 150% font, Chinese/light/360dp; each scale ran three independent Android Instrumentation cases (guide menu, source two-step spotlight, downloads two-step spotlight), **6/6 PASS**, with 5 images per scale (**10 real PNG total**). [Evidence artifact #12781184746](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40609472634/artifacts/12781184746) is short-lived; its existence and logged images do not establish other languages, actual physical devices or user acceptance.
- [Exact-head Web/Desktop CI #40609478800](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40609478800) was **FAILED in Web/Desktop** (2638 passed/3 failed/14 conditional skipped, 334 files); Android job outcome separately pending at log read. The three failures are outdated source-contract expectations: prior literal debug application suffix no longer reflects bounded QA suffix+pair scheme; account-hub Chinese-only literal checks no longer reflect the trilingual resources; source-host frozen ProviderRegistry checksum predates a reviewed fail-closed `forPageForComic` addition.
- Correction preserves full test coverage and stronger runtime guardrails. Android test now verifies default `.dev` **and** bounded isolated QA suffix; account test verifies real resource IDs and three locale files; Host protection retains all original frozen hashes and requires byte-for-byte restoration of the old Registry after removing **only** the reviewed identity-bound routing seam. Do not rebaseline or replace the protected fixture checksum. All corrections remain **unverified** until exact new CI runs.
- No merge, public release, OTA or production install. The S0 data durability risk and full G1/G2/G3/G4 gates remain OPEN.

## S1-03/04 增量：下载页实际 VSpot 测试（本批执行结果待验证）

- 已在已通过的第0章聚光外增加第5章下载页的实际 Android Instrumentation：任务/存储两目标、两张截图、跳过不记已读；原第0章源码与验证证据保留。模拟器 100%/150% 各新增两张目标图片；**期望总计10张 PNG，但只能按实际 GitHub Actions 结果认定**。
- 下载页面中英日资源、标题两行和双按钮有界布局已写入 Draft；独立 Robolectric 测试覆盖 360/393/480dp。取消按钮使用下载页自己的翻译资源而非 JM 专属资源；不新增主程序对漫画源的依赖。
- 下一步须核验最新源码 CI、Lint、截图及原始日志，凡未运行/失败仍为 OPEN。G1 尚未获得用户验收，旧42+新12条款没有改判。

## 本轮 S1-04 模拟器聚光验证（精确源码 53230258）

[完整运行 #40608083571](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40608083571) **SUCCESS**；在 Android35 / 360dp / 中文浅色中，100% 与 150% 字体各完成 1 张真实高级引导目录、2 张真实 VSpot 聚光，共 6 张 PNG（[工件 #12781423591](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40608083571/artifacts/12781423591)）。日志证实来源章节第一步与第二步目标标签正确，跳过未标记已读；对应 4 次 Instrumentation 测试全部成功。旧 #40547904187 启动阶段超时 FAIL 必须保留，不能倒改成 PASS。**只覆盖第0章、两档字体、一个模拟器/语言/主题；不能替代另外7章、其他页面及真机验收。**

本轮 S1-03 接着处理 `DownloadsActivity`：下载标题、工具按钮、操作行、存储状态、作品章节/页数、删除确认改为中英日资源，标题可占两行、主要两个操作使用等权有界宽度。新增 Robolectric 360/393/480dp、三语言页面标题与按钮不重叠回归。这些属于源码更改；后续精确 SHA 的 Android 单元/Lint、模拟器和真实手机情况仍需单独标注，不把未执行写成通过。

# S1 Android UI 第一轮整改及验收边界｜2026-10-27

## 本轮精确聚光测试失败与后续源码修复（未验证通过）

- [真实聚光运行 #40547904187](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40547904187)，源码 `e2c50623`，**terminal FAILURE**：API35/KVM 与 Debug/AndroidTest 编译通过，第一个中文浅色指南目录截图通过；独立的来源第0章聚光测试停在 `phase=spotlight-launch`，150秒外层超时（exit124），未产生两步 VSpot 的合格截图。属于目前已确认的测试/启动阻断，不能以目录截图替代聚光可视化证据；因缺乏足够日志，还不能断言产品页本身死锁。
- 后续独立 Draft 修改：`AccountSourcesActivity` 将引导只读标记跨 Intent extra 被消费后的 `onResume` 及配置重建保存，避免返回时自动发起 Desktop/ExH 探测；新增 Robolectric 回归。真实聚光 Instrumentation 改用 Android 原生 `ActivityMonitor` 观察页面和主线程读取 VSpot，不再用 ActivityScenario 的 Espresso 空闲等待；增加启动/发现阶段日志。
- 同期来源管理页补齐三语言用户可见状态，标题两行上限；缩短高级导览的紧凑说明，缓解放大字体的文字孤行风险。**这些均是源码改动，真实页面截图、物理设备及原 42+12 验收状态尚待新源码运行。**
- [QA3 独立 APK #40542505173](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40542505173) 已是 terminal SUCCESS，属于隔离包 `com.picalibrary.android.s1qa3` 的 Debug 构建证据，不是正式签名覆盖/用户接受。
- 本批更改的精确源码新 CI / 模拟器视觉运行在提交时仍为 **PENDING**。G1 继续 NOT_ACCEPTED；main、Release、正式 OTA 与用户数据不变。

## 已核实两代 Debug QA 与真实截图证据（2026-10-27）

| 精确对象 | 已证实 | 不允许误判 |
| --- | --- | --- |
| [中文浅色指南第一版截图 #40539159767](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40539159767) | 100%/150% 字体各 1 张 PNG，真实 Android35，实测 PASS；已目视发现标题冗余、说明过长、底部按钮挤压 | 不是八章聚光，也不是全语言/全部设备/用户通过 |
| `7689f26b` 更新后的界面 | 代码完成、翻译与 Robolectric 断言提交，首屏改成短说明+强调 CTA+折叠长文+间距 | [新版模拟器 #40541090821](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40541090821) QUEUED，没有复拍前后 PASS 证据 |
| [Dev v90 #40526064065](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40526064065) | SHA-256 `bee99853830d5244c68eff2cda5eb58063564ea952a892d69de7b67e5c69ab28`，已独立核验，包名 `.dev` | 与更新后的 UI 不是同一源码，未经手机验收 |
| [Dev v91 QA2 #40541090823](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40541090823) | 最新界面对应 APK 14,578,316 bytes，SHA-256 `568bbcb04f1af56ce0056599e103fb38d1244807acbd898032e3c35d4afd76ed`，签名/包名/哈希成功 | 和 v90 同为 `.dev` 但临时 Debug 签名不同；不能覆盖安装保护旧数据 |
| QA3 `v92` 源码 `a28404e7` | 计划独立 `com.picalibrary.android.s1qa3` 与配对 scheme；Gradle 默认 Debug/Release 路由不变，静态单测已增加 | [QA3 工件 #40542505173](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40542505173) QUEUED，不能当作实体构建已 PASS |

仍需完成：八章目标控件可见/跳过/回退的 Android 真机验证、三语言与 360/393/480dp × 多字体 × 深浅主题矩阵、旧用户 Stable 签名覆盖和个人库迁移；最终用户接受 G1 保持 **NOT_ACCEPTED**。



## 可供实体安装验证的隔离 Android Dev v90（已独立 SHA 核验）

[GitHub Actions QA 工件 #12745469077](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40526064065/artifacts/12745469077) 在源码 `d288bc225e15e49c40eea06b52c67193f95ba457` 上成功生成；APK 为 14,576,408 字节，SHA-256 `bee99853830d5244c68eff2cda5eb58063564ea952a892d69de7b67e5c69ab28`，证书指纹 `d3588d987b4d0a6afdf4aed66909722db63011d5b7dacb1d7a8f509a07e4f6b1`。包名 `com.picalibrary.android.dev`、versionCode `90`，与正式 v0.5.0 APK 不同包名，且不保证覆盖不同 Debug 证书的旧 Dev APK。**这只是可供用户验收的 Debug 产物，不是 G1、正式发布或升级成功证据。** 交接见 [S1 Dev90 独立验收](PRODUCT_RECOVERY_S1_DEV90_HANDOFF_20261027.md)。签名与 SHA 校验成功，不等于 Android 真实 UI 已验证。该独立打包工作流保留 Lint/assemble，完整 Android JUnit 仍由主 CI 守卫。


## S1-04 从指南首页进入真实聚光控件的下一道门禁

已通过的 `7689f26b` 模拟器仅证明指南首页能渲染，不能证明“开始本章交互引导”能显示控件聚光层。本轮新增隔离 Instrumentation 场景：携带第 0 章 Intent 进入真实 `AccountSourcesActivity`，等待现有 `VSpotView` 出现，断言两步目标分别为“选择来源”和“用户 Host”入口，抓取前后两步真实屏幕图片，点击跳过并检查该章**没有被标记已读**。只读取合成全新 Debug 应用的本地默认状态，不配置来源/账号，不触发联网或业务操作。Android 100%/150% 字体各另有两张预期截图；新测试是否通过仍需本轮精确 GitHub Actions 判定。

## 新的 S1 模拟器最小真实页面渲染门禁（2026-10-27）

历史 #40526314386 已确认：KVM 生效、Android35 模拟器启动、59 项 Gradle build tasks 通过、安装两个 APK，但 Instrumentation 开始后未结束，任务最终超时取消。**0 张可验收 PNG**。此外 Runner Actions 的正确参数名为 `disable-linux-hw-accel`，旧 `disable-linux-hw-acceleration` 并非有效输入。

下一次改为仅在 360dp、浅色、中文场景启动真实 `AdvancedGuideActivity`，100% 和 150% 字体各验证 1 张。删除可能阻塞的额外 `waitForIdleSync`，测试直接持久化应用自身主题而非触发系统夜间模式切换；增加 `S1_VISUAL` 逐阶段日志与每档 150 秒上限，并上传文字诊断。**两张成功只是最小渲染证明，不替代原计划 24 张、其余语言/主题/设备或真实手机验收**。

## S1 真实证据门禁最新分类（独立于工程编译）

| 来源 | 实际结果 | 处理 | 允许得出的结论 |
|---|---|---|---|
| [#40522901087](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40522901087) | FAIL，模拟器冷启动超时 | 日志显示缺少 `/dev/kvm` 权限、运行器关闭加速 | Runner/模拟器可用性问题，**不是**已证明的阅读器排版错误 |
| [#40526314386](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40526314386) | KVM 预检已完成；截图流程 IN_PROGRESS（最近核查） | 等精确 SHA 的 PNG 与 Instrumentation 记录 | 暂时无可展示的 24 张截图，G1 仍 OPEN |
| [#40521071684](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40521071684) | CANCELLED，在重复跑 full JUnit 时到工作流时限 | 另起 [#40526064065](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40526064065) 只打包/Lint，full JUnit 保留原 CI | 没有 Dev APK 完整验收，勿提供安装链接 |

后续只在实际 APK、PNG、哈希、安装/运行证据出现时更新为包验证或模拟器验证。模拟器正常运行也不等于真实手机 / 用户验收。S2 在线阅读新增来源绑定为另一组独立功能/安全检查，不作为 S1 视觉门禁的替代。


## 最新模拟器运行的独立事实（截至 2026-10-27）

| 运行及源码 | 结果 | 实际工程证据 | 未满足的事项 |
|---|---|---|---|
| [#40517358640](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40517358640) / `02841418` | FAIL | 模拟器能启动 | Gradle 在仓库根目录无法找到工程 |
| [#40519878220](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40519878220) / `45e6e641` | FAIL | Debug 和 AndroidTest APK 构建成功；59 tasks | 访问 `/sdcard/Android/data` 受限，未进入截图 |
| [#40522901087](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40522901087) / `505b4a90` | PENDING | 改用应用私有 Files + Debug run-as 按名单提取 | 尚无通过结论、PNG 总数和可视化检查 |

Android 35 的存储拒绝属于**测试工具自身的访问策略问题**；不能据此断言软件的阅读器发生同样的存储故障，也不能因编译成功而宣布 UI 优秀。截图目标仍是每档字体 12 张，总计 24 张；多设备 393/480dp 与 130% 字体、真实手机/用户验收尚未完成。

**独立 S1 Dev 测试包：** [构建 #40521071684](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40521071684) 必须通过 JUnit、Lint、签名和版本核验后才可当作 Dev QA 候选。不得覆盖正式 APK/清除既有 Dev 用户数据；源码 S2/S3 仍未满足纯 Reader 包条件。


## 视觉验收工具补充（实际运行回执，不是通过结论）

- 开发分支新增可运行 Android 35 模拟器 UI 截图，`360dp × 字体 1.0/1.5 × 中英日 × 深浅` 的部分页面组合，目标 24 张 PNG；单次截图包含具体源码 SHA、模拟器检查日志。图像来自隔离的 `.dev` 版本，不是官方 stable Android，也不能证明真实手机交互合格。
- 初次 [#40517358640](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40517358640) **FAIL**：模拟器启动但 Gradle 工作目录错误，未执行 UI 截图；本错误已复现并提交独立 Bash 脚本修复（`45e6e641`）。下一次截图只能引用修复后的 [#40519878220](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40519878220) 结果，不可凭启动状态声明通过。
- 为实际用户验收准备独立包构建 [#40521071684](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40521071684)：按正常 Gradle 单元/Lint/Debug 编译、检查 Dev 应用身份并提供校验 SHA、签名摘要和隔离提示。**打包通过前无任何新 APK 交付**。已有 Dev 安装遇签名不一致不能卸载清用户资料来绕过。
- **剩余 393/480dp 真实图像、130% 放大字体及物理设备验收尚未覆盖**；不要把 24 张计划截图误写为最终全矩阵。


**源码基线**：PR #218 `8f8124657d203c71a51ea5e7121fd6798bfee998`，Draft/UNPUBLISHED。
**产品基线**：正式 v0.5.0；对照版本与资产元数据见 [S0 正式版审计](PRODUCT_RECOVERY_V050_OFFICIAL_BASELINE_20261027.md)。
**验收状态**：S1 implementation=IN_PROGRESS，自动 CI（此精确 SHA）=NOT_FINAL，物理手机=NOT_RUN，userAcceptance=NOT_ACCEPTED，G1=OPEN。

## 本轮已提交的源码薄片

| 编号 | 修改范围/解决的问题 | 现有证据 | 未完成门禁 |
|---|---|---|---|
| S1-01/03 | `SettingsRow` 的标题与右侧长状态文本分别使用有界宽度；不再让状态文字无限挤掉标题 | Android 源码 + `SettingsRowNarrowLayoutTest`，早期测试行数断言失败已修；后续 Lint 错常量也已修 | 英/日/中放大字体，真实截图，相关页面整体布局 |
| S1-02/03 | 手机书库/书架长按多选时，窄屏 5 个操作按钮分两行；宽屏仍为一行，不藏入省略菜单 | 源码 + `SelectionActionBarLayoutTest` 日文宽/窄测量 | 实机操作区高度、键盘/导航栏冲突 |
| S1-02/03 | 标签参与页面标题栏使用受约束的宽度和多行布局 | `TagParticipationActivity`、`TagParticipationActivityTest` 新增 360dp 英文测量 | 更长文案/其他尺寸，真实截图 |
| S1-04 | 8 个高级章节实际进入功能页面并高亮控件；后补滚动、不可见目标防假完成及“已读”返回刷新 | `AndroidOnboarding` + `DualOnboardingTest`、`AdvancedSpotlightTargetTest`、`AdvancedSpotlightScrollTest` | 真实 Android VSpot 可见性、覆盖关系、全部页面用户验收 |
| S1-04/01 | 高级引导的**交互入口优先**，长篇离线文字说明默认折叠，用户自选展开；中英日均具相应按钮文案 | `AdvancedGuideActivity`/3 语言资源/`DualOnboardingTest` | 真实页面可读、不同字体字号、返回与旋转交互 |
| S1-01/03 | 下载更新页说明有滚动区域，操作区不被大段说明挤出屏；引导打开更新页默认只读，忽略旧下载通知 | `UpdateActivity` + `UpdateNotesLayoutTest` 和 guide 安全测试 | 真实更新包/长 release notes 不在此轮测试 |
| S1-04 | WebDAV 数据存取从 UI 读取的时机分离：表单在主线程快照，后台仅运行请求 | `RemoteStorageActivity` 修改及原来源权限边界 | 实际账号/云端读写没有运行，本轮不声称完成 |
| S1-02 | 原 `LocalizationLayoutTest` 增加 393/480dp 三语言以及高级引导页，保存旧 360/412/600dp 测试 | GitHub Actions Android Gradle/Robolectric 确认后才能通过 | 130%/150% 字体、真实图像视觉比较 |

## 不得以工程证据代替的事项

1. 用户已明确反馈 **Android 多处排版不好用**。缺少具体缺陷截图和硬件配置时，只能声称改善了上述可确认代码风险；不猜测用户看到的全部问题，也不能标 G1 通过。
2. 代码与测试不能证明所有导览控件在手机真机上都具有正确滚动、可见高亮与返回手势。需用户实际打开、录屏/截图或硬件自动化证据。
3. 目前没有可供用户直接升级的经过整套 UI 验收的正式 APK；勿把旧 Dev89 安装包当作新修复交付。
4. 原 P0–P6/42 项案例与其中失败/缺口维持原状态；本 S1 新增 UI 门禁只提供增量核验，未关闭 #199/#200 或来源外置任务。
5. 本轮没有改变 Library/Reader/推荐/Visual 的算法和数据库 schema，也没有删除 Pica/EH/JM SDK。S2/S3 仍按 [来源解耦审计](PRODUCT_RECOVERY_S2_S3_SOURCE_DEPENDENCY_AUDIT_20261027.md) 继续。

## 继续推进顺序

先收口当前精确 SHA 的 CI 失败与完整证据；再在隔离 Android 设备按 `360/393/480dp × zh/en/ja × 字体100/130/150% × 明/暗主题` 的代表性组合做**页面截图和实际操作**；复现所有用户已观察的异常并建立逐项前后对照；最后验证与 v0.5.0 的功能对等，再考虑 G1。

任何新的修改继续仅放在 PR #218 Draft，历史 PR 和正式版保持不动。
