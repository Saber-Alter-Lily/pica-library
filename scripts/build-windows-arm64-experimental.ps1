$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw -LiteralPath (Join-Path $root 'package.json') | ConvertFrom-Json
$version = [string]$package.version
$nodeVersion = '24.15.0'
$gitSourceSha = (git -C $root rev-parse HEAD).Trim()
$sourceSha = if ($env:PICA_LIBRARY_BUILD_PROVENANCE) { [string]$env:PICA_LIBRARY_BUILD_PROVENANCE } else { $gitSourceSha }

if ($gitSourceSha -notmatch '^[0-9a-f]{40}$') { throw 'Could not resolve Git source commit SHA' }
if ($sourceSha -notmatch '^[0-9a-f]{40}$') { throw 'Build provenance must be exactly 40 lowercase hex characters' }
if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [System.Runtime.InteropServices.Architecture]::Arm64) {
    throw 'Experimental Windows ARM64 package must be built on a native ARM64 Windows runner'
}

$shortSha = $sourceSha.Substring(0,8)
$name = "Pica-Library-v$version-$shortSha-windows-arm64-experimental"
$buildRoot = Join-Path $root 'artifacts\windows-arm64-package'
$stage = Join-Path $buildRoot $name
$zip = Join-Path $root "artifacts\$name.zip"
$runtimeFile = "node-v$nodeVersion-win-arm64.zip"
$runtimeCache = Join-Path $root "artifacts\cache\$runtimeFile"
$runtimeExtract = Join-Path $buildRoot 'runtime-extract'

function Get-Sha256([string]$file) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        $stream = [IO.File]::OpenRead($file)
        try { return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-','').ToLowerInvariant() }
        finally { $stream.Dispose() }
    } finally {
        $algorithm.Dispose()
    }
}

if (Test-Path -LiteralPath $stage) { Remove-Item -Recurse -Force -LiteralPath $stage }
if (Test-Path -LiteralPath $runtimeExtract) { Remove-Item -Recurse -Force -LiteralPath $runtimeExtract }
if (Test-Path -LiteralPath $zip) { Remove-Item -Force -LiteralPath $zip }
@(
    (Join-Path $stage 'app'),
    (Join-Path $stage 'runtime'),
    (Join-Path $stage 'licenses'),
    (Split-Path $runtimeCache -Parent),
    (Join-Path $root 'artifacts')
) | ForEach-Object { New-Item -ItemType Directory -Force -Path $_ | Out-Null }

Push-Location $root
try { pnpm build } finally { Pop-Location }

if (-not (Test-Path -LiteralPath $runtimeCache)) {
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$nodeVersion/$runtimeFile" -OutFile $runtimeCache
}
$checksums = (Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$nodeVersion/SHASUMS256.txt").Content
$expectedLine = @($checksums -split [char]10 | Where-Object { $_ -match "\s$([regex]::Escape($runtimeFile))\s*$" })[0]
if (-not $expectedLine) { throw 'Official Node.js Windows ARM64 runtime checksum was not found' }
$expectedHash = ($expectedLine -split '\s+')[0].ToLowerInvariant()
$actualHash = Get-Sha256 $runtimeCache
if ($actualHash -ne $expectedHash) { throw 'Official Node.js Windows ARM64 runtime checksum mismatch' }

Expand-Archive -LiteralPath $runtimeCache -DestinationPath $runtimeExtract
$runtimeRoot = Join-Path $runtimeExtract "node-v$nodeVersion-win-arm64"
Copy-Item -LiteralPath (Join-Path $runtimeRoot 'node.exe') -Destination (Join-Path $stage 'runtime\node.exe')
Copy-Item -LiteralPath (Join-Path $runtimeRoot 'LICENSE') -Destination (Join-Path $stage 'licenses\Node.js-LICENSE.txt')

$runtimeIdentity = (& (Join-Path $stage 'runtime\node.exe') -p "process.platform + '/' + process.arch").Trim()
if ($runtimeIdentity -ne 'win32/arm64') {
    throw "Bundled Node.js runtime is not native Windows ARM64: $runtimeIdentity"
}

Copy-Item -Path (Join-Path $root 'dist\*.js') -Destination (Join-Path $stage 'app')
Copy-Item -LiteralPath (Join-Path $root 'dist\licenses\THIRD_PARTY_LICENSES.txt') -Destination (Join-Path $stage 'licenses\THIRD_PARTY_LICENSES.txt')
Copy-Item -LiteralPath (Join-Path $root 'web') -Destination $stage -Recurse

$registrySource = Join-Path $root 'src\data\registry-v3-final'
$registryTarget = Join-Path $stage 'src\data\registry-v3-final'
$registryMirror = Join-Path $stage 'app\runtime-assets\registry-v3-final'
New-Item -ItemType Directory -Force -Path $registryTarget,$registryMirror | Out-Null
Copy-Item -Path (Join-Path $registrySource '*') -Destination $registryTarget -Recurse
Copy-Item -Path (Join-Path $registrySource '*') -Destination $registryMirror -Recurse

$registryManifestFile = Join-Path $registryTarget 'PICA_REGISTRY_V3_FINAL_MANIFEST.json'
if (-not (Test-Path -LiteralPath $registryManifestFile)) { throw 'Registry V3 runtime manifest is missing' }
$registryManifest = Get-Content -Raw -LiteralPath $registryManifestFile | ConvertFrom-Json
$requiredRegistryAssets = @(
    'PICA_REGISTRY_V3_FINAL_MANIFEST.json',
    [string]$registryManifest.runtime_semantic_file,
    'PICA_ENTITY_REGISTRY_V3_FINAL.csv',
    'PICA_TAG_ALIAS_MAP_V3_FINAL.json',
    'PICA_TAG_UNRESOLVED_V3_FINAL_WATCHLIST.csv',
    'PICA_TAG_LIBRARY_V2_REVIEWED.csv',
    'PICA_TAG_ALIAS_MAP_V2.json'
)
foreach ($asset in $requiredRegistryAssets) {
    if (-not $asset -or -not (Test-Path -LiteralPath (Join-Path $registryTarget $asset)) -or -not (Test-Path -LiteralPath (Join-Path $registryMirror $asset))) {
        throw "Required Registry V3 runtime asset is missing: $asset"
    }
}

Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination $stage
foreach ($notice in @('NOTICE.md','UPSTREAM.md','DISCLAIMER.md')) {
    Copy-Item -LiteralPath (Join-Path $root $notice) -Destination $stage
}

$cscCandidates = @(
    'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe',
    'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
)
$csc = @($cscCandidates | Where-Object { Test-Path -LiteralPath $_ })[0]
if (-not $csc) { throw 'The Windows .NET Framework compiler is unavailable' }
& $csc /nologo /target:winexe /optimize+ /platform:anycpu /reference:System.Windows.Forms.dll "/out:$stage\Pica Library.exe" (Join-Path $root 'packaging\windows\Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Windows ARM64 launcher compilation failed' }

$launcher = Join-Path $stage 'Pica Library.exe'
if (-not (Test-Path -LiteralPath $launcher) -or (Get-Item -LiteralPath $launcher).Length -eq 0) {
    throw 'Windows ARM64 launcher is missing'
}

$readme = @"
Pica Library v$version experimental preview for Windows 11 ARM64
Source: $sourceSha

1. Extract the entire ZIP.
2. Double-click Pica Library.exe.
3. Complete setup in the browser.

This package runs the official Node.js $nodeVersion Windows ARM64 runtime.
The launcher is managed AnyCPU and starts the bundled native ARM64 Node process.
User data remains outside the application directory under the normal Pica Library user-data root.

This is an experimental CI artifact, not a formal release.
Windows ARM64 self-update and formal distribution remain disabled.
No separate Node.js, npm, pnpm, Git, terminal, or administrator access is required.
"@
[IO.File]::WriteAllText((Join-Path $stage 'README-WINDOWS-ARM64.txt'),$readme,(New-Object Text.UTF8Encoding($false)))
[IO.File]::WriteAllText((Join-Path $stage 'SOURCE_SHA.txt'),"$sourceSha$([Environment]::NewLine)",(New-Object Text.UTF8Encoding($false)))

[ordered]@{
    schemaVersion = 1
    platform = 'windows'
    arch = 'arm64'
    minimumWindows = 'Windows 11 ARM64 preview baseline'
    nodeVersion = $nodeVersion
    runtimeIdentity = $runtimeIdentity
    launcher = 'managed-anycpu'
    formalRelease = $false
    distributionReady = $false
    selfUpdate = $false
} | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $stage 'PLATFORM_REQUIREMENTS.json')

foreach ($required in @(
    'runtime\node.exe',
    'app\pica-library.js',
    'app\desktop.js',
    'web\index.html',
    'licenses\Node.js-LICENSE.txt',
    'licenses\THIRD_PARTY_LICENSES.txt',
    'Pica Library.exe',
    'SOURCE_SHA.txt',
    'PLATFORM_REQUIREMENTS.json'
)) {
    $requiredPath = Join-Path $stage $required
    if (-not (Test-Path -LiteralPath $requiredPath) -or (Get-Item -LiteralPath $requiredPath).Length -eq 0) {
        throw "Required Windows ARM64 package file is missing: $required"
    }
}

$forbidden = Get-ChildItem -LiteralPath $stage -Recurse -Force | Where-Object {
    $_.Name -eq '.git' -or
    $_.Name -match '^\.env($|\.)' -or
    $_.Name -match '\.db(-shm|-wal)?$' -or
    $_.FullName -match '\\node_modules\\'
}
if ($forbidden) { throw 'Forbidden package content detected' }

Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
$hash = Get-Sha256 $zip
[IO.File]::WriteAllText(
    (Join-Path $root 'artifacts\WINDOWS-ARM64-EXPERIMENTAL-SHA256SUMS.txt'),
    "$hash  $name.zip$([Environment]::NewLine)",
    (New-Object Text.UTF8Encoding($false))
)

[ordered]@{
    path = $zip
    sha256 = $hash
    size_bytes = (Get-Item $zip).Length
    uncompressed_bytes = (Get-ChildItem $stage -File -Recurse | Measure-Object Length -Sum).Sum
    file_count = @(Get-ChildItem $stage -File -Recurse).Count
    node_version = $nodeVersion
    product_version = $version
    source_sha = $sourceSha
    runtime_identity = $runtimeIdentity
    launcher = 'managed-anycpu'
    formal_release = $false
    distribution_ready = $false
    self_update = $false
} | ConvertTo-Json -Depth 4
