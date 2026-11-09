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
