# Security and content policy

## Credentials

- 账号和密码只从进程环境或被 Git 忽略的 `.env.local` 读取。
- 登录日志不打印密码，SQLite 不保存账号、密码或会话令牌。
- 不要把 `.env.local`、数据库、收藏导出或下载内容提交到 Git。

## Local web service

- 默认只监听 `127.0.0.1`。
- 非回环地址默认拒绝启动；明确设置 `PICA_LIBRARY_ALLOW_REMOTE=true` 才能覆盖。
- 带浏览器 `Origin` 的跨域写请求会被拒绝。
- 若要跨设备使用，请自行增加受信任的反向代理、TLS 和身份验证；当前版本不应直接暴露到公网。

## Downloaded content

GitHub 仓库、Pages、Releases 和 CI 只用于源码、文档、测试与构建产物。本项目不把漫画内容上传为 Actions artifact，也不提供第三方临时网盘上传。使用者应只保存有权访问的内容，并自行遵守站点规则和适用法律。

## Reporting

请通过 GitHub Security Advisory 私下报告凭据泄漏、路径穿越、跨域写入或任意文件覆盖问题。不要在公开 Issue 中附带真实账号、令牌、收藏清单或漫画文件。
