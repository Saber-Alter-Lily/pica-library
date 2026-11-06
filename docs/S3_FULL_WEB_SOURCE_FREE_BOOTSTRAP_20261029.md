# S3 CORE-LIB-04b-01｜复用正式 Web app 初始化，正确进入无来源核心模式（2026-10-29）

**开发分支 / PR**：`codex/s3-full-web-core-gate-20261029` / [Draft #238](https://github.com/Saber-Alter-Lily/pica-library/pull/238)，接在已完成来源无关状态/作者/能力接口的 [Draft #237](https://github.com/Saber-Alter-Lily/pica-library/pull/237)。仍不合并 `main`、不部署、无 Release/OTA、无正式客户端安装或用户数据库读写。

## 原正式网页的真实调用链问题

原 `web/app.js` `loadDesktop()` 在 `GET /api/v1/desktop/status` 不存在时立即返回 `desktop=null`，没有读取同样可由 Core 提供的 `/api/v1/capabilities`。随后原 `detect()` 虽已通过 `GET /api/v1/status` 和原本地漫画 `/comics`、作者 `/authors` 与 `/library/query`，却**必定**调用在线推荐反馈和 `/recommendation-sessions/status?mode=final`。独立无源核心并不提供在线推荐服务，于是现有 UI 将本应工作的本地书库标为“初始化部分失败”；下一步甚至可能错误创建在线推荐 session。

这不是 Reader 重新开发问题，应直接修正式网页初始化逻辑、使用 [#237] 已确立的原 `appCapabilities` 作为判断依据。

## 正式源码变更

1. 原 `loadDesktop()` 缺失 Desktop host 时单独尝试读取来源无关的 `/api/v1/capabilities`。只恢复可用功能声明，不伪造 `desktop.status`、CSRF、更新能力或账户配置。若连能力接口也不可达仍保留原 Browser Lite 降级路径。
2. 原 `detect()` 在明确 `features.recommendationSessions === false` 时仍按原逻辑请求本地 `/status`、`/comics`、`/authors`、`/library/query` 并调用旧 `renderAll`，但**不再调用**推荐反馈、在线 session status/恢复创建以及 `/recommendations`。使用现有推荐页的 `#recommend-message` 只展示“无兼容来源，在线推荐不可用”的真实原因。
3. 若能力为 `true` 或旧历史后端根本不返回相关标志，保留原 provider-enabled 初始化方式；不得把普通在线推荐在正式用户环境下错误关闭。
4. 原 `web/i18n.js` 中英、`web/i18n-ja-core.js` 日文均新增 `message.coreOnlyRecommendations`，不得在 `web/app.js` 中硬编码中文。未修改 CSS、页面尺寸或 Android 原生 UI。

## 工程验收 / 留存失败

- 新 `test/unit/web-source-free-bootstrap.test.ts` 使用仓库原有 TypeScript compiler AST，**提取并执行真实现有** `web/app.js` 的 `detect()`、`loadDesktop()`，分别验证 source-free、provider-enabled、无能力字段 legacy Desktop、无 Desktop host 但可获取 capabilities，以及中英日三种文本；不是在第二套伪页面实现推荐逻辑。
- 新 S3 双平台专项 `.github/workflows/s3-full-web-core-gate.yml` 运行原完整 TypeScript typecheck、网页 syntax check、新原函数运行测试，以及旧 i18n、Desktop Web、Core bootstrap 回归。
- 首轮 [专项 #40860442807](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40860442807) 因测试中 `context/state/api` 的类型参数名与变量名相同导致 TS2502 **FAIL**，产品 JS 未出错。已在 `c7f6e47de585839acb61ad85fb8dce089e83fb1d` 仅修复测试类型参数命名，没有删除用例或放宽检查。
- 修后 [Linux/Windows 专项 #40860567748](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40860567748) **SUCCESS，两个平台全部通过**。完整 Android/Web/Desktop [CI #40860576867](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40860576867) 本文创建时仍在运行，**不得提前认定 PASS**。

## CORE-LIB-04b-02 / 04c 真正剩余工作

当前 Source-free QA Web 仍只打包**原 Reader 片段**，没有完成整个原 `web/index.html`、`web/app.js` 和其他依赖资源的来源独立实际包装/Chromium验收。旧首页加载了大量独立业务模块，部分模块可能各自发起在线源/画像探测，不能认为只修 `detect()` 就全部实现安全、稳定的 core-only 运行。

下一切口必须做原 HTML、JS import 图、CSS、字体与静态资产实际闭包清单；将来源业务资源与核心资源按原模块边界装配；对 **实际原首页** 做真实 Chromium 打开、书库搜索、书架增删、阅读恢复、设置/WebDAV 基础展示等行为测试；记录每个缺失的正式 API，不能返回假的“成功”响应。任何真实源码无源包仍须通过原物理 esbuild 导入白名单门禁，绝不携带具体 Pica/E-H/JM 源 SDK。

`CORE-LIB-04c` 还需让正式 Windows 主组合 `src/desktop/main.ts` 和 HTTP `src/library/server.ts` 真正不强制实例化 `LibraryService/ProviderService`。正式 Windows/Android 双端源 SDK 清除、受信任签名/安装/升级和撤销、v0.5.0 完整用户数据与一键升级/回滚、Android 真机 UI/引导及原 42+新增12 项用户验收依旧全部 **OPEN**，不可合并发布。

最终 G1–G4 均 OPEN。#232/#233 不同书架实现的竞争分叉需在正式集成前单独审核选版。用户选择外部来源不自动排除版权、条款或开发者法律义务。
