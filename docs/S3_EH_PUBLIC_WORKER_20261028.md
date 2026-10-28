# S3｜E-H 公开读取：现有 Provider 独立进程适配（2026-10-28）

状态：Draft PR #223 / UNPUBLISHED / ENGINEERING_SLICE。基于 #222 的签名进程和共用 Reader；不是来源外置完成、更不是可发布的来源市场。v0.5.0、main、OTA、Android 签名与用户资料未改。

## OSS 与项目内代码复用

原样使用已有 src/providers/eh-provider.ts 中的 EhProvider.episodes / pages / fetchPage，实现真实 E-H 画廊元数据、章节 HTML 和图片解析；不另写爬取器。Mihon 的内容中立架构及可选 Suwayomi Host 是设计参考，不照搬未经审核的第三方可执行插件加载器。

本阶段严格限定匿名公开只读，不包含 Cookie/登录、ExH、收藏、搜索、下载。没有提供任意工作进程路径、远程可执行插件 URL、源码商店或自动启用能力。

## 实际工程链

- eh-public-identity.ts：保留原 eh:gid:token 数据库及 Reader 作品 ID，在 IPC 内转换成受限别名 eh-public-reader:gid_token；大小写／前导零原样往返，不迁移旧数据库主键。
- eh-public-bridge.ts：只有应用受信任组合入口可注入身份映射，签名 manifest 或 HTTP 都不能注册它。把签名来源的作品投影为旧 catalogue:eh，两个阅读通道在统一书库中归为同一作品、不同 route。
- signed-source-reader.ts：兼容旧调用方、默认空桥接映射；经原 OnlineReaderService 进行章节、页媒体、缓存和进度。签名源进度仍写入单独 signed-source-progress-v1 命名空间。
- eh-public-reader-transport.ts：用真实 EhProvider 读取。原 eh-page 媒体定位符只留在来源工作进程，主 Reader 只能看 32 字符 HMAC 临时页面 token。token 绑定源内作品／章节／原 locator，随机密钥按进程生成；最多保留四个章节、单个 locator 512 字符、拒绝越界及混用，错误刷新不能先删除健康旧 token。
- workers/eh-public-worker.ts：可独立 bundle 的单文件 CommonJS 入口，IPC 仅 hello、episodes、pages、media。无账号/凭据入口、自更新、安装、搜索与下载。生产 Desktop 主入口和 Android 默认包都没有注册该来源，因此实际正式用户仍不可开启它。

## 已执行与未执行的测试

新增 test/unit/eh-public-reader-migration.test.ts：用固定离线 HTTP 响应驱动真实 E-H Provider 的解析代码，检查旧 ID、跨作品防护、token、不替换旧进度和 disable 后缓存仍拒绝。

新增 test/unit/eh-public-worker-ipc.test.ts：运行 esbuild 编译真实 E-H Provider，实际将单文件生成物按临时 Ed25519 密钥签名并装到 SignedWorkerStore，通过 OS 子进程 IPC 走现有 Reader 的章节/图片/进度/统一书库路径，显式禁用验证原有会话被撤销，测试时无真实网站网络或个人凭据。新增编译 import-metafile 校验：可选 worker 必含 E-H Provider，但不应混入 Desktop main、Pica SDK。

精确 SHA 218316841536c66e6bb8cfdca52d193937785faf 的 [Linux/Windows S3 专项 #40732088085](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40732088085) 已 SUCCESS：Linux 91/91、Windows 65/65、双系统类型检查通过。此后提交了 token 限界、无损刷新和 bundle 图检查，当前 HEAD 必须重新验收；不可继承旧绿灯。全项目 CI 包含 Android 和 Web/Desktop，两者状态也须按新 HEAD 分别核验。

## 待完成阻断

| 门禁 | 实际状态 |
|---|---|
| S3-EH-01 实际旧 E-H Provider 通过签名进程驱动原 Reader | 工程候选已实现，旧 SHA 专项通过，新 HEAD 待核 |
| S3-EH-02 旧作品 ID、独立进度与书库合并 | 离线真实进程回归已做，尚未设备/实网 |
| S3-EH-03 官方签名发行、受保护 Windows 根、公钥更新 | NOT_IMPLEMENTED |
| S3-EH-04 真实 E-H 公共站点互操作与许可/协议审核 | NOT_RUN |
| S3-EH-05 ExH/账号/收藏/下载及真实 v0.5.0 历史迁移 | NOT_IMPLEMENTED |
| S3-EH-06 Android Service/Binder 与物理纯 Core APK | NOT_IMPLEMENTED |
| NEW-SRC-01 核心 Windows/APK 全面移除 Pica/EH/JM SDK | NOT_IMPLEMENTED |
| G1 手机视觉、G2 来源独立、G3 无痛升级、G4 允许发布 | OPEN |

后续：复核新 HEAD 的精确 CI；建立可信发布根与受控 OS 权限，完成一次真实 E-H 匿名阅读及协议/许可核对；再迁移其余来源与 Android，最后真实用户资料/旧库/下载/阅读恢复/自动升级和回滚的物理验收。用户自行接入来源不构成版权或平台条款的普遍免责。
