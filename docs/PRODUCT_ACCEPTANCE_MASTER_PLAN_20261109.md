# Pica Library｜集成候选至正式验收执行总计划（2026-11-09）

> **唯一执行总账**｜当前状态：B1 `PACKAGE_VERIFIED / MANUAL_QA_PENDING`，B2 `NEXT_REAL_SOURCE_GATE`，B3–B5 `BLOCKED_BY_DEPENDENCY`；五批次覆盖现有 R0–R4/S0–S6，**不替换或缩小**历史 42+12 项验收。任何后续对话只收到“继续推进”时，先读本文、[总 Issue #283](https://github.com/Saber-Alter-Lily/pica-library/issues/283) 和本分支最新 SHA/CI，选择首个未过门禁的批次；禁止跑偏为零散接口/测试/视觉 PR。

## 0. 产品目标与冻结边界

- **唯一开发与验收分支**：`codex/product-integration-r1-20261102`；唯一产品 PR：[Draft #284](https://github.com/Saber-Alter-Lily/pica-library/pull/284)。截至建档基线为 `d9813ea92c86c9beb01faaa4f90b48b301bff9cf`，以后必须按**最新实际 SHA**逐次更新，不把此 SHA 当恒定当前版本。
- **稳定基线**：`main`=`095d6910c34e00824e03b08a30af0ce4e708137e`，正式发布 v0.5.0。此计划及常规“继续”**不授权**合并 main、修改 Release/OTA、签署生产版、修改真实用户资料、登录第三方账户。
- **定位**：Windows/Android 原版全功能、本地优先的漫画书库+唯一 Reader；可选用户自管来源/Host/网盘，0 账号/0 网络/0 Host 仍可导入、管理、阅读和续读；来源不能再内置为核心执行依赖。完整四标签/全 Web 产品不允许被小型 Reader QA 壳替代。
- **复用原则**：先审本仓库 v0.5.0 的原 Reader、SQLite/LocalComicStore、LibraryIngestion、ShelfLedger、推荐/Visual、下载调度、LAN/WebDAV、Upgrade Assistant 和现有 GitHub workflows；再参考 Suwayomi/Mihon/Keiyoushi/Kavita 等成熟开源方案的接口和 UX；审查许可证，禁止复制未知授权的第三方插件。**不新建**第二 Reader、DB、Updater、任务框架、网络协议或推荐引擎。来源外置不等于自动免除版权/许可责任。
- **范围冻结**：优先消除实际用户 P0/P1（资料损失/侵权风险、无法导入/阅读/升级、黑屏/卡死、严重 UI 遮挡）。暂缓扩展 OS、推荐模型研究、装饰性 UI、额外的抽象层/测试框架。发现 P0/P1 可作为所在批次的阻断性修复，必须更新本计划。
- **验收判定**：每项 `PASS` / `FAIL` / `NOT_RUN` / `N/A`（附原因）；“代码已实现”“CI 绿”“模拟器过”“物理实机与用户接受”四个等级分开。一个 workflow SUCCESS 但 `windows-rc/android-rc SKIPPED` **不代表**双端包可用。不得在 G1–G4 未全通过前宣布“已可发布”。

## 1. 固定基线事实（建档时核查；后续逐次刷新）

| 工程证据 | 现状 | 下一步 |
|---|---|---|
| [Web/Desktop/Android 标准 CI #42579629180](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42579629180) | `d9813ea` SUCCESS | 保留，后续以冻结最终 SHA 复跑 |
| [综合 Web/Source #42579629184](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42579629184) | `d9813ea` SUCCESS；其他旧分支限定 job SKIPPED | 不能代替真实产品双端完整验收 |
| [Windows 原产品三种模式 QA #42579623676](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42579623676) | `d9813ea` SUCCESS | B1 同源可安装 ZIP 核验 |
| [P2 运行时门禁 #42579629240](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42579629240) | FAILURE；`android-static` Gradle 下载 HTTP 504；其他实测 job 通过 | 基础设施阻断，保留完整断言 |
| [K3 Android 负载 #42579629161](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42579629161) | FAILURE；Gradle 8.9 下载 504 | 只修依赖固定来源/降重复网络请求，不弱化测量 |
| [v0.4 Direct Upgrade #42579629449](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42579629449) | FAILURE；Android 公共旧 APK CDN 504；Windows/资料测试通过 | 固定精确 Release 资产+SHA/证书，恢复可重复获取 |
| [Post-stable RC #42579629248](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42579629248) | workflow SUCCESS，**实际 `windows-rc`、`android-rc` SKIPPED**（只执行合同/状态） | B1 触发可信 push/dispatch，检查每个安装包真实产出 |
| 三款来源 JAR 的安装/撤销、Android 官方 Suwayomi Local Source 两页图片 | 工程证据有，但非真实第三方作品 | B2 实际来源操作与独立第二来源必做 |
| 旧 42+新12 验收 | [原矩阵](PRODUCT_RECOVERY_ACCEPTANCE_MAP_20261027.md) 保留，重新验收尚未逐条签收 | B5 生成 54 行逐项证据索引 |

## 2. 工作顺序、不可并行的依赖和退出条件

### B1｜同一 SHA 双端可安装候选与阻断清理（**PACKAGE_VERIFIED，G1 仍 OPEN**；对应 R1/R3/R4 工程准备）

**范围**：完成 CI、真实 Windows x64 ZIP+真实 Android 原四标签 **source-neutral clean QA APK** + 独立 **same-signer user-host APK**；Dev APK 仅作旧功能对照。不能把临时 QA 包说成“正式签名升级版”。

**具体执行**：
1. 修复在 **真实失败 job** 中定位到的 Gradle/CDN 504、固定旧版 APK 下载 504：复用已有 `scripts/ci/install-gradle-8.9-fallback.sh`、GitHub 官方资产 API/Release URL 和原 SHA256/证书锁。限时有界重试，无法验证资产时 FAIL，绝不更换资产/绕过。
2. 原 `post-stable-rc-packages.yml` 进行可信集成分支 **push** 或授权的工作流 dispatch；`contract/windows-rc/android-rc/artifact-summary` 逐一查结果，要求同一 SHA 的 Windows 和 Android 工件、`RC_STATUS.json`、`SHA256SUMS.txt`。绝不因为 PR 的 skipped job 宣称已打包。
3. 沿用原 `s3-windows-offline-portable-qa.yml` Windows 解压启动、书库/页码/重启；Android `r3-android-clean-source-qa.yml` R8/DEX/权限/包名审计；同签名 Binder 的 Reader+Host；`ci.yml`/集中验收不遗漏。
4. 出一份 `docs/PRODUCT_ACCEPTANCE_EVIDENCE_20261109.md` 证据汇总，列 SHA、workflow/job、文件名/Hash、是否实际上传、未通过原因和 G1/G2 尚不能外推内容。

**B1 验收**：所有与包相关的关键工作流均确认为 **terminal SUCCESS 且实际 package jobs SUCCESS**；三个适用安装包同源码 SHA/哈希/身份匹配，Android clean APK 实际 DEX 无内置 Pica/EH/JM 代码；Windows 真实 ZIP 解压启动与原 Reader 本地阅读完成；QA 与 v0.5.0 资料严格隔离；保留签名/包名冲突拒绝行为。**真实设备视觉可留 G1 OPEN，不阻止 B2 工程进入，但阻止发布。**

**B1 不通过则**：停在 B1，只修实际阻断；若供应商 CDN 不可用，记录 `EXTERNAL_DOWNLOAD_BLOCKED` 与对应锁定 SHA，不假装成功或更换无校验镜像。

### B2｜真正外接来源的两个独立端到端闭环（对应 R2/G2）

**范围**：以独立安装、用户自行选择/信任的 Suwayomi/Tachiyomi 合法扩展为主；三个目标 Pica/JM/E-H 均做可用性表，但**最少两种独立实际提供章节和图片的来源**才允许宣称通用多源支持。JAR 的存在/验证/注册 ≠ 站点服务可用。

**操作闭环（Windows、Android 分别验证）**：无源 Reader 自启 → 明确 Host 配置与授权 → 用户管理的已安装来源 → 搜索 → 选作品 → 原 Reader 实际章节和至少两页图片 → 原书签 → 用户确认一章离线保存 → 图像文件字节/页码校验 → 关闭/卸载或撤销 Host → 原本地 Reader 离线重启续读 → 同一作品不同来源 ID 不串号。

**来源异常**：缺扩展、签名不可信、认证失败、服务不通、源版本升级、失效/重试/取消、移除单个书签、50/500 本已有书签保护；缺来源失败要可解释，不得隐式安装、再登录、删副本。确认两端来源更新与回滚语义；复核扩展许可证、用户获取路径及发布许可。

**B2 验收**：至少两种独立来源、双端完整真实数据路径，各附独立的扩展名字/版本/Hash/签名/许可、可访问范围、实际章节/图片（只保留必要非侵权元数据和合规测试图片）、设备、原 Reader/离线结果。无法使用合法第三方账户则写 `G2 BLOCKED_AUTHORIZED_ACCESS`，不可用本地 synthetic Source 冒充 PASS。G2 不能以 UI 隐藏旧站点入口代替真实 DEX/依赖隔离。

### B3｜双端全功能体验与回归收口（R3/G1）

**以真实日常用户路径分组回归**：
- **读与管理**：CBZ/文件夹导入、损坏/取消、标题检索/排序、书架批选/移除、详情页页数、作者/同一内容/跳转和返回滚动位置、阅读模式、下一章、重启续读。
- **推荐/画风**：12 本批次切换不重算/反馈后不立即补插；已收藏与同内容跨版过滤；作者比例；推荐偏好修改、独立手机与 Windows 及显式同步；Visual 开/关、权重和长任务进度、暂停/取消/恢复。
- **标签/公开 Issues**：#199 客观地图 BLOCK/LESS 可选显示过滤、数据绝不改写；#200 缺失/繁简/细粒度与私人标签映射、标签可控；#204 JM 收藏只在实际获授权来源的可获取元数据下做预览/确认导入，不能暗中访问账号或虚构同步。
- **互动 UI**：Android 360/393/480dp × zh/en/ja × light/dark × 字号 100/130/150% 的代表性交叉矩阵，四主标签和关键操作图、返回手势/键盘/横竖屏；八章 VSpot 真控件聚光、主动跳过不记业务完成。Windows 设置页减少混乱按钮但不改变已验证功能入口。
- **稳定与同步**：本地/LAN/WebDAV/配对、离线编辑后连接、冲突/删除保护；约 1500 部**有真实封面/数据负载**的冷启动、p95 前台响应、帧率/ANR、推荐/下载/Visual 重叠任务与用户可见进度。先用 v0.5.0 同条件基线冻结指标，再比较新候选。

**B3 验收**：真实 Windows x64 和代表性 Android 实体手机各完整走通用户主线，关键截图、复现步骤与设备/OS/字号存证；P0/P1=0，未通过的 #199/#200/#204 不提前关闭；自动化成功不代替实际体验，G1 保持 OPEN 直到实体设备接受。

### B4｜旧用户无损升级、备份、差异核对、异常回滚（R4/G3）

1. 先只读盘点一份**经过用户明确授权**的 v0.5.0 资料；保护文件位置与账号私密性，列 SQLite/WAL、JSON/标签/Visual、书架/收藏、进度、下载文件、WebDAV/LAN、偏好。备份必须可用 SHA256 验证并能恢复，禁止在真实资料上直接做实验性覆盖。
2. **先在隔离克隆**分别完成 Windows v0.4.11/v0.5.0 → 新完整包（一键升级自动选择增量/替换）；Android 公开 v0.5.0 同包名/同生产签名覆盖版本（不可用另一个 `.dev/.cleanqa` 代表），包括旧来源配置变为惰性但旧元数据不删除。
3. 注入中断、校验错误、更新助手/Launcher 失败、目标启动不健康、存储索引损坏/旧 WAL 等，逐个比较升级前/后/回滚后原资料 ID、字节 Hash、页码、推荐/标签/书架；恢复原程序并再次打开实际 Reader。
4. 由用户批准针对真实资料的最终确认；任何实际升级/安装行为仍需单独授权。

**B4 验收**：升级和 rollback 各在两个平台的适用路径 PASS；旧数据一致或有用户明确批准的记录化 schema 变更；失败后旧程序+旧库可健康启动。没有真实授权只能标 `G3 SYNTHETIC_VERIFIED / REAL_PROFILE_NOT_RUN`，不可发布。

### B5｜54 项证据对账、正式签名与发布审批（G4）

- 依据 [42 + 12 验收映射](PRODUCT_RECOVERY_ACCEPTANCE_MAP_20261027.md) **逐条记录** `case_id | platform | target_sha | environment | automated_result | physical_result | artifact/run | blocker | final_verdict`。旧 42：CORE6/SRC8/TAG7/REC4/SYNC4/UX3/UPD8/DEL2；新增 12：NEW-UI-01..03/NEW-MOD-01..02/NEW-SRC-01..04/NEW-DATA-01/NEW-PERF-01/NEW-REL-01；不因已有测试存在就代填 PASS。
- 冻结同一个 HEAD，以同源码产出 Windows 完整正式候选和 Android 原产品 clean+独立 Host；验证 signed package ID、版本/升级助手、SHA256、Android 生产签名与相同签名权限。审查来源许可、README 简洁操作说明、应用内赞助入口与 Release 资产清单是否一致。
- 关闭已实际通过的 Issues，保留解释/已知限制；G1–G4 全部 PASS、P0/P1=0、用户明确同意之前，**保持 Draft**，禁止合并 main、正式签名发布、Tag/Release/OTA。

## 3. 54 项案例的批次责任映射（每案只在最终证据账本登记一行）

| 批次主责 | 原案例 ID | 新案例 ID |
|---|---|---|
| B1 / B2 | CORE-01, CORE-02, SRC-01, SRC-04, SRC-05, SRC-06, SRC-07, SRC-08 | NEW-MOD-01, NEW-MOD-02, NEW-SRC-01, NEW-SRC-02, NEW-SRC-03, NEW-SRC-04 |
| B2 / B3 | SRC-02, SRC-03, TAG-01–07, REC-01–04 | 无 |
| B3 | CORE-03–06, SYNC-01–04, UX-01–03 | NEW-UI-01–03, NEW-DATA-01, NEW-PERF-01 |
| B4 | UPD-01–08 | 无 |
| B5 | DEL-01–02 | NEW-REL-01 |

上表仅指定**主要执行批次**，没有任何豁免。存在交叉验证需求时由后续批次复核，不能因主责已完成而撤销 G1–G4 实证要求。

## 4. 每次执行的固定操作规程（防止跑偏）

1. 读取本文件、Issue #283 最后 checkpoint、PR #284 当前 HEAD、目标批次专用文档、workflow/jobs **实际终态**；从首个未满足退出条件的 B 批次继续。
2. 用最少开源复用/原有模块实现**一个可见的产品使用路径**；本轮变更先说明受影响的用户操作，禁止以大量微小 API/防御测试替代产品成果。测试用于抓真实风险，不应扩张成第二框架。
3. 只在集成分支提交。每个实质批次更新本计划的 `进度快照` 和独立证据文档，同一个 checkpoint 给出精确 SHA、代码变更、实测日志、失败原因与下一批。旧事实保留、后追加校正，不重写历史 `FAIL` 为 `PASS`。
4. **严格证据级别**：`IMPLEMENTED` → `CI_VERIFIED` → `PACKAGE_VERIFIED` → `DEVICE_VERIFIED` → `USER_ACCEPTED`。任何 skipped/timeout/HTTP504/站点限制都标清失败位置。以 Actions 的实际 artifact 路径、SHA、证书和退出码为准。
5. 单一 PR #284/单一 Issue #283 持续维护；不新建碎片 PR，不自动部署/Release，不把私有漫画图片、账号、密码/签名密钥放进 GitHub。每次任务交付在 #283 追加一段简短 checkpoint，明确下次从哪里继续。

## 5. 本次建档后的首轮执行决定

- **立即执行 B1**：修复造成三项专项任务 HTTP 504 的未覆盖依赖（保留固定版本校验），使完整双端 RC 工作流在可信集成分支 push 下执行真实 `windows-rc` + `android-rc`，核对工件，而不是误用 PR-only contract SUCCESS。
- B1 工程通过后只进入 B2 外部真实来源；无法得到获授权真实来源时，不对 G2 编造 PASS，可在不影响本地独立使用的前提下并行推进 B3 **非 G2 依赖**的 UX 测试，但发行仍受 G2 约束。
- **不提前执行**：正式用户资料覆盖升级、生产签名/Release、无明确价值的多平台拓展、重新实现来源插件系统。

## 6. 进度快照（须随每个实质 checkpoint 更新）

| 批次 | 当前状态 | 阻断 | 最后证据 |
|---|---|---|---|
| B1 双端候选 | PACKAGE_VERIFIED / MANUAL_QA_PENDING | 物理设备交互仍未验收 | 同一产物 SHA `ecd7435` Windows/Android RC 四 job SUCCESS；Android35 原 Reader/Host 真模拟器 [#42600954633](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600954633) SUCCESS，详情见 [证据](PRODUCT_ACCEPTANCE_EVIDENCE_20261109.md) |
| B2 两个真实来源 | IN_PROGRESS / TWO_PUBLIC_SITE_CI_VERIFIED | 真实 Windows/Android 图形设备与目标 Pica/JM/E-H 站点尚未验收；xkcd 超长目录需要新 SHA 复核 | [#42625363093](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42625363093) ComicFury 与 Pepper&Carrot 各自真实网站原 Reader → 本地完整章节 → 断源离线 Hash PASS，细节在 [B2 证据](B2_REAL_LICENSED_SOURCE_E2E_20261109.md) |
| B3 体验/Issue/1500 负载 | NOT_ACCEPTED | 实体手机与同源真实数据及多个日常流程未闭环 | 历史模拟器/单测和合成 1500 部只作基础 |
| B4 升级回滚 | NOT_ACCEPTED | 真实 v0.5.0 用户资料授权 + 全量差异与异常回滚 | 公开 APK 合成实机升级属部分工程证据 |
| B5 发布裁决 | NOT_STARTED | G1–G4、54 项逐行回执及用户批准 | Draft #284，不更改 main |

### 2026-11-09 B1 首轮工程关闭证据

- 详细精确 SHA/证书/实际文件 Hash 与 Actions run：见 [B1 验收证据档](PRODUCT_ACCEPTANCE_EVIDENCE_20261109.md)。可信 `push` [RC run #42600954377](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600954377) 的 `contract`、`windows-rc`、`android-rc`、`artifact-summary` 全部 SUCCESS；`RC_STATUS.json` 明确为 `INSTALLABLE_ARTIFACTS_READY_MANUAL_QA_PENDING`。
- 外部 504 阻断已在实际后续 [K3](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600963036)、[v0.4 升级](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600962878)、[P2](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600962896)、[标准 CI](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600962848) 和 [综合验收](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600962905) 中得到 SUCCESS；仍需注意后续不同网络环境的可重现性。
- 此次工程关闭**不代表**真实手机 G1、两来源真站点 G2、真实用户资料 G3 或签正式版 G4 通过。B2 可以在 B1 的安装包基础上进入真实来源验证；无法获授权测试源时不得伪造 PASS。
