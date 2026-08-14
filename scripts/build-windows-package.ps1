$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw -LiteralPath (Join-Path $root 'package.json') | ConvertFrom-Json
$version = [string]$package.version
$nodeVersion = '24.15.0'
$name = 'Pica-Library-v0.1.4-dev.2-local-test-windows-x64'
$buildRoot = Join-Path $root 'artifacts\windows-package'
$stage = Join-Path $buildRoot $name
$zip = Join-Path $root "artifacts\$name.zip"
$runtimeCache = Join-Path $root "artifacts\cache\node-v$nodeVersion-win-x64.zip"
$runtimeFile = "node-v$nodeVersion-win-x64.zip"
$sourceSha = (git -C $root rev-parse HEAD).Trim()

function Get-Sha256([string]$file) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash([IO.File]::OpenRead($file)))).Replace('-','').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}

if ($version -ne '0.1.4-dev.2') { throw 'Local Windows package must report version 0.1.4-dev.2' }
if ($sourceSha -notmatch '^[0-9a-f]{40}$') { throw 'Could not resolve source commit SHA' }
if (Test-Path -LiteralPath $stage) { Remove-Item -Recurse -Force -LiteralPath $stage }
if (Test-Path -LiteralPath $zip) { Remove-Item -Force -LiteralPath $zip }
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'app'),(Join-Path $stage 'runtime'),(Join-Path $stage 'licenses'),(Split-Path $runtimeCache -Parent) | Out-Null

Push-Location $root
try { pnpm build } finally { Pop-Location }

if (-not (Test-Path -LiteralPath $runtimeCache)) {
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-win-x64.zip" -OutFile $runtimeCache
}
$checksums = (Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$nodeVersion/SHASUMS256.txt").Content
$expectedLine = @($checksums -split "`n" | Where-Object { $_ -match "\s$([regex]::Escape($runtimeFile))\s*$" })[0]
if (-not $expectedLine) { throw 'Official Node.js runtime checksum was not found' }
$expectedHash = ($expectedLine -split '\s+')[0].ToLowerInvariant()
$actualHash = Get-Sha256 $runtimeCache
if ($actualHash -ne $expectedHash) { throw 'Official Node.js runtime checksum mismatch' }
$runtimeExtract = Join-Path $buildRoot 'runtime-extract'
if (Test-Path -LiteralPath $runtimeExtract) { Remove-Item -Recurse -Force -LiteralPath $runtimeExtract }
Expand-Archive -LiteralPath $runtimeCache -DestinationPath $runtimeExtract
Copy-Item -LiteralPath (Join-Path $runtimeExtract "node-v$nodeVersion-win-x64\node.exe") -Destination (Join-Path $stage 'runtime\node.exe')
Copy-Item -LiteralPath (Join-Path $runtimeExtract "node-v$nodeVersion-win-x64\LICENSE") -Destination (Join-Path $stage 'licenses\Node.js-LICENSE.txt')

Copy-Item -Path (Join-Path $root 'dist\*.js') -Destination (Join-Path $stage 'app')
Copy-Item -LiteralPath (Join-Path $root 'dist\licenses\THIRD_PARTY_LICENSES.txt') -Destination (Join-Path $stage 'licenses\THIRD_PARTY_LICENSES.txt')
Copy-Item -LiteralPath (Join-Path $root 'web') -Destination $stage -Recurse
Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination $stage
foreach ($notice in @('NOTICE.md','UPSTREAM.md')) { Copy-Item -LiteralPath (Join-Path $root $notice) -Destination $stage }
foreach ($requiredLicense in @('licenses\Node.js-LICENSE.txt','licenses\THIRD_PARTY_LICENSES.txt')) {
    $licensePath = Join-Path $stage $requiredLicense
    if (-not (Test-Path -LiteralPath $licensePath) -or (Get-Item -LiteralPath $licensePath).Length -eq 0) {
        throw "Required redistributed license material is missing: $requiredLicense"
    }
}

$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $csc)) { throw 'The Windows .NET Framework compiler is unavailable' }
& $csc /nologo /target:winexe /optimize+ /platform:x64 /reference:System.Windows.Forms.dll "/out:$stage\Pica Library.exe" (Join-Path $root 'packaging\windows\Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed' }

$readme = @"
Pica Library v$version for Windows 10/11 x64

1. Extract the entire ZIP.
2. Double-click Pica Library.exe.
3. Complete setup in the browser.
4. To use Browser Lite, open Settings > Browser Lite and export the data package.

No separate Node.js, npm, pnpm, Git, terminal, or administrator access is required.
This unsigned open-source build may show a Windows SmartScreen reputation warning.
"@
[IO.File]::WriteAllText((Join-Path $stage 'README-WINDOWS.txt'),$readme,(New-Object Text.UTF8Encoding($false)))
$readmeZh = @"
Pica Library v$version Windows 10/11 x64

1. 解压完整 ZIP。
2. 双击 Pica Library.exe。
3. 在浏览器中完成首次设置。
4. 可在设置中使用同步、下载和已下载漫画视图。

这是本地验收构建，不需要单独安装 Node.js、npm、pnpm、Git 或管理员权限。
"@
[IO.File]::WriteAllText((Join-Path $stage 'README-WINDOWS.zh-CN.txt'),$readmeZh,(New-Object Text.UTF8Encoding($false)))
[IO.File]::WriteAllText((Join-Path $stage 'SOURCE_SHA.txt'),"$sourceSha`n",(New-Object Text.UTF8Encoding($false)))

$forbidden = Get-ChildItem -LiteralPath $stage -Recurse -Force | Where-Object {
    $_.Name -eq '.git' -or
    $_.Name -match '^\.env($|\.)' -or
    $_.Name -match '\.db(-shm|-wal)?$' -or
    $_.FullName -match '\\node_modules\\'
}
if ($forbidden) { throw 'Forbidden package content detected' }
$textFiles = Get-ChildItem -LiteralPath $stage -Recurse -File | Where-Object {
    $_.Extension -in @('.js','.html','.css','.json','.md','.txt')
}
foreach ($file in $textFiles) {
    $text = [IO.File]::ReadAllText($file.FullName)
    if ($text -match '(?i)[A-Z]:\\Users\\[^\\]+\\' -or $text -match '(?im)^\s*PICA_(ACCOUNT|PASSWORD)\s*=\s*[^;\r\n]+$') {
        throw "Sensitive or developer-specific content detected in $($file.Name)"
    }
}
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
$hash = Get-Sha256 $zip
[IO.File]::WriteAllText((Join-Path $root 'artifacts\SHA256SUMS.txt'),"$hash  $name.zip`n",(New-Object Text.UTF8Encoding($false)))
[ordered]@{ path=$zip; sha256=$hash; size_bytes=(Get-Item $zip).Length; uncompressed_bytes=(Get-ChildItem $stage -File -Recurse | Measure-Object Length -Sum).Sum; file_count=@(Get-ChildItem $stage -File -Recurse).Count; node_version=$nodeVersion; product_version=$version; source_sha=$sourceSha } | ConvertTo-Json
