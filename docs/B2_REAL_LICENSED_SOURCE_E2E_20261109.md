# B2｜真实外接来源及无搜索浏览兼容（2026-11-09）

## 本批实际产品增量

- B1 已证实原 Windows x64 + Android 四标签 clean+可卸载 signed Host 同源码 QA 包和原 Suwayomi Local Source 两页原 Reader/导入/离线恢复；G1–G4 尚未全过。当前唯一集成 Draft #284，正式 v0.5.0/Main 不变。
- B2 首轮 [实际五项来源运行 #42622051897](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42622051897) 发现：原 Pepper&Carrot 发布扩展的 `SEARCH` 操作返回上游 `No search`；原 ComicFury JAR 注册多个来源 ID；Pica/JM 固定 JAR 的老 Release tag `4591fbc-2` 不再存在（HTTP 404），但 **同一 SHA-256** 的 JAR 当前在 Keiyoushi 官方 [b035310-3](https://github.com/keiyoushi/extensions/releases/tag/b035310-3)。历史 E-H JAR 注册/移除 PASS，未访问站点内容。
- 此次新增**真实产品功能**：使用原 Suwayomi `fetchSourceManga(type:POPULAR)`，增加 Windows 原 Host 页面与 Android 独立签名 Host 的“浏览此来源作品（无需搜索词）”控件；不绑定来源/未授权时不可用；上一页下一页延续 `POPULAR` 而不发起 SEARCH；已有搜索、书签、唯一 Reader 与明确单章离线保存均沿用原代码。无自动安装扩展、无默认来源。
- ComicFury 一 JAR 多来源问题：保留所有实际注册的 64 位来源 ID，只按运行时 Host 报告的**明确语言和来源名称**定位一个候选，歧义则显示来源元数据并失败，不擅自选任意 ID、不串来源。
- Pica/JM JAR 下载：只替换死掉的 Release URL，实际文件 SHA256 保持不变，继续核验实际注册、删除，不将此结果冒充真实 Pica/JM 账户/图片。

## 授权公开内容的隔离真实来源测试

- **Pepper&Carrot** ([作者公开漫画](https://www.peppercarrot.com/en/))：公开 CC BY 4.0 作品，源扩展 JAR [Keiyoushi b035310-0](https://github.com/keiyoushi/extensions/releases/tag/b035310-0) `tachiyomi-all.peppercarrot-v1.6.1.jar`，digest `7f0b9912a59c45d8c4ae147fdbed9231558aaa52715886c4dc390368c163c37d`。改用 POPULAR，不依赖不存在的文字搜索。站点不能访问则明确上游不可用。
- **ComicFury**：只尝试由作者明确允许的公开作品以及相应 [Keiyoushi b035310-0](https://github.com/keiyoushi/extensions/releases/tag/b035310-0) `tachiyomi-all.comicfury-v1.6.1.jar`，digest `30744ec9dda0c7d7bdfa352437c383c514c7aae49815166fa4909775c2dde38e`；平台公开≠任意内容可复制。只做 CI 中的一次非商业临时验证，不能再分发漫画图片。
- 使用现有项目 `HostedLibraryReader` → `LocalLibraryIngestion` → `ReaderService` 和官方 Suwayomi GraphQL，实际用户路径为：安装独立受信 JAR → 人工授权绑定来源 → POPULAR/SEARCH → 原 Reader 实际至少两页 → 明确保存章节 → 撤销 Host → **关闭上游后新进程**核对本地图片哈希。无图片、Cookie、账号、密钥进入 GitHub 工件或正式应用。站点无法访问、缺失图、来源不匹配都标 FAIL/NOT_VERIFIED，不替换 synthetic 伪造 PASS。

## 验收级别和剩余阻断

- 最新 CI/Android 原四标签与两个真实网站的实际完整终态以本批修改产生的 **同一 SHA Actions** 为准。新增 POPULAR 按钮的自动化 PASS ≠ 真机 UI PASS。
- 上述两个公开站点是**真正第三方来源通路的工程证据**，并不验证 Pica、JM、E-H 的真实账户、完整漫画或持续稳定性。G2 必须另外核对用户自行获得且授权的目标站点扩展、证书、章节/图片及 Windows/Android 实机；G1/G3/G4 继续 OPEN，正式生产包无变化。

## 2026-11-09 真站点正式运行证据与边界

[真实六来源验收 #42625363093](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42625363093) 属于源码 `7de7441`，作业**分别记录**，不因总流程的 xkcd FAIL 擅改状态：

| 来源 | 作业结果 | 真实业务证据 | 尚需注意 |
|---|---|---|---|
| ComicFury 英文来源 | **SUCCESS** | 站点搜索 → 原在线 Reader 实际 2 张图 → 本地保存 2 章 → 停用并停止官方 Suwayomi → 新 Reader 进程离线逐页 Hash PASS | 本次脚本最后的 `sourceId` 摘要字段曾采用集合首项，未必是实际英文绑定 ID，下一提交已修正；源绑定本身有精确 ID 校验 |
| Pepper&Carrot | **SUCCESS** | 经 POPULAR 浏览 → 原在线 Reader → 1 章真实 6 张图 → 本地保存 → 断 Host → 离线 SHA256 PASS | 修复 `image/jpg`→`image/jpeg` 单一 MIME 别名后通过；其他 MIME、图像字节与大小校验不变 |
| Pica、JM、E-H 三扩展 | **三项均 SUCCESS** | 固定 SHA 的独立 JAR 安装、源注册、撤销 | **没有**登录、搜索、阅读或下载目标站点，不能宣称这些平台真实内容支持 |
| xkcd | **FAIL** | 注册成功，因 >2000 章节触发原内存边界 `SOURCE_HOST_TOO_LARGE`，未取得完整内容 | 已将 Windows 和 Android 原解析器的章节数组上限调整为有限的 5000，保留原 1 MiB 整体响应约束及唯一身份校验；新 SHA 的真实来源结果仍须复测 |

**严格解释：**已有两个公开授权的独立真实第三方来源完成原 Windows 组件和离线入库链路的工程实证。但此结论不是原 Windows 图形客户端的实物使用验收，更不能替代 Android 手机通过真实站点的签名 Host/Binder 阅读、用户目标 Pica/JM/E-H 的登录/章节、真实用户资料迁移或最终发布批准。G1–G4 继续 OPEN。

新工程提交：Windows `8f45f2d`、Android `35bb97f` 的 POPULAR 浏览、`48f624e` 的有证据 MIME 规范化、`cad6d18` 的有上限长篇章节支持。下次按同一 SHA 重新核对 CI 和真实来源结果。

## 2026-11-09 后续独立实证：xkcd 长篇章节边界关闭、Android 真站点待核验

- **xkcd 原失败已按新源码重新实测 PASS（仅工程层）**：修复 `cad6d18` 后的 [独立来源六作业 #42626544616](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42626544616) 属于 `e7ceb9ce9268cde0ecf552c60b05ecf65bb950df`，**六个来源 job 均为 terminal SUCCESS**。其 xkcd job 实际输出 `ONLINE PASS`（`realImagePages=2`、`savedChapters=1`、`originalHostedReader=true`、`originalLocalImporter=true`）和 `OFFLINE PASS`（`hostStopped=true`、`localReader=true`）。因此前一运行 #42625363093 的 xkcd `FAIL/SOURCE_HOST_TOO_LARGE` 保留为历史事实，但不再是现行 5,000 章工程限制的未修复问题。此次并未验证 5,001 章以上成功；上限仍存在。
- 同批真实来源 ComicFury、Pepper&Carrot 也各自 SUCCESS；Pica/JM/E-H 三项仍**仅** SHA 固定 JAR 安装、注册和移除，绝不推定站点搜索/登录/章节/图片。
- **Android 原四标签 clean App + 独立同签 Host 的真 Pepper&Carrot UI/Reader/离线闭环**：`74db198` 已增补原有 Android35 ADB 工作流（不新建 Reader/DB/运行器），新源固定扩展 SHA-256，要求用户显式绑定真实来源、浏览、原 Reader 两张实际图片、单章本地写入后断开 Host 并在新进程逐页验证文件字节。前一 `74db198` Android run [#42628553992](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42628553992) 是 **FAIL**，原因是 Java `HostSourceManager.java:64` 的编译括号错误；已在后续 `dc6487e` 纠正。**新同源码实测 [#42633334908](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42633334908) 尚无终态，本段登记时为 IN_PROGRESS，不能记为 Android 真站点 PASS。**
- 2026-11-09 下一阻断：先取 #42633334908 实际 job/错误日志并修复真实首次失败；拿到 Android 原 App 真来源一次闭环后，再扩展到独立第二个来源（不得用同一来源的第二个漫画代替），随后推进两个平台的实体 GUI/设备确认。公开来源的 CI 成功不能替代 G2 目标 Pica/JM/E-H 账号授权访问或 G1 真机、G3 真实旧资料、G4 发布审批。所有这些仍 OPEN。

## 2026-11-09 真 Android 第二阶段失败与对症修复（不得先标 PASS）

- [原 Android35 真站点工作流 #42633334908](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42633334908) 在精确源码 `dc6487e` 的 **terminal FAILURE**。编译已通过；独立固定 Pepper&Carrot JAR 安装、签名 Host 配置/授权、Spinner 选择、POPULAR 浏览、原 Clean Reader `Read · Pepper&Carrot` 均由真实 ADB 交互执行。原 Reader 在第二页检查时只显示 `Image failed · view details`；脚本等待 `2 / 6` 超时，实际失败阶段 `b2-public-licensed-browse-original-reader`。**未**取得两页图片和完整离线保存，因此 Android 真站点闭环仍 FAIL，不引用 Windows PASS 覆盖它。
- 源码定位发现 Android 原 `HostHttp.image()` 严格 MIME 白名单只认识 `image/jpeg`，不识别已在 Windows 公共 Pepper&Carrot 真实路径出现过的别名 `image/jpg`。提交 [`fbd7eb6`](https://github.com/Saber-Alter-Lily/pica-library/commit/fbd7eb6759b01158769d86601eaf85509a67e317) **仅**将该别名规范化为 `image/jpeg`，仍要求原 JPEG magic、20 MiB 上限、独立 Host/来源范围与无重定向。此为有证据的首要原因**假设**，截至记录时**不能**宣称因果已由真站点复测验证。
- [`0609452`](https://github.com/Saber-Alter-Lily/pica-library/commit/06094529fa6752ce3767f6f070a1a80a0fdf3f22) 给原 `HostHttpTest` 增加有界别名/伪装 PNG 拒绝回归；[`23f0e7b`](https://github.com/Saber-Alter-Lily/pica-library/commit/23f0e7b67599086f2914fa10be82800f6f51058c) 让原 Android 真站点失败时在既有 Reader 弹窗读取**仅白名单错误分类**写入 CI，不采集/导出第三方漫画像素、账号、URL。新 [Android 工作流 #42638248893](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42638248893) 已触发，登记时未出终态。只有它真正完成第 1/2 页、明确章节保存、断开 Host、离线原 Reader 页面 Hash 才可标 PASS；若失败必须依新日志修复，不放宽断言。
- Windows 原外接 Host 页面已参考 Android 现有 Host 管理入口，新增用户主动点击“在浏览器中管理我自己的 Host 来源”，只打开当前已配置的 HTTP(S) Host WebUI；绝无自动安装、切换来源、索取凭据或后台连接。提交 [`e5a9dc2`](https://github.com/Saber-Alter-Lily/pica-library/commit/e5a9dc20af330acf3834df6b5d22e115bfb24958)，原 `source-host-discovery-ui` 惰性回归 [`bc5a0b5`](https://github.com/Saber-Alter-Lily/pica-library/commit/bc5a0b5b4da29a106695f884b1dd4d2ec2a56772)，Vitest 1.x 断言兼容提交 `16bac9d`；仍待本 SHA CI 终态与用户图形界面核验。
- G1–G4 及 54 项最终逐行裁决仍 OPEN。下一执行顺序：**先验证 Android #42638248893 终态 → 若 PASS，再用第二个不同的合法公开来源验证同一 Android 原 Reader → 双端实体 GUI → B3 体验/性能**。不发布、不改 main、不碰真实用户资料。

## 2026-11-09 Android 实际失败工件复核：原 Reader 自动隐藏状态与复测

- [#42638248893](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42638248893) **terminal FAIL**，测试点击原 Clean Reader 的 Next 后等待第二页可见计数，报 `visible=[]`。这不是 Android 真源链路 PASS；没有进行明确章节离线保存/Hash 验证。
- 在 Actions 失败工件 [#13685392969](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42638248893/artifacts/13685392969) 的 `latest.xml`，实际仍有原 Clean Reader 前台 `ViewPager2`、页面 `RecyclerView` 和 `ImageView`，却没有页码或错误控件；`ReaderScreenActivity.scheduleHide()` 的 2.8 秒隐藏机制与这一事实一致。这只支持**原测试忘记唤出栏**的解释，不足以证明真实图像已解码。保留此前 `#42633334908` 真图按钮错误历史，不篡改。
- [`7c129b7`](https://github.com/Saber-Alter-Lily/pica-library/commit/7c129b7039c886e90c4a7c301c6b1d490583e515) 只把 B2 中原始 `wait(('2 / 6'))` 换成仓库既有、之前本地 Reader 已用的 `wait_page_counter()`；没有新 Reader、业务豁免或页面源伪造。真实新运行 [#42659776053](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42659776053) 当时仍未终态。下次以其实际 job 日志为唯一依据：真实来源两页 → 原书库保存 → 停止 Host → 离线 SHA256 全绿后才准开始第二个独立来源的 Android 实测。

## 2026-11-09 Android35 第二次重试的真实结果：在线章节与离线 Hash 已通过，UI 搜索待核验

- 第一次 [#42659776053](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42659776053) 在系统 Quickstep ANR 阶段失败，未进入作品；**同 SHA 的 attempt 2** 已结束于更下游的 `b2-public-licensed-offline-after-host-stop`，本运行整体仍 **FAIL**，不可标整条路径 PASS。
- attempt 2 的操作日志：原 Clean Android + 独立签名 Host 通过官方 Suwayomi + 公开 Pepper&Carrot 扩展，在原 Reader 逐页阅读 1/6、2/6（明确 PASS）；选择 `Episode 1: The Potion of Flight` 完整章节，点击 `SAVE THIS CHAPTER`，实际原库成功入库（明确 PASS）；停止 Host 及其进程后重新启动原 Clean Home，通过本地 `LocalComicStore` 再查询同一作品 ID、完整页面并逐页 SHA256 对比，一致才继续。最终仅因约 `1503 本` 虚拟化列表未展示目标标题，在原 `tap("Pepper&Carrot")` 中超时，没有完成最后原 Reader 离线视觉闭环。
- [`37c6ae0`](https://github.com/Saber-Alter-Lily/pica-library/commit/37c6ae0d83eba728f66c3f355953f9a439b5c3b2) 只使用**原版** Android Home 的搜索框和 Search 输入动作定位保存作品，随后用已有 Reader 及 auto-hide-aware 页码进行真实离线重开。没有新增测试框架/存储/界面模拟。新 [Android35 #42665563088](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42665563088) 正在单独验此路径；确认完整 job terminal SUCCESS 之前不将 G2/Android 记为 PASS。
- 下一个宏目标：第二个独立公开来源 `xkcd` Android 原 signed Host，要求实际访问至少两章的两张图、明确保存/撤销/离线 Hash，而不是只做 JAR 注册。来源目标 Pica/JM/E-H 的实际授权站点测试、实体手机、真实旧用户资料、正式发布仍全部 OPEN。

## 2026-11-09 Android Home 搜索/Enter 实证纠正与未决门禁

- [#42665563088](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42665563088) 已终态 **FAIL**，发生在真 Pepper&Carrot 章节已保存、关闭 Host、新 Home 启动、每页本地 SHA256 核验后，原 1503 本的可见列表里找不到目标作品。失败工件 [#13699055281](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42665563088/artifacts/13699055281) `latest.xml`：`EditText` 内容 `Pepper`，导航栏位置 y≈546，键盘占用大量屏幕，当前无任何可见漫画卡片。这一截图不能独立证明 `UnifiedCatalogStore` 记录丢失。
- [`10ff462`](https://github.com/Saber-Alter-Lily/pica-library/commit/10ff462acbeeb5ac43989aa89152f6e846404beb) 修改**原始 Android Home**：按硬件 Enter 也提交标题搜索，与现有 IME Search 相同；现有 ADB 真实用户流程显式关闭键盘，要求页面真正出现目标后才打开**原本地 Reader**并检查页码。此前真实源章节/签名 Host/停止 Host/离线 Hash 逻辑均保留，无第二书库或假图片。
- [标准 CI #42727168448](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42727168448)、[综合验收 #42727168442](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42727168442)、[旧公开 Android 同签名 QA #42727160372](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42727160372) 已 SUCCESS；新 [Android35 真网站 #42727160233](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42727160233) 本次更新时仍运行，不能推断 PASS。若此轮完整成功，下一宏批次用独立公开许可 xkcd 扩展（单章可能一页，必须**至少两章两张实图**）重复授权→原 Reader→明确保存→停止 Host→离线校验流程，并且仍需真实手机/Windows GUI 验收与 Pica/JM/E-H 授权站点验证。G1–G4 不变。

## 2026-11-09 最新失败工件复核：业务搜索命中，三列网格标题在折叠视窗之外

- Android 原四标签 clean app 的 [#42727160233](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42727160233) **terminal FAIL**。确切源码 `10ff462` 已能通过 Enter 提交 `Pepper` 关键词；失败时 `latest.xml` 计数为 **1 / 1503 本**，且虚拟化 `GridView` 位置为约 [24,736][696,1056]，因默认 3 列封面垂直尺寸大于剩余窗口，可见树没有作品标题。文件 Hash 对比已在此前执行通过；此 failure 并不是找不到书库 ID、没有保存内容或站点请求失败。
- [`58bac93`](https://github.com/Saber-Alter-Lily/pica-library/commit/58bac93caa271585062580a315623f9e3717f6b1) 改用原 Home “显示方式→列表”以真实 UI 展示标题卡，才能点击同一个已保存章节的原本地 Reader；没有使用 adb 直接启动 Reader、没有造测试条目、没有减少真正的图片/离线 Hash 门禁。新 [Android35 #42732030006](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42732030006) 当时仍在运行，不宣称最终 PASS。
- 仅当新 run 的原 Reader 离线启动和文件 Hash 全部通过，才开始 Android 上第二个独立公开来源 xkcd 的 Host/章节/图片/下载/撤销复验。正式 Release 不变。

## 2026-11-09 Pepper&Carrot Android 原 Reader/离线闭环实测通过，xkcd 第二独立源启动

- **Pepper&Carrot Android 完整工程 PASS（首次）**：[真 Android35 run #42732030006](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42732030006) 源码 SHA \`58bac93caa271585062580a315623f9e3717f6b1\`，job \`local-ui-flow\` **terminal SUCCESS**，尾部 \`S3 LOCAL END-TO-END PASS\`。原 Clean QA 四标签 App + 独立同签名 Host APK + 公开 Pepper&Carrot 固定扩展，在**用户明确授权**后经真实 Suwayomi POPULAR 打开原 Reader 1/6、2/6；原生选择首章显式入库；Host 断开/苏瓦由米服务真实终止；重启后再次使用**原书库**搜索、显示方式→列表、点击 \`Pepper&Carrot · Episode 1: The Potion of Flight\` 进入原本地 Reader，日志 \`PASS: Host stopped: original four-tab Clean app opens preserved real-source offline chapter\`。离线前后存入的每张图片通过 SHA256；无漫画原图存入公开 Actions 工件。证据 [#13726522723](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42732030006/artifacts/13726522723)。此前 #42727160233 的 UI 标题不可见历史 FAIL 保留。
- **xkcd 作为第二个独立站点，Windows 已实证，Android 新增同链路测试：** Windows [六来源独立任务 #42626544616](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42626544616) xkcd job 是 SUCCESS，返回 \`realImagePages=2\`、\`savedChapters=1\`、关闭 Host 后离线 PASS。Android 没有冒用此结果。[新增同函配置化 \`74df621\`](https://github.com/Saber-Alter-Lily/pica-library/commit/74df621f849f411adb80d088a51a0ea7475d3f17) 把 **Pepper、xkcd 两个独立公开站点** 都放入现有 Android35 真源路径：固定 xkcd JAR [Keiyoushi b035310-0](https://github.com/keiyoushi/extensions/releases/tag/b035310-0) 名称 \`tachiyomi-all.xkcd-v1.6.1.jar\`、大小 128,549、SHA256 \`65548058e8400d82fbe2b30d03bf126012aef6123c103e6abe4de7e788c51701\`，原 native Binder Reader 要看到真实两页、原章节选择器要保存**两个不同章节**、关闭 Host 后两章文件完整 SHA256、原 Home 离线重开；真实站点运行失败必须阻断总体 PASS，不减少图片质量/权限断言。新 [Android35 #42736306757](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42736306757) 当前队列中，**没有终态，不能记为 Android 第二来源 PASS**。
- **许可/工程范围**：Pepper&Carrot 公开 CC BY 4.0，xkcd 网站 CC BY-NC 2.5；本流程为非商业 CI 临时检验，不发布漫画图片；两站点插件仅安装在可删除的官方 Host JAR 数据目录，不打进阅读器客户端、不自动获取来源或站点凭据。用户目标 Pica/JM/E-H 的真实账户、图片测试仍然是独立待验收项。G1 真实实体 GUI、G2 授权来源双端设备、G3 真实资料、G4 正式发布均 OPEN。

## 2026-11-09 双源 Android 首轮 terminal FAIL：原因是验收脚本而非 xkcd 功能

- [#42736306757](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42736306757) **terminal FAILURE**。Log 实际 Pepper&Carrot 阅读已输出 `PASS: real Pepper&Carrot source image pages 1 and 2 opened in original clean signed Android Reader`，接下来原 Host 保存按钮在未退回 Reader 的情况下被寻找，`UI item ... not visible; []`。此外原 `for _, _, bounds, kind in nodes()` 覆盖了来源参数，日志错误阶段意外出现 `android.widget.Spinner`。**该次没有触达 xkcd 来源，因此不得标记 xkcd PASS 或站点服务 FAIL。**
- [`796588b`](https://github.com/Saber-Alter-Lily/pica-library/commit/796588b5aca144f06d13f68638a337dfc8a06943) 仅恢复原已经通过的 Reader→Host→Importer 导航与参数变量隔离，沿用已有 signed Binder、本地章节保存、停止 Host、文件完整 Hash/离线 Reader 校验；没有扩大产品攻击面或添加第二 Reader。新 [#42744126740](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42744126740) 仍待终态。
- Pepper&Carrot 第一站点此前独立真 Android 完整 run [#42732030006](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42732030006) **SUCCESS** 保留。Windows 三公开站点 [#42626544616](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42626544616) PASS 不代替 Android xkcd，也不代替真实用户目标站点/实体设备测试。

## 2026-11-09 Pepper POPULAR 目录漂移，解耦第二站点 Android 实证

- [Android35 #42744126740](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42744126740) 在 `796588b` **terminal FAILURE**；真实执行了 Pepper&Carrot JAR SHA 固定安装、官方 Suwayomi Host 用户显式连接/选择来源及 `Browse this source`，但当前返回 `Press`、`References`、`Wiki` 等导航条目，不包含先前通过的 `Read · Pepper&Carrot`。因此原强断言正确拒绝，无法下结论它们是漫画章节，更不能将此视作第二站点 xkcd 的失败。本轮未进入 xkcd 章节与下载。**早期 Android 真 Pepper 完整 #42732030006 PASS 保留**；这次上游实时漂移限制它对后续可用性的外推。
- [`d85edf5`](https://github.com/Saber-Alter-Lily/pica-library/commit/d85edf5c1961dddb6520f790a1e4703cd489e8a3) 保持原代码复用，仅给已有真实 Android35 ADB 函数增加明确的独立来源选择，本轮 workflow 固定 xkcd。xkcd 扩展依然严格核验 [Keiyoushi b035310-0](https://github.com/keiyoushi/extensions/releases/tag/b035310-0) JAR 128,549 字节 / SHA256 `65548058e8400d82fbe2b30d03bf126012aef6123c103e6abe4de7e788c51701`。原签名 Host/Reader 的实际两页、两章独立选择并入库、关闭 Host、所有离线图片 SHA256、原四标签书库重开仍不可豁免。
- 新 [xkcd 独立 Android35 #42763016774](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42763016774) 在本 checkpoint 未出终态；单次验收结果 `publicSourceCasesActuallyRun` 只记本次真正测到的源，防止用 Pepper 历史 PASS 伪装当次两源 PASS。Windows xkcd 真实路径独立 SUCCESS [#42626544616](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42626544616)。G1–G4 仍 OPEN，不发布。

## 2026-11-09 xkcd 独立 Android 真实扩展身份发现首轮失败及有界修正

- [#42763016774](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42763016774) **terminal FAILURE**：真实运行结束于 `b2-public-licensed-xkcd-extension-setup: Cannot uniquely identify one independent public source`；不是图片失败、没有执行到原 Reader 或离线入库。其扩展 JAR（v1.6.1、128,549 字节、已锁定 SHA）和官方 Host 均已安装、运行。旧测试的 `spec["match"] in name.lower()` 对 xkcd 过宽，包含其他来源身份无法选择。
- [`b4944b8`](https://github.com/Saber-Alter-Lily/pica-library/commit/b4944b81412140df71072ffe81ed8523a5266960) 与原 Windows 测试一致，选 `name.strip().lower()=="xkcd"` 且语言为 `en/all/other`；Android 使用确切 `Host name · language` Spinner 项，保持未唯一定位立即 FAIL。错误时仅打码输出最多 12 个来源名称+语言供排查，不暴露内容、地址或登录态。xkcd 单页漫画可从**两个原生实际章节**形成两张真实图片，总计两章节均须明确保存、断源后逐页文件哈希一致并从原四标签书库离线重新打开；Pepper 仍要求单章至少两页。
- 新 [#42773734479](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42773734479) 已启动但未终态，当前不宣称 xkcd Android PASS。历史 [Pepper Android #42732030006](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42732030006) 的完整 terminal SUCCESS 和 [Windows 三来源 #42626544616](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42626544616) 的工程 SUCCESS 均保留。

## 2026-11-10 xkcd 原 Android Reader 首次到达但触发有界单响应超限

- 真 [Android35 #42773734479](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42773734479) **terminal FAILURE**，步骤 `b2-public-licensed-xkcd-browse-original-reader`。日志实际点击 `xkcd · en`、`Use selected source`、`Browse this source`、`Read · xkcd`，进入原 Reader 后显示 `External source · SOURCE_HOST_TOO_LARGE`。此前独立来源身份筛选问题已解决；此轮没有获得 xkcd 真实图片或实际离线章节，所以 G2 不能记录 Android xkcd 通过。
- Android 原 `HostHttp.json` 每次 GraphQL 保留 1 MiB 响应限制；原 `PicaHostManga` 把全部长篇 `chapters.nodes` 一次请求，xkcd 超出了一个响应能承载的边界。参考并核对**官方固定上游 Suwayomi 2.4.2366** 源码 `ChapterQuery.chapters(condition:ChapterCondition,first:Int,offset:Int)`，而 `MangaType.chapters` 是不可分页的 DataLoader 字段；因此不是简单扩大内存或调低断言。
- [`a1124fc`](https://github.com/Saber-Alter-Lily/pica-library/commit/a1124fcb3808d537fd888528811c4545d0ccd7c8) 在**原** Host HTTP allowlist、GraphQL operations、协议和来源 manager 实现固定 `PicaHostPagedChapters`。原作品验证与 `fetchMangaAndChapters` 权限动作保留，返回仅作品身份；后以 500 章/页、最多 5000 章在每页 1 MiB 下分批重建。分片时逐页验证 mangaId、每批 totalCount 与 hasNextPage、跨批章节 id/url 不重复及 session scope；不接受任意 GraphQL/URL、超过 5000 章或伪装数据。原 Robolectric 添加 1001 章多页和负面案例。新 [Android35 #42786068759](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42786068759) 在本 checkpoint 未有实际终态，不能声称 Android 双站点完成。

## 2026-11-10 Android xkcd 分页后续阻断与按用户路径修复（尚未验收）


- **真实失败终态已核实，不是 xkcd 实站验收通过**：[Android35 #42786068759](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42786068759) attempt 1 在系统 Quickstep ANR 后停机；attempt 2 重试进入原 Android signed Host 后，在原 synthetic 26-source/第 2 页搜索结果点击「保存在线书签（不下载）」处失败，`user-host-saved-books-v1.json` 未写出，尚未开始真正 xkcd 章节/图像。旧模拟 Host 不支持新增的 `PicaHostPagedChapters`，而原 Host 书签按钮调用 `select()` 会为了存在线索引而读取全量章节，属于实质性能/操作语义缺陷。
- **复用并更正原链路**：[业务源码 `4df7239`](https://github.com/Saber-Alter-Lily/pica-library/commit/4df7239d5c2231aae5cc231d7cbd528505c5d2fa) 使 Android 原 `HostBrowserActivity` 的 bookmark-only 只调用 `HostSourceManager.saveBook`，后者仍要求显式授权、活动 Host 会话和已绑定来源的搜索作品，但**只持久化严格九字段 locator，不请求章节/图片、不启动 Reader 或下载**；只有用户明确在线阅读或离线导入时才执行身份核验、分页章节、原 Binder Reader/LocalComicStore。原 synthetic Host 按固定 500 章 GraphQL 响应新增 1 章分页并在书签恢复实际 Reader 时核验操作，沿用旧原生测试。
- **精确测试纠正**：首个修复 SHA 的 Web [#42791317695](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42791317695) 与综合 [#42791317862](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42791317862) 已见 2918 pass / 1 fail（旧 TS 静态合同仍要求已弃用的 `selected(session,comicId)`）；[源码 `383d90e`](https://github.com/Saber-Alter-Lily/pica-library/commit/383d90e525eef65f6ab915ada389aa50de475356) 更新合同以要求 `book(session,comicId)` 活动来源约束，并修复 Android xkcd **单章本可只有 1 页**却错误要求首章 ≥2 页的验收缺陷；仍严格要求保存两**不同**真实章节、核对每张真实图 SHA256、Host 停止及原本地 Reader 离线重开。Pepper 单章两页门禁不放宽。
- **新实测只登记进行中，不冒充 PASS**：源码 SHA `383d90e` 对应 [Android35 实际 push #42792126068](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42792126068)、[标准 CI #42792137092](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42792137092)、[综合 #42792136752](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42792136752) 在本记录时均**尚无最终裁决**；[R3 原产品来源隔离 #42791306415](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42791306415) 已 SUCCESS，属上一应用源码 SHA 的独立工程证据。PR-only 被 SKIPPED 的 S3 不可替代 push Android35 实测。记录期间 `main` v0.5.0、生产签名/Release/OTA、真实用户库未改变。
- **下一步（严格 B2 先行）**：优先读 #42792126068 真实失败点；若成功，登记 xkcd 第二来源的每章图片数/离线 Hash/原 Reader 结果；若失败，只修确证的原业务/脚本阻断。G1 实体设备和 1500 实负载、G2 两源跨端实际使用与 Pica/JM/E-H 授权来源、G3 v0.5.0 真实资料升级回滚、G4 54 项+发布批准全部保持 OPEN。

## 2026-11-10 公共 xkcd 3,321 章的 Binder v1 尺寸门禁定位与 v2 复用

- 原 Android35 [#42794975352](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42794975352) 精确 `8d9727c` **terminal FAILURE** 于 xkcd 已开启的原 Reader：`External source · SOURCE_HOST_TOO_LARGE`，未到读图/章节离线阶段。此前合成数据、本地 Reader、Suwayomi Local Source 成功都不能作为 xkcd 实站 PASS。
- 同一个官方 `Suwayomi 2.4.2366` 和 sha256 固定 xkcd v1.6.1 JAR 在复用的 [外部真实来源测试 #42802805309](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42802805309) 中，实际 `chapterTotalCount=3321`，前 500 章 GraphQL 响应大小 `59380 bytes`，均小于原 5,000/1 MiB 上限。六任务成功；没有导出章节标题/URL、漫画图像或令牌。
- 代码审计把 `SOURCE_HOST_TOO_LARGE` 缩小到**下游 Android Binder v1**：原 `BoundSourceClient` 用 `rows.length()>2000` 保护固定 JSON String 交易，`ExternalSourceService` 的整串传输还有 480,000 字符上限。即使 GraphQL 已分页，返回 3,321 章仍会在 Reader IPC 失败。
- 新增 [`545ae428`](https://github.com/Saber-Alter-Lily/pica-library/commit/545ae428ff4f6c8d135f7755ab178439e4ca8766)：只扩展原 `:source-bridge` 的签名 AIDL，**方法追加在末尾**以保留 v1 transaction ID；Host 原有 `ParcelFileDescriptor` 管道复用于有限章节 JSON，分段验证会话，最大 5,000 章/4 MiB，接收端支持旧 v1 和新 v2、严格限制；无网络直接进入 Clean Reader，无第二 DB/插件解释器/Reader。
- 精确源码 [Android + Web 标准 CI #42803939476](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42803939476) 两 job SUCCESS、[R3 Clean APK 源隔离 #42803928570](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42803928570) SUCCESS、[综合 #42803939988](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42803939988) 适用 job SUCCESS。真实 [Android35 xkcd #42803928636](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/42803928636) 尚无 terminal PASS，不声称完成图片、双章入库、Host 撤销与离线 Hash 闭环。G1–G4 不变；main/Release/OTA/真实数据不动。

