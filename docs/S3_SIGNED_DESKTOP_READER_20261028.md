# S3｜受签名来源驱动的桌面阅读入口（2026-10-28）

状态：**Draft PR #222 / 实现候选；未进入正式 v0.5.0，G2 仍 OPEN。** 工作继承关系：[#218](https://github.com/Saber-Alter-Lily/pica-library/pull/218) → [#219](https://github.com/Saber-Alter-Lily/pica-library/pull/219) → [#220](https://github.com/Saber-Alter-Lily/pica-library/pull/220) → [#221](https://github.com/Saber-Alter-Lily/pica-library/pull/221) → [#222](https://github.com/Saber-Alter-Lily/pica-library/pull/222)。

## 本轮为何这样设计

此前 [PR #221](https://github.com/Saber-Alter-Lily/pica-library/pull/221) 已经实现并自动验证 Ed25519 签名清单、不可覆盖的来源版本目录、显式启用/禁用、回滚和真实 Linux/Windows 工作进程。这套组件原先仅被测试文件调用。继续堆砌来源进程类并不能证明产品可用，所以本轮把它接入**现有 Desktop HTTP 服务与唯一的 OnlineReaderService**。

当前还没有经过正式发行验证的应用发行者公钥，也没有 Windows 受保护的来源安装根。因此，`src/desktop/main.ts` 不启用该服务；只有**应用代码主动注入**具有受信任公钥和已安装组件的 `SignedSourceDesktopReader` 时，真实 HTTP 路由才会开放。普通用户、来源清单或未受信任浏览器不能自行开启。

## 实际代码链路

`src/desktop/signed-source-reader.ts` 实现一个明确的应用层 port：

1. 从 `SignedWorkerStore` 查询已经安装且签名验证通过的版本。请求不含来源执行文件路径、代码和发布者公钥。
2. `activate/disable/rollback` 必须由授权用户明确提交 `sourceId/version/expectedRevision`；原子修订号冲突拒绝旧 UI 覆盖，禁用或变更版本撤销运行中的会话和媒体请求。
3. `connect` 只启动当前明确选定的已签名工作进程；即使上次会话存在，重启不会自动执行新进程。来源 session 随机生成 UUID，关闭和版本切换都会使旧 session 失效；最大同时 4 个来源会话。
4. 对接现有 `bindExternalReader` → `OnlineReaderService`：章节列表、章节页面、图片缓存、进度保存与读取。图片始终使用 Desktop 本地会话 URL，页面 token 和任意来源 URL 不透传至 UI。
5. 阅读进度采用单独的 `signed-source-progress-v1:<sourceId>` 命名空间，不会覆盖现有 Pica/E-H/JM 在线阅读、下载、书库或 Host 阅读进度；只有明确保存进度时才进行写入。

`src/library/server.ts` 在原先的 Desktop 路由分组中新增**可选且默认不存在**的 `/api/v1/desktop/signed-reader` 路由。安全与限制：

- 只允许 loopback 客户端，必须同时有精确 CSRF、来源同源证明和已经配置且启动完成的 Desktop controller。浏览器 GET 可以使用 **Referrer + Sec-Fetch-Site:same-origin + CSRF** 的组合；自定义客户端必须提供匹配的 Origin + CSRF。验证失败统一 HTTP 403。
- POST 接受有界、严格字段的 JSON 命令，只支持 status / activate / rollback / disable / connect / disconnect；**没有 HTTP 上传代码、安装来源、指定任意 worker 路径、提供公钥、传账号 Cookie 或远程仓库地址的能力**。
- 只有 session 绑定的 /chapters、/pages、/progress 可读写；图像仅返回安全 raster content type，HTTP 结果使用 no-store、nosniff、same-origin 资源策略。
- 所有来源执行业务仍发生在已固定哈希的独立工作进程内，Reader 本体不导入下载 SDK 或进程启动器。可选 Host 不是前置依赖。

## 真实 HTTP 集成验收

新增 `test/unit/signed-source-desktop-http.test.ts`，运行时产生临时 Ed25519 密钥对，使用真实 SQLite `LibraryDatabase`、`LibraryService`、`startLibraryServer`、`SignedWorkerStore`、`SignedSourceDesktopReader` 以及仓库已有 synthetic worker。测试通过 HTTP `fetch` 对真实端口操作，而不是只调用同名 mock：

- 初始已安装但未启用，无进程自动启动；
- 不带 CSRF/Origin、伪造 Origin、跨站 GET/被禁止的安装/公钥与执行入口均被拒绝；
- 已签名版本明确激活/连接→章节→页面→图片→进度完整流程，已下载书库和历史本地阅读数据不产生伪记录；
- 受控版本升级后旧 session 图片 URL 失效，错误 revision 不可回滚；用旧签名版本显式回滚、禁用后不可继续连接；
- 测试真正浏览器可能省略 GET Origin 的情况，安全接收同源 Referrer/Sec-Fetch 请求，拒绝伪造跨域 Referrer；
- Windows+Linux 两套独立工作进程 CI、完整项目 CI 必须以**本 PR 最新可执行代码的精确 SHA**判定，不能沿用上游绿灯。

## 还未完成的产品项与分级

| 项目 | 截至本轮 |
|---|---|
| 桌面真实 HTTP 接入、Reader 共享与会话撤销 | **已提交 Draft / 新 CI 待定** |
| 已有受签名工作进程生命周期组件 | 上游 #221 Linux/Windows 专项及完整 CI 已通过（具体 SHA 以 Actions 为准） |
| 正式应用固定发行者公钥、Windows 安装根保护和多进程锁 | **NOT_IMPLEMENTED** |
| 实际一个 Pica/E-H/JM 来源外移并授权账号/凭据代理 | **NOT_IMPLEMENTED** |
| Windows 纯 core 安装包无来源协议/SDK及依赖图实体证明 | **NOT_IMPLEMENTED** |
| Android 独立服务/进程、纯 core APK、真实手机版交互 | **NOT_IMPLEMENTED** |
| 正式版 0.5.0 用户无痛迁移/下载/阅读记录和回滚 | **NOT_VERIFIED** |
| 旧42+新12验收用例、G1/G2/G3/G4 | **全部保留、未豁免** |

## 下一工程切口

在取得 PR #222 的两平台真实 HTTP 验收后，下一步**不再新增一个 synthetic worker**：选择一个现有 Provider 的来源读取链，保留旧的库身份与已下载数据，验证其请求/凭据代理如何穿过进程 IPC，同时保持本地/CBZ/WebDAV 完全独立。然后才建立官方可信发布根、实际 Windows 安装组件与签名、Android Binder 服务和纯核心包的物理外置。

**法律与安全边界**：用户自己添加来源不构成普遍的版权或平台条款免责；未审核的用户代码不能因为“签名字段存在”就取得应用完整权限。同用户身份的 Node 进程不等于 OS 沙箱。任何生产发布必须明确说明这一点。

## 2026-10-28 接续：真正的同一 Reader UI 与默认进程边界

本轮在先前 HTTP 成功基础上补充真实用户可点击链路，而不是把签名源伪装成 legacy `online`：

- **保护默认桌面安装**：把 `SignedReaderInputError` 移入零依赖的 `src/source-extensions/signed-reader-errors.ts`，`src/library/server.ts` 仅 `import type` 签名组件控制器，默认 HTTP 服务不得递归导入 `SignedWorkerStore`、`TrustedSourceProcess` 或 `src/desktop/signed-source-reader.ts` 的运行时执行器。实际 TypeScript AST/解析后的运行时依赖闭包与人工注入的违规依赖均进入 `module-dag-policy` 自动测试。
- **崩溃后回收**：当签名源子进程崩溃或提前退出，`SignedSourceDesktopReader` 的查询/连接入口可清理失效会话，但**绝不自行 fork/restart**；必须由用户明确发起下一次 connect。重新选择相同签名版本不会不必要地断开健康会话，且 `connected` 状态不再错误显示为 false。
- **业务身份隔离**：统一阅读投影新增独立 `signed` 通道和易失 `sessionId`，拒绝把签名源假装成旧 `online` 路由，缺少有效 session 的行 fail-closed。已连接组件的阅读进度进入现有 `ReadingLibrary` 只读查询、用户记录的 `signed-source-progress-v1:<sourceId>` 依旧独立；来源停用后行不可再声称可读，不删除原有进度。不存在来源目录写入、云端同步或下载的隐式副作用。
- **复用现有 Web Reader**：`web/reading-library.js` 增加中英日签名源阅读按钮，调用 `openSigned(comicId, sessionId)` 而非普通在线 Provider；`web/app.js` 保留原来的 Reader、章节导航、滚动/分页模式和进度写入算法，仅在明确签名 session 时切换 API root 与 CSRF 头。普通 Pica/E-H/JM、本地文件和 Host 路径不改写。
- **图片例外非常有限**：浏览器原生 `<img>` 不能附加 CSRF 头，因此仅当**同源、匹配 Referrer、`Sec-Fetch-Site:same-origin`、`Sec-Fetch-Dest:image`、无异源 Origin，且请求落在签名 session 的确切 `/pages/<index>`** 时允许无 CSRF 的 GET 图像；所有管理、章节元数据、进度及其他 HTTP 请求继续要求应用已有的 loopback+Origin/CSRF 授权。响应仍标注 `no-store`、`nosniff`、同源资源策略。不能把无 CSRF 图像例外扩大成任意 GET。
- **新增真实测试**：Linux/Windows Node 本地 HTTP 签名源测试扩充默认无控制器 403、手动断线重连、故障后旧 session 不可用、只读统一书库投影、同源图片授权和元数据 CSRF 反例；`reading-library.test.ts`、`reading-library-ui.test.ts`、`web-reader-progress.test.ts` 限定 signed route 与实际用户调用行为。专项工作流同时在 Linux 和 Windows 跑这些已有测试文件。

**验证边界**：[首轮带 HTTP 签名源的双系统专项 #40712630322](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40712630322) SUCCESS；同源原代码 [全项目 CI #40712643773](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40712643773) SUCCESS，均只针对旧代码 `dd03822e`。本轮新增的错误依赖隔离、崩溃处理和用户点击链路需要 **新 SHA 的两平台专项与完整 CI**，未跑完前不能登记 PASS。正式发行者公钥、OS 受保护安装根、真实 Pica/E-H/JM 外置适配、Android Binder/纯 Core APK、旧用户升级/回滚仍 **NOT_IMPLEMENTED/NOT_VERIFIED**，G1–G4 OPEN。

## 本轮精确 SHA 的双平台验收（2026-10-28）

继承上轮通过的 `dd03822e` 之后，新的前端与依赖/安全变更已在 `4a13b65d` 的 [S3 Linux + Windows 专项 #40715552549](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40715552549) 得到 **SUCCESS（Linux 87/87；Windows 61/61）**。这次专项同时覆盖已有真实 IPC 进程、受签名代际管理、真实 HTTP 与带授权的图片请求、Reader 崩溃回收、默认禁用、不可从普通服务传递加载特权执行器、统一阅读进度投影、单独 signed 路由以及浏览器三语言签名来源按钮。全部使用受控合成源，不包含真实源账号和网络访问。

相同源代码的 [全项目 CI #40715568582](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40715568582) 最后查询时仍 **QUEUED / NOT_VERIFIED**。上一版 `dd03822e` 的完整 [CI #40712643773](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40712643773) SUCCESS 是历史证据，**不能替代新源码的完整 CI**。后续对正式 Windows 安装包/Android APK 的 G1–G4 验收仍未执行。

统一书库通过的是**已连接签名源的会话限定恢复阅读**，而不是会话断开后自动重连、全来源收藏夹导入或常驻在线来源：页面仅在当前签名 session 已启用时获得可点击 signed route，并携带易失 UUID；禁源后的本地进度仍保留，重新连接必须用户明确操作。正常情况下没有有效官方公钥与受保护组件根，现行 Desktop 默认不会启用此入口。

下一步必须将经过审计的正式发布者公钥及可信应用目录加入签名发行流程，并逐一迁移已有具体 Provider 协议，验证旧用户账号/收藏/下载/进度和真实双端读写，再证明纯 Core 安装包确实没有具体站点 SDK。**不因为本次专项 CI 全绿就宣布来源外置完成。**
