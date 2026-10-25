# 当前集中验收入口：只认这一份安装候选

## 现在可以测试的包

`PICA_MODULAR_READER_CONSOLIDATED_ACCEPTANCE_20261024_9e879d3aa703_r2.zip`

本机位置：`C:\Users\PC\Documents\海鲜市场\deliverables\PICA_MODULAR_READER_CONSOLIDATED_ACCEPTANCE_20261024_9e879d3aa703_r2.zip`。

SHA-256：`77c664ba48f824fea40d9e103853c8e172e2faf52a99fdae21eea6d5a518ddf3`；安装候选源码固定为 `9e879d3aa7030d1fc49a92354f54bba0bd610074`。本轮只读复核了外包、Windows/APK 实际字节哈希与 Windows SOURCE_SHA/module-contracts，均未变；Android 证书沿用此前验证回执，没有本地启动 Java 重验。

包内实际安装文件：

- `installables/Pica-Library-Next-Acceptance-Windows-x64.zip`，SHA-256 `ccfa145aa97215ac74223e58f4b4dab7ef179853b1bab20e4d82a7d2ef6cbf0f`。
- `installables/Pica-Library-Next-Acceptance-Android-Dev.apk`，Dev82，包名 `com.picalibrary.android.dev`，SHA-256 `64e02187e65155637caa35437b9144b574e3fac7bf8eb3b075365bf28915eaa2`。
- 分组步骤以包内 `docs/NEXT_CONCENTRATED_ACCEPTANCE_CHECKLIST.zh-CN.md` 为准；不是要求现在开始测试。

Windows 完整解压到独立程序目录，准备好测试时再自行启动；以内部 TEST_BUILD.txt 的隔离目录声明为准，不覆盖正式程序、不复制正式数据库。Android 只覆盖现有 Dev；签名不一致或系统拒绝版本覆盖时停止，不卸载、清数据或强行降级。这里没有自动安装、进程清理或部署授权。

软件内“检查更新”的正式 OTA 不是这个未发布候选。包内合成升级诊断材料也不是供用户安装的更新包；真实升级/断电/旧控制器验收需要明确提供的目标包，不自行尝试生产覆盖。

## 先验证三条真实使用路径

1. 无来源、无账号：导入一份自己的小文件夹/CBZ，预览→确认→阅读→退出→恢复进度。只看本地不必配置推荐、画风或任何来源。
2. 按需接源：只测自己选择和有条件使用的 Pica/E-H/JM；不使用的记“不适用”。用户宿主阅读仅限 Desktop 的单独授权范围，不把它当手机/全源搜索/扩展安装已经完成。
3. 两套引导与日常操作：日常流程是否能明白，高级功能是否可以跳过；标签/AI/手机离线及 LAN/WebDAV 依原分组清单继续，不重做每次内部重构。

记录“通过/失败/未执行/不适用”，失败保留步骤、错误原文和脱敏截图。不要上传 Cookie、配对码、凭据、整库或漫画正文。人工/真机/真实来源/质量验收仍未完成，自动化和哈希检查不能替代它。

## 与本地源码进展分开

`PICA_PROFILE_*_PROGRESS_*.zip` 是本地源码/证据包，不是更新安装包。NEXT68–79 的私有恢复工作没有并入上述固定安装候选，也不再作为它的测试前置；恢复界面、真实目标发布和完整回滚仍未完成。

本轮仅修正 Desktop/Web 的已有引导文案：说清无需账号、本地文件夹/CBZ 的实际入口、在线发现可跳过、导入的预览/复制/格式/平台限制。日常仍7步，高级本地导入说明追加到存储章节末尾，不改变既有步骤索引或 GUIDE_VERSION3，不重置引导进度，不启动任务。Android 引导和安装包均未更改。

上述引导收尾后，又在本地[拆出 Web 阅读输入规则](WEB_READER_INPUT_MODULE.md)，修正弹窗、编辑区、输入法和组合键被阅读器快捷键抢占的问题；沿用已有翻页语义，不改手机手势、来源、推荐或升级逻辑。

随后本地[拆出 Web 阅读视口跟踪](WEB_READER_VIEWPORT_MODULE.md)，清理切章/离开后的旧观察器、滚动与动画帧，防止旧回调污染当前进度，以及旧退出操作关闭新作品。保存接口和数据格式不变；异步保存持久性及浏览器/真机仍需独立验证。

本地又[拆出进度状态与写入调度](READER_PROGRESS_MODULE.md)，修正旧保存回执误清除新修改，以及在线/宿主保存异步完成顺序覆盖的问题。复用既有 p-limit，同一存储对象/进度键在当前后端按进入服务的顺序写入；不是跨设备、乱序到达、重启或断电的持久化裁决。请求和数据库格式未变。

**这些新文字、输入、视口与进度模块都还不在固定 r2 安装包里。** 各自证据包记录其本地纯模块/默认策略/更新兼容性/引导/输入/模拟视口/合成进度检查、类型和 Web 语法；没有运行当前源码的浏览器、应用、Java、完整 CI 或打新安装包。若以后要包含到新候选，需要单独冻结源码并跑其精确源码 CI，不能借用 r2 的旧绿灯。旧包的差异不阻止先验证既有本地阅读能力。

完整本地优先、不自带内容、用户自选来源、模块化与一次应用更新目标仍 OPEN；[主验收范围与长期待办](NEXT_USER_ACCEPTANCE_SCOPE.md) 不因这份入口文档而缩小或被宣布完成。没有 main 合并、tag/Release、OTA 或远端写入。
