# Pica Library｜B1 同源双端 QA 候选证据（2026-11-09）

> **判定：PACKAGE_VERIFIED / MANUAL_QA_PENDING**。精确产品源码 `ecd743553c9d6be3e2d68bf5ec32dbf7f125d393`（[提交](https://github.com/Saber-Alter-Lily/pica-library/commit/ecd743553c9d6be3e2d68bf5ec32dbf7f125d393)），对应 [五批主计划](PRODUCT_ACCEPTANCE_MASTER_PLAN_20261109.md) B1。本文件随后以纯文档提交补充核验记录；不是重新打包，也未改变已核验的产品源码。未经许可不修改 `main`、v0.5.0、Release/OTA、生产签名或真实用户资料。

## 1. 可信 push 的真实打包，不是 PR-only contract

- [实际 Post-stable RC Actions #42600954377](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600954377)，事件 `push`：`contract=SUCCESS`, `windows-rc=SUCCESS`, `android-rc=SUCCESS`, `artifact-summary=SUCCESS`。**实际上传了安装包**。
- [状态 ZIP #13665379410](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600954377/artifacts/13665379410) 内状态输出 `INSTALLABLE_ARTIFACTS_READY_MANUAL_QA_PENDING`；`manualQa=PENDING`。
- [Windows artifact #13665976677](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600954377/artifacts/13665976677) 真实外层 ZIP 36,165,360 字节；内部原 Windows 全量 QA ZIP/README/SOURCE_SHA/VERSION/SHA256SUMS 与 R4 回滚记录存在。实际解包校验 SHA256：
  - `Pica-Library-Post-Stable-RC-Windows-x64.zip`：36,295,983 字节；SHA256 `1e379c49964fe1b9e7b3b427c6375d1057e2a8e8d5b1bce5f52296409505185b`，与内部清单完全一致。
- [Android artifact #13665827952](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600954377/artifacts/13665827952) 真实外层 ZIP 7,660,644 字节；内部三个 APK、SOURCE_SHA/VERSION、签名/权限/包信息及 SHA256SUMS 共 15 个文件。实际解包逐文件 Hash 校验：

| QA APK | packageId | 字节 | SHA256（独立复算） | 验证 |
|---|---|---:|---|---|
| `Pica-Library-Post-Stable-RC-Android.apk` | `com.picalibrary.android.dev`（历史完整 Dev 对照） | 14,805,351 | `5deb49a1c1a2995764801fd7cab4496aef16e28201da5c33cd442fb101117361` | PASS |
| `Pica-Library-Post-Stable-RC-Clean-Android.apk` | `com.picalibrary.android.cleanqa`（原四标签清洁产品） | 3,756,884 | `2bc52433d8f97745b5e1e0825e38ab9a6a95aedfbd411c5ef5e112f25ba2abc1` | PASS |
| `Pica-Library-Post-Stable-RC-User-Host.apk` | `com.picalibrary.android.userhost.qa`（来源独立伴侣） | 199,046 | `8531d938bee998faa5b7dfc2daa2ce70a2c3909e6604d032dd0937fcfa0b72fa` | PASS |

三 APK 的 `CERTIFICATE_SHA256.txt` / `CLEAN_CERTIFICATE_SHA256.txt` / `HOST_CERTIFICATE_SHA256.txt` 在实际 ZIP 中均为 `64fb87dc7d8bd6bc7b2cec92cc8c83fad3afe8cfb07591a2e53d53cbd3ab2f9d`；构建 job 的 `apksigner` 对相同原始签名进行强制验证，清洁版 R8/DEX 实际报告 `source_leaks=[]`、`direct_forbidden=[]`，无列举的 Pica/E-H/JM 执行客户端。

## 2. 同一产品 SHA 的独立工程门禁

| 门禁 | Actions run | terminal result | 限制 |
|---|---|---|---|
| 标准 CI（Desktop/Web/Android） | [#42600962848](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600962848) | SUCCESS | 非实体手机 G1 |
| Next consolidated acceptance | [#42600962905](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600962905) | SUCCESS | 历史 branch-scoped jobs 可能 SKIPPED，不等于整机验收 |
| K3 Android 真实负载编译/合同 | [#42600963036](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600963036) | SUCCESS | 非 1500 部真实带封面实体设备性能 |
| v0.4 Direct Upgrade | [#42600962878](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600962878) | SUCCESS | 实际旧版公共资产 Hash/证书，未操作真实用户资料 |
| P2 runtime promotion | [#42600962896](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600962896) | SUCCESS（含五专项+summary） | 合成/隔离性能回归，不等于 G1 |
| Android 原四标签 source-neutral DEX | [#42600954386](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600954386) | SUCCESS | 只证明物理隔离边界 |
| 公共 v0.5.0 真包名/真签名 Android 原位覆盖 QA | [#42600954375](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600954375) | SUCCESS | 临时合成书架、隔离模拟器，不能替代真实旧资料 G3 |
| Android35 原 Reader/Host 实际模拟器 E2E | [#42600954633](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600954633) | **IN_PROGRESS（本证据建档时）** | 完整最终结果以 Actions 实际终态和本文件后续 checkpoint 为准；不可推定 PASS |

## 3. 当前可安装 QA 的安全边界

- **Windows**：只在独立测试目录完整解压内层 ZIP，使用隔离 `Pica Library Post Stable RC` 资料路径。不可用此包直接覆盖正式 `%LOCALAPPDATA%\\Pica Library`。
- **Android**：要测试清洁产品，仅安装**同一 Actions ZIP 内的** Clean-Android 和 User-Host 两 APK；历史 Dev APK 只供原功能对照，不要把三个 APK 当同一产品运行。不覆盖正式包名 `com.picalibrary.android`，签名冲突停止而非卸载既有软件绕过。
- 仅用获许可的样本漫画和测试账户；不上传漫画正文、Cookie、密钥、真实账号或用户私有书库。三 APK 的 SHA 和相同预览签名为 QA 证据，**不是正式生产签名发布许可**。
- 实物 G1 Android 360/393/480dp/三语/大字号和 Windows 日常使用未验收；G2 至少两种真实合法第三方外接来源内容未验收；G3 真实旧用户书库差异/rollback 未验收；G4 用户许可发布未取得。不得合并/Release/OTA。

## 4. 从此证据继续下一完整批次

- **B1 包工程：PACKAGE_VERIFIED**（不是 USER_ACCEPTED）。本证据是严格同源码的 Windows/Android RC 与基础 CI 证据，保留供实机 G1。
- **B2 应继续实际来源**：用户自管 Suwayomi、独立可信扩展 → 搜索 → 原 Reader 实际图 → 明确离线保存 → 断开 Host → 原本地 Reader 恢复。至少两种独立来源、双端、真实章节和图片；不能把已通过的 Suwayomi Local Source/三 JAR 注册当成真正网站 G2。
- 不用再为 B1 反复重造打包器或插件接口。B3 可以推进不依赖第三方授权的 UI/1500 部实体 QA；旧用户资料和正式发布仍必须等待 B4/B5 授权。

## 5. B2 第三方真实来源工程证据（独立于 B1 包与 G1/G2 人工验收）

- 参考 [B2 来源证据档](B2_REAL_LICENSED_SOURCE_E2E_20261109.md)。真实 [#42625363093](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42625363093) 按六独立 matrix job 核验。**Pepper&Carrot 与 ComicFury 两个真实站点各自完整 SUCCESS**：Pepper 1 章/6 张真实图片，ComicFury 2 章/2 张；均在原 Host Reader 读取、用户明确本地保存、撤销并关闭 Suwayomi 后在新本地 Reader 进程进行 Hash 对照。没有上传站点图片或账号 Cookie。原三款 Pica/JM/E-H 扩展仅安装/注册/撤销 SUCCESS，**未**验证目标站点内容。
- xkcd 独立 case 因旧 2000 章数量上限 FAIL，故整个 matrix 工作流为 FAILURE；不能把两个通过 job 偷换成整体通过。后续 bounded 5000 章的双端代码已提交 `cad6d18`，与精确新 SHA 的真实 xkcd 结果、完整 CI 仍需复验。来源 ID 报告在 multi-ID 扩展中存在次要的记录错误，已于后续修正；Reader 实际绑定的精确来源身份没有改变。
- Android35 实际原 Reader/Host [#42600954633](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42600954633) **SUCCESS**（Suwayomi 官方 Local Source，非目标第三方真实站点）。G1 物理设备、G2 双端真实第三方及用户目标站点、G3 真实用户资料和 G4 发布仍 OPEN。

## 2026-11-13 B3 最新源码工程与 QA 重新打包记录（保留上次原始证据，不覆盖）

此节是**新增候选来源的独立记录**，不得把 2026-11-09 的 `ecd7435` 安装包 SHA 冒充最新代码；旧工件对应的证书/哈希仍为历史可验证事实。

| 证据和结论 | 当前源/运行 | 能证明什么 | 不能证明什么 |
| --- | --- | --- | --- |
| 最新开发标准 CI **SUCCESS** | `f2892df` [#43407537556](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43407537556) | Android 及 Web/Desktop 代码通过；B3 离线推荐/封面绑定/任务中心修改通过工程检查 | 真实用户离线推荐全流程及物理设备 |
| R3 Android 清洁来源边界 **SUCCESS** | `f2892df` [#43407528343](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43407528343) | 原完整四标签 QA 客户端不打包列举的站点 SDK | 生产签名、商业站点许可、用户实机 |
| 综合 Web/source **适用部分 SUCCESS** | `f2892df` [#43407537337](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43407537337) | Web/source 适用 job 通过 | 被 SKIPPED 的历史其他 job |
| P2 运行时 **六个任务 SUCCESS** | `f2892df` [#43407537618](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43407537618) | 既有 Windows/Android 运行时及资源检查通过 | 实机 1500 张真实图、实时帧率 |
| S3 Android35 **整体 FAILURE，B3 子流程有真实 PASS** | `2c118d4` [#43406478168](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43406478168) | 1500 独立缓存键与 512×768 合成 PNG 写入、原 1500 本书架滑动和位置恢复、旧书检索/三宽布局、Pepper 真实章节离线重开等逐阶段 PASS | 同运行双真实站点 G2、真实封面库完整解码、用户实体 Android G1 |
| 历史跨轮站点互补 | Pepper 当前 PASS／ComicFury `SOURCE_HOST_UNAVAILABLE`；较早 [#43358581271](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/43358581271) ComicFury PASS／Pepper 失败 | 每站有独立真实使用成功历史，当前外部服务有可复现波动 | 任何同一候选两站点稳定通过的结论 |

**本节写入之后触发的可信 push [Post-stable Isolated RC Packages](https://github.com/Saber-Alter-Lily/pica-library/actions/workflows/post-stable-rc-packages.yml) 是新的待核对安装包来源**；只有实际四 job 完成、上传文件同 SHA、源文件/签名/Manifest/哈希校验才可填写新候选的工件编号。不要预先填写未知 artifact ID 或 SHA256。

**安全的试用方法**：仅在 Windows 独立 QA 目录解压候选，Android 仅把同一工件中的 `Clean-Android.apk`（`.cleanqa`）与可选 `User-Host.apk`（`.userhost.qa`）安装在旁路；原 `Android.apk` 是历史 Dev 对照，不是和 Clean 同时安装的必需组件。使用测试样本，不覆盖或清空正式资料；如果出现签名/包名冲突，停止而不卸载正式 App。证据 3 天过期；G1 实体用户验收、G2 真双来源、G3 真资料和 G4 正式发布全为 OPEN。

