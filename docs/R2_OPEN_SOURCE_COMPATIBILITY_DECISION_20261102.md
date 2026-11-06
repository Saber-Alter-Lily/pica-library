# R2 | 开源来源架构兼容与复用决策（2026-11-02）

> 适用于 Draft PR #284 的并行 R2 研究与 Windows 候选。R1 未完成实机验收，G1–G4 仍 OPEN。这里记录的是源码级检查与工程选择，**不是**第三方插件可运行/获授权/真实源站连通的结论。

## 源码级核对，不重复造轮子

| 项目 | 现存实现与核对位置 | 许可证 / 直接复用限制 | 本项目结论 |
| --- | --- | --- | --- |
| [Breeze](https://github.com/deretame/Breeze) | `rust/src/qjs/mod.rs`：Rust `rquickjs_playground` + QuickJS；`lib/plugin` 生命周期；[`Bika 插件`](https://github.com/deretame/Breeze-plugin-bikaComic) 的 `src/index.ts` 使用 `searchComic/getComicDetail/getChapter/fetchImageBytes`；[`JM 插件`](https://github.com/deretame/Breeze-plugin-JmComic) 也有同类 API | 主仓库 MPL-2.0；两独立插件仓库未找到明确的项目级许可证，**不得假定其实现可复制**；主 Rust 文件仍有内嵌 Bika/JM bundle 的 `include_str!`，不是无源内核发布范例 | **复用接口与 QuickJS 隔离思路，不搬 Flutter/Rust 整套、不复制插件代码** |
| [VeneraNext](https://github.com/CyrilPeng/Venera-Next) | [`doc/api/comic_source.en.md`](https://github.com/CyrilPeng/Venera-Next/blob/main/doc/api/comic_source.en.md) 与 [`minimal_source.js`](https://github.com/CyrilPeng/Venera-Next/blob/main/doc/examples/minimal_source.js)：`ComicSource`、`search.load`、`comic.loadInfo/loadEp`、`onImageLoad`；[`js.en.md`](https://github.com/CyrilPeng/Venera-Next/blob/main/doc/api/js.en.md) 明示 QuickJS 运行时，不是 Node / browser | GPL-3.0；不同于 Pica Library MIT；未许可前不直接搬运脚本或核心 | **参考稳定来源 ID、章节顺序、来源数据隔离、脚本兼容桥；不直接加载 JS** |
| [Delta Comic](https://github.com/delta-comic/delta-comic) | `packages/client/core/plugin`、`plugin-install`、`packages/shared/plugin/manifest`；[`Bika 插件`](https://github.com/delta-comic/delta-comic-plugin-bika) | 主程序、Bika 插件 AGPL-3.0；部分关联 SDK 声明可能不一致，应单独审查 | **只借鉴插件生命周期与模型，不复制代码或打包它的插件** |
| [Suwayomi Server](https://github.com/Suwayomi/Suwayomi-Server) | 已存在标准 GraphQL Host 与独立服务架构；Pica 代码 `src/source-hosts/{suwayomi,library-reader,connections}.ts` 和 `src/desktop/core-user-host-preview-main.ts` | 主机与来源扩展均由用户自行管理；真实运行需核实版本、协议和插件信任 | **立即复用已有 Host 组合**；不新建来源 HTTP/JS 引擎 |
| [Mihon](https://github.com/mihonapp/mihon) | Android Reader/Source 分离、外部 APK 更新与信任模式 | Apache-2.0；代码级直接复用依然要求保留许可通知，APK 扩展有权限风险 | **参考 Android UI/服务边界，短期不接入不可信第三方扩展 APK** |

## 当前代码复用资产

- **已有** `src/source-extensions/reader-contract.ts`：SourceAdapter 的作品/章节/图片键、缓存身份；`desktop-reader-adapter.ts` 接现有 OnlineReaderService；`SignedWorkerStore` 用应用内公钥验证 Ed25519 签名且安装后不自动启用。
- **事实限制**：`TrustedSourceProcess` 使用 Node 子进程，不是 OS sandbox；不能仅因为“用户自己安装”就允许执行任意 Venera/Breeze JS。后续如确需嵌入 QuickJS，应复用成熟引擎、实现独立进程/网络授权与端口权限，先通过 Windows + Android 双端样本，不得让核心联网或默认含站点 SDK。
- **本轮有可运行增量**：沿用 `stageOfflineFullWebQa` 和原 Windows `Launcher.cs`，产生普通 `reader/full-web` 与独立 **`user-host`** QA 组合；`desktop-core-preview.mjs` 始终使用无 Host 的 `app/web`，显式的 `desktop-core-host-preview.mjs` 才使用 `app/web-host` 和原 `host-library` UI。两者共用真正的 Reader/SQLite，Host 不预装、不自动连接、不默认信任来源，也不读取正式 v0.5.0 用户资料。

## R2 后续只保留两个主要验收关口

1. **外部 Host**：Windows 全套 ZIP 实体解压，核查启动两种模式、无 Host 时本地仍可阅读、用户显式授权后的 Host 搜索/章节/图片以及取消和过期会话；Android 需真实可选 Host → 原 Reader 链路。当前仅验证封装与合成服务，**尚未核实真实第三方 Host/扩展**。
2. **外置来源**：确认 1 个受支持、获授权且可信的插件生命周期（独立安装、版本更新、停用、撤销、回退）；再用第二种合法实际来源验证通用适配器。同一阅读器/进度/下载身份不串号。若 QuickJS 兼容工程比现有受签名 Worker 复杂，优先复用标准 Host，暂不新建多种插件执行器。

**禁止提前标 PASS**：真实网络来源、Android Binder/Service、发布公钥根、最终 Windows/Android 无源正式包、老用户升级回滚、签名 Release、G1–G4 均未完成。目标始终是保留 Pica Library 的书库/推荐/同步特征，用开源成熟来源方案补上可选来源，而不是把完整应用重写成 Flutter/Tauri。

