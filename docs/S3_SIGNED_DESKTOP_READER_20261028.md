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
