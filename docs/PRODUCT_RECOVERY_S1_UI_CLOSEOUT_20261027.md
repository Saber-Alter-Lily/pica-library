# S1 Android UI 第一轮整改及验收边界｜2026-10-27

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
