# Pica Library v0.2.0 本地产品架构

状态：`0.2.0-dev.1` 本地验收设计；公开稳定版仍为 `v0.1.3`。

## 稳定边界

| 边界 | 职责 | 不负责 |
| --- | --- | --- |
| `ProviderService` | 收藏同步、搜索、详情、章节/图片、单本远端收藏变更 | UI、批量远端收藏 |
| `RecommendationService` | Session、Batch、seen cycle、耗尽/重开 | 改写 Recommendation V2 权重 |
| `PreviewCacheManager` | 哈希命名、TTL、LRU、容量、清理 | 永久下载内容 |
| `LibraryQueryService` | 同一查询驱动列表、计数、facet、全部筛选结果 | 前端二次过滤 |
| `ShelfService` | 本地书架 CRUD、成员与批量加入 | Pica 收藏或文件删除 |
| `ReaderService` | 已下载文件读取、进度、CBZ、默认阅读器 | 在线整章串流 |
| `UpdateManager` | 验证、暂存、外部 updater 交接 | 运行进程自覆盖 |
| `AppCapabilities` | 版本与功能协商 | 根据 UI 猜测能力 |

## 数据和调用方向

浏览器只调用 loopback Local Engine。Provider API 的签名、token 和 Cookie 不进入浏览器；媒体通过独立的无 API 认证客户端读取，再由 Local Engine 提供短生命周期预览。数据库写入集中在 `LibraryDatabase`，服务层不散落建表语句。

数据库 schema v6 依次包含基础库、生命周期、封面、下载可观测性、书架/阅读/推荐状态和 `app_state`。迁移有顺序、事务和迁移前备份；旧 v0.1.x 数据可原位升级。

## 兼容性表面

- App API：2
- Database schema：6
- Bundle format：1（新增字段可选，旧导入保持兼容）
- Update manifest：1
- Reader API：1

`GET /api/v1/capabilities` 是 Web UI 的唯一能力发现入口。新增能力应先增加服务接口和 capability，再增加 UI；不要让页面探测私有方法。

## 安全与扩展规则

- 更新只能写应用 allowlist，用户数据根不在更新域。
- Reader 只能解析数据库已登记、realpath 仍位于 Library 根内的文件。
- Shelf 永远是 local-only；未来 Smart Shelf 应作为新规则层加入，不改变现有成员语义。
- Recommendation 新 Session 继续复用 V2 排序，只改变曝光周期。
- 新 Provider mutation 必须能确认最终远端状态；否则 capability 为 false。
- 第三方阅读器只通过安全参数数组调用；本轮不捆绑二进制。
