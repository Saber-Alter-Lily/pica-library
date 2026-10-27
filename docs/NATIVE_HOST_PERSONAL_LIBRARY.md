# 手机：明确保存的外部书目（未发布）

## 云端执行补记（2026-10-26 本地时间）

**最终工程结果：`f5be335de553d3e394bc828e8e723198ef2ce61c`／CI `40459202415` 两端通过，2026-10-26 再次只读核对 PR216 仍 Draft/Open/未合并。** Web56、Vitest2620PASS/14skip/331文件、真实Chromium61通过；Android实际执行编译、testDebugUnitTest、lintDebug和assembleRelease并成功，不是缓存/跳过。成功日志未导出原生用例总数，不凭首轮471项伪造最终精确计数。未使用固定私钥、未改版本；该次常规CI没有输出可交付安装包。原生24项新增测试已随完整任务执行；下文“尚未执行”保留为封存时点历史，不再代表此精确源码当前状态。

用户已授权新Draft与既有云端调试CI；PR216基于冻结PR215。首轮源码67ef35a/CI40458023912的Web/Desktop通过；Android已真实编译并执行471项，470PASS/1FAIL（移出确认UI），没有固定签名或发布。现有紧凑日志未提供单个断言expected/actual，原失败不改判。

测试按[Android AlertController消息分发](https://android.googlesource.com/platform/frameworks/base/+/master/core/java/com/android/internal/app/AlertController.java)和[Robolectric PAUSED规则](https://robolectric.org/blog/2019/06/04/paused-looper/)，复用本项目JM测试已有的点击后mainLooper.idle；不跳过或删减确认/取消/无请求断言。产品另外补“移出完成”状态，避免旧代码在操作成功后仍显示处理中。新精确源码CI尚待执行；下文NOT_RUN/未授权是封存时点记录，不是当前授权状态。

## 实际问题与范围

前一冻结源码`8045754b88c81cd692018915a2dfe779700d0ebd`/PR215已经通过真实官方Suwayomi及合成LocalSource工程互操作；原始下载结果、失败和签名边界不变。手机原来的Host搜索结果仍为有界短会话：重启后必须重新搜索，历史不等于可管理的长期书库。本段在新的本地分支`codex/host-personal-library-20261027`补**用户明确选择的本机书目引用**，不是整个来源目录导入、来源收藏同步或下载。

沿用用户批准的目标持续隔离开发例外；本轮Local Memory路由和claim均NOT_FOUND，没有猜项目或修复DPAPI。PR215和已封存包不改，本机不运行Java、应用、浏览器、监听或迁移，不读正式资料。新Draft/CI须遵循这段的单独实际授权，固定签名、版本、发布/OTA/部署没有由本段自动获得权限。

## 用户路径

1. 为自己配置的Host明确授权并选源，搜索作品；点击“保存到本机书库”。它核对实际作品身份后只保存书目，不打开Reader、不下载正文、不改变Host收藏。
2. 从“我的书库 → 已保存的外部作品”或原Host页查看本地书目，每页12条。结束会话、停用来源或重启后书目仍保留；列表和翻页不连接Host，不取账号秘密。
3. 读取仍需同一Host、账号主体和原来源的短会话；未授权点击只解释并预填标题，不自动连、选源或搜索。明确重新授权/选源后点击旧书目，由原适配器重新核对remoteId/sourceId/URL摘要，再进入同一`ReaderActivity/HostReaderSource`。不是根据标题认领另一作品。
4. “移出本机书目”先确认，只删除这个引用。已经保存的本地副本、阅读历史、宿主收藏/正文不删；即使Host离线或配置损坏，也不以Host会话作为本机移除许可。
5. 真正离线阅读仍用原来的“选择一章保存到本地”，进入原`LocalComicStore/Reader`。保存引用绝不显示成已下载或承诺离线正文。

## 复用与模块边界

- 参考[Mihon已有的明确加入书库流程](https://mihon.app/docs/guides/getting-started)，但不复制它的来源执行器或自动更新行为。沿用我们的八个固定Host操作、短期权限、主Reader、独立本地保存器和现有书库导航；不新增Host、下载队列、浏览器或外网默认目录。
- 持久化复用Android标准[`AtomicFile`](https://developer.android.com/reference/android/util/AtomicFile)，不用自造文件替换器。官方明确AtomicFile本身不提供并发锁；本模块各实例读/修改/写均共享类锁，只保证同进程串行，不宣称跨进程CAS或物理断电验证。标准有效`.bak`恢复与“无法解析就重置”是两回事。
- `HostSavedBooks`只是可选来源的**引用序列化/存储适配器**，不取代`UnifiedCatalogStore`，不维护第二套推荐、标签、阅读进度或正文。现有统一书库有真实入口，但本段尚未将Host ID放进不支持它的旧收藏/标签/同步/推荐协议；不会用Pica ID冒充它。
- 使用原来按Host配置UUID + 账号主体摘要 + signed64来源ID字符串 + URL摘要构成的`hosted:`身份。标题、保存时间和远端数字行号不作为跨作品合并依据；两端既有ID公式有独立Node/原生固定样本对照。

## 文件与数据安全

App私有目录新增`user-host-saved-books-v1.json`，独立格式v1，不修改SQLite/schema、旧统一目录、旧身份、正文目录或现有同步/推荐状态。根只含`schemaVersion/books`；每条恰好`comicId/connectionId/principal/sourceId/remoteId/urlDigest/title/hostLabel/savedAt`九字段。没有endpoint、原URL、账号名、密码、Cookie、Token、短会话ID、图片或章节列表。

仅明确保存才首次写文件。最多500条/2MiB，满了拒绝新增并解释，不静默淘汰用户选择；重复保存不增副本，已验证标题更新保留首次保存时间。严格UTF8/JSON/字段/有符号Long字符串/组合身份/时间校验，重复、尾随、超大、未来格式或未知字段拒绝。没有有效AtomicFile恢复副本的坏文件保持原样并阻止写入/移除，不把损坏解释为空库，不自动重置。

书目本身是个人信息，写入位置是该App私有空间；本模块没有应用级导出/跨端传输/账号权限迁移。现有Manifest的allowBackup=true未改，因此Android系统备份/设备迁移仍按系统和现有App设置运行，不能承诺元数据绝不离开设备。主体摘要不是匿名化保证，也不是来源授权。旧账号、不同来源、配置指向变化、到期、撤销以及宿主行号复用均不能借一个已保存引用获得请求权限。恢复操作始终携带原捕获的短会话，不在中途重新获取另一个会话的权限；写入异常或OOME走标准failWrite清理，不展示异常原文。

## 有限门禁与状态

本段对应原SRC与书库连续性案例，不扩充7阶段/42产品案例。原生回归覆盖：明确保存/没有隐式请求、重新实例化与授权、旧ID及Long字符串、账号/来源/过期拒绝、同名不合并、原Reader接线、移除确认与资料保留、12条分页、坏文件不覆盖、容量与字节上限、同进程并发与标准备份恢复。

本地仅做Node源码/资源契约、关联服务/惰性UI回归、类型和Node `java-parser`文法检查；这些**不是Android编译、Robolectric执行或真机测试**。第一轮关联234PASS/1FAIL由原防泄漏门禁挡住`failure.getMessage()`；改用明确的`HostSavedBooks.Full`异常类型，旧门禁不放宽，原失败保留。实际计数以本轮独立验证receipt为准。

新增原生测试和完整Android CI仍待实际执行；未生成新安装包，不要求用户测试。仍未完成：完整原生Host元数据/私人标签/收藏、跨端身份与同步、后台恢复、第二真实平台及最终同源码集中候选。总目标保持OPEN，不把这一块本机书目保留称为“完全接源”。

本地封存：regression-4共235PASS/0FAIL/0skip、17文件，types-3通过，IO审计均0事件且运行期间源码哈希未变；grammar-5用Node解析254个Java文件无语法错误。三语言XML有效，各61个唯一字符串。新增24项原生测试（存储12、管理器5、实际UI7）尚未编译/执行，不把文法或源码检查当作这些断言已经通过。
