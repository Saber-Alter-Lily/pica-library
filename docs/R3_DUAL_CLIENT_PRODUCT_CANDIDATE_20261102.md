# Pica Library | R3 双端完整产品安装候选（2026-11-02）

> **交付目标：**把已有完整 Windows 与 Android 客户端放进同一个未发布的产品候选流程，提供可直接安装、体验全部旧功能的 QA 包。不得把原完整客户端错误标记为物理无源正式版。稳定版 `main` / v0.5.0 / OTA / 正式数据保持不变。

## 本批可实际拿到什么

| 候选 | 交付入口 | 产品范围 | 用户数据边界 |
| --- | --- | --- | --- |
| Windows 完整原产品 RC | [Post-stable Isolated RC Packages](https://github.com/Saber-Alter-Lily/pica-library/actions/workflows/post-stable-rc-packages.yml) 的 `Pica-Library-Post-Stable-RC-Windows` | 原全量桌面/Web：书库、在线、推荐、Visual、设置、Reader、下载、同步及已有更新 UI | `%LOCALAPPDATA%\\Pica Library Post Stable RC`，不读取旧正式目录 |
| Android 完整原产品 RC | 同一工作流的 `Pica-Library-Post-Stable-RC-Android` | 原四标签导航、完整书库/推荐/在线/设置、交互引导、Reader、下载任务和远程能力 | `com.picalibrary.android.dev`，独立于稳定版 `com.picalibrary.android` |
| 来源物理外置的 Android 工程候选 | 原 [CI](https://github.com/Saber-Alter-Lily/pica-library/actions/workflows/ci.yml) 的 `source-free-local-qa` 和 `r2-source-free-user-host-android-qa` | 无 INTERNET 阅读器 + 同签名可卸载 Host；真实官方 Suwayomi 内置来源已在 Android35 E2E 通过 | 两个独立 QA applicationId，不是完整原产品 UI，不可当作 v0.5.0 直接升级 |

以上是**两条不同验收线**：原完整产品用于快速发现 R3 真实 UX/功能缺口；无源模块组合继续验证未来架构。不能因为同时有三个 Android APK 就声称单 APK 正式迁移已完成。

## 完整客户端的单批交付

继续使用已经成熟的 `.github/workflows/post-stable-rc-packages.yml`，**不编写第二套打包工具**。本次将它的 trusted push 接入唯一集成分支；只有更新本交接文件、打包脚本或工作流自身时触发，而非每次提交都重新制造 RC。可按需在 GitHub Actions 显式手动运行。

- 源码固定：以该工作流实际 `GITHUB_SHA` 为唯一真相。Windows x64 使用发布的 v0.5.0 基线 ZIP + 原 RC Launcher / 原完整 Web，现成 PowerShell 路由会进行临时全量替换、启动、配置持久化验收。保留原更新助手与正式数据隔离。
- Android 使用现有 `:app` 完整产品、JUnit/lint、预览签名及 `com.picalibrary.android.dev` 安装身份；如果 GitHub QA 签名凭据不存在、SHA 不符或安装包元数据不匹配，明确 FAIL，**不得绕过**。不改生产 applicationId 或 versionCode。
- 仅当 `contract`、`windows-rc`、`android-rc` 都成功且上传 artifact 后，`RC_STATUS.json` 才可称为 `INSTALLABLE_ARTIFACTS_READY_MANUAL_QA_PENDING`；合同绿灯或已有历史安装包不能替代本次交付。
- 安装包只保留 3 天，使用时按同一个 SHA 和 `SHA256SUMS.txt` 配对；不发 Release、Tag、OTA，不将用户本机真实书库复制给 CI。

## R3 第一轮实际体验验收（从产品而不是接口出发）

只收集会影响日常使用的 P0/P1，截图与失败步骤需对应候选 `SOURCE_SHA.txt`：

1. **Android 360/393/480dp、中文/英文/日文、默认字号及放大字体**：四大标签切换、返回、书库搜索/长按选择底栏、设置、在线来源入口；不存在覆盖、被裁切、点击无反馈或整屏黑屏。
2. **八章新手引导**：必须从设置入口能够逐章在真实控件上展示 Spotlight，允许跳过，未完成真实操作不得假写业务成功；不接受纯文字内容当作交互引导。
3. **书库到阅读器**：本地 CBZ/文件夹、历史、书架、同一内容跳转、页数、阅读进度与重启续读；Windows/Android 两端沿用原有模型，不能新建一份。
4. **推荐与任务**：批次翻页不重算、负反馈不混入下一批、已收藏不重复召回；Visual 可关闭；约 1500 本的读取/推荐过程可见进度、取消、恢复，无 UI 黑屏或长时间阻塞。
5. **标签与同步**：#199 的 BLOCK/LESS 仅影响显示；#200 保持原始键与客观收藏计数；LAN/WebDAV/离线同步的状态清晰且不会静默改动数据。

## R4 先行准备（严格不触碰生产数据）

此次完整 Windows RC 继续执行既有 `test-windows-universal-full-upgrade.ps1`：在**临时模拟资料**下由公开 v0.5.0 ZIP 启动并做完整替换验证，属于升级可行性工程证据，不属于用户真实数据迁移验收。Android 用原固定预览证书检查软件包身份/签名，不是 v0.5.0 正式包同身份更新。以后正式迁移必须独立满足备份、只读预检、数据一致性与失败回滚。

**本批结束条件：**同一 SHA 的 Windows 和 Android 完整安装包确实上传，`RC_STATUS.json` 报成功，再进入实机 G1。R2 物理无源最终包、第三方真实站点、G3 正式旧用户迁移、G4 发布批准仍 OPEN。不因 CI 绿灯自动发版。
