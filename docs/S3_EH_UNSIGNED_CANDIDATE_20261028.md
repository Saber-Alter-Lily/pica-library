# S3-EH-PKG｜独立来源可重复构建及未签名候选验证（2026-10-28）

**状态：Draft PR #224 / ENGINEERING_QA_ONLY / NOT_RELEASED。** 在 #223（E-H 旧 Provider 真实读链）基础上推进。正式 v0.5.0、main、OTA、用户数据、签名密钥和官方安装包未改。

## 具体实现与开源复用

- 继续复用仓库已使用的 esbuild 构建器和现有 SignedWorkerStore / Ed25519 V1 签名验证，不重复发明来源插件 ABI、签名协议或依赖解析器。
- 新增 scripts/build-eh-public-worker-candidate.ts：唯一允许的入口为 src/source-extensions/workers/eh-public-worker.ts，构建成单文件 Node 22 CJS，仅在内存中得到 bytes。固定来源 ID、仅允许三段版本号、大小上限 1MiB，使用 esbuild 的真实 metafile 对比明确列出的 9 个第一方源码文件与 Node 内置 external，拒绝 node_modules、未经审计的其它 SDK 和任意动态依赖。
- 命令行入口只输出 JSON 审核元数据，包含 sourceId、version、size、SHA-256、准确的源码依赖和 Node 内置 import；不将 worker.cjs 写出，不包含账号、Cookie、私钥或签名，也不产出可供用户安装的插件。
- test/unit/eh-public-worker-package.test.ts 实际构建两次并比较字节与 SHA-256；使用临时内存 Ed25519 密钥，验证同一 worker 字节**只有获得可信发行者签名**才能被 SignedWorkerStore 接受。即使签名安装成功也不激活、不启动，篡改字节必须失败。
- 复用 scripts/audit-modules.ts 的 TypeScript AST 真实运行时依赖图，验证新可选 E-H worker、transport、identity bridge 不在默认 Desktop、HTTP Server、local / online Reader 的传递导入闭包内；同时明确检测**旧 Desktop 仍依赖 EhProvider**，不能以此把 NEW-SRC-01 标记完成。
- Linux/Windows 的原 S3 专项 workflow 已接入新测试，上传只包含 import-graph.json 与 eh-worker-candidate.json（元数据、1 日保留）；不上传可执行 worker 或用户资料。

## 实际验证与边界

- 精确源码 70521297d78dab24eeccacda3e8e087493347532：[S3 Linux/Windows #40810352619](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40810352619) **SUCCESS**，Linux 13 文件/98 测试通过，Windows 9 文件/72 测试通过，两端 TypeScript 类型检查通过。此测试确认同 runner 重复构建确定性；**未宣称跨 OS 的二进制哈希相同**。
- 完整项目 [CI #40810412798](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40810412798) 在记录时仍运行中 / NOT_VERIFIED。不能用 S3 专项通过代替全项目 Windows/Android、UI 和旧版兼容验收。以后以精确运行 SHA 和各作业最终结论为准。
- GitHub Action 仅保存可读元数据；暂未在正式可信环境进行发布者公钥分发、生产签名、版本固定回滚、Windows ACL/AppContainer、Android 隔离进程、真实网站联网或来源独立安装。

## 后续工程门禁

| 门禁 | 状态 |
|---|---|
| S3-EH-PKG-01 可审计的真实 E-H worker 单文件构建 | 已提交并经双平台专项 CI PASS（70521297） |
| S3-EH-PKG-02 未签名不得安装、签名后必须显式激活 | 临时签名 QA PASS；正式信任根未实现 |
| S3-EH-PKG-03 包内依赖图封闭；来源 worker 不倒灌默认 Reader | 自动依赖图 PASS；正式 Core 仍含 E-H/Pica/JM |
| S3-EH-PKG-04 生产发行者公钥、不可变信任根、OS 隔离、独立交付与回滚 | NOT_IMPLEMENTED |
| S3-EH-PKG-05 正式 E-H 匿名读取联网互操作与许可证审查 | NOT_RUN |
| NEW-SRC-01 物理纯 Core Windows+Android 安装包 | NOT_IMPLEMENTED |
| G1 手机 UX / G2 来源外置 / G3 无痛升级 / G4 发布 | OPEN |

**下一切口**：在隔离 QA 候选上建立清晰的生产受信任发布根设计（密钥不进仓库）、Windows 安装根 ACL 与多进程锁审计；再逐步验证真正不含具体在线来源 SDK 的核心运行/产物。不可将同用户 Node 子进程视为 OS 沙箱，不得让可选 Host 成为本地书库的强制依赖。
