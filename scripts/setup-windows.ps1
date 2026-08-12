$ErrorActionPreference = 'Stop'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw '未找到 Node.js。请先安装 Node.js 24 LTS。'
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host '正在启用 pnpm...'
    corepack enable
}
if (-not (Test-Path -LiteralPath '.env.local')) {
    Copy-Item -LiteralPath '.env.template' -Destination '.env.local'
    Write-Host '已创建 .env.local，请填写 PICA_ACCOUNT 和 PICA_PASSWORD。'
}

pnpm install --frozen-lockfile
pnpm build

Write-Host ''
Write-Host '配置完成。填写 .env.local 后运行：'
Write-Host 'node dist/library-cli.js serve'
