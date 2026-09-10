# Recommendation Session v1

一个 exposure cycle 包含多个 Session；一个 Session 最多 60 部，按 12 部组成最多 5 个 Batch。Session 1 的首批仍由原 Recommendation V2 确定，因此同 fixture 的 Batch 1 顺序不变。

用户看完 5/5 后，“继续发现”请求 Session 2，而不是回绕 Session 1。服务在数据库保存 `recommendation_sessions` 和 `recommendation_seen`，新 Session 排除当前 cycle 已展示 ID。若候选池没有未展示结果，返回“暂时没有更多未展示推荐。”，不伪造新颖性。

“重新开始推荐”必须经确认，创建新 cycle 并清空该 cycle 的曝光限制；它不会修改 V2 权重、收藏排除、canonical 去重或多样性重排规则。

Browser Lite 离线包最多预计算 100 个结果并拆为 bounded sessions，不含预览页二进制。离线 Session 用尽后显示：

> 当前离线数据中的推荐已经看完。重新同步并导出 Browser Lite 数据包可获得新的推荐。
