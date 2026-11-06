# T3：独立首次迁移云端门禁

用户已明确批准：只在 GitHub 临时 Windows runner 使用固定公开 v0.5.0 和合成资料，独立验证 T3。不在本机运行，不访问正式资料，不合并/发布/OTA/部署。新分支 `codex/legacy-transition-t3-20261026`；PR213/Dev88 固定 `40b3a555cb0dcb1732fe0f80ba5cb152d1fa136a`，原包/原始失败不动。本文件不是 PASS 记录。

## 最终工程结果补记（以下准备/失败快照保留）

精确源码5f4b7ead0fcd4faff0974450adf65bdc910717f2：[T3运行40444592760](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40444592760)七组全部PASS，[CI40444597333](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40444597333)Web/Desktop及Android通过。23份实际诊断独立核验：真正0.5.2/200capabilities/200HTML、完整目标树与选定合成状态保留，12条瞬时探测/console一对一对应，HTTP错误0、边界/清理失败0，健康负响应跨度58952ms/产品期限60000ms。

116成员工程复核包SHA2564c8909ef67eccb79ca1106231f491acfd867e31afe0086481beb3be6070a3296，另用.NET核对115个payload哈希，无安装器/可执行stable夹具/正文/数据库/秘密。原2/7、6/7、诊断6/7不重写。PR214冻结Draft、不合并/发布/部署；旧恢复限支持headless CI范围，不证明公开分发信任、真实用户资料、交互默认LAN或物理/OEM验收。当前专项收口，后续回到来源互操作，不继续增加升级功能。

## 最新归因与最小产品修正

诊断源码`d292f70ade0aec07c158ef879b16e5512554fab1`/[运行40442777436](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40442777436)仍6PASS/1FAIL，全部23份诊断已核验。唯一400是首屏`POST /api/v1/recommendation-events`；源码中`renderAll`无条件调用推荐渲染，空状态也提交`recommend_batch_presented`，而服务端必须有cycle/batch上下文。实际客户端函数的惰性端口复现得到2FAIL/115PASS、0本地IO审计事件，保留红灯；这不是迁移事务或合成作品ID问题。

唯一产品修正位于`web/app.js`：没有真实cycle/batch/非负整数批号/非空项目时不提交该展示事件。真实批次原字段及普通search/feedback事件仍通过原单事件接口；服务端验证、数据库、排序、Visual及状态表不变。PR213/Dev88原成品仍封存，不冒充已包含新修正。

其余连接拒绝均发生在已收到apply成功之后、新文档重载之前，且仅为现有`update-reconnect.js`的`GET /api/v1/capabilities`和`GET /?pica-update-ready=<timestamp>`。新增精确分类：同一应用origin、fetch/GET、仅ERR_CONNECTION_REFUSED、已有90000ms重连上限内，console消息必须与真实失败请求按URL和1秒时序一对一对应。必须随后读到真实新版本0.5.2、200capabilities和200HTML页面，否则不能豁免。所有HTTP错误（尤其原400）、页面异常、其他请求/来源/时段/错误类型均继续失败。**此处明确修正“连正常停机探测也要求零资源消息”的测试语义，不声称字面断言完全未变，也不采用旧测试的全资源错误排除。**产品健康60000ms、重连90000ms、来源/进程/网络守卫不变。新精确源码及全七组仍须云端通过。

## 首轮执行与有证据的夹具修正

最新`ad7040aabb4eb87626062a9b4fe79e5e7a01e3d1`的[T3运行40441168209](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40441168209)在约6分钟内正常以FAIL退出，不再等55分钟取消。**6/7通过**；launch/health回滚按已声明的旧headless隔离范围通过，健康负响应跨度58740ms，产品期限60000ms。success-forward已完成迁移和下一次应用内更新、实际0.5.2就绪及树/合成状态核对，但最后浏览器无错误断言捕获1个400和12个连接拒绝，整体仍FAIL。全部23份下载诊断静态核验、所属进程清理及网络/进程边界通过，常规CI40441171189两job通过。首轮和本轮原始失败均保留。

现有错误文本没有请求身份，不能断言400是可忽略项或将全部连接拒绝当重启噪声。下一轮**仅增加有界请求诊断，不放宽断言**：接口/静态资源路径、HTTP状态、请求失败代码、相对时间与UI阶段；不存host/port/query/fragment/凭据/请求或响应正文，超界仍FAIL。按证据决定是否产品修复，不直接复制旧门禁对所有“Failed to load resource”的宽泛排除。

精确源码 `1360c5ce2e559d5c7b53b849e036b86375c13363` 的常规 [CI40433450181](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40433450181) Web/Desktop 和 Android 通过；独立 [T3运行40433426476](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40433426476) 为 **FAIL：2项通过、5项失败**。七份场景结果已写入，但控制进程未退出，最终在55分钟job上限被取消。不能把控制器不退出等同于迁移事务运行55分钟，也不能用已成功的子断言改判场景通过。

| 场景 | 首轮结果与已核实原因 |
| --- | --- |
| preview-cancel | FAIL；真实ConPTY已可用，但`.cmd`的绝对路径被重复转义，cmd未执行入口。改为在工具cwd直接运行批处理名。 |
| integrity-rejections | PASS；原旧树/目标载荷及路径角色错误被拒绝。 |
| running-refusal | FAIL；创建日志WriteStream后尚未等fd打开就传入spawn。改为等待两个open事件。 |
| concurrent-entry | PASS；两个确认仅一个helper获准，真实目标就绪且合成状态保留。 |
| success-forward | FAIL；独立迁移已完成，但浏览器在首启引导出现前检查可见性，随后导航被welcome/确认框挡住。改为等待真实welcome、点击“稍后”、等待隐藏；不force-click或写浏览器状态绕过。 |
| launch-rollback / health-rollback | FAIL；两者均已保留失败终态、恢复旧程序树并实际重启旧程序，健康失败保留60000ms期限；但旧程序交互默认会尝试监听`0.0.0.0:7788`，被外部安全夹具拦住，整体仍失败。 |

旧公开源码固定 `bec7f9f31828e8c57e0a2c103b6b1206c22c37cf` 的runtime-mode已有`--headless`选项；只有精确哈希证明为旧desktop的进程，外部CI preload才追加该已有选项。新desktop仍用交互模式完成真实浏览器更新。**这只是支持模式下的CI隔离，不修补原包，不证明旧版交互默认LAN已修复或已验收**；全部非回环监听/请求和进程安全断言保留。回滚证据须标注`SUPPORTED_HEADLESS_CI_CONTAINMENT_ONLY`及`NOT_ACCEPTED_NOT_FIXED`。

控制器在全部结果同步落盘及所属进程清理检查后，记录`getActiveResourcesInfo()`的资源类型并按真实汇总状态显式退出；不是把FAIL退出码改成0。首轮没有资源类型记录，残留句柄的具体类型尚不能确证。仅收紧CI job/场景步骤外层上限至25/15分钟，产品60000ms健康期限不变。以上为第一次有证据的夹具修正；新精确源码运行仍待执行，不据此宣布T3通过。

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

可执行的 synthetic stable 工具/目标/引导脚本只留在临时 runner，不作为 artifact 上传、不给用户安装、不部署。仅上传精确白名单的结果、版本/来源/哈希/许可回执及有界脱敏诊断。失败保留原始原因；现有旧内置两条首跳失败不重新判 PASS。当前T3首轮FAIL，夹具修正后的精确源码运行尚未完成。
