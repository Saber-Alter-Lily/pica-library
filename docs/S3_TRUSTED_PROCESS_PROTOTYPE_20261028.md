# Pica Library S3｜受控来源进程原型与外置路线（2026-10-28）

**交付边界：仅 Draft PR #220、无用户数据、无正式发布。** 本文件记录真实实现和下一步验收，不代表已经完成漫画源独立安装、SDK 外置或双端生产应用迁移。

## 1. 现有成果及继承

基于 [S2 Draft PR #219](https://github.com/Saber-Alter-Lily/pica-library/pull/219)，采用已有 `OnlineReaderService`、`OnlineReaderSource`、`SourceAccess` 和 Reader 进度/缓存机制；不再创造第二个阅读器。该分支 [S2 完整 CI #40689775058](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40689775058) 在 `3c544bd8` SUCCESS，仍为未合并候选。

参考开放源码设计：

- [Mihon](https://mihon.app/docs/faq/browse/extensions)：用户自主接入来源，但官方明确警告第三方扩展可能获取应用的完整访问权限，因此不能直接复制其第三方 APK 运行/市场机制。
- [Suwayomi-Server](https://github.com/Suwayomi/Suwayomi-Server)：来源运行时可与客户端分离；本项目只参考“Reader 与来源运行隔离”的思想，**不得要求所有本地/网盘用户自行部署 Host**。
- 此原型只使用 Node 内置 `child_process.fork` IPC、TypeScript、原有 Reader 接口；没有导入上述项目代码、私有 SDK、签名密钥或第三方漫画正文。

## 2. 实现文件与技术责任

| 文件 | 实际内容 | 限制 |
|---|---|---|
| `src/source-extensions/trusted-process.ts` | 显式受信任路径与 SHA-256 校验、Node IPC 进程、随机会话握手、并行上限、请求超时、MIME/媒体上限、崩溃/撤销失效 | 当前仅 QA 进程协议；同用户权限进程**不是**系统级安全沙箱 |
| `test/fixtures/s3-trusted-worker.cjs` | 本仓内无账号/无网络的模拟来源；章/页/图片/挂起/迟到响应/异常退出/错误媒体 | 不含 Pica、E-H、JM 具体来源能力 |
| `test/unit/trusted-source-process.test.ts` | 真实 fork → Reader → 缓存/进度，错误 Hash/路径/握手，环境变量隔离，超时和撤销，非法媒体和故障恢复 | 使用合成数据；与真实来源账号和用户书库没有交集 |
| `.github/workflows/s3-trusted-source-process.yml` | Linux 和 Windows 分开执行真实进程回归，typecheck，1天证据保留 | 不是安装包/物理 Android 设备验收 |

进程由**应用的受控组合入口**明确创建，不接受来源 manifest 提供可执行脚本地址。单个工作进程的文件路径必须位于预先给定的可信目录，且完整内容 SHA-256 与受信任期望值一致；工作进程不继承父进程的 `PICA_*` 凭据、`NODE_OPTIONS` 或命令行加载配置。实际执行身份、可写目录的 TOCTOU、完整依赖闭包、操作系统权限和签名链必须在后续正式集成中单独解决。

传输格式采取随机会话标识、版本化请求序号、固定操作枚举（握手、章节、页信息、媒体）和 fail-closed 验证；媒体仍使用 S2 统一的来源-作品绑定 token，不以裸 HTTP URL 猜测来源。禁止超限消息、过多请求、过期会话或撤销后的缓存命中。工作进程非正常退出或超时时拒绝所有待处理操作，**不会悄悄自动重新连接或重新启用来源**。

S3 实测证据：[Linux + Windows 真实进程专项 CI #40690767200](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40690767200) 在代码 `a785af6f` 下 **SUCCESS**；两套独立工作均经过 TypeScript 校验，Windows 工作流真实执行本仓 worker、IPC、撤销、超时、媒体和身份的集成测试。它只证明签名前的测试代码路径，不能代替正式版 Windows 工件签名/安装/更新。最新完整项目 CI 需按同一 SHA 独立核实。

## 3. 可追踪验收矩阵

| 编号 | 验收内容 | 证据 | 当前状态 |
|---|---|---|---|
| S3-PROC-01 | 受信任文件 SHA/路径核验、版本和来源握手 | 集成测试 | Linux/Windows 双平台专项 PASS（源码 a785af6f） |
| S3-PROC-02 | 真实独立进程的章节→页→媒体→Reader 进度 | 集成测试 | Linux/Windows 双平台专项 PASS（源码 a785af6f） |
| S3-PROC-03 | 禁源、迟到回复、进程退出/超时、缓存失效 | 集成测试 | Linux/Windows 双平台专项 PASS（源码 a785af6f） |
| S3-PROC-04 | 父进程敏感环境变量不传给来源进程 | 集成测试 | Linux/Windows 双平台专项 PASS（源码 a785af6f） |
| S3-PROC-05 | 固定协议、输入校验、媒体大小/格式限额 | TypeScript + 集成测试 | Linux/Windows 双平台专项 PASS（源码 a785af6f） |
| S3-WIN-01 | 实际 Windows 同源码跨进程可用，且随签名包交付 | Windows QA + 发行物哈希 | NOT_VERIFIED |
| S3-AND-01 | Android 隔离 Service/Binder、无来源权限/凭据泄漏 | 真 APK + 原生 Instrumentation | NOT_IMPLEMENTED |
| S3-EXT-01 | Pica/E-H/ExH/JM 具体协议完整移出纯核心 Windows/APK | 依赖图+包内逐字节+离线 Reader | NOT_IMPLEMENTED |
| S3-LIFE-01 | 单源独立启用/更新/撤销/回滚不伤已收藏/下载/阅读 | 实际来源与故障注入 | NOT_IMPLEMENTED |
| S3-DATA-01 | v0.5.0/Dev 的旧来源、数据、签名、升级保持兼容 | 双端用户隔离迁移测试 | NOT_IMPLEMENTED |

**绝不将前五项的成功替代后五项，更不能以关闭默认来源或仅移走 JM JVM 宣称 SDK 已外置。**

## 4. 接续开发顺序

1. 核实 PR #220 精确提交的 Linux/Windows 子进程测试与全量 CI，修复真实失败，冻结协议第一版和负向安全测试。
2. 在现有 `ProviderService` 的受控组合入口内增加“已批准工作进程”选配通道，保持旧三源完整兼容，先用隔离本地模拟源证明进程启动/关闭/恢复不改 Reader 核心。
3. 在 **Windows QA 独立工件** 内验证实际 process-tree、资源占用、故障恢复与 SHA/版本许可，不把用户控制目录中的任意脚本当已信任来源。
4. 为 Android 设计 Binder/AIDL 隔离服务（优先考虑 app 受控 Service + 严格数据 DTO，必要时使用独立 UID 或签名权限），明确访问账号和媒体句柄的权限边界，并建立真实 APK 自动化测试。
5. 单独迁移一个已有真实来源，验证取消、账号授权、章节/页身份、下载、缓存、网络关闭/重启；在安全和兼容确证前不允许一键启用未经审核的可执行插件。
6. 最后实现无源 core 安装包、适配器安装/撤销与安全升级交易，双端比对旧 v0.5.0 数据与回滚；G2/G3 与 G4 仍需各自独立验收。

当前阶段 **`S3=IN_PROGRESS/ISOLATED_PROTOTYPE`，`G2=OPEN`，`G3=OPEN`，`G4=OPEN`**。主程序 main、正式 Release、稳定 OTA、账户、下载文件及个人书库均未修改。
