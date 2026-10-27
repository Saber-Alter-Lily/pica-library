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
