# Pica Library 项目版本日志

本文件只记录版本的核心能力演变，不记录纯文案、微小样式和一次性修复。

## Unreleased — 研发进展

> 本节记录尚未进入正式 Release 的核心研发能力。完成自动测试不等于正式发布；实机验证、合并与 Release 仍需单独授权。

### Recommendation V5 / Visual V1

- 推荐偏好页升级为“画像 → 当前推荐构成 → 人工微调”三层：长期/近30天/本次行为画像先展示，当前启用的来源层、召回通道、Provider 请求预算和主要锚点可见；不再要求用户先猜标签再搜索。
- 1–10 偏好调整改为批量暂存后统一保存/撤销；具体偏好搜索改为按钮或 Enter 明确提交，搜索未命中时必须再次确认“作为标签添加”，不再把输入文字自动写成 TAG 控制。
- 增加一键推荐审计导出 ZIP：导出 policy、timescale、candidate-channel、behavior evidence、user events、shadow runs、evaluation 和最小 catalog；明确排除 Pica/E-H/GitHub/WebDAV 凭据、Cookie/Token 与漫画图片/下载文件。
- Desktop 手机连接增加本地生成二维码与 `picalibrary://pair` 深链，复用 Android 已有深链配对协议；二维码由仓库内 MIT qrcodejs 本地渲染，不调用第三方二维码服务。
- Desktop↔Android 配对后自动同步 Pica/E-H“是否已连接”的非秘密状态；Android 设置页显示“已由 Desktop 连接”，Desktop-backed 功能不再因为手机没有本地账号而误导用户重复登录。当前 LAN Bridge 仍为 HTTP，因此密码/Cookie/长期 Token 不跨端复制，后续先完成加密传输/设备身份再考虑 Provider relay 或可撤销 session handoff。
- 建立 V5 Portable Policy：Desktop 负责完整画像、跨 Provider 召回与重计算；Android 接收候选缓存与策略基线，离线仅做轻量增量调整，下一次配对再双向合并。
- 新作发现增加第一版 owned/work-level suppression：收藏、书库、已下载视为 owned，并用归一标题 + 作者 + 页数识别高置信跨来源同作品。
- 显式偏好从“多一点 / 少一点”升级为基于收藏画像的 1–10 档控制；系统基准由收藏支持数和占比推导，用户调整同时可影响排序与后续完整召回。
- V3 Tag Registry 的 facet 被复用于 V5 控制中心，标签按作者、IP、角色、题材、剧情、关系、外观等语义组折叠展示。
- 推荐重算进度拆出 Provider 可用性检查，并明确区分“下方旧结果”和“新 cycle 已切换”。
- Like / Dislike 增加即时可见回执；Dislike 卡片弱化，避免用户无法判断操作是否生效。
- Visual V1 保持冻结、版本化和可回滚；当前研发原则是不因 Recommendation V5 改造而重建或覆盖现有视觉向量。
- P1 语义收尾开始：将“已经看过 / 已经拥有 / 重复上传 / 暂时不想看”从口味反馈中拆出，作为独立事实或约束；临时隐藏采用可过期状态。
- 增加“保留收藏但不参与推荐口味画像”：仅移出 preference inference、召回 seed 与 Visual preference prototype，收藏/下载/已拥有过滤和 Visual embedding 均保留。
- P2A 启动 Canonical Work Identity 基础层：新增 Series / Work / Edition / Upload 绑定、身份证据与人工裁决的加法表结构；首轮不自动绑定、不改写现有 comic_id。
- P2A-2 增加 evidence-only 身份候选回填：高置信同作品候选可按 resolver version 幂等写入证据表，但 canonical work 与 upload binding 仍保持 0，等待后续人工裁决。
- P2A-3 增加可逆人工身份裁决：同一作品 / 不同版本 / 保持分离均独立持久化；只有“保持分离”立即进入高权限去重保护，其余裁决暂不改写 serving 或创建 binding。
- P2A-4 增加 Work 物化预览：把已裁决 SAME_WORK / EDITION_VARIANT 关系按传递连通性组织成候选 Work 组，并检测组内 KEEP_SEPARATE 冲突；当前仅预览，仍不写入 Work/Edition/Upload binding。
- P2A-5 增加 Controlled Materialization Dry-run：在任何真实绑定前生成确定性的 Work / Edition / Upload 计划，读取既有 binding 并输出拟新建/复用/变更动作、原绑定回滚信息、Edition 分区不确定性与冲突阻断；当前 `writeEnabled=false`，无执行绑定入口。
- P2A-6 增加 prepare-only transaction contract：Dry-run 计划绑定 SHA-256 digest，Desktop CSRF 路径要求精确 plan version/digest、显式确认 token 与幂等 request key；新增 materialization audit ledger，但 `executionEnabled=false`、`applyEndpoint=null`，仍不能写入 Work/Edition/Upload binding。
- P2B-1 启动 Behavior Evidence 语义层：新增 shadow-only evidence ledger，明确区分 Taste / Ownership / Exposure / Identity Report / Temporal Constraint / Hard Constraint / Profile Control；Like/Dislike 保持显式口味证据，收藏为强正向，完成阅读与重复阅读分层，预览/少量阅读为弱证据，下载拆为 ownership + weak taste，单纯曝光不再视为正向口味。当前 `rankingImpact=false`，尚未替换 V3 ranker。
- P2B-2 增加 legacy semantic drift 对照：shadow ledger 量化旧 V3 中“曝光被当正向”“下载/reader open/progress 被抬到接近强正向”“非 Dislike 的移除/取消被当负向”等差异，为后续行为权重迁移提供可审计基线；仍不改变线上排序。
- P2C-1 增加 multi-timescale preference shadow：在不替换 V3 ranker 的前提下，将 inferred preference 分为 Lifetime / 7d / 30d / 90d / Session，并把 persistent/session explicit controls、session intent 与 hard constraints 作为独立层输出；历史收藏只进入 Lifetime，Recent/Session 仅使用带服务端事件时间的行为，当前 `rankingImpact=false`。
- P3A-1 启动 multi-channel candidate planner：将 Session / Recent / Lifetime / Explicit 分别映射到 AUTHOR / FANDOM / TAG / CATEGORY / RELATED / EXPLORATION / REDISCOVERY / TARGET 通道，并为 Pica / E-H / ExH 分配独立请求预算；Provider failure isolation、BLOCK/LESS 语义和本地 rediscovery 均进入计划层，Visual 通道继续禁用。当前 `mode=SHADOW`、`servingImpact=false`，尚未接管 V3 retriever。
- P3A-2 增加 provider query compiler：按现有 Provider 契约将 channel 编译为 Pica native keyword/tag/category、E-H/ExH exact canonical tag 或 keyword fallback、Pica related、本地 rediscovery；E-H canonical binding 仅从本地真实 `rawTags` 的唯一观测映射提升，namespace 冲突或不合法 canonical 自动降级，E-H category/related 等未实现能力不伪造。当前 `executionEnabled=false`，只读输出 provider routes。
- P3A-3 增加 provider-isolated shadow retrieval：Pica 新增可选 bounded page seam，ProviderService 支持 `persist:false` 与 non-persisting Pica related；shadow executor 按 Provider 隔离失败、同 Provider 顺序执行、跨 route/provider 去重并记录 yield/latency/failure telemetry。真实网络执行仅开放 Desktop CSRF + 显式 confirmation 的手动入口，`persistCandidates=false`、`servingImpact=false`，结果不进入 V3 ranker。
- P3A-4 增加 shadow run audit history：复用现有 candidate-pool 存储，以 `v5-shadow/<planner>/<compiler>/<retrieval>` model version 保存候选 ID 与聚合 telemetry，不持久化 shadow 候选元数据；支持按版本前缀读取历史运行，为后续 channel/provider benchmark 提供基线。同步将 E-H / ExH shadow 请求上限收敛到已验证的 4 / 2，Pica 保持 8。
- P3B-1 增加 deterministic candidate hygiene shadow：shadow retrieval 后、任何 relevance ranking 前，按 Owned / Seen / Duplicate Report / Temporary Suppression / BLOCK / work-level identity 去除确定性不可展示或重复候选，并逐项记录 removal reason；`Dislike` / `LESS` 等 taste negative 不硬过滤。Shadow audit 从本阶段起保存过滤后 candidate IDs，同时保留 raw retrieval 与 hygiene telemetry。
- P3C-1 增加 explainable relevance ranker shadow：在 hygiene 后用 channel priority、route corroboration、provider rank/precision、精确 item feedback、Lifetime / 30d / 7d / Session affinity、显式 MORE/LESS/TARGET 与低权重 popularity 生成透明线性分数和真实 reason codes；Visual、diversity 和 exploration quota 不进入 relevance score，`learningToRank=false`、`servingImpact=false`。Shadow audit 从本阶段起保存 ranked candidate ID 顺序及前 100 项 feature/reason evidence。
- P3D-1 增加 deterministic batch diversity shadow：在 relevance ranking 之后使用 greedy saturation 选择批次，作者 / FANDOM-IP / 语义标签采用 A→B→C 分阶段上限与软惩罚，Provider 仅使用小幅 balance bonus；记录 raw-top 与 selected concentration、relevance delta 和 pass 分布。Visual style diversity 继续关闭，`servingImpact=false`。
- P3E-1 固化 session mode shadow policy：将 DEFAULT / FAMILIAR / RECENT / EXPLORE / TARGET 的差异版本化为 channel/source priority policy；模式改变召回来源与预算竞争，不改 relevance ranker 权重。当前仅在 shadow pipeline 生效，正式 Web/Android 模式入口暂不开放，等待 benchmark 与 serving promotion。
- P3F-1 增加 promotion review gate：仅使用当前 exact composite modelVersion 的重复 DEFAULT shadow runs 评估候选池规模、Provider route failure、hygiene removal、完整 batch、作者/IP/标签集中度、diversity relevance loss 与 shadow safety invariants；通过时最多返回 `READY_FOR_MANUAL_REVIEW`，从不自动 promotion，`servingMutationEnabled=false`，无 promote/activate 写入口。
- P4A-1 启动 Visual V1 representation QC：只读取冻结的 DINOv2-small embedding，按同作者 vs 异作者、同 IP 不同作者、同作者同/跨 Provider、同/混合 source kind、近/远页数差异计算 cosine 分布，并以 deterministic k-NN 统计作者与 IP Top-K 命中及 Provider/source nuisance proxy；同时报告 catalog/favorite/provider/source coverage。当前 `mode=READ_ONLY`、`rebuildPerformed=false`、`servingImpact=false`，不重建向量、不启用 Visual recall。
- P4B-1 增加 Visual Author Atlas：复用现有 Visual V1 multi-prototype 聚类器，对至少 2 本已索引作品的作者建立一个或多个画风 prototype，保留 representative works、cohesion、substyle spread、Provider/source 支持，并构建有界 Top-K author similarity graph；当前 `mode=READ_ONLY`、`visualRecallEnabled=false`、`styleFamilyServingEnabled=false`，不重算 embedding、不进入 serving。
- P4C-1 增加 provisional Style Families：在作者 prototype 节点上构建 bounded mutual-kNN 图并取 connected components，允许同一作者的不同 substyle prototype 进入不同候选 family；输出 family prototype、成员作者/作品、边相似度与 multi-family author 统计。当前 `provisional=true`、`servingImpact=false`、`visualRecallEnabled=false`、`styleDiversityEnabled=false`，不把图聚类直接当作正式艺术流派标签。
- P4D-1 增加 Visual candidate coverage planner：在 P3 shadow run 仍持有完整候选对象时统计 ranked pool / diversified batch 的当前 Visual V1 覆盖，并按“最终批次缺向量 → Top relevance 缺向量”生成有预算上限的补算优先队列；同时区分 catalog 已存在、可直接 prepare 的候选与 non-persist shadow 候选，后者明确标记 `SHADOW_CANDIDATE_NOT_PERSISTED`。当前 `mode=PLAN_ONLY`、`embeddingGenerationEnabled=false`、`candidatePersistenceEnabled=false`，只将覆盖与阻塞信息写入 shadow telemetry。
- P4E-1 增加 Visual activation review gate：综合冻结 representation QC、author atlas、provisional style family 非坍缩、exact current P3 shadow run 的 candidate coverage 与 preparation readiness，只在全部必需条件通过时返回 `READY_FOR_SHADOW_REVIEW`；否则保持 `NOT_READY/OFF`。Gate 始终 `autoActivation=false`、`servingMutationEnabled=false`、`embeddingGenerationEnabled=false`、`visualRecallActivationEnabled=false`、`styleDiversityActivationEnabled=false`，无 visual-promote/activate 写入口。
- P5A-1 建立 fixed evaluation metrics + correctness audit：把既有 Recall/NDCG/MRR helper 提升为生产模块并补 Precision/Hit/ItemCoverage；每次 P3 shadow run 对 hygienic ranked pool 与 diversified batch 二次运行同一 hygiene，统计 Owned / Seen / BLOCK / Duplicate leakage，理想值严格为 0，结果进入版本化 shadow telemetry。
- P5B-1 增加 retrospective future-outcome benchmark：仅使用 exact current shadow modelVersion 的历史 run，并以 run 之后窗口内发生的 Like / Favorite / reader complete 作为未来正向证据，计算 ranked/batch Precision、Recall、NDCG、Hit、MRR，同时汇总 correctness、concentration、item coverage 与 EXPLORE hit；serendipity / long-tail 在现有日志不能可靠识别时明确标记 unsupported，不补造指标。
- P5C-1 增加 Steerability audit：围绕每个 inferred 标签/作者/分类/IP 的系统 baseline 模拟 ±3 档和 BLOCK，验证匹配候选 adjustment 单调变化、非匹配候选 0 collateral、BLOCK 0 leakage；当前仅验证 control-plane monotonicity，不冒充线上因果 A/B。
- P5D-1 增加统一 Evaluation Framework：汇总 P3 engineering gate、P4 Visual gate、retrospective benchmark 与 steerability，证据充分时最多标记 `BASELINE_EVALUATION_READY`，否则 `BASELINE_BUILDING`；始终 `autoPromotion=false`、`modelEscalationEnabled=false`，LTR / Contextual Bandit / Active Learning 均保持 deferred，直到存在固定基线对照证据。
- P5E-1 增加 Recommendation Evaluation Dashboard：Web/Desktop 统一展示 P3 engineering gate、P4 Visual gate、P5 baseline 状态、future-outcome Precision/Recall/NDCG/Hit/MRR、correctness leakage、作者/IP/标签集中度、catalog coverage、Steerability 与最近 shadow runs；页面加载只读 GET 评估数据，Shadow benchmark 仅能用户手动点击并通过 Desktop CSRF + 显式 confirmation 触发。Advanced Learning 继续显示 deferred，不新增 promote/activate 入口。
- P5F-1 增加 exact modelVersion baseline comparison：可显式选择 baseline 与 candidate 两个 shadow modelVersion，在相同 retrospective benchmark / future horizon 下比较 Precision@12、Recall@12、NDCG@12、Hit@12、MRR、correctness leakage、作者/IP/标签集中度、catalog coverage 与 EXPLORE hit；双方至少各有 3 个 exact runs、3 个 future-evaluable runs 和 3 个 correctness audits 才标记 `COMPARISON_READY`。始终 `winner=null`、`automaticWinnerSelection=false`、`modelEscalationEnabled=false`，Dashboard 仅在用户点击“比较版本”后执行比较。
- P6A-1 增加 Advanced Learning Decision Gate：高级学习必须由人工先选择 LTR / Contextual Bandit / Active Learning；共同前置为 `BASELINE_EVALUATION_READY`。LTR 还要求 exact modelVersion comparison=`COMPARISON_READY`，满足时最多进入 `READY_FOR_EXPERIMENT_DESIGN`；Bandit 因缺 propensity/randomized assignment/online reward attribution，Active Learning 因缺 uncertainty/query-value/question-response telemetry 继续 deferred。Gate 始终 `trainingEnabled=false`、`servingMutationEnabled=false`、`autoExperimentCreation=false`、`autoModelSelection=false`，Dashboard 只提供“评估实验门槛”。

- V5 Beta 稳定性修复：推荐设置页不再在打开时自动运行完整 Evaluation/Visual QC 重计算；修复书库推荐口味与推荐反馈 DOM `MutationObserver` 自触发重渲染风险。重型评估和 Visual QC 改为用户显式点击后执行。

- V5 Beta 实机反馈修复：Android 配对在获得 Desktop token 后立即显示“配对成功”，推荐/书架同步转为后台执行，不再让重算耗时伪装成“仍在连接”。
- V5 Evaluation 修复 composite shadow modelVersion 超过旧 160 字符读取上限导致的 `Invalid candidate-pool model prefix`；Shadow 按钮改为“影子推荐”并明确说明不会改变正式推荐。
- 推荐控制中心强化 1–10 档可发现性：扩大系统推断控制目录，并在搜索未命中时提供显式标签 1–10 滑杆，而不是空白结果。
- P2A 作品身份审计增加双封面、详情、本地/在线阅读入口；未裁决候选优先，已经裁决的 pair 自动沉底。
- Visual V1 QC 详情改为直接接入主 Reader，详情页的本地/在线阅读不再依赖当前页面是否存在其他阅读按钮。
- 后续连接体验规划：Desktop↔Android 扫码配对作为首选入口，手工地址 + 6 位配对码保留为 fallback；尚未在本轮 hotfix 中引入相机权限/扫码依赖。


- Web/Desktop 全量 UX 审计第一轮完成：新增独立 Web UX audit 清单，统一焦点/禁用/危险操作/空状态/响应式层级；书库、搜索、推荐、下载、已下载、书架与设置页按“主流程优先、次级功能折叠”重组，不改变既有业务语义。
- Reader 交互重构：阅读时顶部退出保持可达，阅读设置收敛为浮层；Esc 退出、方向键/PageUp/PageDown 单一键盘处理，退出全屏后回到进入阅读前的页面并恢复原滚动位置，修复长图阅读必须回到页首才能退出的问题。
- 推荐控制中心改为用户语义：手动调整置顶；1–10 档解释收起为帮助；未被系统可靠识别的偏好显示“系统未判断”，以 5/10 中性起点供用户显式设置，不再把未知误表达为 1/10 低偏好。
- V5 Evaluation 改为“测试进度优先”：普通层只展示基础轮次、安全检查、后续真实行为积累与“正式推荐未改变”；Precision/NDCG、Gate、modelVersion 与高级学习收进开发者详情。Future-outcome benchmark 升级为 outcome-maturity 口径，未走完整观察窗的 run 仅计 provisional evidence，不进入正式准确率，避免右删失偏倚。
- 设置页实验能力分层：Visual QC、P2A 作品身份审计、V5 Evaluation 统一归入默认折叠的“实验与诊断（高级）”；画风模型参数、本地更新 ZIP、性能/Browser Lite 导出、文件/日志工具均从普通主流程降为高级项。
- Web UX 审计第二轮收口：Reader 增加固定上一章/下一章与当前章节高亮；漫画库/搜索补明确空状态与回车操作；收藏同步、在线搜索、下载启动、维护工具及 WebDAV 测试/保存/扫描增加防重复 busy 状态；设置页连接状态改为用户主动检查，不再打开页面自动探测 Pica/WebDAV；退役重复软件更新轮询并合并全局 DOM observer；同时修正中文推荐/Visual/收藏图鉴与动态外观文案的语言一致性。
- Web UX 审计第三轮收口：统一应用内确认/输入弹窗，替代书架、推荐重建、下载取消、更新、Browser Lite 与 WebDAV 等主流程中的浏览器原生 prompt/confirm；设置 Hub 升级为可键盘操作的标准 tablist/tab/tabpanel；E-H 主操作与高级操作分层并增加防重复提交；导入改为“选择并导入”单步流程；设置保存、连接测试、代理检测、更新检查、导出与预览缓存清理统一 busy/失败回执；移除主题脚本与主应用重复的滚动恢复，并将主题/Visual/设置 Hub 的全局 DOM 工作合并或降频，减少常驻扫描。


## v0.4.0 — 多来源与统一语义

- Pica 从唯一在线来源升级为多来源架构。
- E-Hentai 成为第二个核心 Provider，支持公开搜索、详情、在线阅读、下载和云收藏。
- ExHentai 保留为 E-H 账号下的可选能力；状态探测失败不影响 E-H 和推荐。
- E-H 标签保留 namespaced canonical identity，并接入 EhTagTranslation 中文显示和中文反查。
- Pica 与 E-H 收藏共同构成推荐画像；不同 Provider 保留各自最适合的召回语法。
- E-H 增加 Latest、Popular、Favorites、Watched、Categories、Toplists 和高级筛选。
- E-H 云收藏升级到 10 个原生收藏槽，并保留分类名与 note 数据。
- 书库筛选重构为“存储位置”和“内容 Provider”两个正交维度。
- 建立统一作者 Concept / Provider Binding；详情页支持作者目录和跨来源作者作品。
- 恢复阅读历史，并升级为 session ledger；支持时间范围、指定日期和具体页码恢复。
- Android 主导航稳定为“书库 / 推荐 / 在线 / 设置”。
- Web/Desktop 对齐 Android 的多来源、E-H 浏览、作者导航、阅读历史和 Provider 筛选逻辑。

## v0.3.14 — 多 WebDAV 与移动端成熟化基线

- 支持多个 WebDAV 目标并切换当前远程存储。
- Android 形成独立 Dev / 正式包身份和正式更新链。
- Desktop 与 Android 的本地数据继续与程序版本分离。
- 阅读、存储、主题、账号与更新入口进一步统一到产品化页面。

## v0.3.9 — GitHub Star 验证稳定化

- 修正 GitHub Star API 的 HTTP 204 成功判定。
- 个性化能力的 Star 状态验证不再把成功响应当失败。

## v0.3.8 — 账号与个性化解耦

- GitHub Device Flow 进入正式账号路径。
- Desktop 与 Android 的当前主题选择解耦；主题包可以同步，但不强制两端启用同一主题。
- E-H / Pica 等后续 Provider 账号架构开始从单站按钮向统一账号与来源中心演进。

## v0.3.5 — 应用内更新稳定化

- Windows 更新器补齐代理和官方 Release 下载兼容。
- 修复失败后仍显示“更新完成”等错误状态。
- 本地 ZIP 更新、官方检查、下载校验、应用与重启形成同一更新流程。

## v0.3.0 — 统一书库

- 从单纯下载工具升级为以漫画为中心的统一书库。
- 收藏、下载、书架、Desktop、本地和 WebDAV 状态开始收敛到同一 comic record。
- 增加后端 Library Query / facet，筛选结果、计数和批量操作使用同一查询语义。
- 推荐、在线发现和阅读不再各自维护独立漫画身份。

## v0.2.x — Desktop 本地优先架构

- 建立 SQLite 本地资料库、收藏同步、作者规范化、标签和分类索引。
- 增加持久化下载队列、并发控制、失败恢复和本地阅读。
- 增加书架、下载状态、维护任务、Web UI 与 Desktop bridge。
- 建立官方增量更新包、更新 manifest、回滚和发布校验基础设施。

## v0.1.x — 项目起点

- 基于上游 `pica-cli` 能力建立 Pica 登录、搜索、收藏读取和下载基础。
- 从命令行下载流程逐步扩展为长期收藏管理项目。
