# Pica Library 项目版本日志

本文件只记录版本的核心能力演变，不记录纯文案、微小样式和一次性修复。

## Unreleased — 研发进展

> 本节记录尚未进入正式 Release 的核心研发能力。完成自动测试不等于正式发布；实机验证、合并与 Release 仍需单独授权。

### Recommendation V5 / Visual V1

- 启动 v0.4.0 → 下一正式版直升验收：冻结 public Schema 9 作为兼容基线，新增 Schema 9→当前版本的数据保留回归测试与独立 CI Gate；Windows 采用“完整应用替换、用户数据目录保留”路线，Android 正式发布必须满足同 package ID、versionCode>42、同签名证书并完成原地安装验收。
- 升级审计发现并修复 schema authority 漂移：public v0.4.0 实际已迁移到 9 但 capabilities 仍声明 8，当前开发实际到 13 也仍声明 8；现改为 `DATABASE_SCHEMA_VERSION = latestMigrationVersion`，更新 manifest、capabilities 与兼容判断统一引用 migration 权威。
- 启动 Recommendation Ecosystem Pack V1 E1 Contract：参考成熟开源项目的 manifest/entity/device-identity 思路，将 Canonical Knowledge、Provider Intelligence、Tag/Alias、Visual Intelligence、Recommendation Policy 设计为版本化声明式 Pack；新增 manifest 类型、payload 路径安全、SHA-256 content root、dependency/publisher 校验，但本阶段不加载 Pack、不改变 serving。
- Recommendation Ecosystem Pack V1 推进到 E2 只读库存基础：Desktop 数据目录新增独立 `packs/`，逐字节校验 Pack manifest/payload/大小/SHA-256/目录身份与最低应用版本，并提供只读 inventory API；仍无 activate/apply/promote 路由，不读取 Pack 内容改变推荐结果。
- Pack E2 增加默认折叠的只读“推荐生态包状态”界面：仅显示 Pack ID、generation、类型、完整性、兼容性与错误，并支持重新检查/打开本地目录；当前无安装、启用、应用、promote 操作，不影响 Recommendation serving。
- Pack/生态路线明确不采用混淆或隐藏 ranker 作为“防抄”手段；核心优势转向长期维护的跨 Provider canonical knowledge、Visual QC/compatibility、用户私有状态、跨端 portable foundation 与 evaluation ledger，同时保持 MIT 核心和 local-first 数据边界。

- Desktop↔Android 推荐进入“双独立运行节点”基线：两端不再同步当前 cycle/batch/session answer；Android 使用自己的 `NativeRecommendationStore/Engine` 独立生成批次，Desktop 只提供 Portable Foundation、Canonical Work bindings、候选 reservoir、Visual affinity 与可移植行为/偏好。同步后两端 cycle 不同属于正常状态。
- 新增 Recommendation Sync V1 三层契约：Foundation Baseline（Desktop→Android）、Portable User State（双向）、Runtime State（设备本地）。`本次想看`/当前批次/当前页面永不跨端覆盖；持久 1–10、MORE/LESS/BLOCK、Like/Dislike、语义作品状态、口味画像排除和有界 Recent evidence 可同步。
- Android 完成三方偏好冲突检测：以上次共同 snapshot 为 base；同一显式偏好在 Desktop/Android 并发改成不同值时必须人工选择“使用电脑/使用手机”，不按时间戳静默覆盖、不取平均。普通无冲突行为按 event/mutation identity 合并。
- Android 推荐 UI 对齐 Desktop 信息架构但保持移动端交互：推荐画像显示 Lifetime / 最近30天 / 当前手机 Session / 当前本机推荐构成与主要依据；人工调整使用五个大组→具体 facet 两级折叠、约 5 行高内滚动窗口、1–10 SeekBar、BLOCK、本次想看、显式搜索及“作为标签添加”确认。
- Android 增加语义化单作品推荐控制：推荐卡片和漫画详情可执行作者调整/BLOCK、已经看过、已经拥有、重复上传、30 天临时隐藏，以及“保留收藏但不用于推荐口味”；这些状态与 Dislike 分离并可在下次连接时同步。
- Android 1–10 调整与 Desktop 对齐 `levelDelta × 0.03`、上限 0.27 的幅度语义；本机修改立即影响手机排序，之后才由 Recommendation Sync 合并到 Desktop。
- Portable Foundation 进一步版本化：新增 session-independent `portablePolicyGeneration`，并分别跟踪 Visual、Canonical、Behavior、Candidate Reservoir generation，避免 Desktop Session 改动触发伪同步提示。
- Portable Candidate Reservoir 不携带 Desktop 当前推荐答案；Android 将其与本机 Provider 候选合并，再用 Lifetime/Recent/Session/Explicit/Visual 本地重排。Canonical Work bindings 用于 Android work-level owned/duplicate suppression。
- Visual 保持“Desktop 重计算、Android 轻消费”：Desktop 负责 DINOv2/全库 embedding/作者 prototype 等重任务；Android 只同步 compact affinity/coverage，并拥有设备本地 OFF/SHADOW/LIVE 开关，默认 SHADOW，切换不会改变 Desktop Visual 模式。
- Android 新增本地推荐行为 ledger：recommend impression（cycle 内去重）、推荐详情打开、reader complete；Desktop Recent evidence 可同步为非 Session、非 dirty 历史，Android 本地事件可回传 Desktop，避免双向 echo。
- 新增双客户端正式验收清单 `docs/RECOMMENDATION_TWO_CLIENT_ACCEPTANCE_V1.md`，覆盖 runtime independence、Session isolation、三方冲突、语义 item controls、Portable reservoir、Visual/Canonical、Provider Relay、重连提示与数据保留。该验收不等同于 V5 质量 promotion。
- Android 推荐架构从“Desktop 结果缓存/轻量重排”升级为真正的独立运行节点：Desktop 与 Android 各自持有独立 cycle/batch/session，连接同步不会再把 Desktop 当前推荐列表覆盖到手机；手机可结合本地 Lifetime / Recent / Session / Explicit 状态独立生成新周期。
- 冻结 `RECOMMENDATION_SYNC_V1` 三层契约：Foundation Baseline 仅 Desktop→Android，Portable User State 双向合并，Runtime State 永不跨端覆盖；`本次想看` 明确保持设备本地。
- 新增 Desktop→Android Portable Foundation Package：同步 bounded candidate reservoir、Visual generation/每候选轻量 affinity、Canonical Work/Edition bindings 与版本号；手机不下载/运行 DINOv2，也不重做全库 Canonical Identity，只消费已计算结果。
- Android native ranker 接入 Portable Candidate Reservoir、Canonical work-level dedupe、Desktop 预计算 Visual affinity、本机 Recent / Session 行为与显式 1–10 控制；Desktop 离线后仍可基于已同步候选和手机本地状态独立推荐。
- 推荐同步升级为 three-way merge：Android 保存上次共同 base，Desktop 与 Android 同时修改同一显式偏好且值不同才生成冲突；冲突必须明确“使用电脑/使用手机”，不按时间戳静默覆盖、不取平均。Like/Dislike 与可移植行为证据继续按事件合并。
- 新增 Android“推荐同步”中心与连接后差异提示：显示手机→电脑待同步项、电脑→手机偏好/基础包变化、Visual/Canonical/Candidate/近期行为 generation 和人工冲突；无变化不弹窗，同一差异签名做节流去重。
- Desktop 最新 Like/Dislike 与 30 天内推荐曝光/详情打开/完成阅读可作为 bounded Portable behavior 同步到手机；手机的当前 Session 不回传，Desktop 来源事件导入手机后标记为非 dirty、非本机 Session，避免回声同步。
- Android 推荐 UI 对齐 Desktop 信息架构：增加“推荐画像 / 人工调整 / 推荐同步 / 画风基础”；人工调整采用五个大组→facet 二级折叠→固定高度内部滚动窗口，支持 1–10 档、BLOCK、本次想看、明确搜索与“作为标签添加”，内部滚动手势不会拖动外层页面。
- Android 推荐说明统一接入轻量圆形“!”帮助按钮；实时状态、同步差异、错误与冲突仍直接展示，不隐藏在帮助层。
- Desktop-backed Provider Relay 扩展到 E-H / ExH：手机未配置本机 E-H Cookie 但已配对且 Desktop 已登录时，Watched、Favorites、ExH capability/search、E-H/ExH 详情/页列表/在线阅读和云收藏 mutation 均通过已认证 Mobile Bridge 执行；公开 E-H 搜索仍可由手机直接访问。Relay 不下发 `ipb_member_id`、`ipb_pass_hash`、`igneous`、`cf_clearance`。
- E-H Desktop relay 的收藏同步保留 10 个原生收藏槽的用户自定义名称、slot、count 与 note，不再退化成“只有全部收藏”；手机本机会话仍优先，Desktop 离线时公开 E-H 仍可直连，账号能力则 fail closed 或使用用户显式配置的手机本机会话。
- Desktop↔Android 账号复用进入 Provider Relay 阶段：手机无本机 Pica 账号但已配对且 Desktop 已登录时，`PicaClient` 自动以 Desktop Mobile Bridge 为后备来源，覆盖搜索/浏览/收藏列表/排行榜/相关作品/详情/章节/页列表及收藏增删；本机账号存在时仍优先直连。Relay 只传 Provider 结果和用户操作，不把 Pica 邮箱、密码、authorization token 或 E-H Cookie 复制到手机。
- Android Pica 账号页在 Desktop-backed 状态下默认显示“已由 Desktop 连接”，不再直接要求重复登录；只有用户明确需要“电脑关闭后手机仍直连”时才展开配置手机本机账号。在线浏览、作者作品刷新、详情、Reader、阅读历史、封面补全和手机推荐入口均已识别 Desktop-backed Pica 可用性。
- 2026-09-19 当前实机测试轮判定为 `SUFFICIENT_FOR_PRODUCT_AND_TELEMETRY_ITERATION`：现有真实数据已覆盖推荐曝光、批次展示、详情打开、Like/Dislike、收藏/行为证据、Shadow 运行、审计导出与跨会话 ID，可用于继续修 UI、数据契约、会话归因、serving/Shadow 口径和跨端连接；继续在旧 Beta 上积累同类数据的边际价值已较低。
- 同一测试轮仍为 `INSUFFICIENT_FOR_FORMAL_RECOMMENDER_PROMOTION`：当前 Shadow run 数量和成熟 future-outcome 窗口不足，不能据此宣称 V5 推荐质量优于现有 serving、不能做正式模型 promotion，也不能触发 LTR/Bandit/Active Learning。研发推进与长期 benchmark 解耦，不再为等待 30 天 outcome maturity 阻塞产品修复。
- 下一阶段采用“候选版短验收 → 继续真实使用积累”的节奏：下一候选只需重点验证 Session 非零、audit schema v2/serving_composition、内置扫码、设备去重、折叠/内部滚动与 InfoTip；通过后继续日常使用，长期准确率证据后台自然成熟。
- 2026-09-19 实际使用反馈轮：推荐画像页继续收敛信息密度。画像、当前实际推荐构成、V5 Shadow 实验规划均可独立折叠；20+ facet 再聚合为“人物与作品 / 内容与剧情 / 外观与画风 / 行为与偏好 / 形式与其他”五个大组，各 facet 使用固定高度内部滚动查看全部条目，不再只展示前 12 项后强迫搜索。
- 修复 Recommendation V5 Session 证据链：Web 当前 `appSessionId` 接入 timescale/channel 读取与推荐审计导出；首份真实审计包中“Session=0”不再被误解释为无会话行为。
- 新增只读 Final V3 serving composition：普通页面展示已经实际落盘的当前推荐批次来源构成；V5 candidate-channel 继续明确标注 Shadow / `servingImpact=false`，避免把实验规划冒充正式推荐来源。
- 推荐审计导出升级 schema v2：加入 `serving_composition.json` 和 manifest `appSessionId`；继续只导出 allowlist 推荐/行为数据，不含 Pica/E-H/GitHub/WebDAV 秘密、Cookie/Token、漫画图片或下载文件。
- 偏好屏蔽统计拆分为“屏蔽偏好”和“屏蔽作品”，修复 AUTHOR/TAG BLOCK 已存在却被首页显示为“已屏蔽 0 项”的口径错误。
- Desktop 手机连接改为二维码 / 手动地址+配对码 / Deep Link / 已配对设备四个折叠区域；说明文案开始迁移到统一 InfoTip，而不是长期占用页面的 muted 灰字。
- Android“连接电脑”增加应用内扫一扫入口，复用开源 JourneyApps ZXing Android Embedded；扫描结果只接受 `picalibrary://pair` 配对 Deep Link。
- 修复同一手机反复配对产生多个同名设备：Android 发送稳定 `DeviceIdentity`，Desktop 对同一 device ID 轮换 token 并撤销旧 token；旧数据的同名重复项在状态展示层合并。
- 本轮按实机数据积累约束只推进开发分支、测试与日志；CI 可继续生成未发布构建用于自动验证，但不向用户交付、不要求安装新的 Windows/Android 测试包，直到本轮正式测试数据回收后再统一出候选版。
- 全站说明文案开始统一迁移到圆形“!” InfoTip：Desktop 支持鼠标悬停/键盘聚焦与点击固定展开，普通首页、漫画库、书架、推荐、在线发现、下载、设置、连接状态、WebDAV、Theme Studio 等说明不再长期占用灰色副文案；实时状态、错误、警告和安全信息继续直接显示。
- 推荐偏好页升级为“画像 → 当前推荐构成 → 人工微调”三层：长期/近30天/本次行为画像先展示，当前启用的来源层、召回通道、Provider 请求预算和主要锚点可见；不再要求用户先猜标签再搜索。
- 1–10 偏好调整改为批量暂存后统一保存/撤销；具体偏好搜索改为按钮或 Enter 明确提交，搜索未命中时必须再次确认“作为标签添加”，不再把输入文字自动写成 TAG 控制。
- 增加一键推荐审计导出 ZIP：导出 policy、timescale、candidate-channel、behavior evidence、user events、shadow runs、evaluation 和最小 catalog；明确排除 Pica/E-H/GitHub/WebDAV 凭据、Cookie/Token 与漫画图片/下载文件。
- Desktop 手机连接增加本地生成二维码与 `picalibrary://pair` 深链，复用 Android 已有深链配对协议；二维码由仓库内 MIT qrcodejs 本地渲染，不调用第三方二维码服务。
- Desktop↔Android 配对后自动同步 Pica/E-H“是否已连接”的非秘密状态；Android 设置页显示“已由 Desktop 连接”，并通过已认证 Mobile Bridge 复用 Desktop 的 Pica 与账号型 E-H/ExH 能力。密码/Cookie/长期 Provider Token 不跨端复制；若未来需要电脑离线时仍自动继承账号，再单独评估加密、可撤销 session handoff。
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
