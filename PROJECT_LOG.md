# Pica Library 项目版本日志

本文件只记录版本的核心能力演变，不记录纯文案、微小样式和一次性修复。

## Unreleased — 研发进展

> 本节记录尚未进入正式 Release 的核心研发能力。完成自动测试不等于正式发布；实机验证、合并与 Release 仍需单独授权。

### Recommendation V5 / Visual V1

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
