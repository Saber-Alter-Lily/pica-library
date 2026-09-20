$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$ReleaseTag = 'v0.4.1'
$AssetName = 'Pica-Library-v0.4.1-upgrade-assistant.zip'
$HashName = 'Pica-Library-v0.4.1-upgrade-assistant.sha256'
$Repository = [string]$env:GITHUB_REPOSITORY

if ([string]::IsNullOrWhiteSpace($Repository)) {
    throw 'GITHUB_REPOSITORY is missing.'
}
if ([string]::IsNullOrWhiteSpace([string]$env:GH_TOKEN)) {
    throw 'GH_TOKEN is missing.'
}

$root = Split-Path -Parent $PSScriptRoot
$assistantRoot = Join-Path $root 'packaging\windows\upgrade-assistant-v041'
$assistantScript = Join-Path $assistantRoot 'Upgrade-Pica-Library-v0.4.1.ps1'
$assistantLauncher = Join-Path $assistantRoot 'Upgrade-Pica-Library-v0.4.1.cmd'
$publishRoot = Join-Path $root 'artifacts\v041-upgrade-assistant-publish'
$asset = Join-Path $publishRoot $AssetName
$hashFile = Join-Path $publishRoot $HashName

foreach ($required in @($assistantScript, $assistantLauncher, (Join-Path $assistantRoot 'README.txt'))) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required assistant file is missing: $required"
    }
}

$tokens = $null
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path $assistantScript),
    [ref]$tokens,
    [ref]$errors
)
if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_.Message }
    throw "PowerShell parser reported $($errors.Count) assistant error(s)"
}

$source = Get-Content -Raw -LiteralPath $assistantScript
$requiredContracts = @(
    '$RequiredSourceVersion = ''0.4.0''',
    '$TargetVersion = ''0.4.1''',
    '88d87a8f0e5a8413656751ff344052eccbfa796e663e4acc8c7fe4a0e0866b3d',
    '974d4e9b22379aeed379b71711008332acc213a4',
    'Save-SafetySnapshot',
    'Rollback-Upgrade',
    'Assert-UserDataOutsideInstall'
)
foreach ($needle in $requiredContracts) {
    if (-not $source.Contains($needle)) {
        throw "Assistant safety contract is missing: $needle"
    }
}

Remove-Item -LiteralPath $publishRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $publishRoot | Out-Null
Compress-Archive -Path (Join-Path $assistantRoot '*') -DestinationPath $asset -CompressionLevel Optimal

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $asset).Hash.ToLowerInvariant()
"$hash  $AssetName" | Set-Content -Encoding ascii -LiteralPath $hashFile
if ((Get-Item -LiteralPath $asset).Length -gt 1MB) {
    throw 'Upgrade assistant unexpectedly exceeds 1 MiB.'
}

$release = gh release view $ReleaseTag --repo $Repository --json isDraft,isPrerelease,tagName,body | ConvertFrom-Json
if ($release.tagName -ne $ReleaseTag) {
    throw 'Stable release tag mismatch.'
}
if ($release.isDraft -or $release.isPrerelease) {
    throw 'v0.4.1 is not a published stable release.'
}

gh release upload $ReleaseTag --repo $Repository --clobber $asset $hashFile
if ($LASTEXITCODE -ne 0) {
    throw 'Failed to upload v0.4.1 upgrade assistant assets.'
}

$marker = '<!-- V041_UPGRADE_ASSISTANT -->'
if ([string]$release.body -notmatch [regex]::Escape($marker)) {
    $section = @'
<!-- V041_UPGRADE_ASSISTANT -->
## Windows v0.4.0 → v0.4.1 升级助手

**推荐 v0.4.0 Windows 用户优先使用升级助手，不需要手动覆盖程序目录。**

1. 下载 Pica-Library-v0.4.1-upgrade-assistant.zip；
2. 解压到“下载”或桌面等普通文件夹；
3. 双击 Upgrade-Pica-Library-v0.4.1.cmd；
4. 助手会自动下载并校验官方 v0.4.1 Windows 完整包，保护 %LOCALAPPDATA%\Pica Library，备份旧程序和 SQLite 数据，完成替换后执行健康检查；失败时自动回滚。

如果漫画保存目录位于旧程序文件夹内部，助手会停止自动升级并提示先迁移数据。手动完整 ZIP 替换仍可作为备用方案。

---

'@
    $notes = Join-Path $publishRoot 'release-notes.md'
    $updated = $section + [Environment]::NewLine + [string]$release.body
    [IO.File]::WriteAllText($notes, $updated, (New-Object Text.UTF8Encoding($false)))
    gh release edit $ReleaseTag --repo $Repository --notes-file $notes
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to update v0.4.1 release notes.'
    }
}

$verified = gh release view $ReleaseTag --repo $Repository --json isDraft,isPrerelease,assets,body | ConvertFrom-Json
if ($verified.isDraft -or $verified.isPrerelease) {
    throw 'Stable release state changed unexpectedly.'
}
$names = @($verified.assets | ForEach-Object { $_.name })
if ($names -notcontains $AssetName -or $names -notcontains $HashName) {
    throw 'Published assistant assets are incomplete.'
}
if ([string]$verified.body -notmatch 'V041_UPGRADE_ASSISTANT') {
    throw 'Release note assistant marker is missing.'
}

Write-Host "V041_UPGRADE_ASSISTANT_PUBLISHED=PASS"
Write-Host "ASSISTANT_SHA256=$hash"
