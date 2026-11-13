# S3 CORE｜无来源 SDK 的本地阅读核心：独立实体 QA（2026-10-28）

**范围：Draft PR #226；纯本地 QA 候选，不可安装为正式 Windows 软件，不接收真实 v0.5.0 书库。** 原 main/v0.5.0、用户账号/数据库、Android 签名、Release/OTA 未更改。

## 复用而非重造

沿用现有 LibraryDatabase、LocalLibraryIngestion 和 ReaderService，依赖现有 esbuild 与 AdmZip，构建唯一 Node 24 ESM 文件。未写第二套 Reader、未复制 CBZ 解析器、未建立来源安装器或网络服务。新的 src/offline-core/qa-cli.ts 只用于完整进程测试：init、status、list、import、chapters、chapter、picture、progress、history。

import 强制指定 --confirm 后才执行原有的 preview→confirm；progress 明确写入时也必须 --confirm。picture 仅输出 MIME、字节数与 SHA-256，绝不输出实际用户媒体。仅可初始化**不存在**的测试目录，后续严格校验单独 QA sentinel；已有 v0.5.0 目录及没有 sentinel 的数据库必须在打开 SQLite 前拒绝。禁止启动 Host、连接 Provider 或自动下载。

## 物理二进制依赖证据

- scripts/build-offline-core-candidate.ts 使用 esbuild 的 metafile，要求真实打包输入同时包含本地 CLI、SQLite 数据库、本地导入及 Reader；禁止 src/sdk、src/providers、src/desktop、src/source-extensions、src/source-hosts、remote-api、在线 Reader/ProviderService、Android/JVM 源码进入可执行闭包。
- 只允许此前已有的 AdmZip npm 依赖与 Node 内置 external；所有新增第三方依赖或内部站点模块都使 CI 失败。Node ESM 需要原来的 createRequire(import.meta.url) 以加载 node:sqlite/AdmZip，并未复制 SQLite 实现。
- 初测发现 AdmZip 的 Electron 专用可选 original-fs 依赖；没有删除检查或将未知模块标记安全，仅对这个 Node-only QA 编译实例将 original-fs 明确映射到 node:fs，正式应用打包规则未修改。
- 脚本只生成可读 SHA-256/大小/源码模块/依赖 JSON；不把 runnable core.mjs 放进 GitHub Actions Artifact。仅自动化测试在临时目录实际写出并启动内存构建的程序。测试使用短期完全隔离的临时数据，不读取账号/原书库。

## 实际 Linux / Windows 独立验证

测试 test/unit/offline-core-candidate.test.ts 包括连续两次构建的字节一致性、真实操作系统启动不同 Node 进程、文件夹及 CBZ 导入、章节列表/页数/内容哈希、明确保存阅读位置及跨进程恢复、原始 PNG/CBZ 不被更改、无 --confirm 的操作拒绝、现有非测试数据库拒绝且保持原字节。另并行运行已有本地导入、Reader 和模块 DAG 回归。

- 精确源码 **bc1539515aa0f5b41dfbedb0b3b0a47df3744609**： [S3 独立核心双系统 #40821030082](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40821030082) **SUCCESS**，Linux 4 文件/26 项通过，Windows 4 文件/26 项通过，双平台 TypeScript 检查通过。真实可执行文件在 CI 临时目录内启动。
- 先前失败 #40820738241、#40820815297 的原始证据保留，错误为 AdmZip optional original-fs 未审计的 external；后续经明示本机映射修复。不能删除错误历史来冒充首次就成功。
- 对同一代码的 [完整项目 CI #40821035105](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40821035105) 在本文件生成时仍待最终核验；专项成功不代表正式 UI 与 Android 通过。

## 明确尚未完成

| 门禁 | 状态 |
|---|---|
| S3-CORE-01 不含来源 SDK 的实体本地 Node 核心 | **隔离 QA PASS**（代码 bc153951；Linux/Windows） |
| S3-CORE-02 把当前 Desktop Web UI/HTTP 路由与纯核心组合，无 ProviderService 初始化 | **NOT_IMPLEMENTED** |
| S3-CORE-03 正式 Windows ZIP/启动器、许可证及签名可执行物源闭包 | **NOT_IMPLEMENTED** |
| S3-CORE-04 Android 完全无来源协议 APK 与权限隔离 | **NOT_IMPLEMENTED** |
| S3-CORE-05 v0.5.0 旧账号、原版书库/下载/进度原位无痛升级、故障回滚 | **NOT_VERIFIED** |
| S3-CORE-06 网盘 WebDAV / 可选 Host 与 Reader 的真实 UI 对等性 | **NOT_VERIFIED** |
| G1/G2/G3/G4 产品验收与正式发布 | **全部 OPEN** |

**下一技术切口（依既定计划）**：梳理现有 src/library/server.ts 对 LibraryService/ProviderService 的直接运行时耦合，将已有本地 Reader HTTP 端点提取为可被纯核心及旧 Desktop 双方复用的中立路由模块；拒绝另造一个 Reader 或第二套 SQLite；在取得受信任组件分发根和安全安装方案之前，不允许用户安装/执行任意来源代码。待共用 Web UI 真正无源运行后，再建立 Windows 实物安装包和 Android Service/Binder 对等实现。
