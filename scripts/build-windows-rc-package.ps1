param(
    [Parameter(Mandatory = $true)][string]$RcVersion,
    [string]$Output = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$packageFile = Join-Path $root 'package.json'
$stableVersion = [string]((Get-Content -Raw -LiteralPath $packageFile | ConvertFrom-Json).version)
if ($stableVersion -ne '0.4.11') {
    throw "P2 RC builder requires repository stable metadata 0.4.11; observed $stableVersion"
}
if ($RcVersion -notmatch '^0\.4\.11-p2rc\.[0-9a-f]{7,12}$') {
    throw "RC version must match 0.4.11-p2rc.<commit>: $RcVersion"
}

$gitSourceSha = (git -C $root rev-parse HEAD).Trim()
$sourceSha = if ($env:PICA_LIBRARY_BUILD_PROVENANCE) {
    [string]$env:PICA_LIBRARY_BUILD_PROVENANCE
} else {
    $gitSourceSha
}
if ($gitSourceSha -notmatch '^[0-9a-f]{40}$') {
    throw 'Could not resolve Git source commit SHA'
}
if ($sourceSha -notmatch '^[0-9a-f]{40}$') {
    throw 'Build provenance must be exactly 40 lowercase hex characters'
}

$requiredBase = Join-Path $root 'artifacts\release-base\Pica-Library-v0.4.10-windows-x64.zip'
if (-not (Test-Path -LiteralPath $requiredBase)) {
    throw 'Official v0.4.10 Windows package is required under artifacts\release-base before building the P2 RC'
}

Push-Location $root
try {
    & (Join-Path $root 'scripts\build-windows-package.ps1')
    if ($LASTEXITCODE -ne 0) {
        throw 'Stable package assembly failed before RC repackaging'
    }
} finally {
    Pop-Location
}

$stableZip = Join-Path $root 'artifacts\Pica-Library-v0.4.11-windows-x64.zip'
if (-not (Test-Path -LiteralPath $stableZip)) {
    throw 'Stable package assembly did not produce the expected v0.4.11 ZIP'
}

if ([string]::IsNullOrWhiteSpace($Output)) {
    $Output = Join-Path $root "artifacts\Pica-Library-v$RcVersion-local-test-windows-x64.zip"
} elseif (-not [IO.Path]::IsPathRooted($Output)) {
    $Output = Join-Path $root $Output
}
$Output = [IO.Path]::GetFullPath($Output)

$work = Join-Path ([IO.Path]::GetTempPath()) ("pica-p2rc-build-" + [guid]::NewGuid().ToString('N'))
$extract = Join-Path $work 'extract'
New-Item -ItemType Directory -Force -Path $extract | Out-Null
$originalPackageText = [IO.File]::ReadAllText($packageFile)
$success = $false

try {
    Expand-Archive -LiteralPath $stableZip -DestinationPath $extract

    foreach ($required in @(
        'Pica Library.exe',
        'runtime\node.exe',
        'app\desktop.js',
        'app\pica-library.js',
        'app\updater.js',
        'web',
        'SOURCE_SHA.txt'
    )) {
        if (-not (Test-Path -LiteralPath (Join-Path $extract $required))) {
            throw "Stable package tree is missing required entry: $required"
        }
    }

    $candidatePackage = $originalPackageText | ConvertFrom-Json
    $candidatePackage.version = $RcVersion
    [IO.File]::WriteAllText(
        $packageFile,
        (($candidatePackage | ConvertTo-Json -Depth 100) + "`n"),
        (New-Object Text.UTF8Encoding($false))
    )

    Push-Location $root
    try {
        pnpm build
        if ($LASTEXITCODE -ne 0) {
            throw 'RC production bundle build failed'
        }
    } finally {
        Pop-Location
    }

    Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $extract 'app\*.js')
    Copy-Item -Path (Join-Path $root 'dist\*.js') -Destination (Join-Path $extract 'app') -Force
    Copy-Item -LiteralPath (Join-Path $root 'dist\licenses\THIRD_PARTY_LICENSES.txt') -Destination (Join-Path $extract 'licenses\THIRD_PARTY_LICENSES.txt') -Force

    $csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    if (-not (Test-Path -LiteralPath $csc)) {
        throw 'The Windows .NET Framework compiler is unavailable'
    }
    & $csc /nologo /target:winexe /optimize+ /platform:x64 /reference:System.Windows.Forms.dll "/out:$extract\Pica Library.exe" (Join-Path $root 'packaging\windows\RcLauncher.cs')
    if ($LASTEXITCODE -ne 0) {
        throw 'RC launcher compilation failed'
    }

    $readme = @"
Pica Library $RcVersion — UNPUBLISHED P2 RC

Manual QA only. This package is not a GitHub Release and is not connected to the stable update channel.
Its launcher isolates all Desktop state under %LOCALAPPDATA%\Pica Library P2 RC.
It does not read or migrate the normal %LOCALAPPDATA%\Pica Library data root.

1. Extract the entire ZIP.
2. Double-click Pica Library.exe.
3. Configure the isolated RC profile separately.
4. Do not copy the RC database over the stable database.

No separate Node.js, npm, pnpm, Git, terminal, or administrator access is required.
This unsigned build may show a Windows SmartScreen reputation warning.
"@
    [IO.File]::WriteAllText(
        (Join-Path $extract 'README-WINDOWS.txt'),
        $readme,
        (New-Object Text.UTF8Encoding($false))
    )

    $readmeZh = @"
Pica Library $RcVersion — 未发布 P2 RC

仅用于手工测试。此包不是 GitHub Release，也不会进入稳定更新通道。
启动器会把全部 Desktop 数据隔离到 %LOCALAPPDATA%\Pica Library P2 RC。
它不会读取或迁移正式版 %LOCALAPPDATA%\Pica Library 数据目录。

1. 完整解压 ZIP。
2. 双击 Pica Library.exe。
3. 单独配置 RC 测试环境。
4. 不要把 RC 数据库覆盖到正式版数据目录。

无需另行安装 Node.js、npm、pnpm、Git，也不需要管理员权限。
未签名构建可能触发 Windows SmartScreen 提示。
"@
    [IO.File]::WriteAllText(
        (Join-Path $extract 'README-WINDOWS.zh-CN.txt'),
        $readmeZh,
        (New-Object Text.UTF8Encoding($false))
    )

    @"
UNPUBLISHED P2 RC
Version: $RcVersion
Source SHA: $sourceSha
Stable channel: v0.4.11
Desktop home: %LOCALAPPDATA%\Pica Library P2 RC
Stable data root is intentionally isolated.
"@ | Set-Content -Encoding utf8 -LiteralPath (Join-Path $extract 'TEST_BUILD.txt')

    [IO.File]::WriteAllText(
        (Join-Path $extract 'SOURCE_SHA.txt'),
        "$sourceSha`n",
        (New-Object Text.UTF8Encoding($false))
    )

    $forbidden = Get-ChildItem -LiteralPath $extract -Recurse -Force | Where-Object {
        $_.Name -eq '.git' -or
        $_.Name -match '^\.env($|\.)' -or
        $_.Name -match '\.db(-shm|-wal)?$' -or
        $_.FullName -match '\\node_modules\\'
    }
    if ($forbidden) {
        throw 'Forbidden package content detected in RC package tree'
    }

    $textFiles = Get-ChildItem -LiteralPath $extract -Recurse -File | Where-Object {
        $_.Extension -in @('.js','.html','.css','.json','.md','.txt')
    }
    foreach ($file in $textFiles) {
        $text = [IO.File]::ReadAllText($file.FullName)
        if (
            $text -match '(?i)[A-Z]:\\Users\\[^\\]+\\' -or
            $text -match '(?im)^\s*PICA_(ACCOUNT|PASSWORD)\s*=\s*[^;\r\n]+$'
        ) {
            throw "Sensitive or developer-specific content detected in $($file.Name)"
        }
    }

    $outputDirectory = Split-Path -Parent $Output
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
    if (Test-Path -LiteralPath $Output) {
        Remove-Item -Force -LiteralPath $Output
    }
    Compress-Archive -Path (Join-Path $extract '*') -DestinationPath $Output -CompressionLevel Optimal
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Output).Hash.ToLowerInvariant()

    [ordered]@{
        path = $Output
        sha256 = $hash
        size_bytes = (Get-Item -LiteralPath $Output).Length
        product_version = $RcVersion
        source_sha = $sourceSha
        stable_repository_version = $stableVersion
        unpublished_rc = $true
        desktop_home = '%LOCALAPPDATA%\Pica Library P2 RC'
    } | ConvertTo-Json

    $success = $true
} finally {
    [IO.File]::WriteAllText(
        $packageFile,
        $originalPackageText,
        (New-Object Text.UTF8Encoding($false))
    )

    if (Test-Path -LiteralPath $work) {
        $resolved = [IO.Path]::GetFullPath($work)
        $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
        if (
            $resolved.StartsWith($temp + '\', [StringComparison]::OrdinalIgnoreCase) -and
            (Split-Path -Leaf $resolved) -match '^pica-p2rc-build-[0-9a-f]{32}$' -and
            -not ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)
        ) {
            Remove-Item -Recurse -Force -LiteralPath $resolved -ErrorAction SilentlyContinue
        } elseif ($success) {
            throw 'Refusing RC cleanup outside the isolated temporary build directory'
        }
    }
}
