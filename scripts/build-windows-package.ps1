$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw -LiteralPath (Join-Path $root 'package.json') | ConvertFrom-Json
$version = [string]$package.version
$nodeVersion = '24.15.0'
$name = if ($version -match '^\d+\.\d+\.\d+$') {
    "Pica-Library-v$version-windows-x64"
} elseif ($version -eq '0.2.0-dev.0') {
    'Pica-Library-v0.2.0-dev.0-update-base-windows-x64'
} elseif ($version -eq '0.2.0-dev.1') {
    'Pica-Library-v0.2.0-dev.1-local-test-windows-x64'
} elseif ($version -eq '0.2.0-dev.2') {
    'Pica-Library-v0.2.0-dev.2-local-test-windows-x64'
} else {
    throw "Unsupported Windows package version: $version"
}
$buildRoot = Join-Path $root 'artifacts\windows-package'
$stage = Join-Path $buildRoot $name
$zip = Join-Path $root "artifacts\$name.zip"
$runtimeCache = Join-Path $root "artifacts\cache\node-v$nodeVersion-win-x64.zip"
$runtimeFile = "node-v$nodeVersion-win-x64.zip"
$gitSourceSha = (git -C $root rev-parse HEAD).Trim()
$sourceSha = if ($env:PICA_LIBRARY_BUILD_PROVENANCE) { [string]$env:PICA_LIBRARY_BUILD_PROVENANCE } else { $gitSourceSha }

function Get-Sha256([string]$file) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash([IO.File]::OpenRead($file)))).Replace('-','').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}

if ($gitSourceSha -notmatch '^[0-9a-f]{40}$') { throw 'Could not resolve Git source commit SHA' }
if ($sourceSha -notmatch '^[0-9a-f]{40}$') { throw 'Build provenance must be exactly 40 lowercase hex characters' }
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
    if (-not $asset -or -not (Test-Path -LiteralPath (Join-Path $registryTarget $asset))) {
        throw "Required Registry V3 runtime asset is missing: $asset"
    }
}
foreach ($sourceAsset in @(Get-ChildItem -LiteralPath $registrySource -File)) {
    $targetAsset = Join-Path $registryTarget $sourceAsset.Name
    $mirrorAsset = Join-Path $registryMirror $sourceAsset.Name
    if (
        -not (Test-Path -LiteralPath $targetAsset) -or
        -not (Test-Path -LiteralPath $mirrorAsset) -or
        (Get-Sha256 $sourceAsset.FullName) -ne (Get-Sha256 $targetAsset) -or
        (Get-Sha256 $sourceAsset.FullName) -ne (Get-Sha256 $mirrorAsset)
    ) {
        throw "Registry V3 runtime asset copy mismatch: $($sourceAsset.Name)"
    }
}
Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination $stage
foreach ($notice in @('NOTICE.md','UPSTREAM.md','DISCLAIMER.md')) { Copy-Item -LiteralPath (Join-Path $root $notice) -Destination $stage }
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

$historicLauncherBasePaths = @{
    '0.2.0-dev.1' = 'artifacts\Pica-Library-v0.2.0-dev.0-update-base-windows-x64.zip'
    '0.2.0-dev.2' = 'artifacts\Pica-Library-v0.2.0-dev.1-local-test-windows-x64.zip'
    '0.3.0' = 'artifacts\Pica-Library-v0.2.0-windows-x64.zip'
    '0.3.1' = 'artifacts\Pica-Library-v0.3.0-windows-x64.zip'
    '0.3.2' = 'artifacts\Pica-Library-v0.3.1-windows-x64.zip'
    '0.3.3' = 'artifacts\Pica-Library-v0.3.2-windows-x64.zip'
    '0.3.4' = 'artifacts\Pica-Library-v0.3.3-windows-x64.zip'
    '0.3.5' = 'artifacts\Pica-Library-v0.3.4-windows-x64.zip'
    '0.3.6' = 'artifacts\Pica-Library-v0.3.5-windows-x64.zip'
    '0.3.7' = 'artifacts\Pica-Library-v0.3.6-windows-x64.zip'
    '0.3.8' = 'artifacts\Pica-Library-v0.3.7-windows-x64.zip'
    '0.3.9' = 'artifacts\Pica-Library-v0.3.8-windows-x64.zip'
    '0.3.10' = 'artifacts\Pica-Library-v0.3.9-windows-x64.zip'
    '0.3.11' = 'artifacts\Pica-Library-v0.3.10-windows-x64.zip'
    '0.3.12' = 'artifacts\release-base\Pica-Library-v0.3.11-windows-x64.zip'
    '0.3.13' = 'artifacts\release-base\Pica-Library-v0.3.12-windows-x64.zip'
    '0.3.14' = 'artifacts\release-base\Pica-Library-v0.3.13-windows-x64.zip'
    '0.4.0' = 'artifacts\release-base\Pica-Library-v0.3.14-windows-x64.zip'
    '0.4.1' = 'artifacts\release-base\Pica-Library-v0.4.0-windows-x64.zip'
    '0.4.2' = 'artifacts\release-base\Pica-Library-v0.4.1-windows-x64.zip'
    '0.4.3' = 'artifacts\release-base\Pica-Library-v0.4.2-windows-x64.zip'
    '0.4.4' = 'artifacts\release-base\Pica-Library-v0.4.3-windows-x64.zip'
    '0.4.5' = 'artifacts\release-base\Pica-Library-v0.4.4-windows-x64.zip'
    '0.4.6' = 'artifacts\release-base\Pica-Library-v0.4.5-windows-x64.zip'
    '0.4.7' = 'artifacts\release-base\Pica-Library-v0.4.6-windows-x64.zip'
    '0.4.8' = 'artifacts\release-base\Pica-Library-v0.4.7-windows-x64.zip'
    '0.4.9' = 'artifacts\release-base\Pica-Library-v0.4.8-windows-x64.zip'
    '0.4.10' = 'artifacts\release-base\Pica-Library-v0.4.9-windows-x64.zip'
    '0.4.11' = 'artifacts\release-base\Pica-Library-v0.4.10-windows-x64.zip'
}
$historicLauncherBaseHashes = @{
    '0.3.12' = '0356f2c81259c1d8c43022be7be03232c376eb469242b8e41480f6c5f2e4e660'
    '0.3.13' = 'a18cb46d40a077ba6f6ee46b9c8ee6df78812e2e384bbeff63dbc4a563497810'
    '0.3.14' = '4575cc0c073d68baac4a6e34979d25c062b83086053f86a87bd0d4d847cf1c77'
    '0.4.0' = '211bc7d7d4f384af0389288439e38a645a7e8a458e56d947d005cd179848cb56'
    '0.4.1' = '1e22df88d067c34152e1a94008fbb4c378c543fc41450768e01c25c105e698d0'
    '0.4.2' = '88d87a8f0e5a8413656751ff344052eccbfa796e663e4acc8c7fe4a0e0866b3d'
    '0.4.3' = '96bcc020c7cd19aa84f982af9010f6656a44dc01b827839d6e24c40e36ec24c1'
    '0.4.4' = '36283292a1b3aefb1032b11c5064663bef9176d4bf32562be6a3f531c84ac733'
    '0.4.5' = 'cff1c7cf5d79300d8fa38e9faf9d7280c20df1641908fbf28a28e32d3de41bff'
    '0.4.6' = 'f5b93b4a81c78df17bbee793354d4e8df002fad6dcc9c432e334bb7c14fee901'
    '0.4.7' = '914d691b441e8dbc95a9ef0bb7a7ebc46940bfc44907e0595a8953a293bda50c'
    '0.4.8' = 'dafea5417e27055c6a4871b7386f31b66a51f82a5ce01136d467ee1176659947'
    '0.4.9' = '6fd3eb5a1346cd2211efe5b47588b38d4099d6e768f836461969eaf22d64e26d'
    '0.4.10' = '862570ee4517453da594a21e937b6d8ebc6114df6724ac3976457fa38f544941'
    '0.4.11' = '6d53832632545634ced23d24c67aa16e0e8c25ffa10e185f0a14a92962575aab'
}
$stableLauncherSourceLockedVersions = @(
    '0.3.2','0.3.3','0.3.4','0.3.5','0.3.6','0.3.7','0.3.8','0.3.9',
    '0.3.10','0.3.11','0.3.12','0.3.13','0.3.14',
    '0.4.0','0.4.1','0.4.2','0.4.3','0.4.4','0.4.5','0.4.6',
    '0.4.7','0.4.8','0.4.9','0.4.10','0.4.11'
)
$launcherBaseVersion = [string]$env:PICA_WINDOWS_LAUNCHER_BASE_VERSION
$launcherBaseHash = [string]$env:PICA_WINDOWS_LAUNCHER_BASE_SHA256
$explicitLauncherBase = -not [string]::IsNullOrWhiteSpace($launcherBaseVersion)
$reuseAcceptedLauncher =
    $historicLauncherBasePaths.ContainsKey($version) -or $explicitLauncherBase

if ($reuseAcceptedLauncher) {
    if ($explicitLauncherBase) {
        if ($launcherBaseVersion -notmatch '^\d+\.\d+\.\d+$') {
            throw "Invalid PICA_WINDOWS_LAUNCHER_BASE_VERSION: $launcherBaseVersion"
        }
        if ($launcherBaseHash -notmatch '^[0-9a-fA-F]{64}$') {
            throw 'PICA_WINDOWS_LAUNCHER_BASE_SHA256 must be a 64-character SHA-256'
        }
        $baseZip = Join-Path $root "artifacts\release-base\Pica-Library-v$launcherBaseVersion-windows-x64.zip"
    } else {
        $baseZip = Join-Path $root $historicLauncherBasePaths[$version]
    }
    if (-not (Test-Path -LiteralPath $baseZip)) {
        throw 'The previous accepted package is required to reuse its unchanged launcher'
    }

    if ($explicitLauncherBase) {
        $actualBaseHash = Get-Sha256 $baseZip
        if ($actualBaseHash -ne $launcherBaseHash.ToLowerInvariant()) {
            throw "Official v$launcherBaseVersion launcher base package checksum mismatch: $actualBaseHash"
        }
    } elseif ($historicLauncherBaseHashes.ContainsKey($version)) {
        $actualBaseHash = Get-Sha256 $baseZip
        if ($actualBaseHash -ne $historicLauncherBaseHashes[$version]) {
            throw "Historical launcher base package checksum mismatch for v$version"
        }
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($baseZip)
    try {
        $baseSourceEntry = $archive.GetEntry('SOURCE_SHA.txt')
        $baseLauncherEntry = $archive.GetEntry('Pica Library.exe')
        if (-not $baseSourceEntry -or -not $baseLauncherEntry) {
            throw 'The accepted base package is missing launcher provenance'
        }
        $reader = New-Object IO.StreamReader($baseSourceEntry.Open())
        try { $baseSourceSha = $reader.ReadToEnd().Trim() } finally { $reader.Dispose() }

        if ($stableLauncherSourceLockedVersions -contains $version -or $explicitLauncherBase) {
            $launcherBlob = (git -C $root hash-object 'packaging/windows/Launcher.cs').Trim()
            if ($launcherBlob -ne '1351568469abf3edcb61354144498ec9734ad08f') {
                throw 'Launcher source changed since accepted stable package; a full install is required'
            }
        } else {
            & git -C $root diff --quiet "$baseSourceSha..$gitSourceSha" -- 'packaging/windows/Launcher.cs'
            if ($LASTEXITCODE -ne 0) {
                throw 'Launcher source changed; a full install is required'
            }
        }

        $destination = [IO.File]::Open(
            (Join-Path $stage 'Pica Library.exe'),
            [IO.FileMode]::Create,
            [IO.FileAccess]::Write
        )
        try {
            $source = $baseLauncherEntry.Open()
            try { $source.CopyTo($destination) } finally { $source.Dispose() }
        } finally {
            $destination.Dispose()
        }
    } finally {
        $archive.Dispose()
    }
}

$readme = @"
Pica Library v$version for Windows 10/11 x64

1. Extract the entire ZIP.
2. Double-click Pica Library.exe.
3. Complete setup in the browser.
4. To use Browser Lite, open Settings > Browser Lite and export the data package.

Users upgrading from v0.1.3 must use a complete Windows ZIP.
From v0.2.0 onward, compatible releases may use the built-in incremental update flow.
No separate Node.js, npm, pnpm, Git, terminal, or administrator access is required.
This unsigned build may show a Windows SmartScreen reputation warning.
"@
[IO.File]::WriteAllText((Join-Path $stage 'README-WINDOWS.txt'),$readme,(New-Object Text.UTF8Encoding($false)))
$readmeZhBase64 = 'UGljYSBMaWJyYXJ5IHZ7VkVSU0lPTn0gV2luZG93cyAxMC8xMSB4NjQKCjEuIOWujOaVtOino+WOiyBaSVDjgIIKMi4g5Y+M5Ye7IFBpY2EgTGlicmFyeS5leGXjgIIKMy4g5Zyo5rWP6KeI5Zmo5Lit5a6M5oiQ6aaW5qyh6K6+572u44CCCjQuIOiuvue9ruWujOaIkOWQjuWQjOatpeaUtuiXj++8jOWNs+WPr+S9v+eUqOa8q+eUu+W6k+OAgeaOqOiNkOOAgeS4i+i9veWSjOmYheivu+OAggoKdjAuMi4wIOeUqOaIt+WPr+S9v+eUqOWGhee9rui9r+S7tuabtOaWsOWuieijheWFvOWuueeahCB2MC4zLjAg5aKe6YeP5YyF44CCCnYwLjEueCDnlKjmiLfor7fkuIvovb3lubbop6PljovlrozmlbQgV2luZG93cyBaSVDjgIIK5peg6ZyA5a6J6KOFIE5vZGUuanPjgIFucG3jgIFwbnBtIOaIliBHaXTvvIzkuZ/ml6DpnIDnrqHnkIblkZjmnYPpmZDjgII='
$readmeZh = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($readmeZhBase64)).Replace('{VERSION}',$version)
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
$launcherBaseReport = if ($reuseAcceptedLauncher) {
    if ($explicitLauncherBase) { $launcherBaseVersion } else { 'historical-fixed' }
} else {
    $null
}
[ordered]@{
    path=$zip
    sha256=$hash
    size_bytes=(Get-Item $zip).Length
    uncompressed_bytes=(Get-ChildItem $stage -File -Recurse | Measure-Object Length -Sum).Sum
    file_count=@(Get-ChildItem $stage -File -Recurse).Count
    node_version=$nodeVersion
    product_version=$version
    source_sha=$sourceSha
    launcher_base_version=$launcherBaseReport
} | ConvertTo-Json
