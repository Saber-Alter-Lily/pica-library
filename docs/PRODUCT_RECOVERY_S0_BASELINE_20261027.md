# S0 第一轮源码基线核查｜2026-10-27

状态：**IN_PROGRESS / STATIC_REVIEW_ONLY**。来源：`main@095d691` 对照未发布 `PR217@af42b4d`；本轮未安装/操作用户设备，未执行应用/JUnit/真实浏览器，不能宣布任何功能或 UI 已被物理验收。

## 确认事实

| 范围 | 本轮证据 | 结论与处理 |
|---|---|---|
| 发布版本 | 正式版 `v0.5.0`；main 最近记录 SHA `095d691`，PR217 `af42b4d` 为 Draft/unmerged | 体验基线=v0.5.0，候选源码为后续工程修改起点，不默认发布 |
| 阅读器产品边界 | `docs/MODULAR_LOCAL_READER_ARCHITECTURE.md`、`docs/CORE_READER_SOURCE_BOUNDARY.md` | Reader/Core/Tags/Recommendation 已有实际提取片段，但未完成整个 monolith/UI 和实际来源外置 |
| Android 高级引导 | `mobile/android-alpha2/app/src/main/java/com/picalibrary/android/AdvancedGuideActivity.java` | 8 个章节：长文字+打开目的页面的按钮；**没有把章节与目的页面真实控件 spotlight 连接**；列 S1-04 确认缺陷 |
| Android 可复用聚光能力 | `AndroidOnboarding.java` 使用已装的 `VSpotView`，且推荐设置页已带实际控件 tag | 必须优先复用现有原生引导，不引新框架/新 CDN |
| 通用设置行布局风险 | `SettingsRow.row()` 将右侧状态作为无上限 wrap-content sibling；左侧标题使用剩余宽度 | 窄屏/长文本会挤压标题；是静态可证明风险，不冒充用户具体截图归因 |
| Android 来源残余耦合 | `mobile/android-alpha2/app/build.gradle` 编译 shared JVM 及 JM 依赖；Manifest 存在 Pica/EH/JM 相关 Activity | 仅禁用来源或 Windows core 不包含 JVM 无法认定“来源已外置”；S3 BLOCKING |
| 旧核心能力 | 现有文档包含原 42 案例；`docs/PRODUCT_RECOVERY_ACCEPTANCE_MAP_20261027.md` 逐项映射 | 新计划不覆盖或自动改判历史门禁与失败 |
| 工程证据与真实接受 | PR217 云端工程门禁已在先前运行通过；用户随后明确报告排版及高级引导问题 | USER_ACCEPTANCE=NOT_ACCEPTED，S1 实机与 UI 视觉证据缺失 |

## 需要进一步核实，不得填写 PASS

- **S0-01**：固定 v0.5.0 官方 ZIP/APK、发行构建 SHA、渠道完整性与 UI 基准截图；目前只确认官方版本线和现有文档，不重哈希未下载的旧安装包。
- **S0-02**：逐页对照正式版与 Dev89 的功能和交互；没有两个版本同设备实操，不可断言全部功能被保留。已登记组件/页面清单，待真实截图。
- **S0-03**：按源码和最终编译产物双重核对所有残余来源专属代码、JNI/JVM、素材及网络行为；本轮只确认部分残余耦合。
- **S0-04**：用户报告“手机版很多排版问题”是真实验收阻断；除高级引导外，具体页面/设备/字体/语言/最小步骤尚未提供，不能自行把所有 UI 风险说成其根因。
- **S0-05**：构建完全隔离的 CBZ/文件夹、约 1,500 作品和多设备冲突夹具；目前没有创建真实样本文件，不得虚称测试通过。
- **S0-06**：原 42 个案例已枚举且新阶段映射完成（映射文档），**新一轮实际测试全部 NOT_RUN**；历史 PASS/FAIL 仍依其原始来源有效。

## 当前首批实施边界

- **S1-03 薄片**：仅修复可确认的设置行长状态文本挤压风险；附源码检查及新回归，尚不能据此认定所有页面排版恢复。
- **S1-04 薄片**：使用既有 VSpot 引导目标，不开启账户/网络/下载/更新操作；先完成可确认的章节目标并诚实记录未接通章节。不可标称 8/8 完成。
- **不触及**：推荐权重/Visual 向量、DB schema、正式版更新和 OTA、来源凭据、用户资料、已有冻结 PR、签名密钥。
