# S3 Windows Portable｜纯核心临时打包与实际启动验收（2026-10-29）

**状态：Draft PR #230；只在 CI 临时目录生成并解包测试，不公开发布 ZIP 或签名。** 继承 #229 通过的纯本地 ESM Reader + 10 文件 Web 资源装配。正式 v0.5.0/main、用户账号/书库/下载、OTA、Android 包名与签名全部保持不变。

## 实现范围

- `scripts/build-windows-offline-portable-qa.ts`：沿用项目既有 esbuild `buildOfflineCoreCandidate()` 和 `stageOfflineReaderAssetsQa()`，在 Windows x64 OS 临时目录创建一个未签名的 Portable 树，内含 `app/core.mjs`、`app/web/` 原 Reader 的 10 个资源、`runtime/node.exe`、`Start-Offline-Reader-QA.cmd`、本地 QA 使用说明、根 `LICENSE` / `NOTICE.md` / `UPSTREAM.md` / `DISCLAIMER.md`、`licenses/Node.js-LICENSE.txt` 和 `licenses/AdmZip-LICENSE.txt`。不装载其他在线来源、Host、账号、推荐或整套正式 `web/app.js`。
- Node 版本固定 **24.15.0**，与原正式 Windows 打包代码的运行时版本一致。CI 从 nodejs.org 官方 HTTPS 分发目录读取 Windows x64 ZIP 和 SHASUMS256 清单，实际检验两者匹配；额外独立固定**整个运行时 ZIP 的 SHA-256** `cc5149eabd53779ce1e7bdc5401643622d0c7e6800ade18928a767e940bb0e62`，避免同版本文件无审查被替换；只提取官方 `node.exe` 与原 LICENSE。使用 `node.exe --version` 验证来源。
- 严格清单：**20 个普通文件 + BUILD-MANIFEST.json，共 21 个 ZIP 条目**。逐文件记录大小与 SHA-256，源码 SHA、准确运行时版本、官方 ZIP 哈希、`sourceCount: 0`、`signed: false`、`userInstallable: false`、`publishAuthorized: false` 和 `otaChanged: false`。ZIP 在 CI Temp 创建、随后解压实际运行后删除；**只上传一天保留的 JSON 清单、完整性及验收摘要**，不上传 `.zip/.exe/.mjs`。
- Windows `Start-Offline-Reader-QA.cmd` 是独立便携 QA 启动脚本：仅当用户显式指定一个已经用 `init --confirm-disposable` 建立的**隔离 QA 书库绝对路径**才会启动。不会创建用户目录、访问无标志旧数据、执行任意来源组件、下载更新或以管理员权限安装；进程自动分配 loopback 随机端口并打印一次性阅读入口。它不等于正式 Win32 Launcher 或源代码保护机制。
- `scripts/verify-windows-offline-portable-qa.ts`：审计真实 ZIP 实际条目列表、每个压缩及解压文件的字节哈希、许可证与禁止文件；在另一个临时目录解压，再从解压包**运行其自带的官方 node.exe**，检查 Windows x64 平台信息、启动器无参数拒绝及**通过实际 .cmd 正向启动**、本地 PNG 文件夹导入、章节/图片 HTTP GET、会话 Cookie、伪造 Host 拒绝、源路径不可访问、受控 POST CSRF/页码写入，并终止整个临时 cmd/Node 子进程树后，重新运行 SQLite Reader 检查进度恢复和原图完整。
- 仅对已核实为 `name=adm-zip`、`license=MIT` 的 pnpm 许可证文件允许 pnpm 内容寻址仓库固有的 hardlink；Node.exe、官方 LICENSE 及其它输入维持原严格文件类型/非符号链接检查，不放宽脚本执行文件校验。

## 真实 CI 与失败历史

- 第一轮 [#40837813326](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40837813326) **FAIL**：官方 Node 下载与 SHA 校验通过，打包时 pnpm 硬链接的 AdmZip 许可证被通用硬链接拒绝规则拦截。限定到审计过的 npm 包许可证后，[#40838038263](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40838038263) 对代码 `d886e9fc` **SUCCESS**，真实创建/解压 ZIP、执行随包 Node、Local Reader 和保护性 HTTP 测试，元数据（非可执行物）已作为短期 Actions Artifact 留存。
- 之后增添官方运行时独立哈希 pin，[#40838344251](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40838344251) 对代码 `3945a590` **SUCCESS**。
- 首次将直接 CMD 启动纳入测试时，[#40838531135](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40838531135) **FAIL** 于测试验证脚本的旧函数类型引用；修复后精确最新可执行代码 `0ca6f6e8aaf614751d6c32d0302427961df41432` 的 [Windows 实体 QA #40838638638](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40838638638) **SUCCESS**，包括实际 `.cmd` 启动和关闭进程树后的阅读进度重启恢复。保留失败历史，不把前轮结论冒充当前通过。
- 同源完整 [Android + Web/Desktop CI #40838644597](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40838644597) 在本文登记时仍运行中 **NOT_VERIFIED**，以实际 SHA 完成后的作业结论为准；本 PR 不是完整产品发布门禁。

## 严格尚未完成

| 验收项 | 当前状态 |
|---|---|
| S3-WIN-PKG-01 原 Reader/SQLite/CBZ 与 Node x64/资源清单组成可运行 ZIP | **隔离 Windows QA PASS** |
| S3-WIN-PKG-02 官方 Node SHA、精确 hash pin 与 Node/AdmZip/project 许可证 | **隔离 Windows QA PASS** |
| S3-WIN-PKG-03 实际 Windows CMD 启动、本地 HTTP/Session/CSRF 和异常终止恢复 | **隔离 Windows QA PASS** |
| S3-WIN-PKG-04 全功能正式 Windows GUI、完整书库/推荐/本地网盘管理、不含站点 SDK 的生产包 | **NOT_IMPLEMENTED** |
| S3-WIN-PKG-05 正式签名发行、可信安装根、独立在线来源授权/更新/卸载/撤销 | **NOT_IMPLEMENTED** |
| S3-WIN-PKG-06 v0.5.0 实际用户书库/账号/下载/进度原位无痛升级、自动回滚 | **NOT_VERIFIED** |
| S3-WIN-PKG-07 Android 物理纯核心 APK、隔离来源 Service/Binder 与真机 UI | **NOT_IMPLEMENTED** |
| G1/G2/G3/G4 正式产品验收 | **全部 OPEN** |

**后续主线**：先从已验证的 Portable 文件清单升级为正式 Windows Core 的**完整 Web/Library 业务模块化组合**，不复制第二套 Reader/下载/推荐，并尽量沿用 v0.5.0 数据库和升级助手；同时设计原本在线来源 SDK 的独立可信发行、OS 权限隔离和回滚；然后与 Android 等效实现及旧用户升级/真机清单逐项核验。**临时 Node 子进程不是 OS 沙箱，纯本地 QA ZIP 不是可发布的正式客户端。**
