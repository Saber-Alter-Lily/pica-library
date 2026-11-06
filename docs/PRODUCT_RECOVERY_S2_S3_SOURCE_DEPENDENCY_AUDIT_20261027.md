## 2026-10-28｜S2 原型与实际依赖图增量（基于用户授权，单独 Draft PR #219）

从 PR #218 的 `6e5c1a4a` 分支隔离开发，正式 `main` / v0.5.0 / OTA 不变。2026-10-28 用户明确要求停止重复追求 S1 视觉矩阵完善，先推进 S2/S3 架构；**G1 真机验收仍是发布阻断，不作为隔离研究性 Draft 的前置门禁**。

- S2 首轮真正运行的 [架构 CI #40677952242](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40677952242) 对 SHA `383c89e5` SUCCESS，下载审阅其 239 TS 文件、1,079 import 边、0 runtime SCC cycles 的完整 JSON；6 条 `ProviderService` 对具体来源/SDK的旧 import（含 type-only）均可列举，不是凭空假设依赖已经清除。
- `src/source-extensions/{reader-contract,desktop-reader-adapter}.ts` 用版本化严格契约和授权 runtime epoch，实际适配原 `OnlineReaderService`；无用户账号、无默认 URL/Host 和无任意可执行插件注册。实读测试含章节、图片、页缓存、进度、跨作品拒绝、禁源与迟到请求回滚；首轮验证范围为合成来源，不涉及真实站点接入。
- 随后新增 `src/providers/compiled-composition.ts` 作为旧三源**唯一受控构造入口**，`ProviderService` 不再直接 `new` Pica/EH/JM 类；新 CI 门禁和兼容性测试保留历史 ID、media scheme、注入对象与 permission lease。此修改在其精确 HEAD CI 完成前仍是候选，不应判 PASS。
- **尚未完成**：在 Desktop 实际入口采用外置运行进程、Android IPC/签名与组件分发、核心包物理移除来源 SDK、独立禁源/安装/撤销/升级事务，以及旧数据/源码/真机/一键升级 G2/G3 全覆盖。可选 Suwayomi 不成为强制依赖。

后续以 [S2 实施文档](S2_SOURCE_BOUNDARY_20261028.md) 为准；先看最新确切 CI 与模块 DAG，再迁移一条真实受控来源的组合入口与独立运行时，不将用户自行接入视为自动版权免责。

---
## S2-A 静态实际依赖边记录（2026-10-27，未改变运行代码）

本项仅按当前 Draft `e42919a` 实际源码读取 import 入口，作为 `S2-01 / NEW-MOD-01` 的**待实施依赖重排输入**。它不是生成/验证过的全库 AST import DAG，也不算纯核心安装通过。用户 G1 尚未验收，按既定顺序不提前执行外置来源运行时。

| 实际文件与引用方向 | 当前已核实的边 | 模块化意义与下一个工程切口 |
|---|---|---|
| `src/services/online-reader-service.ts` | `../reader/progress-writes`、`../types`、`p-limit`、`node:crypto`；**无 SDK/账号/具体 Provider import** | 已有 `OnlineReaderSource / OnlineReaderCache / OnlineReaderState` 注入端口值得直接复用；下一步把 Reader 的 `Buffer` 传输压缩为进程边界可验证的能力/媒体句柄，不写入来源凭据 |
| `src/services/provider-service.ts` | 直接 import `../sdk`、`../providers/{pica,eh,jm}-provider`、`ProviderRegistry` 及 `source-policy` | **当前应用组合层强耦合三来源**。下一阶段先保持旧账号/收藏/章节行为，把具体适配器构造移到受控组合入口；禁止把源构造下沉到 Reader |
| `src/desktop/main.ts` | 直接 import `../sdk`、`../services/pica-account`、`./eh-web-login`、`../library/server` 等 | 桌面启动入口仍会编译具体来源代码；纯 Core Desktop 不成立。需在运行组合/白名单工件验收里证明无源码协议执行而非只看配置开关 |
| `src/services/reader-service.ts` | `../library/database`、`../local-library/types`、`./external-reader-adapter` | 本地 Reader 有独立路径，但该外部适配器引用 `node:child_process`；需核实外部文件工具和来源 SDK 属于不同权限/生命周期，避免误砍本地打开文件能力 |
| `src/providers/types.ts` | `ProviderId='pica'\|'eh'\|'jm'`，`SearchRequest` 含 E-H 专属过滤字段，媒体返回 Node `Buffer` | 现有 `ComicProvider` 不是跨进程 ABI；应新增版本化、边界独立的 DTO/错误/能力数据模型，**保留旧 Provider 接口作为内部适配层**，迁移不能直接序列化 SDK 对象 |
| `src/modules/contracts.ts` + `runtime-composition.ts` | 已有 `library/reader/sources/tags/recommendation/sync/update` API 版本契约，但 runtime 构成只能表示 `jm` 是否带入 | 当前 runtime 组合不等于可独立升级全部来源；不得用其现有成功替代 S3 真正来源生命周期 |
| `mobile/android-alpha2/app/build.gradle` | `implementation jmcomic-core`、`jmcomic-android-support`；还包含共享 `source-jvm` 编译路径 | 安卓所谓核心包物理上仍带有来源 SDK；将来必须分别验纯核心 APK 依赖图、功能入口、离线 Reader，且留有旧用户索引和下载数据兼容 |

**边界冻结原则**：维护同一身份、缓存、Reader 进度通道；继续使用 `ProviderRegistry.forPageForComic` 和真实 `OnlineReaderService.picture` 的 cache-hit 前校验，不允许引入不受控 JS/JAR 任意执行；可选 Suwayomi 不是本地/网盘 Reader 的必经依赖。此批只完成部分代码的真实 import 摘要，不给 `NEW-MOD-01` 写 PASS。下一步在 S1/G1 获得用户认可后写完整依赖 DAG 与 CI 反向引用拒绝，并完成无源离线读取真流程。

---

# S2/S3：来源外置的源码耦合证据与最小迁移顺序（2026-10-27）

## S2-01 新增源码薄片：身份绑定的图片路由（2026-10-27）

当前新增 `ProviderRegistry.forPageForComic(comicId, locator)`，先按作品 ID 解析来源归属，再按媒体 locator scheme 解析媒体归属，两者不匹配直接拒绝。单元测试覆盖旧式无前缀 Pica ID、E-H、JM 成功路线及跨来源/未知 Host 失败路线，并禁止触发图片抓取。**新 API 是纯模块契约，本轮没有替换已用 `forPage()` 的历史生产调用。** 这保留既有 Pica HTTP(S) 下载兼容，同时为未来 S3 来源转移提供 fail-closed 接口；它**不能**证明 SDK 已移出核心包、未知 Host 已可动态安装或受控插件信任链完成。

相关测试：`test/unit/source-module-contracts.test.ts`；实现：`src/providers/provider-registry.ts`。运行结果只按新提交精确 SHA 的 CI 判定；真实设备/来源验收仍 OPEN。


状态：**STATIC_AUDIT_ONLY / S2-S3_NOT_IMPLEMENTED**。源码基线为 Dev89 及 PR218 的当前代码；本文件不宣布来源已外置，不更改 SDK、账户、数据格式或生产连接。S1 真实 UI 验收优先级不变。

## 已存在、应当复用的模块

| 代码 / 已有能力 | 复用依据 | 限制 |
|---|---|---|
| `src/providers/provider-registry.ts` | 路由别名、漫画 namespace、媒体 page scheme 原子碰撞拒绝，未知 namespace 默认失败 | 只接受进程内实现、编译时的 ProviderId；不是外部安装/信任机制 |
| `src/providers/module-manifests.ts` | 固定版本/标识/命名空间/alias 的格式校验 | 内置 `pica,eh,jm` Record，声明不能脱离核心发行、更没有权限/卸载/签名来源 |
| `src/providers/types.ts` | `ComicProvider` 的搜索、详情、章节、页能力和 ProviderComic 数据定义 | `ProviderId` 为三个固定值，`SearchRequest` 混入 E-H 专属过滤器，`fetchPage` 返回 Node Buffer，不能直接作为跨进程/跨手机的安全 ABI |
| `src/providers/pica-provider.ts` | 现有 Pica SDK 的明确适配类 | 运行时仍从主程序 `../sdk` 取得 Pica 会话，核心发行代码尚未与平台协议剥离 |
| `src/providers/jm-provider.ts` 和 `jm-worker.ts` | 当前按需启动的已有 JM worker、租约检查、取消和账户身份缓存 | 是进程内打包的可选 runtime 适配，不是已外置并独立签名/安装的来源 |
| `mobile/android-alpha2/app/src/main/java/com/picalibrary/android/sources/SourceAccessPolicy.java` | 原生独立权限状态、修订号、取消 epoch、原子提交 | `IDS` 写死 `pica,eh,jm`；`SourceAccess.java` 的 legacy 过渡需保留，不能盲清旧账户 |
| `src/modules`、现有 full-upgrader 与运行时组合验证 | 已有应用/模块兼容、事务/回滚及程序集清单门禁 | 不能把应用整包的 core/JM 二选一宣称为单独来源更新器 |
| 用户自选 Suwayomi Host | 可选 Host 的来源/权限/章节访问和局部互操作证据 | 不是独立手机端所有来源的唯一途径，更不是本地 Reader 必需后台 |

## 已核实的核心阻断

1. **不可动态注册**：`ProviderId='pica'|'eh'|'jm'`、`SourceModuleManifest` 和 Android `SourceAccessPolicy.IDS` 均固定来源集合。新增来源不能只放一个配置文件就运行。
2. **SDK 仍捆绑**：Android `app/build.gradle` 直接实现 `jmcomic-core` 与 `jmcomic-android-support`，并编译共享 `source-jvm`；Manifest/页面仍有专属 Pica、E-H、JM Activity。Windows core 无 JM JVM 只是物理 runtime 裁剪。
3. **IPC 还没有受控的数据模型**：当前 `ComicProvider` 暴露 Buffer、通用 Episode/Picture 和可任意扩展的 `providerMetadata`。跨进程/插件必须另设 schema、流媒体传输句柄、大小限制、统一异常/取消和来源身份/归属验证；不得直接序列化 SDK 对象。
4. **路由细节需单独复核**：当前 Pica manifest 声明裸 HTTP(S) pageScheme，`forPage` 按 URL scheme 分流。未来 Host 或其他来源不能依靠裸 HTTP(S) 被误路由到 Pica；迁移需要保持旧 Pica locator 兼容与明确来源上下文，先加失败闭锁/归属对照，不仓促删除旧机制。
5. **扩展信任尚不存在**：当前 manifest 没有插件签名、权限、API 升降兼容、启用/撤销/升级/回滚或可信分发源，不能据此开放任意 JS/JAR/APK 执行。
6. **新旧数据身份需兼容**：旧未加前缀的 Pica ID、已收藏/下载内容、现有 E-H/JM namespace、portable 状态和原有 SourceAccess legacy 授权必须有明确映射/迁移，而非批量重写或自动注销。
7. **WebDAV 是存储协议**：来源能力应按本地文件、远程文件存储、漫画 Provider、用户 Host 区分，不强制所有能力支持登录、排行榜或 favoritesWrite；任何缺失必须明确表现为 UNSUPPORTED。


## S2-02 接口配套完整性门禁（2026-10-27）

新增安全回归：如果未来某个来源适配器单独暴露 `fetchPageForComic`，却没有提供对应的 `assertPageOwnedByComic` 同步校验，在线 Reader **在检查缓存之前**直接拒绝，不允许命中旧缓存绕过来源归属验证。没有采用新接口的旧适配器仍维持兼容通路。此项是 S2 的 fail-closed 契约约束；**并不代表所有旧适配器天然具备独立外置或插件安全性**。

## S2-02 将来源归属校验接到真实在线阅读链路（2026-10-27）

源码显示真实调用路径为 `OnlineReaderService.picture(comicId,...)` → `ProviderService.fetchPage(locator)`。本轮添加可选端口 `assertPageOwnedByComic(comicId, locator)` 和 `fetchPageForComic(comicId, locator)`，并由 `ProviderService` 实现。真实在线 Reader **在缓存读取前**验证媒体 scheme 与作品身份一致；之后使用作品绑定的来源抓图接口。原有来源接口保留，供未升级的兼容适配器及隔离测试继续使用；本地文件 Reader、数据库和推荐算法没有更改。

现有单元测试之外新增带作品 ID 的抓图/拒绝跨来源测试及缓存命中时拒绝绕行；运行结果仍以精确新 SHA CI 判定。此阶段**尚未证明旧 SDK 已从安装包外置**，未开放用户自定义可执行插件，也没有真实来源账号的全流程验收。

## 后续工程顺序（从现有开源实现继续，不另起整套框架）

| 阶段 | 可执行工作 | 验收出口 |
|---|---|---|
| S2-A | 记录 core/library/reader/provider 的真实 import DAG 与数据所有权，复用现有 AST 依赖门禁 | 无源本地 Reader 不初始化来源；新增跨层引用使 CI 失败 |
| S2-B | 把必要的来源中立 DTO、能力/错误/进度接口定成版本契约；先为受控测试适配器提供独立替换能力 | 不修改推荐/Visual 算法，不混淆源 ID，不直接暴露私人数据 |
| S3-A | 参照 Mihon/Mihon-extensions 的设计边界、可选 Suwayomi Host 与既有 SDK，分别验证 Android 受控服务或独立插件、Windows 独立适配进程方案 | 用户自己添加/禁用来源的最小真实闭环，隔离/性能/签名/撤销证据存在 |
| S3-B | 以保留旧来源数据为前提逐一外移 Pica/E-H/ExH/JM 协议实现；纯核心双端离线运行 | 安装包依赖图和运行行为证明不带平台专属 SDK/协议，没有强制 Host 或默认源 |
| S3-C | 检查旧版配置迁移、各来源真实功能对等、两端身份/下载/Reader/书库整合 | 真正的来源新增/升级/禁用/卸载不破坏本地数据和已有阅读；未验证平台如实标注 |

用户自选来源与第三方代码不等于版权或安全免责。来源软件的许可、功能、默认连接与发行物需单独审查。本轮仅根据已读取源码形成实施约束，**未运行/安装任何外部源或改动生产资料**。

与既有 [产品恢复计划](PRODUCT_RECOVERY_EXECUTION_PLAN_20261027.md) 和 [42 案例映射](PRODUCT_RECOVERY_ACCEPTANCE_MAP_20261027.md) 同时适用；以 S1/G1 用户界面质量先收口为前置。
