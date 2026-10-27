# T3：独立首次迁移云端门禁（未执行设计快照）

用户已明确批准：只在 GitHub 临时 Windows runner 使用固定公开 v0.5.0 和合成资料，独立验证 T3。不在本机运行，不访问正式资料，不合并/发布/OTA/部署。新分支 `codex/legacy-transition-t3-20261026`；PR213/Dev88 固定 `40b3a555cb0dcb1732fe0f80ba5cb152d1fa136a`，原包/原始失败不动。本文件不是 PASS 记录。

## 有限范围与出口

| 场景 | 必须证明 |
| --- | --- |
| preview-cancel | 实际生产器绑定固定旧包、精确干净源码、目标 Node/helper/载荷及许可；未发布包实际入口只预检；真实终端取消无修改 |
| integrity-rejections | 旧文件/载荷哈希及目录/资料错配拒绝；拒绝前不暂存/替换，不读取正文或展示秘密 |
| running-refusal | 选中旧程序仍运行则拒绝，不凭 PID 猜身份、不终止它 |
| concurrent-entry | 两次确认至多一个获得迁移所有权；另一次明确拒绝，不能重复写入/覆盖恢复材料 |
| success-forward | 原 v0.5.0 → 独立入口 → 当前引擎完成、真实应用就绪、逻辑状态/下载字节保留；之后正常软件内更新到第二个合成版本 |
| launch-rollback | 外部夹具触发一次异步启动失败，原应用树/资料恢复、旧程序实际可运行、明确终态 |
| health-rollback | 实际目标启动但健康响应失败，保留原 60 秒期限；停止并确认目标退出后恢复，旧程序可运行 |

这是 UPD-01..08 内的工程场景，不增加产品案例，不替代真实 Host/第二来源、真机/手势/标签/AI/同步、物理断电或集中人工验收。同一根因至多两轮有证据修复，之后路线评审，不改弱门禁或重复原样构建。

## 复用与证据层级

复用现有 `buildLegacyTransitionAssistant`、`handoffLegacyTransition`、进程所有权/锁/ACK、全量事务/恢复引擎、固定旧包、合成逻辑状态和现有 v0.5.2 惰性发布夹具。不写第二套升级器。真实终端使用微软 [node-pty v1.1.0](https://github.com/microsoft/node-pty/releases/tag/v1.1.0)（[MIT/版本](https://github.com/microsoft/node-pty/blob/v1.1.0/package.json)），只装入 runner 临时工具目录，不进应用依赖。Playwright 沿用 1.63.0。不得伪造 `stdin.isTTY` 或增加产品执行旁路。

现有产品正确拒绝带 `TEST_BUILD.txt` 的另一资料通道，也只允许 stable 绑定入口执行。为测试而在**临时 runner 内**用标准生产器构建数值版本 0.5.1/0.5.2、正式资料布局但仅指向该 runner 的合成 LOCALAPPDATA；仅版本元数据构建覆盖，源码/旧 helper 字节不修补。执行夹具使用内部绑定的 synthetic stable authority，未发布夹具仍必须只读。没有真实 tag/Release、没有版本占用或候选正式发布；预期 provenance URL 不是已解析/认证的公开发布事实。

因此成功只能证明内部已绑定来源下的入口/事务行为；不能宣布正式分发信任链、真实 OTA、人工双击/OEM或所有历史版本已验收。真实 `.cmd` 未发布预检与真实 ConPTY JS 入口/故障注入分列。外部 preload 只用于界限观测、惰性发布、已说明的负向故障，不返回虚构健康成功、不改 helper/指令/期限。所有正文/账号均为无账号合成资料，状态比较为逻辑值而非要求正常启动后 SQLite 文件字节不变。

## 禁止交付原始夹具

可执行的 synthetic stable 工具/目标/引导脚本只留在临时 runner，不作为 artifact 上传、不给用户安装、不部署。仅上传精确白名单的结果、版本/来源/哈希/许可回执及有界脱敏诊断。失败保留原始原因；现有旧内置两条首跳失败不重新判 PASS。当前全部 T3 运行结果仍 NOT_RUN。
