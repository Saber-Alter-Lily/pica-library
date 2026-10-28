# S0-01 / S0-02｜正式 v0.5.0 发布资产与功能对照基线

状态：**官方 Release 元数据已核实；真实二进制下载/运行对照 NOT_RUN**。核查日：2026-10-27。证据来自仓库官方 GitHub Release 与 tag，下面 SHA256 是 GitHub 对资产的元数据声明，**并非本轮重新下载后独立算出的哈希**。

## 1. 不可混用的三条版本线

| 版本线 | 精确参考 | 含义 |
|---|---|---|
| 正式 v0.5.0 | [tag `bec7f9f31828e8c57e0a2c103b6b1206c22c37cf`](https://github.com/Saber-Alter-Lily/pica-library/releases/tag/v0.5.0)，2026-10-01 发布 | 产品功能、安装与 UX 基线 |
| 最新 main（此前核查） | `095d6910c34e00824e03b08a30af0ce4e708137e` | 发布后 Web 更新重连补丁的仓库主线；**不等同于正式发行二进制** |
| Dev89 继续开发基线 | [`af42b4d3ecafd1d51b3c2ef8aee7339c56c75921`](https://github.com/Saber-Alter-Lily/pica-library/pull/217) | Draft 工程候选，用户未验收；来源外置目标仍未完成 |

## 2. 关键官方资产（尚未独立重哈希）

| 发布文件 | GitHub 大小 | Release SHA256（元数据） |
|---|---:|---|
| `Pica-Library-v0.5.0-windows-x64.zip` | 35,111,628 bytes | `14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf` |
| `Pica-Library-Android-v55.apk` | 1,875,378 bytes | `0bfe382b9026b7942309ac5a1e7cfefc676c0ea3e4e85f288d15d33fead8f598` |
| `Pica-Library-v0.5.0-update-from-v0.4.11.zip` | 551,712 bytes | `47807414f8bc3993051e088042c6fe0adb6b0286b8af26e225ec38b0b2340cb1` |
| `Pica-Library-v0.5.0-upgrade-assistant-from-v0.4.11.zip` | 6,722 bytes | `eb6010821e47d92168f49ea3cdeb7f8f4a645c7ce6277746466a5355cbf5df34` |

Release 还包含 SOURCE_SHA.txt、BUILD_TRANSPARENCY、SHA256SUMS 和 Android 更新元数据。源/包身份需按这些文件核对，不能因 main 相同目录存在源码就认定相同安装物。此版 Android 正式身份为 `com.picalibrary.android` / versionCode55；Dev89 为不同的 `com.picalibrary.android.dev`，不可直接互换数据或签名。

## 3. 正式版主功能清单（作为差异核对起点）

| 产品域 | v0.5.0 公开声明的能力 | Dev89 核查及可用性验收 |
|---|---|---|
| Windows 更新 | v0.4.11 一键升级、外置 upgrade assistant、重连刷新、可回滚完整替换 | 新版 T3 工程场景部分完成；正式用户资料、实际发行迁移未证明 |
| Windows UI | 简化设置中心、书库显示、连接状态与引导 | 源码需逐页/浏览器对照，NOT_RUN |
| Android 批量整理 | 书库/书架长按多选及底部情境操作栏 | 两版 `HomeActivity` 均存在 5 个等权重、单行显示操作按钮；长日文在窄屏有静态拥挤风险，待真实截图/修复 |
| Android 书库 | 收藏顺序、详情页页数、同一作品检查状态 | Dev89 有相关实现声明，但真实产品差异/性能 NOT_RUN |
| 推荐 | 有界收藏变化检查、作者曝光限制、正负反馈、人工 0–10/BLOCK/Session 编辑位置保留 | 旧模型规则冻结；现阶段不擅自修改排序 |
| 手机引导 | 任务型引导，含书架、推荐、Visual、同步和连接 | Dev89 高级指南曾退化为文字目录；新 S1 源码正在修复，真机未通过 |
| 长任务 | 进度/暂停/恢复、Desktop/Android 并发稳定性 | 需要正常大库与同时运行下载/推荐/画风压力实测 |
| 同步 | 手机与 Desktop 配对，已有本地/远程使用流程 | 新 Host 的统一收藏/标签/进度同步仍缺，不能混同旧路径 |
| 来源 | Pica、E-H/ExH、WebDAV、本地来源按正式版能力复核 | Dev89 并非纯核心源外置：Android 包依赖 JM SDK、SourceSpecific UI 仍在，S3 尚未完成 |

**限制：** 上表的“v0.5.0 公开声明”只用作功能核对清单，不能替代正式版实际安装和真实设备录屏。尤其“5 个等权重单行按钮”同时存在于旧版和候选版，属于须优化的继承体验风险，不凭此声称新版独有回退。

## 4. 下一步骤

1. 下载正式资产并按官方 SHA256 独立校验，在隔离设备/资料上运行；记录 v0.5.0 与候选版同设备截图及基础交互差异。
2. Android 先覆盖：书库/书架选择模式、账户来源和设置状态、推荐偏好与高级引导；不同字体/语言和窄屏为重点。
3. 形成包含每项适用端、源码、提交、页面截图、首次可复现版本、严重程度、测试状态的功能/UX 差异矩阵。
4. 任何新改动仅进入 Draft 分支，正式版和主线保持冻结。
