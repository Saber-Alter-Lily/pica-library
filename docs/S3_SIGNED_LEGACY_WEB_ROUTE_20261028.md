# S3 Web Reader｜历史来源作品的签名阅读入口修复（2026-10-28）

**状态：Draft PR #225 / 未发布。** 继承 Draft #224 → #223 → #222，正式 v0.5.0/main、安装包、账号和数据库未修改。

## 真实缺陷与路径

先前已实现旧 E-H identity bridge，保持原始 eh:gid:token ID，并在 ReadingLibrary 投影为同一 E-H 作品。Web 阅读列表的“从已验证来源阅读”可以调用 openSigned(comicId,sessionId)，但同一 Web Reader 的 openReaderComic 入口此前只允许单冒号 source:opaque，遇到原始 E-H 双冒号 ID 即静默返回；导致 worker / HTTP / 书库的专项测试通过，但用户点击没有实际进入阅读器。这是实际代码路径上的功能缺陷，不是 UI 样式问题。

## 修复及复用

- 新增 web/signed-reader-route.js（及 TS 声明），只在浏览器层做有限语法校验：source:opaque 或 source:opaque:opaque；长度与字符限制，拒绝 local/hosted/URL/路径/额外冒号。它不包含 E-H 解析器，也不授予来源权限。
- web/app.js 在 signed 入口调用该来源无关校验。拒绝危险路由时显式抛错，交由已有阅读列表错误状态展示，避免点击时无反馈；仍对每个 signed metadata/progress HTTP 请求携带会话 CSRF。真正来源、工作归属、版本/权限和撤销继续由 Desktop SignedSourceDesktopReader 和受信任 identity bridge 验证。
- 保留旧 eh:gid:token 字符串并经 encodeURIComponent 路由到原 Web Reader；不创建第二 Reader、不覆盖旧 online 和本地进度、不修改数据库主键。
- test/unit/signed-reader-web-routing.test.ts：运行从实际 web/app.js TypeScript AST 提取的 openReaderComic 函数，检查双冒号旧 ID、签名会话、章节+进度 API 路径、CSRF、导航回调；非法 ID/无效 session 在任何 API/页面变更前拒绝。
- 扩充 reading-library-ui.test.ts：模拟真实已保存 E-H catalogue 记录，online 不可用、signed route 可用时，实际点击“从已验证来源阅读”必须调用 signed 而不是旧在线 Provider；保留原三语言文案测试。

## 验收

- 首轮 S3 #40811134919 对 1043285c 失败：两个系统 TypeScript 报 test/unit/signed-reader-web-routing.test.ts 第 72 行 AST 节点可能为空；是测试辅助函数的类型缩小问题，不是阅读器运行问题。修复为非空断言并提交 066f105fa3b4fdf349f26e532696c68d37a78f1e，失败历史保留。
- 精确修复代码的 [Linux/Windows 专项 #40811216292](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40811216292) **SUCCESS**：Linux 14 文件 / 125/125 测试通过，Windows 10 文件 / 99/99 测试通过，两平台类型检查成功。
- 新源码的 [完整 CI #40811220694](https://github.com/Saber-Alter-Lily/pica-library/actions/runs/40811220694) 此文件登记时仍在执行，NOT_VERIFIED；不得将专项成功当作正式双端设备验收。

## 尚未完成

- 正式 Windows 主程序没有可信发布根和组件安装服务，E-H 独立 worker 尚不能让真实用户使用；真实网站联网/账号/下载未验证。
- 纯核心 Windows 和 Android 仍捆绑旧来源 SDK。Android 隔离进程、生产签名根、用户旧资料无痛迁移/升级/回滚与真机实际阅读尚待完成。G1/G2/G3/G4 仍 OPEN。

下一工作按既定 S3/S5 顺序：审查完整 CI → 单一信任根、受保护安装目录和 OS 权限设计 → 实际来源发行/独立启停 → 真实零来源安装/老版本数据迁移 → Android 真机与 Windows 验收。用户自行接入来源不代表自动规避版权或服务条款责任。
