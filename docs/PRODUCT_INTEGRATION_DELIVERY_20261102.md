# Pica Library｜R0–R4 产品集成交付计划（2026-11-02）

> 状态：已启动 R0；R1 为下一集中开发批次。本计划控制交付顺序和合并粒度；历史 S0–S6 的范围及 G1–G4 验收标准不减项。正式版 main / v0.5.0 / Release / OTA / 用户生产数据均不得因本计划自动改变。

## 1. 基线、目标与禁止事项

- 正式产品：v0.5.0；生产 main：095d6910c34e00824e03b08a30af0ce4e708137e。
- 集成源头：2026-11-02 已完成 24/24 Actions 的 Draft #282，精确 HEAD 27ce6f8b1a0f5b52c14948a1e1a9c4d35ca64948；对 main 的比较领先约 929 commits，不能继续把这些分散草稿当作可发布产品。
- 唯一后续候选主干：codex/product-integration-r1-20261102（从 #282 的精确 HEAD 分叉）。可独立进行必要的模块开发，但都应汇集到此主干。正式 main 不自动合并。
- 产品定位：Windows/Android 本地优先的个人漫画书库与阅读器。无账号、无网络、无可选 Host 时也能导入、整理、阅读和继续阅读。Pica、E-H/ExH、JM、WebDAV、其他合法来源、用户自管 Suwayomi Host 是自愿添加的能力，不可成为核心启动前置。
- 旧数据与身份：保留 v0.5.0 的收藏、书架、进度、下载、推荐/Visual、同一作品规则、配对和同步语义。未经单独许可不得修改/迁移任何真实账户、旧资料或安装环境。
- 合规：来源外置不代表自动获得版权免责；受支持来源的许可证、访问与分发方式应分别评估。

## 2. 五个阶段——只以完整产品流验收

| 批次 | 唯一主要交付 | 必须证明的实际用户路径 | 不可借用的验收 | 状态 |
| --- | --- | --- | --- | --- |
| R0 统一集成 | 一个对 main 的未发布 Draft 集成候选、一个事实/缺口列表、旧任务完整映射 | 可以追踪 v0.5.0 → 各 Draft → 唯一候选的代码和功能归属 | 精确 SHA 对账，CI 仅记工程成功；不合并 main | IN_PROGRESS |
| R1 双端完整核心 | 使用原 Windows Web 和原 Android Reader/存储的统一核心，独立可测试，不重造第二套 App | 两端分别首次启动 → 本地文件夹/CBZ 导入 → 浏览/搜索 → 书架 → 章节/图片阅读 → 记录进度 → 关闭重启后续读；用户数据相互隔离 | Windows 实体可启动候选、Android 实体 APK 的依赖/DEX 检查、真实设备操作；G1 仍需人工验收 | IN_PROGRESS |
| R2 来源真正可选 | 原 Reader 接入可单独启停/升级/撤销的来源，Host 只是可选路径 | 无源核心仍可用 → 用户主动装/选一个可信来源 → 搜索/详情 → 章节/图片 → 继续阅读 → 停用来源不破坏本地作品；双端至少各有真实链路，第二真实来源单独核验 | Windows 受保护来源安装与签名信任、Android Service/Binder、可验证真实外部来源、许可审查；禁用 UI 不算物理剔除 | IN_PROGRESS |
| R3 产品体验与功能收口 | 两端完整日常体验，集中消化 Issue 而非不断增加独立样例 | 原功能矩阵逐项：布局/三语/明暗/交互式八章引导，推荐与 Visual 可控、标签过滤 #199/#200、#204 的授权范围、下载进度、LAN/WebDAV 同步、无黑屏和长任务可取消 | 360/393/480dp 与字体缩放代表性截图，真实手机 + Windows；约 1500 部库实测；重大 P0/P1=0；G1 经用户确认 | PLANNED |
| R4 无痛升级与发布 | 旧 v0.5.0 安全过渡 + 同源码双端签名候选 + 统一发布决策 | 旧版真实数据只读预检 → 校验备份 → 用户同意迁移/升级 → 旧书库/进度/下载/偏好比对 → 故障注入回滚 → 新候选再次启动和应用内更新 | G3 真实一致性/回滚，G4 原42+新增验收逐条回执、SHA/签名/版本/来源信任、用户明确批准；禁止以合成迁移冒充生产验收 | PLANNED |

## 3. 当前集中开发任务——R1 产品化，不再分散为微 PR

本批只做两件彼此对应的用户成果：

1. **Windows 原产品界面**：复用已经实现的 source-free full Web、本地持久资料、原 SQLite/Reader/书架/历史/导入导出及可选 Host 组合。使用户通过真实 Windows 启动入口使用，而不是只有 isolated HTTP/unit-test 证明。Host 有独立显式启动入口；默认核心不包含或自动加载 Host/站点 SDK。不能把新建的临时小阅读器当作正式 Web 产品。
2. **Android 原产品界面**：复用已独立编译的 local-core/local-storage/reader-view 和已有正式 App 的本地书库接线，完成同样的导入、书架、阅读、继续阅读和重启恢复；保留隔离 APK 作为 DEX/权限验收证明，不把它当作正式版替代。最后在真实手机核对完整视觉与交互。

R1 完成定义：同一固定 HEAD 的 Windows/Android 构建与核心流程测试通过，有可核查候选清单、原应用功能对照和实机未验收事项；至少一次真正贯通上述双端流程。任何仅修改接口/测试/文档、用户操作没有变得完整可用的提交，不单独称为一个交付批次。

### R1 第一批：同源双端候选与实际操作（2026-11-02）

- Windows 复用已存在的原完整 Web + Reader + SQLite + NativePicker + Windows Launcher 打包测试。新的集成分支只在全 Web ZIP 的解压、真实本机启动/阅读/书架/重启核验成功后，保留 3 天未签名 QA 产物供人工操作；Reader-only 小壳继续不上传。
- Android 复用现有独立无源 APK 的正式 CI 构建/DEX 验证与 Android 35 系统 SAF 模拟器；集成分支 push 直接执行真实模拟器流程。APK 与 v0.5.0 的安装包 ID 和资料隔离，不是正式版替代。
- 双端手工操作和证据见 [R1 同源双端测试候选](R1_LOCAL_CORE_DUAL_PLATFORM_CANDIDATE_20261102.md)。不新增第二套架构、阅读器、测试系统；当前仍需实机 Windows/Android 和用户体验核验。G1–G4 一律 OPEN。
### R2 开源复用决策与 Windows 可选 Host 候选（2026-11-02）

- 已逐文件核对 Breeze QuickJS/Rust + Bika/JM 插件 API、VeneraNext JS/QuickJS API、Delta Comic 插件安装/协议、现有 Suwayomi Host 与本项目签名 CJS Worker；结论与许可证界限见 [R2 开源兼容审计](R2_OPEN_SOURCE_COMPATIBILITY_DECISION_20261102.md)。Breeze 插件无明确许可，Venera GPL、Delta AGPL 不复制到本 MIT 项目。
- 按“先复用可工作的服务/插件架构”原则，R2 首批选现有 Suwayomi Host，**作为额外可选组合**接入原 Windows Launcher + Web + Reader，不推翻 R1。严格区分 `app/web` 原无源页面、`app/web-host` 显式 Host 页面；默认从不启用 Host，绝不打包具体站点 SDK。
- 本轮可运行工程候选仍须通过 exact HEAD Windows 实体 ZIP/两个原生入口与真实用户源端验证；R1、G1–G4 仍 OPEN。
### R2 Android 物理来源分离候选（2026-11-02）

- 基于原 Android `:local-core/:local-storage/:reader-view` 与 `:local-app` 的现有组件，已将 Suwayomi Host 协议/HTTP/会话及离线保存代码**移动到独立 `:user-host-core`**，主 App 仅保留旧 BridgeClient 兼容适配。
- 新增 `:user-host-app`，独立 APK 复用原本地 UI 源代码和 Reader，默认纯本地可用，另有用户授权后才运行的 Host 管理、搜索、阅读与按章保存。两个来源模块不包括 Pica/EH/JM SDK。完整代码/验收边界见 [R2 Android 无源 Host 候选](R2_ANDROID_SOURCE_FREE_USER_HOST_CANDIDATE_20261102.md)。
- 新增的同一 Android CI / Android 35 模拟器路径要求 APK 权限/DEX 实证和真实 UI；在 exact-head 得到结果前，R2 阶段与 G1–G4 仍 OPEN。原正式 Android App 的来源代码尚未全部物理剔除，因此独立 APK 属于工程候选，而不是旧用户自动升级方案。
## 4. 工程和开源复用纪律

- 首先检查本仓库 v0.5.0 已实现的 Reader、SQLite、LocalLibraryIngestion、ReaderProgress/History、Shelf、Web UI、Upgrade Assistant、NativePicker、SignedWorkerStore 和 SourceHostConnections；其次参考 Mihon（Apache-2.0）来源与核心分离、Suwayomi 用户自管 Host 标准 API、Kavita 的书库检索/状态 UX；未核许可与适配成本，不复制第三方源代码。Kotatsu GPL 工程只能作设计比较，不直接复制。
- 不新增第二套 Reader、数据库、来源协议库、任务调度器、插件管理器、自动更新器、完整测试框架。新依赖只有经项目内现有实现及成熟开源方案比较后仍不可避免时才允许。
- 复用现有 CI、Windows 打包/回滚、Android 35 模拟器及 Chromium 流程；只在发现会导致用户数据损坏、权限越界或核心真实流程失效时追加最小测试。不允许用增加几十项防御性用例代替功能落地。
- 聚焦阻断因素：P0 数据丢失/越权/不可恢复，P1 导入/阅读/导航/升级无法使用、明显错乱、黑屏/卡死；轻微样式调整、内部命名和低价值防御性重构集中延期或同批解决。
- 每个批次最多一份主要集成 PR 与一份短结案记录（已有连续 Draft 不删除历史）；记录固定 HEAD、产品可使用路径、真实设备/模拟器差异、OPEN/FAIL、下一阶段。不要把单个内部接口当成独立 PR。
- 只有 GitHub Actions 绿色时，标 ENGINEERING_VERIFIED；只有真实 Windows/Android 验收和用户确认时才可标 USER_ACCEPTED。所有 PR 保持 Draft，正式 main、签名 Release/OTA 必须得到单独授权。

## 5. 统一追踪与不可跳过的门禁

- R0：单一集成 Draft PR 对 main 的改动审查；确认 HEAD 不落后于 #282，历史连续 Draft 均可追溯。若已有进展在其他分支，不重新实现，评估后合入唯一候选。
- G1：手机真实页面及 Windows 原 UI 的完整使用体验——当前 OPEN；原 Dev89 自动化截图曾出现空白帧与语言/对比度问题，必须重新复验，不接受“CI 通过即 UI 合格”。
- G2：Windows/Android 纯核心产物物理无具体来源 SDK、可选来源真实安装/撤销/恢复、真实多来源互操作——当前 OPEN。Android QA 6 DEX 通过是部分证据，不是正式版 G2。
- G3：真实 v0.5.0 资料一致性备份、升级、异常回滚——当前 OPEN。合成 WAL 和历史 schema 验证只能支持工程准备。
- G4：两个正式候选的 SHA/签名/包身份/使用说明/跨端/老用户更新，原 42 + 新增 12 条（以及计划后来附加的范围）逐条可核，未执行不可写 PASS，P0/P1=0，最终用户批准——当前 OPEN。
- Issue #199/#200/#204 按 R3/R2 纳入，不因草稿中已有实现而提前关闭；已有标签/推荐/JM/同步分支成果先复用后整合。

## 6. 报告格式与停止细节失控的规则

每次推进只报告：**当前 R 阶段｜本批贯通了哪条用户流程｜精确提交/CI/实机证据｜剩余发布阻断｜下一完整批次**。非阻断微小事项进入同阶段 backlog，不单独展开长串 PR。若连续两次只产出测试/契约/安全包装而未推进一个用户流程，必须重排优先级并明确原因。

**当前动作**：以 #282 已通过的工程 HEAD 建立唯一集成主干及 Draft 对 main 的审查入口，随后集中进入 R1 双端产品化。此文件不是 G1–G4 通过声明，也不授权接触真实账号或发布新安装包。

历史详细计划：PRODUCT_RECOVERY_EXECUTION_PLAN_20261027.md；历史原 42+新增验收：PRODUCT_RECOVERY_ACCEPTANCE_MAP_20261027.md；流水日志：../DEVELOPMENT_TASK_LOG.md。
