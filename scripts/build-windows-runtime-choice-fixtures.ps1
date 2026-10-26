param([Parameter(Mandatory=$true)][string]$ExpectedSourceSha)
$ErrorActionPreference = 'Stop'
# Must precede input reads, environment changes, builds or Java probes.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'Runtime-choice fixtures require separately authorized disposable GitHub-hosted Windows CI' }
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Fixture builder requires pwsh 7 or later' }
$fixtureRoot = Split-Path -Parent $PSScriptRoot
if ($ExpectedSourceSha -notmatch '^[a-f0-9]{40}$' -or (git -C $fixtureRoot rev-parse HEAD).Trim() -ne $ExpectedSourceSha) { throw 'Exact committed source required' }
if ((git -C $fixtureRoot status --porcelain --untracked-files=no).Length) { throw 'Clean tracked source required' }
$packageFile = Join-Path $fixtureRoot 'package.json'
$originalBytes = [IO.File]::ReadAllBytes($packageFile)
$originalHash = (Get-FileHash -LiteralPath $packageFile -Algorithm SHA256).Hash.ToLowerInvariant()
$metadata = [Text.Encoding]::UTF8.GetString($originalBytes) | ConvertFrom-Json
if ($metadata.version -ne '0.5.0') { throw 'Re-audit the synthetic version when the committed baseline changes' }
$baseline = Join-Path $fixtureRoot 'artifacts/release-base/Pica-Library-v0.5.0-windows-x64.zip'
if (-not (Test-Path -LiteralPath $baseline -PathType Leaf) -or (Get-FileHash -LiteralPath $baseline -Algorithm SHA256).Hash.ToLowerInvariant() -ne '14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf') { throw 'Exact released launcher input required' }
if (-not (Test-Path -LiteralPath (Join-Path $fixtureRoot 'runtime/jm/PICA_JM_RUNTIME.json') -PathType Leaf)) { throw 'CI must build the real optional JM runtime first; no placeholder runtime allowed' }
$fixtureOutput = Join-Path $fixtureRoot 'artifacts/runtime-choice-fixtures'
$coreBuilt = Join-Path $fixtureRoot 'artifacts/Pica-Library-v0.5.1-windows-x64.zip'
$jmBuilt = Join-Path $fixtureRoot 'artifacts/Pica-Library-v0.5.1-with-jm-windows-x64.zip'
foreach ($outputPath in @($fixtureOutput,$coreBuilt,$jmBuilt)) { if (Test-Path -LiteralPath $outputPath) { throw 'Refuse to overwrite existing fixture outputs' } }
$names = @('PICA_LIBRARY_BUILD_PROVENANCE','PICA_REQUIRE_JM_RUNTIME','PICA_WINDOWS_LAUNCHER_BASE_VERSION','PICA_WINDOWS_LAUNCHER_BASE_SHA256')
$saved = @{}; foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
$rows = @()
try {
    $metadata.version = '0.5.1'
    [IO.File]::WriteAllText($packageFile, (($metadata | ConvertTo-Json -Depth 30) + "`n"), [Text.UTF8Encoding]::new($false))
    $fixtureMetadataHash = (Get-FileHash -LiteralPath $packageFile -Algorithm SHA256).Hash.ToLowerInvariant()
    $env:PICA_LIBRARY_BUILD_PROVENANCE = $ExpectedSourceSha
    $env:PICA_WINDOWS_LAUNCHER_BASE_VERSION = '0.5.0'
    $env:PICA_WINDOWS_LAUNCHER_BASE_SHA256 = '14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    New-Item -ItemType Directory -Path $fixtureOutput | Out-Null
    foreach ($mode in @('core','jm')) {
        $env:PICA_REQUIRE_JM_RUNTIME = if ($mode -eq 'jm') { '1' } else { '0' }
        & "$PSScriptRoot/build-windows-package.ps1" -SourceRuntimes $mode
        if ($LASTEXITCODE -ne 0) { throw "Real fixture build failed: $mode" }
        $built = if ($mode -eq 'jm') { $jmBuilt } else { $coreBuilt }
        $marker = [ordered]@{ schemaVersion=1; kind='SYNTHETIC_RUNTIME_CHOICE_ONLY_NOT_FOR_INSTALLATION'; sourceSha=$ExpectedSourceSha; composition=$mode; fixtureVersion='0.5.1'; committedProductVersion='0.5.0'; versionOnlyBuildOverride=$true; compiledSourcesOrHelpersPatched=$false; publishedOrProposedVersion=$false; originalPackageSha256=$originalHash; fixturePackageSha256=$fixtureMetadataHash }
        $zip = [IO.Compression.ZipFile]::Open($built,[IO.Compression.ZipArchiveMode]::Update)
        try {
            foreach ($entryName in @('RUNTIME_CHOICE_FIXTURE.json','TEST_BUILD.txt')) {
                if ($zip.GetEntry($entryName)) { throw 'Unexpected fixture marker collision' }
                $writer = [IO.StreamWriter]::new($zip.CreateEntry($entryName).Open(),[Text.UTF8Encoding]::new($false))
                try { $writer.Write(($marker | ConvertTo-Json -Depth 10)) } finally { $writer.Dispose() }
            }
        } finally { $zip.Dispose() }
        Push-Location $fixtureRoot
        try { pnpm exec tsx scripts/check-windows-runtime-package.ts $built $mode $ExpectedSourceSha; if ($LASTEXITCODE -ne 0) { throw 'Actual marked ZIP composition gate failed' } } finally { Pop-Location }
        $target = Join-Path $fixtureOutput ("SYNTHETIC-$mode-NOT-FOR-INSTALLATION.zip")
        foreach ($exactPath in @($built,$target)) { if (-not ([IO.Path]::GetFullPath($exactPath).StartsWith(([IO.Path]::GetFullPath($fixtureRoot) + [IO.Path]::DirectorySeparatorChar),[StringComparison]::OrdinalIgnoreCase))) { throw 'Fixture path escaped checkout' } }
        Move-Item -LiteralPath $built -Destination $target
        $row = [ordered]@{ mode=$mode; file=[IO.Path]::GetFileName($target); archiveSha256=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant(); marker=$marker }
        $rows += $row
    }
    $diff = @(git -C $fixtureRoot diff --name-only)
    if ($diff.Count -ne 1 -or $diff[0] -ne 'package.json') { throw 'Build changed more than fixture version metadata' }
    $receipt = [ordered]@{ schemaVersion=1; kind='SYNTHETIC_RUNTIME_CHOICE_PAIR_ONLY_NOT_FOR_INSTALLATION'; sourceSha=$ExpectedSourceSha; fixtureVersion='0.5.1'; archives=$rows; noReleaseOrVersionReservation=$true; productOrHelperBytesPatched=$false }
    [IO.File]::WriteAllText((Join-Path $fixtureOutput 'FIXTURE_BUILD_RECEIPT.json'),($receipt | ConvertTo-Json -Depth 15),[Text.UTF8Encoding]::new($false))
    $receipt | ConvertTo-Json -Depth 15
} finally {
    [IO.File]::WriteAllBytes($packageFile,$originalBytes)
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') }
    if ((Get-FileHash -LiteralPath $packageFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $originalHash -or (git -C $fixtureRoot diff --name-only).Length) { throw 'Tracked metadata/source was not restored' }
}
