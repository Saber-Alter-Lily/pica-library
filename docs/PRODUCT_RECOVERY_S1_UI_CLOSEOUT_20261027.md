# S1 Android UI 第一轮整改及验收边界｜2026-10-27

## 可供实体安装验证的隔离 Android Dev v90（已独立 SHA 核验）

[GitHub Actions QA 工件 #12745469077](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40526064065/artifacts/12745469077) 在源码 `d288bc225e15e49c40eea06b52c67193f95ba457` 上成功生成；APK 为 14,576,408 字节，SHA-256 `bee99853830d5244c68eff2cda5eb58063564ea952a892d69de7b67e5c69ab28`，证书指纹 `d3588d987b4d0a6afdf4aed66909722db63011d5b7dacb1d7a8f509a07e4f6b1`。包名 `com.picalibrary.android.dev`、versionCode `90`，与正式 v0.5.0 APK 不同包名，且不保证覆盖不同 Debug 证书的旧 Dev APK。**这只是可供用户验收的 Debug 产物，不是 G1、正式发布或升级成功证据。** 交接见 [S1 Dev90 独立验收](PRODUCT_RECOVERY_S1_DEV90_HANDOFF_20261027.md)。签名与 SHA 校验成功，不等于 Android 真实 UI 已验证。该独立打包工作流保留 Lint/assemble，完整 Android JUnit 仍由主 CI 守卫。


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
