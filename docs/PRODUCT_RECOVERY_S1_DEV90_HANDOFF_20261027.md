# Pica Library Android S1 Dev v90｜独立 QA 测试交接

日期：2026-10-27；状态 **BUILT_AND_SHA_VERIFIED / USER_UI_NOT_ACCEPTED / UNRELEASED**。

## 精确安装包与真实性

| 字段 | 事实 |
| --- | --- |
| APK | `Pica-Library-S1-Android-Dev-v90.apk` |
| 构建源码 | `d288bc225e15e49c40eea06b52c67193f95ba457` |
| GitHub Actions | [成功构建 #40526064065](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40526064065) |
| 6 文件原始工件 | [#12745469077](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40526064065/artifacts/12745469077)；**仅保留 1 天** |
| APK 大小及 SHA-256 | 14,576,408 bytes / `bee99853830d5244c68eff2cda5eb58063564ea952a892d69de7b67e5c69ab28` |
| ZIP 大小及 SHA-256 | 5,681,155 bytes / `f4ee25f3ee182a0af0802334f79e7b124751091cbdd5bf70ef07579b377cb0d4` |
| Debug 签名证书 SHA-256 | `d3588d987b4d0a6afdf4aed66909722db63011d5b7dacb1d7a8f509a07e4f6b1` |
| 包名/版本 | `com.picalibrary.android.dev` / `90` / `0.5.0-S1-QA-dev-pr35` |
| 兼容 Android | minSDK 28（Android 9），targetSDK 35 |
| 构建证明 | Gradle 44 tasks success；Lint、Debug APK、签名、aapt 包身份检查成功；未执行此工件工作流内全量 JUnit |

工件中的 `SHA256SUMS.txt`、`PACKAGE_INFO.txt`、`SOURCE_SHA.txt`、`CERTIFICATE_SHA256.txt`、`STATUS.txt` 已回读；APK 的哈希在工作流之外再次独立计算，等于清单。正式版 `v0.5.0` 的 APK 包名是 `com.picalibrary.android`，不是本候选。

## 数据与使用安全

- 这是不依赖正式签名私钥的 **Debug QA 包**，不能当作正式升级包；不走正式 Release/tag/OTA。
- 与正式版不同包名，可并排安装；若已有同包名 `.dev`、签名不同，不得要求用户卸载清空数据以绕过签名限制。
- 首次体验使用合成或自选非私密小样本，不导入/修改生产漫画收藏或生产云端凭据来验收基本排版。在线来源访问与账号绑定只能经用户明确同意。
- 本包是 S1 视觉与交互候选；**G1 用户接受尚未完成**，其后增加的纯 TypeScript S2 Reader 端口不因为此 APK 的存在就被视为已在 Windows/Android 双端验证。

## 建议测试的具体路径（对照正式 v0.5.0 的对应视觉、功能，不改变历史测试数据）

1. **初次使用**：检查来源默认开关、更新提示、导航四栏、字体、主题和右侧状态文本；关注 360/393dp 小屏。
2. **高级引导**：设置或帮助进入八章；直接点击“开始本章交互引导”，确认打开真实页面并高亮真实控件。文档正文初始折叠、可展开/收起；切换章节、返回、跳过、重新打开后应保持正确进度，不应启动账号、下载、推荐模型或更新任务。
3. **书库与书架**：长按选择，核查所有 5 个操作按钮可见、可用、没有溢出。特别观察中文/英语/日语和系统字体 100%、130%、150%。
4. **来源/推荐标签设置**：长状态文字、标题、可折叠区域以及偏好“待保存”区，不应遮挡或让用户误以为引导已经实际修改设置。
5. **更新页/WebDAV**：高级导览模式不会自动检查网络、写入配置或恢复既有下载；普通手动操作仍有独立明确按钮。长更新说明不应把安装/取消按钮推到屏幕外。
6. **离线最小阅读闭环**：若有隔离的小型 CBZ，检查导入、章节、翻页、返回位置和下次启动的状态；无账号/无 Host 也应可读。禁止用 S1 UI 测试代替完整来源适配与迁移结论。

如果能提供具体截图，需同步记录：设备/Android 版本、屏宽或分辨率、系统字体比例、语言、主题、入口路径、页面滚动位置和看到的预期/实际差异。每项复现对应原 S0–S6 任务编号，修复后在相同条件下复验。

## 未完成门禁

真实物理机 UI/聚光验收 **NOT_RUN/NOT_ACCEPTED**；模拟器截图验收 **PENDING**（原 [KVM 通过但 instrumentation 失联/取消 #40526314386](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40526314386)；新 [分阶段指南首次截图 #40539159767](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40539159767) 独立评估）。历史 42 项及 12 新增案例未据此改成 PASS；G2 来源真正外置、G3 稳定无损升级、G4 正式发布仍 OPEN。

相关：[S1 原缺口矩阵](PRODUCT_RECOVERY_S1_UI_CLOSEOUT_20261027.md)、[S0–S6 权威计划](PRODUCT_RECOVERY_EXECUTION_PLAN_20261027.md)。
