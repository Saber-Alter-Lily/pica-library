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
| B2 两个真实来源 | IN_PROGRESS / TWO_DISTINCT_REAL_CHAPTERS_AND_HASH_PASS__OFFLINE_REOPEN_UNVERIFIED | 原 Android ComicFury 已实证选择精确来源、在线 Reader、两不同章节入库、停 Host 后每张图片 SHA256 相同；前轮 #43048137037 因一次来源搜索不可用，未触及离线新路径；后轮 #43064380672 先通过 B3 三组布局，再因恢复书库后的 session-only 新手引导浮层阻断，未运行真实 ComicFury。现修 B3 结束时真实点击“稍后再看”并返回原 Home，再执行原书库两章离线打开。不对真实第三方账号/站点授权作假 | [先前真实双章/Hash #43031234475](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43031234475) FAIL 在离线 UI 首章不可见；[上轮 B3 阻断 #43064380672](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43064380672) terminal FAIL；[B3/书库批次 b8fe91d](https://github.com/Saber-Alter-Lily/pica-library/commit/b8fe91df239318a7ff117e437c2b1f9d7716d170)；[新真正 Android35 push #43134209270](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43134209270) 未终态；G1–G4 OPEN |
| B3 体验/Issue/1500 负载 | ENGINEERING_3_VIEWPORTS_PASS__1500_SEARCH_SORT_RETEST / NOT_ACCEPTED | 原 Android 35 QA 在合成 1500 作品原 App 书架切换/视窗恢复成功，360dp/100%、393dp/130%、480dp/150% 的四主标签无越界/重叠均有真实模拟器 PASS；后续 session-only 引导于恢复默认尺寸时出现，现已修复正常关闭。原 Home 在筛选、排序、显示模式改变时需重置书库游标（保留书架/其他页面视窗），新增原 1500+ 搜索/列表实 UI 路径。本轮 Web/Desktop CI 全部通过；实体机 3 语言 2 主题、真实 1500 图像/ANR、推荐/同步长任务仍未验收 | [三屏宽 PASS 且恢复 FAIL #43064380672](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43064380672)；[原 Home 游标修复 b8fe91d](https://github.com/Saber-Alter-Lily/pica-library/commit/b8fe91df239318a7ff117e437c2b1f9d7716d170)；[最新综合/CI](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43134214227) 运行中；G1 OPEN |
| B4 升级回滚 | NOT_ACCEPTED | 真实 v0.5.0 用户资料授权 + 全量差异与异常回滚 | 公开 APK 合成实机升级属部分工程证据 |
| B5 发布裁决 | NOT_STARTED | G1–G4、54 项逐行回执及用户批准 | Draft #284，不更改 main |

### 2026-11-09 B1 首轮工程关闭证据

- 详细精确 SHA/证书/实际文件 Hash 与 Actions run：见 [B1 验收证据档](PRODUCT_ACCEPTANCE_EVIDENCE_20261109.md)。可信 `push` [RC run #42600954377](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600954377) 的 `contract`、`windows-rc`、`android-rc`、`artifact-summary` 全部 SUCCESS；`RC_STATUS.json` 明确为 `INSTALLABLE_ARTIFACTS_READY_MANUAL_QA_PENDING`。
- 外部 504 阻断已在实际后续 [K3](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600963036)、[v0.4 升级](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600962878)、[P2](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600962896)、[标准 CI](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600962848) 和 [综合验收](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600962905) 中得到 SUCCESS；仍需注意后续不同网络环境的可重现性。
- 此次工程关闭**不代表**真实手机 G1、两来源真站点 G2、真实用户资料 G3 或签正式版 G4 通过。B2 可以在 B1 的安装包基础上进入真实来源验证；无法获授权测试源时不得伪造 PASS。

### 2026-11-09 B2 新 checkpoint（工程结果不代替实体设备）

- 新真实网站矩阵 [#42626544616](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42626544616) 在 `e7ceb9c` 为 **6/6 terminal SUCCESS**：其中 xkcd 在线实际两页 → 原本地 Reader 明确保存一章 → Host 停止后离线启动成功，修复此前 #42625363093 的 `SOURCE_HOST_TOO_LARGE`。边界仍为 5,000 章与 1 MiB 响应限制；Pica/JM/E-H 仍只有扩展安装/撤销证据。
- `74db198` 新增 **原 Android35 signed Host + 真 Pepper&Carrot** QA 实际用户路径；该 run 编译先因 `HostSourceManager.java:64` 失误失败，`dc6487e` 已对源码修复。新 [Android35 run #42633334908](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42633334908) 在本 checkpoint 仍为 IN_PROGRESS。后续要读取最终真实 log，不能提前写 Android PASS。
- G1 实体双端、G2 双端两种独立来源及目标来源实测、G3 授权真实资料、G4 用户批准仍全部 OPEN。详细变更与原因见 [B2 记录](B2_REAL_LICENSED_SOURCE_E2E_20261109.md)。下个批次先以 Android 实际失败点推进，不因 xkcd 已通过而改做新框架。

### 2026-11-09 B2 纠正 checkpoint：Android 真图失败、复测已发起

先前标记“#42633334908 in progress”仅表示当时的快照；**最终已确认 terminal FAIL**，错误发生在原四标签 Android Reader 真实 Pepper&Carrot 第二页图片显示（“Image failed · view details”），并非外部来源安装、Suwayomi GraphQL 或编译失败。实际按钮操作已经抵达 Reader，但仍**不能**判定 Android 成功阅读。Windows 已实测的 ComicFury、Pepper&Carrot、xkcd 在线到离线链路仍分别 PASS，不覆盖这一失败。

本批在**原代码**补了 Android 严格 `image/jpg`→`image/jpeg` 规范化与原 HostHttpTest JPEG magic 回归，并在原自动化出现失败时只留匿名分类诊断；另复用 Android 已有方式在 Windows Host 页面新增用户主动打开已保存 Host 来源管理 WebUI。核心 Reader/缓存/来源执行器/升级器均未新建。新 [Android35 #42638248893](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42638248893) 已进入队列，等待**实际终态**；MIME 仍只是待验证的原因假设。Windows 用户界面补丁也待同 SHA CI 验证，未发布。下一次首先读取此 Android job 真实日志，若未通过，不进入 B2 Android 完成或 B3 正式验收。细节见 [B2 日志](B2_REAL_LICENSED_SOURCE_E2E_20261109.md)。

### 2026-11-09 B2 真图验收回合：排除 Reader 自动隐藏 UI 的测试误判

[实际 Android35 #42638248893](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42638248893) 于产品 SHA `23f0e7b` **terminal FAIL**。真实 Pepper&Carrot 源扩展、用户显式 Host、源选择、POPULAR 与原 Clean Reader 启动都已执行，点击真实“Next”后 `uiautomator` 查不到页码，错误为 `visible=[]`（区别于前一轮 `Image failed`）。已下载审阅 [失败证据工件 #13685392969](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42638248893/artifacts/13685392969) 的 `latest.xml`：前台仍是 `com.picalibrary.android.cleanqa`，保留 `ViewPager2`、`RecyclerView` 和图片控件；未在该 UI dump 发现崩溃或错误控件。原 `ReaderScreenActivity` 明确会在 2.8 秒后隐藏控制栏，而本次 B2 测试直接等待可见页码，没有复用前面本地阅读已使用的 auto-hide-aware helper；因此是**高度怀疑的验收脚本误判**，不能因为图片视图存在就提前判定图像字节已加载。

[仅测试路径修复 `7c129b7`](https://github.com/Saber-Alter-Lily/pica-library/commit/7c129b7039c886e90c4a7c301c6b1d490583e515) 改为使用现成的 `wait_page_counter()`（自动唤出原 Reader 控制栏），保留真实站点图像读取、原单章本地保存、Host 断连、离线字节 Hash 等全部强制条件。新的 [Android35 push run #42659776053](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42659776053) 本 checkpoint 仍 **IN_PROGRESS**。**不要**将它记为通过；先读实际结果，若成功再进入第二个独立合法公开来源的 Android 原 Reader 验证。B1 已有 PACKAGE_VERIFIED；G1 实体 UX、G2 双端真源、G3 真实资料、G4 正式发布依然 OPEN。

### 2026-11-09 B2 Android 原书库 1500+ 作品末端恢复进展

[同 SHA Android35 #42659776053 attempt 2](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42659776053) **terminal FAILURE，但失败位置已经前移到最后 UI 路径之外**：日志明确 `PASS: real public-source image pages 1 and 2 opened in original clean signed Android Reader`，`PASS: real public-source chapter explicitly saved into original clean app-private library`；随后真实撤销 Host，关闭官方 Suwayomi；在新进程中对已保存作品的**所有页面**复算 SHA256 与存入前一致（检查没有抛出异常）。最终原 Home 的普通书库拥有 `1503 本`，是虚拟化 `RecyclerView`；原用例直接 `tap("Pepper&Carrot")` 在当前可见 viewport 中找不到，未打开离线 Reader，因此尚不能判定 Android B2 完整闭环 PASS。

[修复 `37c6ae0`](https://github.com/Saber-Alter-Lily/pica-library/commit/37c6ae0d83eba728f66c3f355953f9a439b5c3b2)：只在原 Android35 验收脚本中先使用原产品书库 `EditText` 和 IME Search 按标题过滤，再打开已保存作品的原 Reader；页码验证复用 `wait_page_counter` 兼容原自动隐藏栏。并未替换 Reader/库、降低实时图片/字节 Hash 或访问真实用户资料。新 [run #42665563088](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42665563088) 尚未取得最终结果，禁止提前关闭 Android B2。若这一关成功，再将已在 Windows 真实跑通的独立 `xkcd`（CC BY-NC、单章通常一页，故至少验证两章两页）接入原有 Android signed Host 整条链，避免用 Pepper&Carrot 的第二作品冒充独立来源；批次验证完才考虑 B3。G1–G4 仍 OPEN。

### 2026-11-09 B2 原 Android 1503 本书库搜索兼容（`10ff462`）

- 精确真站点 [Android35 #42665563088](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42665563088) **terminal FAIL**，但在最后一项 `b2-public-licensed-offline-after-host-stop` 之前已运行公开 Pepper&Carrot 作品原 Reader 两页、选择完整章节入库、停止 Host、重启对比全部存储图片 SHA256。该失败**不是**用户数据损失的证据，不能以旧 PASS 替代完整 Android 原 Reader 离线重开。失败工件 [#13699055281](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42665563088/artifacts/13699055281) 的 `latest.xml` 中只有搜索框文本 `Pepper` 和屏幕被 IME 收缩到约 546px 的可见 Home 头部；列表目标不可见。
- 新产品修复 [`10ff462`](https://github.com/Saber-Alter-Lily/pica-library/commit/10ff462acbeeb5ac43989aa89152f6e846404beb)：原 `HomeActivity` 标题搜索同时接受软键盘 `IME_ACTION_SEARCH` 和实体键盘 `KEYCODE_ENTER/ACTION_DOWN`，继续使用原 `UnifiedLibraryFilter` 与原有虚拟列表，无新组件；原 Android35 脚本在输入 Enter 后关闭键盘再等待作品结果，仍执行真实离线打开、Reader 页码和原图 Hash 断言。
- 精确代码 SHA 的 [标准 CI #42727168448](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42727168448)、[综合验收 #42727168442](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42727168442)、[隔离 v0.5.0 同签覆盖 #42727160372](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42727160372) 已完成 SUCCESS。**Android 真网站最终 E2E #42727160233 在本 checkpoint 仍 IN_PROGRESS**；不能宣称 B2 Android PASS。B2 下一工作需先核读其实际结果，再做 xkcd 独立第二来源，不用重复重建来源架构。

### 2026-11-09 B2 Android 原网格显示高度与离线查找证据

- [真实 Android35 #42727160233](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42727160233) `10ff462` **terminal FAILURE**：它完成独立 Pepper&Carrot 真实扩展→Host→原 Reader 两页、明确完整章保存、关闭 Host 后本地页面 Hash 对比；最终原 Home 搜索 `Pepper` 已正确执行，计数显示 **`1 / 1503 本`**，证明业务查询/筛选命中唯一记录。但原三列网格在 720×1280 模拟器中位于约 y=736–1056 的 320px 高度窗口，封面卡标题在可视区下方；uiautomator `latest.xml` 看不到标题，原测试 `tap("Pepper&Carrot")` 因此仍失败。不可当作离线 Reader 已打开。
- [`58bac93`](https://github.com/Saber-Alter-Lily/pica-library/commit/58bac93caa271585062580a315623f9e3717f6b1) 不绕过实际 UI：在已正确筛选的原四标签 Home 先确认 `1 / 1503 本`，由用户路径操作现有“显示→列表”，再点击实际作品卡片进入原 `UnifiedComicDetailActivity`/Reader；仍强制保留存储 Hash、原 Reader 页码、签名 Host 断开，不新增 Reader/DB/协议或视觉测试框架。
- 同源码 [Android35 #42732030006](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42732030006) 与 [R4 同签 Android #42732030358](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42732030358) 已触发，记录时未有 terminal verdict。必须读取真实失败/通过后，才可标 Pepper Android 工程完整闭环。独立第二来源 xkcd、实体设备 G1、目标 Pica/JM/E-H G2、真实数据 G3、发布 G4 保持 OPEN。

### 2026-11-09 B2 第一真实来源 Android 完整闭环实证与第二来源启动

- **原四标签 Android + 独立同签名 Host 的首个真实许可来源已工程 PASS：** [实际 Android35 #42732030006](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42732030006) 在精确源码 \`58bac93caa271585062580a315623f9e3717f6b1\` **terminal SUCCESS**。真实 Pepper&Carrot 固定 SHA JAR 安装、用户授权、POPULAR 目录、原 \`ExternalReaderActivity\` 逐页阅读、选择 \`Episode 1: The Potion of Flight\` 并明确保存、断开 Suwayomi/Host、重启原 \`HomeActivity\`，原有书库切换列表显示的本地作品重开，全部通过。日志最后为 \`PASS: Host stopped: original four-tab Clean app opens preserved real-source offline chapter\`、\`S3 LOCAL END-TO-END PASS\`。测试同时按完整本地页面逐页 SHA256 校验，并无公共漫画原图上传仓库。真实工件 [#13726522723](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42732030006/artifacts/13726522723)。同源码 [R4 同签公开旧版覆盖 #42732030358](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42732030358) SUCCESS；它仍非生产用户资料验收。
- **第二个独立公开源 xkcd 已启动**：沿用上述**同一个** Android Host/Reader/import/离线 Hash 函数，而不是再造 Reader；在 [\`74df621\`](https://github.com/Saber-Alter-Lily/pica-library/commit/74df621f849f411adb80d088a51a0ea7475d3f17) 对 Pepper&Carrot 与 xkcd 配置参数化，从 [Keiyoushi b035310-0](https://github.com/keiyoushi/extensions/releases/tag/b035310-0) 固定 xkcd \`tachiyomi-all.xkcd-v1.6.1.jar\` 大小 128,549、SHA256 \`65548058e8400d82fbe2b30d03bf126012aef6123c103e6abe4de7e788c51701\`；要求 xkcd 的原 Reader 两张真图、两章不相同的原生章节选择与明确入库、Host 停止后每章全图 Hash、原书库列表真实离线重开。两个来源用**不同的可擦除 Suwayomi Host 进程**，不合并插件、账号或站点数据，绝不采集漫画图片。原工作流 [#42736306757](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42736306757) 已发起，记录时**QUEUED/未 terminal**，不能提前标 xkcd Android PASS；并增加现有 Python ADB 脚本的编译预检，避免对小拼写错误跑整轮模拟器。
- B2 还未满足完整验收：**真实 Android xkcd 未获得终态**、目标 Pica/JM/E-H 仅 JAR 生命周期，Windows 与 Android 实体设备 UX/原 GUI 仍未 G1/G2 PASS；G3 授权真实用户资料和 G4 发布批准 OPEN。B3 体验与 1500 真图加载、B4 完整数据回滚、B5 54 项逐行裁决不提前关闭。PR #284 保持 Draft，\`main\` v0.5.0 不变。

### 2026-11-09 B2 双真实来源 Android 初测失败与原脚本修复

- [Android35 #42736306757](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42736306757) 精确源码 `74df621` **terminal FAILURE**，但是**并未进入 xkcd**：固定扩展下载、原 Pepper 公开站点浏览、原 Android Reader 两页全部到位，后续 `b2-public-licensed-android.widget.Spinner-save-selected-chapter` 无法返回 Host 的 `Save to Reader library`。源码复核确认是新参数化测试脚本首次保存前缺 `BACK`，并将函数参数 `kind` 被 `for ... kind in nodes()` UI 控件类型 `android.widget.Spinner` 覆盖。前一单站点真实 Android #42732030006 的 terminal SUCCESS 仍有效，不得因为新脚本失败将已通过的历史事实抹掉。
- [仅原 ADB 端到端脚本修复 `796588b`](https://github.com/Saber-Alter-Lily/pica-library/commit/796588b5aca144f06d13f68638a337dfc8a06943)：使用 `node_class` 避免覆盖来源变量、先返回原 Reader 再进入用户明确保存的 Host 原生导入 UI；第二章依然要求独立选择、不同本地 ID、断源后所有 Hash 一致和真正原离线 Reader 打开。未修改产品 Reader、存储或 Host 业务协议。
- 新同源码 [Android35 #42744126740](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42744126740) 已发起，checkpoint 时仍为 IN_PROGRESS。只有完整 run 与第二站点的真实采集全绿才允许把 Android 两源工程标 `CI_VERIFIED`；G1 物理设备、目标 Pica/JM/E-H 合规账户 G2、G3 真实旧库与 G4 发布仍 OPEN。不要因为 PR-only 同名工作流 SKIPPED 而冒领 PASS。

### 2026-11-09 B2 上游 Pepper 目录漂移与 xkcd 解耦验收

- **不篡改第一公开来源历史成功：** [真实 Android35 #42732030006](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42732030006) 在 `58bac93` 已 terminal SUCCESS：真实 Pepper&Carrot 原 Reader 两页、原生章节入库、停用 Suwayomi、全部本地文件 SHA256 与原 Reader 离线重开。**后来实时上游目录变化不改变这次 PASS 的事实**。
- **新双来源 [#42744126740](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42744126740) 已 terminal FAILURE，未触达 xkcd：** Android 签名 Host/来源身份选择和 Pepper POPULAR 查询成功，实际结果 UI 为 `Press`、`References`、`Wiki`，没有先前真实漫画标题；用例因找不到 `Read · Pepper&Carrot` 在本流程前段停止。不能将导航链接当漫画、不能声称 xkcd 站点失败，也不能凭旧结果宣称当前 Pepper 上游仍稳定；精确责任点可能是源扩展 HTML 解析与上游站点内容变化，待合法来源维护证据。
- **避免一站故障挡住另一站：** [`d85edf5`](https://github.com/Saber-Alter-Lily/pica-library/commit/d85edf5c1961dddb6520f790a1e4703cd489e8a3) 在**现有 Android35 流程**增加仅接受 `peppercarrot`、`xkcd`、`both` 的显式独立真站点选择；现有 workflow 本次固定运行 `xkcd`，保留真实同签 Binder、原 Reader、两章明确保存、断 Host 后逐页 Hash + 原书库重开全部强制断言。结果字段 `publicSourceCasesActuallyRun` 与 `independentRealPublicSitesVerifiedInThisRun` 根据**实际执行**写入，避免把旧 Pepper 的结果算入新 xkcd 运行。真正 xkcd [#42763016774](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42763016774) 本 checkpoint 仍 IN_PROGRESS，不能标 PASS。
- B2 只获得两个站点的模拟器/工程数据路径后仍不等于实体 GUI/手机 G1 或目标 Pica/JM/E-H 登录访问 G2；G3 正式旧资料实际无损恢复和 G4 发布仍 OPEN。Release、main v0.5.0、用户真实书库均未改动。

### 2026-11-09 B2 xkcd 实站多来源注册匹配修正（未接受）

- 独立 [Android35 #42763016774](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42763016774) 在 `d85edf5` **terminal FAILURE**，但错误在官方 Suwayomi 成功接受固定哈希 xkcd JAR 后的来源唯一性筛选 `Cannot uniquely identify one independent public source`，并非 xkcd 网络、Reader 图片或保存动作已执行。当前 Android 选择逻辑用 `name contains "xkcd"`，无法唯一排除多注册的同包其他身份；这与原 Windows 独立 [#42626544616](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42626544616) 已验的 `name == "xkcd"` 且 `lang ∈ {en,all,other}` 明确匹配标准不一致。
- [修复 `b4944b8`](https://github.com/Saber-Alter-Lily/pica-library/commit/b4944b81412140df71072ffe81ed8523a5266960) 仅复用既有 Windows 严格名称/语言选择语义，Android 原 Spinner 根据 Host 返回的完整 `name · lang` 选择而非宽松名字，歧义时仅输出有限来源名称/语言元数据帮助确认，绝不输出章节/URL/像素/凭据。xkcd 单章可能只有一幅漫画：允许原 Reader 第一章一页，但强制从原生章节选择器保存**两不同实际章节**、所有页面实图 Hash 一致与断源后原 Reader 重开，不能以单页占位冒充两张图；Pepper 仍要求在线两页。
- 新 [Android35 #42773734479](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42773734479) 本 checkpoint **IN_PROGRESS**。只有它完整 terminal SUCCESS 才记第二独立真实来源的 Android 工程闭环；历史 Pepper #42732030006 的 PASS 不改变。Windows 图形客户端与实体 Android 设备 G1/G2、目标 Pica/JM/E-H 授权访问、G3 真用户资料及 G4 Release 均 OPEN。

### 2026-11-10 B2 xkcd 真 Reader 触发大章数 JSON 上限，复用 Suwayomi 上游分页

- **新实际失败必须保留：** [Android35 #42773734479](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42773734479) 在 `b4944b8` **terminal FAILURE**，已确认 xkcd 固定 JAR 注册、用户 Host 授权、`xkcd · en` 原生选择、目录及原 `Read · xkcd` 成功，原 Reader 显示 `Unable to load · tap to retry / External source · SOURCE_HOST_TOO_LARGE`；尚未读取图像、保存章节或核验离线，因此 Android xkcd **仍未 PASS**。确认原 Android `HostHttp.read()` 对整个 GraphQL JSON 有 **1 MiB** 上限；此前 `manga.chapters.nodes`/prepare 返回一次性长篇章节列表，可触发这一错误。与 Windows 的 5000 章总限不同，单次 JSON 响应是单独门禁，不能通过直接去掉上限规避。
- **使用已安装开源 Suwayomi 的固定 schema，而非新实现源执行器：** 冻结上游 commit `40bc5da57820324ed0ae724cbbc020cc4673b594` 的 `ChapterQuery.chapters(condition:mangaId,first,offset)` 正式支持分页；[源码 `a1124fc`](https://github.com/Saber-Alter-Lily/pica-library/commit/a1124fcb3808d537fd888528811c4545d0ccd7c8) 将 Android 原 Host 的 `manga` 与 `prepare` JSON 请求改为只返回固有作品身份，按固定每页 500 章、最多 10 页、最多 5000 章另取章节。**每次 GraphQL 仍为原 1 MiB 上限**，仍验证远端完整唯一作品 ID/来源/URL、页码/总数一致、章节 ID 与 URL 不重复、会话未取消和无重定向；通过后才允许运行原 Reader 和章节存储。已有 Robolectric fixture 增加 1001 章跨页、错误归属及 >5000 拒绝测试，仍拒绝超过 5000 章的数据。未增加第二 Reader/第二数据库/自动安装扩展。
- **证据级别：** [精确源码 Android35 #42786068759](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42786068759) 与标准 CI 已发起，记录时**IN_PROGRESS**。未取得 terminal SUCCESS 不得标 xkcd Android 通过；原 Windows xkcd [#42626544616](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42626544616) 和原 Android Pepper [#42732030006](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42732030006) 历史 SUCCESS 均保留但不替代本轮。G1 真机、目标 Pica/JM/E-H G2、授权真实旧用户库 G3、正式发布 G4 仍 OPEN；PR #284 Draft，不更改 main v0.5.0。

### 2026-11-10 B2 恢复真实 Android 回归：取消书签预加载章节、适配分页与单页 xkcd 两章

- **真实失败终态已核实，不是 xkcd 实站验收通过**：[Android35 #42786068759](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42786068759) attempt 1 在系统 Quickstep ANR 后停机；attempt 2 重试进入原 Android signed Host 后，在原 synthetic 26-source/第 2 页搜索结果点击「保存在线书签（不下载）」处失败，`user-host-saved-books-v1.json` 未写出，尚未开始真正 xkcd 章节/图像。旧模拟 Host 不支持新增的 `PicaHostPagedChapters`，而原 Host 书签按钮调用 `select()` 会为了存在线索引而读取全量章节，属于实质性能/操作语义缺陷。
- **复用并更正原链路**：[业务源码 `4df7239`](https://github.com/Saber-Alter-Lily/pica-library/commit/4df7239d5c2231aae5cc231d7cbd528505c5d2fa) 使 Android 原 `HostBrowserActivity` 的 bookmark-only 只调用 `HostSourceManager.saveBook`，后者仍要求显式授权、活动 Host 会话和已绑定来源的搜索作品，但**只持久化严格九字段 locator，不请求章节/图片、不启动 Reader 或下载**；只有用户明确在线阅读或离线导入时才执行身份核验、分页章节、原 Binder Reader/LocalComicStore。原 synthetic Host 按固定 500 章 GraphQL 响应新增 1 章分页并在书签恢复实际 Reader 时核验操作，沿用旧原生测试。
- **精确测试纠正**：首个修复 SHA 的 Web [#42791317695](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42791317695) 与综合 [#42791317862](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42791317862) 已见 2918 pass / 1 fail（旧 TS 静态合同仍要求已弃用的 `selected(session,comicId)`）；[源码 `383d90e`](https://github.com/Saber-Alter-Lily/pica-library/commit/383d90e525eef65f6ab915ada389aa50de475356) 更新合同以要求 `book(session,comicId)` 活动来源约束，并修复 Android xkcd **单章本可只有 1 页**却错误要求首章 ≥2 页的验收缺陷；仍严格要求保存两**不同**真实章节、核对每张真实图 SHA256、Host 停止及原本地 Reader 离线重开。Pepper 单章两页门禁不放宽。
- **新实测只登记进行中，不冒充 PASS**：源码 SHA `383d90e` 对应 [Android35 实际 push #42792126068](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42792126068)、[标准 CI #42792137092](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42792137092)、[综合 #42792136752](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42792136752) 在本记录时均**尚无最终裁决**；[R3 原产品来源隔离 #42791306415](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42791306415) 已 SUCCESS，属上一应用源码 SHA 的独立工程证据。PR-only 被 SKIPPED 的 S3 不可替代 push Android35 实测。记录期间 `main` v0.5.0、生产签名/Release/OTA、真实用户库未改变。
- **下一步（严格 B2 先行）**：优先读 #42792126068 真实失败点；若成功，登记 xkcd 第二来源的每章图片数/离线 Hash/原 Reader 结果；若失败，只修确证的原业务/脚本阻断。G1 实体设备和 1500 实负载、G2 两源跨端实际使用与 Pica/JM/E-H 授权来源、G3 v0.5.0 真实资料升级回滚、G4 54 项+发布批准全部保持 OPEN。

### 2026-11-10 B2 真实限制定位：原签名 Binder 2,000 章上限与受限 FD 流修复

- [原 Android35 #42794975352](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42794975352) 在独立安装的 xkcd 固定扩展已正确选中、原 Clean Reader 已启动后，仍报 `SOURCE_HOST_TOO_LARGE`，**terminal FAIL**，未触达实际图片。不能沿用上一轮未经证明的“GraphQL 一页过大”诊断。
- 复用仓库现有合法公开来源/Suwayomi 固定发布与 [R2 workflow #42802805309](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42802805309)，六项隔离任务全 SUCCESS。xkcd 读取的实际章节总数为 **3,321**，固定 500 章的原 GraphQL 响应仅 **59,380 bytes**，不存在 5,000 章总限或 1 MiB 单响应超限；不扩大上述上游边界。
- **真实根因在下游**：源无关 Android `BoundSourceClient.chapters()` 旧 v1 Binder String 接口拒绝超过 2,000 章；Host 还有 480,000 字符单事务限制。二者不足以保证 3,321 章的原 Reader 元数据传输。
- [产品源码 `545ae428`](https://github.com/Saber-Alter-Lily/pica-library/commit/545ae428ff4f6c8d135f7755ab178439e4ca8766)：复用原已签名授权的 Binder `ParcelFileDescriptor` 图像管道，以 AIDL **追加** `openChapterList`，保留 v1 事务编号/小作品旧方法；Host 使用带 16KiB 会话存活校验的独立 FD 流，限制 **<=5,000 章、<=4 MiB 章节 JSON**；原 Reader v1/v2 分支严格解析与限制，仍无独立 Reader、存储、账号或互联网权限。沿用原 Robolectric 增加 3,321 章接受、旧协议上限与 5,001 拒绝回归，未拆新测试框架。
- **工程状态**：[原四标签 Clean + Host 隔离构建 #42803928570](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42803928570) SUCCESS；[标准 Web/Desktop + Android CI #42803939476](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42803939476) 双 job SUCCESS；[综合 Web/source #42803939988](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42803939988) 适用 job SUCCESS、其它路径限定 SKIPPED。**真正 xkcd Android35 push #42803928636 仍未获得 terminal 结果，不能记作实时图片/两章保存/断 Host/离线重开 PASS**。
- 完整 B2 以及 G1 真正实体 UI、G2 Pica/JM/E-H 站点内容和两源双端实测、G3 授权真实 v0.5.0 无损升级恢复、G4 54 项清单/生产签名/用户审批依然 OPEN；Draft PR #284、正式 main v0.5.0、Release/OTA 和任何实际用户资料未触及。下一次严格从 #42803928636 的实际终态继续，仅处理首个确证阻断。

### 2026-11-10 B2 长系列原生章节选择异步等待修正

- **真实下游结果**：[Android35 #42803928636](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42803928636) 在实际固定 xkcd v1.6.1 + Suwayomi 2.4.2366 + Clean 原四标签 Android + 独立 same-signer Host 上，打印 **`PASS: real xkcd public-source original Android Reader pages 1 and 2 opened`**。这证明上一轮 Binder FD v2 解决了 3,321 章目录的旧 2,000 章限制；不能再将本轮标记为 `SOURCE_HOST_TOO_LARGE`。
- 本次 run **terminal FAILURE** 出现在下一步骤 `b2-public-licensed-xkcd-save-selected-chapter`，原 ADB 脚本点击 `Choose chapter to save` 后**立即**寻找 `ListView`。从失败工件 [#13760590619](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42803928636/artifacts/13760590619) 原 `latest.xml` 验证当时 `ExternalImportActivity` 仍显示 `Loading authorized chapters…`，说明尚未完成原生异步章节加载；在没有进一步证据前不能把它当成产品原生列表缺失，也不能把两章保存算作成功。
- [修复 `a2b0b49`](https://github.com/Saber-Alter-Lily/pica-library/commit/a2b0b49ba4cd2584b4ddee6f4469135ef028918f) **仅调整已存在的 Android35 ADB 验收路径**：点击后必须实际等到中/英/日原生 `Select one chapter` Dialog，再检查其本来应有的 `ListView` 和两个不同的可见章节，沿用原 `ExternalImportActivity`、唯一 Reader、`LocalComicStore`。未增设任意来源 SDK、Reader/Updater 或降低章节/图片/hash/会话撤销断言。
- [新原 Android35 来源实测 #42938858971](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42938858971)、[标准 CI #42938866720](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42938866720)、[综合 #42938866605](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42938866605) 本快照均未取得 terminal PASS。**B2 两真实源双端工程不关闭**，尚需 xkcd 两不同真实章节入库、Host 断开+重启+逐张 SHA256、原 Reader 离线重新打开；历史 Pepper&Carrot [#42732030006](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42732030006) 成功仅作历史证据。
- G1 实体双端、G2 Pica/JM/E-H 合法授权来源实用、G3 授权 v0.5.0 资料升级与回滚、G4 54 项+发布审批全部 OPEN；`main` v0.5.0、发布包/OTA、用户资料及生产凭据未修改。下一轮先核对 #42938858971 真实终态，不要用 PR-only SKIPPED S3 替代。

### 2026-11-11 B2 当前外接源/原书库导航整体验收快照（按真实终态）

- **真实 xkcd Android v1.6.1 进展**：[S3 #42938858971](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42938858971) 最终为 **FAIL**，但已经实际完成源注册/Reader 1–2 页、两个**不同**章节的用户选择和原 `LocalComicStore` 入库、断开/终止 Host 后两章本地 ID/每张图像 SHA256 无变化、原 Home 冷启动与 `2 / 1504 本` 搜索结果。最后仅因保留了 1500 部书库的旧 `RecyclerView` 滚动位置，首个已保存标题不在屏幕树内，未完成点击第一章并打开离线 Reader。此证据严格标 `PARTIAL_REAL_ANDROID_PASS / FINAL_OFFLINE_REOPEN_FAIL`，不能计 G2 完成。
- **真实产品修复**：[提交 `64b4484`](https://github.com/Saber-Alter-Lily/pica-library/commit/64b4484a0bbe24c5f42433b53fd288fbb247d3dd) 在原 Android Home 搜索条件变更和库视图模式变更时重置**书库自身**游标/偏移，其他页面与书架视窗保留。原 S3 实际点击第一章继续作为未豁免验收；[R3 原全产品/来源隔离 #42965580804](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42965580804) SUCCESS。随后 [S3 #42965580694](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42965580694) 在执行 Android 代码前因旧 xkcd 发布 JAR URL **HTTP 404** 中断，因此该次既未证明也未否定 Home 修复。
- **官方开源供应链变动，不绕过许可/哈希**：旧 Keiyoushi `b035310-0` Release 已不再提供 xkcd v1.6.1 JAR。官方 Release `3cf15bc` 的新 xkcd v1.6.2（149852 bytes，SHA256 `dfc223927a78720af033adb2f9f168ac10342adcbc0759d40a401b49aac746ad`）由 [`a488268`](https://github.com/Saber-Alter-Lily/pica-library/commit/a48826851041308dba6806556f844549982ca622) 在原 Windows/Android 测试链同步重新固定。实际 [R2 #42966022913](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42966022913) 验证了新 JAR 哈希，但第二图片阶段在上游 Suwayomi 扩展运行时触发 `android.text.SpannableString` 的 `Stub!`，本软件不能将此当成可用来源。历史 v1.6.1 通过日志保留，新版本有独立 FAIL。
- **改用经验证的另一来源复用原路径**：官方 ComicFury JAR 已移动到 `3cf15bc`，版本 1.6.1，95849 bytes、SHA256 `851185e7b79787aa37157cd6a9102849ea44a88dc1a7dfd00052a3dadf32365f`，由 [`c7fc1d7`](https://github.com/Saber-Alter-Lily/pica-library/commit/c7fc1d73bb8ee4f5814d466846c4c888c03c2b6d) 更新固定资产；[Windows 真实来源 R2 #42966388477](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42966388477) 的 **ComicFury 实际独立任务 SUCCESS**：`The Way of the Metagamer` 两个不同章节两张真实图、原 Reader 本地保存、断 Host 后离线读图均通过；其它四个来源任务 PASS，xkcd v1.6.2 FAIL，**整张 6 源矩阵不是全绿**。用户目标 Pica/JM/E-H 仍只有扩展生命周期核验，无账号/作品读取证明。
- [Android 同一原应用通路 `50256d7`](https://github.com/Saber-Alter-Lily/pica-library/commit/50256d7d6ec84330f77b90dd9bfb31d55216ae14) 使用固定 ComicFury JAR/严格来源身份，重复原 Android Clean 四标签→独立同签名 Host→原 Reader→两章真实保存→停 Host→逐页 Hash→原书库离线重开；[真正 Android35 push #42966691815](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42966691815) **仍需终态**。不把一个站点的 Windows PASS 代替 Android，也不把在线阅读替代离线闭环。
- **G1–G4 与 54 项历史验收仍全部 OPEN**。实体手机 360/393/480dp × 字号/三语/1500 真实图片负载、两来源双端真实使用及目标站点权限/许可、用户明确授权的 v0.5.0 资料备份/差异/回滚、正式签名发布批准未完成。唯一 Draft PR #284，`main` v0.5.0 `095d6910`、Release/OTA、任何真实用户数据/凭据不变。下一步先核对 ComicFury Android [#42966691815](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42966691815) 与同源 CI 最终结果，按实际失败点收口，不重建来源协议或第二 Reader。

### 2026-11-11 B2 ComicFury Android 真 Spinner 可见列表修正（待实测）

- [Android35 #42966691815](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42966691815) 已终态 **FAIL**，但通过真实 SHA 锁定 `ComicFury v1.6.1` JAR 安装及官方 Suwayomi Host 启动；未进入来源的 Reader/图片/离线保存。失败步骤 `b2-public-licensed-comicfury-select-external-source`：脚本要求点击 `Comic Fury · en`，但 Android 原生 Spinner Popup 的 UI 树只显示 `Local source` 和 `Comic Fury · other/no-text/fr/ru/it/es/all/zh` 等前 9 行，列表仍可向下滚动。完整 UI 树保存在 Actions 工件 [#13832248610](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42966691815/artifacts/13832248610) 的 `latest.xml`，实际容器为原生 `ListView`，选项为 `CheckedTextView`。不能错误降级到别的语言或声称第三方站点坏了。
- [提交 `281bc05`](https://github.com/Saber-Alter-Lily/pica-library/commit/281bc053d00ccb2e16e421a1254cf8bebf67cee2) **只重用原 ADB 测试脚本的 `tap_scrolling`** 在真实 Spinner 下拉框中找到匹配已验证来源身份的 `Comic Fury · en`。保持精确 Host `name · lang`、签名/账户许可、实际 Reader、原 `LocalComicStore`、两章不同来源章节、Host 停止和逐页 Hash/离线重开所有门禁。
- [新 Android35 push S3 #42992543983](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42992543983) 已触发，本检查点 **尚无终态**。旧 #42966691815 的 Android FAIL 必须保留，Windows ComicFury [#42966388477](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42966388477) 成功不可替代 Android。xkcd 1.6.2 上游 Headless Host 的 `SpannableString Stub!` 另行保留真实 FAIL。
- G1 实体双端 UI、G2 第二真实来源完整 Android/目标 Pica-JM-E-H 授权内容、G3 v0.5.0 真实资料迁移回滚、G4 54 项签收/正式发布仍全部 OPEN；Draft PR #284 不合并，`main` v0.5.0、用户资料、生产签名、Release/OTA 不变。下一步必须读取 **#42992543983** 的真实终态并且从首个实际失败点继续。

### 2026-11-11 B2 ComicFury 第二次实测：正确选择来源后，SEARCH/POPULAR 行为分歧

- [独立 Android35 真实任务 #42992543983](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42992543983) **attempt 1 terminal FAIL**：模拟器 `Quickstep isn't responding`，在本地 CBZ 初始化之前，不涉及 ComicFury 业务；对同一真实代码 SHA `281bc053` 仅重跑失败 job。
- **attempt 2 也是 terminal FAIL，但取得有用业务证据**：官方 Suwayomi 2.4.2366 / 固定签名外部 ComicFury 1.6.1 扩展启动成功、原 Android User Host 原生下拉 Spinner 通过滚动找到并点击确切的 `Comic Fury · en`，随后点击 `Use selected source` 成功；第一次 POPULAR `Browse this source` 后显示通用 `Operation failed. Check Host, session and permissions.`，并无目标作品/Reader 出现。保留 [原 Android 工件 #13846407368](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42992543983/artifacts/13846407368) 与控制台日志；本次不能计在线图片、两章保存或离线 PASS。**此前 Spinner 未滚动问题已经真实消除。**
- 根因调查发现 [Windows 同扩展真实来源 R2 #42966388477](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42966388477) 两个不同真实章节与 Host 停止离线 PASS 实际调用 `action:'search'`（普通关键词 `Metagamer`），**未使用 `action:'browse'` 的 POPULAR 模式**。Android 验收先前统一 POPULAR，未对不同来源使用已有且已经验证的搜索操作，因此无法直接证明 POPULAR 本身是否受扩展站点或 Android 严格解析限制。
- 新代码 [`000ef2e`](https://github.com/Saber-Alter-Lily/pica-library/commit/000ef2ece0529c69ba9a2eba00afd3754df1da38) 仅在已有 Android 原生 ADB 验收流程对 ComicFury 使用 **`Search works` 输入查询+ `Search selected source`**，严格匹配同一官方 `Comic Fury · en` 来源与 `The Way of the Metagamer` 作品标题；其它 xkcd/Pepper 来源模式不变。没有直接调第三方 API、换 Reader、修改账户或默认增加来源；两不同章/真实页/原 LocalComicStore/Host 撤销/每页 SHA256/冷启动离线重开所有要求不降低。
- [新真正 push Android35 #43025455861](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43025455861) 已启动，**未取得 terminal PASS**。旧 PR-only SKIPPED S3 不得代替。标准 Android/Web/Desktop CI [#42992697941](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42992697941) 和适用综合 [#42992698055](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42992698055) 上轮 SUCCESS；新代码须以其自身实际运行判断。
- B1 PACKAGE_VERIFIED/MANUAL_QA_PENDING、B2 IN_PROGRESS、B3/B4/B5 仍待实体/授权依赖；G1–G4 未关闭。Draft PR #284，`main` `095d6910` v0.5.0、Release/OTA、生产签名和真实用户库保持不变。下次优先读 **#43025455861** 真实终态，针对第一个确证失败继续。

### 2026-11-11 B2 连续两章导入体验完整功能批次（一次完成产品、UI 与端到端）

- **先确认实际失败而不是无目标修改**：[Android35 #43025455861](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43025455861) 终态 FAIL，但官方 `Comic Fury · en`、已验证独立 Suwayomi Host、`Metagamer` 真搜索、原 Clean 四标签 Reader 实际第 1 张图和第 1 章导入均 PASS。第二章 `I Bought It On eBay - Obsessive Compulsive` 在原选章弹窗中已被选择，点击 `Save this chapter` 后 120 秒没有新本地条目，工件 [#13859951706](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43025455861/artifacts/13859951706) 的 `latest.xml` 仍是原确认弹窗。失败在用户交互确认/导入完成阶段；第二章离线与整个 B2 不能计 PASS。Windows ComicFury 两章原 Reader+离线 [#42966388477](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42966388477) 历史 SUCCESS 不代替 Android。
- **本次一个完整产品批次** [`38fdea9`](https://github.com/Saber-Alter-Lily/pica-library/commit/38fdea9eb5c5e0b09e49f266511f9ffae3197d33)：在原 `:signed-reader` 的 `ExternalImportActivity` 复用同一授权 Host 的内存章节目录而非每次 3,321 章重新取一遍，重复选择时再次验证签名 Binder 会话、每章读取仍做既有身份核查；保存失败不得覆盖上次成功的 `saved`/“阅读已保存副本”，展示不泄露源 URL、令牌或堆栈的三语失败原因。无新 Reader、下载管理器、数据库、来源协议和账号。
- 同一批原 Android35 ADB 真实用户流程不再退出原导入页重复从 Host 打开每一章：**一次进入原导入页、先第一章再第二章**；每次确认原弹窗必须在用户确切点击后关闭（最多补一次真实点击），并且原 UI 状态必须明确显示**该章节**保存成功才读取原 `LocalComicStore`，否则快速报告原 UI 失败。仍要求两个不同本地 ID、每张实际图片的 SHA256 保存前后完全相同、Host 停止、原四标签 Home 搜索并启动离线 Reader；不放宽原 1 MiB/4 MiB/5,000 章/20 MiB 图限制和同签名隔离。
- **工程终态**：[标准 CI #43031248586](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43031248586) 原 Android 与 Web/Desktop 两个 job **SUCCESS**；[综合 #43031248676](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43031248676) 适用 Web/source **SUCCESS**、其它范围条件 SKIPPED；新增复用式回归，无额外测试框架。**真正 push Android35 #43031234475** 当前无终态，不能据此宣称双章离线 PASS，PR-only S3 SKIPPED 不可代替。
- B3 并行复核开源与旧资产，先不重复造轮子：`#199` 的 BLOCK/LESS **仅显示过滤**已存在 `web/chronicle-view.js` + `taste-chronicle-view.ts` 及单测，保持原客观数据不可改；`#200` 已有 `web/tag-participation.js` 的手工/映射标签与 `preference-discovery.ts` 简繁体别名展示索引。这里只标**工程代码存在／用户体验仍待验证**，不关闭 Issues，不记 B3 通过；`#204` 同样需要实际授权账户及预览确认，不能虚构访问。
- G1 实体双端与 360/393/480dp 三语字号、G2 目标 Pica/JM/E-H 合法授权内容与完整双源、G3 真 v0.5.0 用户资料无损升级回滚、G4 54 项与最终签名发布批准均 OPEN。唯一 Draft PR #284，`main` `095d6910` v0.5.0、Release/OTA/用户资料不动。下一次一并核对 S3 #43031234475 真实最终记录，若通过再进入 B3 整组验收，不回到只补某个按钮而停下。

### 2026-11-11 B2/B3 整批交付：两真实章节独立离线重开与浏览器验收恢复

- **来源内容与离线保存已有实证**：[Android35 ComicFury #43031234475](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43031234475) 已在原独立签名 Host/原 Clean Android Reader 下，分别打开真实来源、连续明确保存两个不同章节，停 Host 和新进程后两个 LocalComicStore ID 及所有图片 SHA256 都通过；原 Home 搜索返回 **2 / 1504 本**。这轮 **terminal FAIL** 原因是最后一步脚本点击第一本时未滚动，真实工件的 RecyclerView 仅高 320px，按“最近更新”显示第二章在第一可见行，第一章在下一行，属于正常虚拟化，不是保存失败或排序错误。
- **整批真实路径补齐**：[源码 9f9630f](https://github.com/Saber-Alter-Lily/pica-library/commit/9f9630f98afff5b52e3201ba73a5ff08ae3109ff) 仅复用现有 Android ADB 实际滚动+原作品卡片→详情→Reader，**两个不同真实章节均须在 Host 停止后分别离线重开、核对各自实际页码**，并继续先比对逐页 Hash；测试没有直接发 Intent、改正常 Library 排序、读取用户账号或上传站点内容。真 [Android35 push #43048137037](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43048137037) 仍在运行，不能标 B2 完成。PR-only 路径 SKIPPED 不计通过。
- **同批恢复完整 Web 浏览器验收**：旧 [CI #43032521709](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43032521709) / 综合 [#43032521636](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43032521636) 通过 2,921 单元测试后，仅因 Ubuntu apt/security.ubuntu.com DNS 失败导致 Playwright `--with-deps` 额外字体包无法安装。原 `scripts/run-web-browser-smoke.sh` 现优先复用 GitHub 托管 Runner 自有浏览器或从 Playwright 安装匹配 Chromium，不再强制 apt 额外依赖，**没有跳过浏览器测试**。[精确应用 SHA CI #43048152444](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43048152444) Android 与 Web/Desktop 均 **terminal SUCCESS**，其中 2,921 Vitest 和真实 **62 Playwright** 浏览器交互通过。
- **B3 复用原则与范围**：`#199` 图鉴 BLOCK/LESS 仅显示过滤已有 `web/chronicle-view.js` + `taste-chronicle-view.ts`；`#200` 手工/映射标签及简繁体展示已有 `web/tag-participation.js`、`preference-discovery.ts`；`#204` JM 明确授权的收藏预览→确认导入已有 `web/jm-account.js` 与 `JmSourceActivity`。本次 62 项原 Web 浏览器测试验证了已有界面工程行为，**未进行合法 JM 真实账号请求或实体 360dp Android 验收**，不重复造轮子、不虚构授权/关闭公开 Issues。合成 1500 部 UI 回归不是 1500 真实封面性能。
- **不变门禁**：B1 PACKAGE_VERIFIED/MANUAL_QA_PENDING；B2 真实 ComicFury 两章离线 Reader 终态未裁决且目标 Pica/JM/E-H 授权内容未证实；B3 实体手机/UI/负载/同步未验收；B4 真 v0.5 用户资料迁移/回滚未授权；B5 54 项/生产签名/Release 未审批。G1–G4 全部 OPEN。唯一 Draft PR #284、main `095d6910` v0.5.0、用户数据和 OTA 均不变。

### 2026-11-11 B2/B3 原产品批次：三屏宽真实通过、恢复引导与 1500 书库筛选游标

- **最近真实 Android35 终态**：[push #43064380672](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43064380672) 为 **FAIL**，但已有 1500 合成书架打开、滚动、切换并恢复原视窗的 PASS；B3 在真实原 Clean 四标签 Home 的 360dp/100%、393dp/130%、480dp/150% 三组点击区域可见、边界、互不覆盖检查均输出 PASS。失败在完成全部三组布局后，从 480dp 恢复 360dp/100% 并 force-stop 重开时，原 `OnboardingStore.later()` **仅会话有效**，欢迎引导重新出现遮住书库；旧脚本只在布局用例内关闭它，在 `finally` 恢复后未关闭。**因此此轮未进入真实 ComicFury，不代表真实来源失败或 B3 导航布局失败。**
- **真实 UI 恢复**：[提交 88ac715](https://github.com/Saber-Alter-Lily/pica-library/commit/88ac7158df83247517c87a23bd3a29410cafbf94) 复用原可见“稍后再看”按钮关闭恢复时的新手引导，确认主书库可见，继续使用原应用而非改写 onboarding 偏好/跳过体验。这保留了首次使用可重看引导的语义和真实用户路径。
- **用户可见书库问题与 B3 联合回归**：[提交 b8fe91d](https://github.com/Saber-Alter-Lily/pica-library/commit/b8fe91df239318a7ff117e437c2b1f9d7716d170) 修复原 Android `HomeActivity` 在更改筛选和排序后仍恢复旧 `RecyclerView` 索引的问题；沿用原有仅重置书库自身视窗的机制，不覆盖书架/其他 tab 滚动。原 S3 1500 合成作品增加真实搜索 `QA_LOAD_1499`、原 `1 / 1500+` 计数、切换“显示→列表”、原列表真实找到目标。动态工程测试未有本 SHA 终态，不代填 PASS。
- **此前 B2 已实证但终态仍受阻**：真实 ComicFury `Comic Fury · en`、`Metagamer`、原 Reader 在线读图、两个不同真实章节原书库保存、撤销独立 Host、cold restart 后对原保存的每张图片 SHA256 均一致，见 [S3 #43031234475](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43031234475)（terminal FAIL 的是滚动可见性）。前一 [#43048137037](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43048137037) 为间歇性真实来源 SEARCH 操作失败，未经过最后离线流程；不能用不同 SHA 的个别 PASS 推断本批真实端到端全 PASS。
- **已执行工程检查与新验收入口**：同一修复主线的原产品/独立 Host 隔离 [R3 #43064380670](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43064380670) SUCCESS，[CI #43064391825](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43064391825) Android+Web/Desktop SUCCESS，[综合 #43064392076](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43064392076) 适用 Web/source SUCCESS。新功能 SHA [b8fe91d](https://github.com/Saber-Alter-Lily/pica-library/commit/b8fe91df239318a7ff117e437c2b1f9d7716d170) 的实际 Android35 **push** [#43134209270](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43134209270)、[CI #43134214227](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43134214227)、[综合 #43134214041](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43134214041) 尚无最终裁决。PR-only S3 SKIPPED 不得当作通过。
- **不变的发布边界**：B1 实体双端 QA 尚未验收；B2 真双来源+目标 Pica/JM/E-H 授权使用和原 Reader 双章离线终态缺口仍在；B3 多语言×主题×真机及 1500 真实图片负载、推荐/Visual/同步/Guide 完整路径仍 OPEN；B4 原用户 v0.5.0 真数据迁移/回滚待授权；B5 54 案及最终批准未开始。G1–G4 OPEN，`main` v0.5.0 `095d6910`、真实用户账户资料、生产签名与 Release/OTA 不动。下一轮第一件事核对 #43134209270 的实际首个失败或完整 PASS，再做下一整批，而非单按钮修补。

### 2026-11-11 B2/B3 本轮续接：双章实际离线与 1500 部书库/三语关键控件

- **准确确认上次终态而非推测成功**：[真实 push Android35 #43134209270](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43134209270) 为 **terminal FAILURE**。但日志证明正式 Clean 原四标签产品在 1500 合成部书库中搜索旧作品、切列表、360dp/100%、393dp/130%、480dp/150% 三种尺寸的底部导航及恢复后的会话引导均 PASS；固定官方 ComicFury · en 的两个不同真实章节已由用户操作保存到原 LocalComicStore，停用 Host 后原库仍保有两个不同的章节 ID 与每页 SHA256；第一个真实章节已经由正常书库→详情→原 Reader 离线打开。失败点在**第一个 Reader 返回后的原 Detail 页面仍在前台**，脚本连续发送两次不等待的 ADB BACK，导致下一步寻找 Home 超时；第二个 Reader 尚未重开，不计 B2 完成。这不是图片保存失败，也不是来源隔离失败。
- **本轮同一产品批次修复**：将现有 S3 Android 真机模拟器的两章离线路径改为每章明确等待 **Reader → 原详情页“漫画详情” → 点击详情页可见“‹ 返回” → 原 Home**，继续逐一打开第二章。**不改动**原 Reader、LocalComicStore、来源 SDK、Host 协议、授权与哈希检查，不通过直接 Activity Intent 绕开真实 UI。保留两章分别离线重新打开和逐页 SHA256 的完整断言。
- **B3 用户可见优化**：复用现有 `LocalizedText.ui(zh,en,ja)`，把原 Android 书库标题及“历史/书架/显示/刷新”、书架返回/新建/重命名/删除等核心入口按中英日显示；继续使用已有 `titleRow` 两行窄屏布局和原 RecyclerView，不另做设置、阅读器或数据存储。本轮尚未声称全页面三语或实体手机验收。
- 仍须以后续**新产品 SHA 的真实 push S3**最终结果裁定 B2 两个 Android 离线章节；工程测试的通过不能代替实体设备。B1 PACKAGE_VERIFIED/MANUAL_QA_PENDING；B2 B3 IN_PROGRESS；B4 用户资料授权后进行；B5 发布审批未开始。G1–G4、54 项历史整体签收仍 OPEN。只有 Draft PR #284；`main` v0.5.0、Release/OTA、真实用户库和正式签名均未改。

