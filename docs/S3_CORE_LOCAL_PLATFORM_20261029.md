# S3 CORE-LIB-03c | 原正式 Desktop 本地配置、文件夹与受限系统目录能力拆分（2026-10-29）

**工作分支 / Draft PR：** `codex/s3-core-local-platform-20261029` / [#236](https://github.com/Saber-Alter-Lily/pica-library/pull/236)；**基线：** 已通过 CI 的 #235 WebDAV 共用端口。正式 `main` / v0.5.0 / OTA / 已安装用户数据 / 安卓包签名未更改；本轮不迁移账号或数据库。

## 修改真正的产品代码，不增加第二套独立 Reader

1. `src/library/core-local-config.ts` 从旧 `src/desktop/config.ts` 抽取**原有**的本地路径/下载配置校验、Reader 设置归一化、保存配置机密检查，以及 `config.json` 以 `.tmp` 文件原子改名的存储路径。只允许 Node 内置模块、旧 `web/reader-settings.js`、原 `sqliteDiskFilename` 的运行时 import；只通过 TypeScript 类型引用旧 `DesktopConfig`，不实例化账号/来源/Host。
2. `src/desktop/config.ts` 仍是原正式 Desktop 的兼容外壳：`buildLocalConfig` 向 core 提供 `sourcePolicyForConfig(current)`，老用户在从 v0.5.0 过渡时不会因为无源拆分而丢失原 `externalSources`。`loadConfig/saveConfig` 调用 core 读取/写入的原路径，同时由旧入口对原来源选择 `normalizeSourcePolicy` 保持校验。旧 Pica 登录、Proxy 分离、JM/E-H/WebDAV 凭据和其他用户设置逻辑没有改写。
3. `src/library/core-local-platform.ts` 将原 `POST /api/v1/desktop/choose-folder` 与 `open-directory` 匹配、执行变成**注入的系统能力**，不在 Reader/Core 中调用 Shell 或从 HTTP 接收绝对文件路径；只认可 `data`、`logs`、`personalization`、`packs` 与已有 `browser-lite-export` 五种目录用途。拒绝 `__proto__`、路径穿越、任意 `command`、额外 HTTP 字段。原 `src/desktop/main.ts` 仍经已有 `DesktopNativePicker` 和 `launchDirectory` 执行系统操作，只是使用同一个固定用途映射来选本机路径。
4. **原正式** `src/library/server.ts` 的两个 HTTP 入口改用纯 core 动作路由，仍在原有 Desktop 登录/Origin/CSRF 保护上下文；`open-directory` 请求体现在限制为 4 KiB 并仅允许 `kind`。其余首页、Reader、网盘及更新 URL 保持原响应和路由设计。
5. 这些模块不是新的小游戏、插件加载器或另一套书库；真正复用原正式生产 API 与保存语义。暂时不把本机系统目录操作暴露给签名 worker、任意来源插件或手机侧。

## 新增验证与实测结论

- `test/unit/core-local-config.test.ts`：真实临时配置文件，比较旧 Desktop 的默认值、保存字段及配置与纯 core 读写完全一致；旧阅读设置归一化、绝对路径/profile/Proxy、密钥和明文字段拒绝、空/损坏配置、磁盘未自动建 DB、TypeScript AST 依赖闭包。
- `test/unit/core-local-platform.test.ts`：原两个 POST 路由、缺失主机、原生选择器取消、合法/非法目录 ID、原型属性以及任意命令/路径拒绝。
- 扩展 `test/unit/local-library-http.test.ts`，在真正的 `startLibraryServer` 和原假定本机原生选择器上验证两个 POST、CSRF、非法路径不执行、合法日志目录执行后，继续验证本地文件导入、书架、Reader、移动配对等原有功能。
- 原 `test/unit/desktop-config.test.ts`、`desktop-native-pickers-p4b2.test.ts` 与 `module-dag-policy.test.ts` 仍加入本阶段 Linux/Windows 专项，未删除或跳过。
- [Linux/Windows 两平台、原 Desktop 路由＋本地配置专项 #40857679928](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40857679928)：**SUCCESS，两平台全部测试与 typecheck 通过**，精确提交 `9a0b3a43d91b5b50d57a3320bffbcd3a14ea8c52`。
- [完整 Android/Web/Desktop CI #40857731995](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40857731995) 于最初文档编写时仍在运行，**不能提前写为 SUCCESS**。仅以该 run/后续精确 SHA 结果判断。

## 重要未关闭项：CORE-LIB-04 与发布关口

现有 `src/desktop/main.ts` 仍**启动 `LibraryService`**，`src/library/server.ts` 仍**创建 `ProviderService` 和多个来源相关推荐/维护服务**。`CORE-LIB-03c` 只是把可共用的本地设置与 OS 能力从来源启动的主程序中抽出来；这**不等于**正式用户看到的 Windows 全功能界面已纯核心化，更不是 `NEW-SRC-01` 或 G2 通过。

下一阶段 **CORE-LIB-04a** 应先盘点原 Windows Web 首页启动依赖和真实 HTTP/UI endpoints，在不另造一套 UI、Reader、数据库或推荐算法的前提下设计原 `src/library/server.ts` 的 core-only composition，并验证无 `LibraryService/ProviderService` 启动时本地作品/书架/Reader/设置/WebDAV 可以用。实际无需来源的服务要从旧 composition 拆掉硬依赖，缺失 Provider 时 UI 应显式标记来源/推荐功能不可用而非黑屏或发起账号探测。该阶段只能在独立 Draft 中开发。

**后续顺序：** CORE-LIB-04 真正旧 Windows 全 UI 核心组合 → 实体 Windows 核心包 SDK 零依赖/可信来源安装、停用与独立升级 → Android 核心 APK 与 Service/Binder → 原 v0.5.0 客户端的旧数据/账号/漫画/偏好/下载和更新助手安全迁移及回滚 → 实体设备和 42+12 项原始验收 → 最终发布。

**G1–G4 均 OPEN；** PR #232 与 #233 为竞争性书架实现，合并前必须单独差异核对，禁止直接叠加合并冲突。CI 自动化通过不代表用户报告的手机版 UI 缺陷已经关闭。

开放第三方来源/用户选择来源并不自动消除版权、使用条款及其他法律责任，实际发行仍须做专门审核。
