# P2：真实用户宿主互操作门禁（未发布）

## 范围与授权

用户已允许新独立Draft及临时云端互操作验证：固定Suwayomi v2.4.2366，仅使用合成图片/CBZ；不安装第三方源、不访问真实平台、不签发安装包、不合并/发布/OTA/部署，本机不启动Java、应用或监听。沿用已批准的目标持续隔离开发例外；Local Memory只读路由仍NOT_FOUND，未猜身份/重置DPAPI。

独立分支`codex/source-host-interop-20261026`基于已验证T3源码`5f4b7ead0fcd4faff0974450adf65bdc910717f2`。PR214/T3、PR213/Dev88和正式安装不改。此门禁不修改应用代码、数据库schema、版本或依赖，不重新生成/签名APK；仓库常规调试CI如自动触发，须与固定签名/发布区分并遵循本轮实际授权。

用户已补充确认允许既有常规CI构建并用临时debug证书签名调试APK；禁止固定私钥/签名Secrets、改Dev版本或发布安装包。专用Host任务仍无Android构建/签名，不把调试构建当成新验收安装包。

## 复用与原包绑定

- 使用[Suwayomi官方v2.4.2366](https://github.com/Suwayomi/Suwayomi-Server/releases/tag/v2.4.2366)，固定源码40bc5da57820324ed0ae724cbbc020cc4673b594；官方JAR182952426字节，SHA256 af9feb20af9d7ebe9e30769e6c6ebc7fc7ab1c447388d42e0280b1da5fe07bfd。只在临时runner下载/执行，不进入Pica包或artifact。
- 已核对26份官方固定Git blob：协议、启动/配置、内置Local Source及Java21目标；来源清单/字节哈希在`_validation/source-host-interop-20261026`。原实现不复制进应用；根许可MPL-2.0不等于对所有内嵌组件重新许可。
- 复用应用现有`SourceHostConnections/Inspector`、固定八个GraphQL操作、`HostedLibraryReader`、`PreviewCacheManager`、既有调度/资源协调、`LocalLibraryIngestion`和`ReaderService`。不写第二个宿主、阅读器或下载器，不用自造GraphQL/图片响应冒充真实接口。
- Suwayomi内置Local Source的来源ID是字符串`0`，不是Pica ID。官方`ChapterType.sourceOrder`与数据类`index`的转换已追踪；不能仅因名字不同就修补协议或放宽页面归属校验。

## 有限工程场景（仍属于既有SRC/CORE案例，不增加42项产品全集）

| 场景 | 必须实际证明 |
| --- | --- |
| H1 运行身份与隔离 | 官方JAR长度/哈希、当前Git源码、独立net namespace；仅lo接口、无外部路由；只停止本次spawn且命令行绑定JAR/私有root的子进程 |
| H2 用户连接边界 | 保存/启用/状态无请求；显式检查真实aboutServer与内置来源列表，无账号继承、默认外部内容或扩展安装 |
| H3 真实协议与范围 | 八个既有固定操作全部到达真实宿主；library-read不能替代source-search-read；另行选择一个已列出的来源 |
| H4 阅读 | 自建文件夹和CBZ各一册、每册两张不同合成图；由原Reader访问真实宿主页面，逐页SHA核对顺序与内容，记录独立进度 |
| H5 明确本地保存 | 未确认本地复制必须拒绝；明确确认后由同一调度/导入器发布完整本地副本，不调用宿主下载队列或收藏操作 |
| H6 断源与持久化 | 禁用撤销旧会话，确认宿主进程退出；另启全新Node进程、原本地Reader/SQLite，四页与页码仍正确，无Host请求或缓存冒充副本 |

## 运行与失败边界

专用workflow只允许精确公共仓库/分支、非PR入口，contents:read，Java21/Node24；下载在隔离测试前完成。真实Java和客户端同处无外部接口/路由的Linux网络namespace，关闭CEF/托盘/浏览器/自动更新/扩展仓库。只用上游支持的属性，不修补JAR或伪造版本/响应。本机入口在读取参数文件、TS/应用加载前拒绝。

仅上传小型`result.json`及失败时最多16KiB宿主启动尾部；不上传JAR、图片/CBZ、数据库、配置或用户内容/凭据。测试保留错误步骤、源码、真实操作计数与独立离线结果。发现失败先读该次证据；同根因至多两轮有依据修正，之后路线评审，不改弱门禁或原样重复启动。

## 不能由本门禁宣布完成的事项

这是**真实宿主 + 合成内置来源 + 生产服务模块链路**，不是第二个真实漫画平台、Windows成品GUI、Android真机或任意扩展兼容证明。完整持久化原生在线目录、私人标签/收藏/跨端同步与后台任务恢复仍未完成。公开分发信任、真机/OEM、AI/标签/同步体验和P6集中候选继续开放。用户不需要代替开发者执行这批工程测试。

当前状态：源码/测试准备，真实运行尚未执行；实际source SHA、Actions、下载结果和错误/通过结论须在执行后另记，不借用T3或Dev88绿灯。
