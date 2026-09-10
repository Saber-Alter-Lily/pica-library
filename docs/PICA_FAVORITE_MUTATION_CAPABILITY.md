# Pica Favorite Mutation Capability

- available: **true**
- SDK method: `Pica.fav(bookId)`
- request: `POST comics/{bookId}/favourite`
- semantics: Provider endpoint是 toggle，而不是幂等 add/remove。
- expected response: SDK 只要求 Provider 请求成功；业务层随后重新读取 `comicInfo(bookId).isFavourite` 作为最终判据。
- rate limit: Provider 未在当前 SDK 合同中给出可靠阈值；429 保留为失败，不自动批量重试 mutation。

`ProviderService.setFavorite(id, desired)` 先读取远端状态；已经满足 desired 时不 toggle。否则只调用一次 `fav`，再次读取远端状态，只有确认一致后才更新本地 `is_favorite`。认证、网络/代理、429、异常响应或确认不一致都会 fail closed，本地状态不变。

UI 依据 `/api/v1/capabilities.features.providerFavoriteMutation` 显示单本按钮。本轮不提供批量远端变更。自动测试全部使用 provider mock，不接触真实账号；人工验收只允许挑选一部测试。
