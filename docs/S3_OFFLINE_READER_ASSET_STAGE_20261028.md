# S3 CORE-WEB-STAGE｜本地 Reader 静态资源独立装配（2026-10-28）

**交付范围：Draft PR #229，叠加 #228。** 仍仅在隔离、未签名的 QA 工作目录内使用；不改变 main/v0.5.0/Release/OTA、用户书库/账号或 Android 签名。

## 为何要做

#228 的本地实体 Core ESM 能在 Linux/Windows 自己运行并提供安全回环 HTTP，Chromium 成功使用旧 Reader 控件。但它仍从开发 Git 工作目录读取 `web/index.html`、样式和模块，缺少脱离源码仓库运行的 UI 资源清单。如果直接照旧装配，会把账号、推荐、来源管理脚本等无关内容混入纯核心候选。

## 实际代码

- `scripts/stage-offline-reader-assets-qa.ts`：从当前版本的正式 `web/index.html` 逐字节提取唯一 `section#reader` 片段至 `reader-fragment.html`，只拷贝 9 个明确列出的已有脚本、CSS 和图标文件；**不拷贝完整 index.html、app.js、eh/jm-account、source-hosts、recommendation**。保持旧 UI 的真实 Reader DOM、CSS 与 input/viewport/progress/settings 代码，未复制第二套漫画 Reader。
- QA stage 必须是 OS 临时目录中**不存在的**子目录，不覆盖旧内容，拒绝软链接/非普通源资产、限制文件大小。每个文件计算 SHA-256、大小且写后回读；生成仅可读元数据，未发布任何可执行工件或签名来源包。
- `src/offline-core/qa-http.ts` 可识别同程序旁 `web/reader-fragment.html`，无该片段才允许此前仓库开发模式从原 `web/index.html` 提取；实际生产服务尚未引入。只把已授权的原 Reader 片段组合进 QA 页面，继续保留随机入口 URL、HttpOnly SameSite Session、Origin/CSRF、严格本机 Host/Peer、CSP、资源白名单及本地 API。
- `src/offline-core/qa-cli.ts` 优先从**实体 ESM 可执行文件旁**的 `web/` 加载这批白名单资源，而非依赖进程当前目录。CI 用另一个独立临时目录作为 cwd，验证离开 Git 工作目录后依然能阅读。
- `scripts/qa-offline-browser-harness.ts` 和 `test/unit/offline-core-http-ui.test.ts` 均实际 stage 资源并从非仓库 CWD 启动子进程。`test/unit/offline-core-web-stage.test.ts` 检查清单确定性、原 Reader 片段逐字一致、10 文件精确集合、仅允许已复制脚本相互导入、旧完整前端的账号/来源/推荐脚本缺席、已存在目标目录拒绝、非临时目录拒绝。

## 真实失败与修复记录

- 第一轮 [S3 #40827089058](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40827089058) **Linux 33/33 PASS、Windows FAIL 3项**：Windows 的 Temp 目录长/短文件名或规范化拼写差异导致原代码在未规范化 child path 与已规范化 temp root 之间错误判断越界。
- 源码 `8ed7d80cf0cdb79a3571c13bc62d20fbc5269197` 修复为对**现有父目录和 OS 临时根都使用 native realpath**再计算相对关系，目标目录仍须不存在，且不放宽对非临时位置的拒绝。原失败记录不删除。
- 新 [S3 #40827250488](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40827250488) **SUCCESS：Linux 7文件/33/33，Windows 7文件/33/33，两端 TypeScript PASS，真实 Chromium 1/1 PASS**。Chromium 实际从独立临时目录装配的 UI 打开漫画、翻页、保存进度、重载恢复；未加载 Web app.js 或任何在线来源。
- 同一源码的 [完整项目 CI #40827256178](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40827256178) 在本文写入时**仍运行中 / NOT_VERIFIED**，不能用专项测试替代 Android 和旧 Desktop 全量回归。

## 尚未关闭的门禁

| 工作项 | 当前证据 |
|---|---|
| S3-PKG-01 可复现的纯本地 Reader 资源十文件装配 | **QA PASS**（源片段 + 9 项白名单文件） |
| S3-PKG-02 无 Git 工作目录的真实 Windows/Linux 源码无源 ESM + 原 Web Reader | **Linux/Windows + Chromium QA PASS** |
| S3-PKG-03 可信分发/签名、受保护安装根、用户可安装 Windows Launcher/Node runtime/ZIP | **NOT_IMPLEMENTED** |
| S3-PKG-04 整套正式 Windows Web UI 纯 Core 与可选来源独立安装/升级 | **NOT_IMPLEMENTED** |
| S3-PKG-05 Android 无来源 APK / Binder-隔离来源 / 真机 UI | **NOT_IMPLEMENTED** |
| S3-PKG-06 旧 v0.5.0 库、下载、账号、阅读历史一键升级及回滚 | **NOT_VERIFIED** |
| G1 UX / G2 生产模块隔离 / G3 升级 / G4 发布 | **OPEN** |

**下一步建议**：以当前的 10 文件资源清单与无来源 ESM 为基线，做独立的未发布 Windows x64 Portable QA 包，明确 Node 运行时来源与许可证、完整字节清单和安装根保护；再推进旧桌面完整 UI 的模块化拆分，不能将此 QA 目录直接发布为可用正式 Windows 版，更不能声称同用户 Node 进程具备 OS 沙箱。
