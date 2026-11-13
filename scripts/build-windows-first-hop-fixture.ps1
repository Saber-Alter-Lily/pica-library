param([Parameter(Mandatory=$true)][string]$ExpectedSourceSha)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'Synthetic first-hop fixture build requires separately authorized disposable GitHub-hosted Windows CI'
}
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'This CI-only fixture builder requires pwsh 7 or later' }
$picaFixtureRoot = Split-Path -Parent $PSScriptRoot
if ($ExpectedSourceSha -notmatch '^[a-f0-9]{40}$' -or (git -C $picaFixtureRoot rev-parse HEAD).Trim() -ne $ExpectedSourceSha) { throw 'Exact committed source required' }
if ((git -C $picaFixtureRoot status --porcelain --untracked-files=no).Length) { throw 'Fixture build requires clean tracked source' }
$picaFixturePackage = Join-Path $picaFixtureRoot 'package.json'
$picaFixtureOriginal = [IO.File]::ReadAllBytes($picaFixturePackage)
$picaFixtureOriginalHash = (Get-FileHash -LiteralPath $picaFixturePackage -Algorithm SHA256).Hash.ToLowerInvariant()
$picaFixtureMetadata = [Text.Encoding]::UTF8.GetString($picaFixtureOriginal) | ConvertFrom-Json
if ($picaFixtureMetadata.version -ne '0.5.0') { throw 'Re-audit the pinned old-client fixture when the source baseline changes' }
$picaFixtureBase = Join-Path $picaFixtureRoot 'artifacts/release-base/Pica-Library-v0.5.0-windows-x64.zip'
if (-not (Test-Path -LiteralPath $picaFixtureBase -PathType Leaf) -or
    (Get-FileHash -LiteralPath $picaFixtureBase -Algorithm SHA256).Hash.ToLowerInvariant() -ne '14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf') { throw 'Exact public v0.5.0 input required' }
$picaFixtureOutput = Join-Path $picaFixtureRoot 'artifacts/first-hop-fixture'
$picaFixtureBuilt = Join-Path $picaFixtureRoot 'artifacts/Pica-Library-v0.5.1-windows-x64.zip'
if ((Test-Path -LiteralPath $picaFixtureOutput) -or (Test-Path -LiteralPath $picaFixtureBuilt)) { throw 'Refuse to overwrite a fixture or prior artifact' }
$picaFixtureVariables = @('PICA_LIBRARY_BUILD_PROVENANCE','PICA_REQUIRE_JM_RUNTIME','PICA_WINDOWS_LAUNCHER_BASE_VERSION','PICA_WINDOWS_LAUNCHER_BASE_SHA256')
$picaFixtureEnvironment = @{}
foreach ($picaFixtureName in $picaFixtureVariables) { $picaFixtureEnvironment[$picaFixtureName] = [Environment]::GetEnvironmentVariable($picaFixtureName, 'Process') }
try {
    # Test-only version metadata. No source/helper edits and no tag/version reservation.
    $picaFixtureMetadata.version = '0.5.1'
    [IO.File]::WriteAllText($picaFixturePackage, (($picaFixtureMetadata | ConvertTo-Json -Depth 30) + "`n"), [Text.UTF8Encoding]::new($false))
    $picaFixturePackageHash = (Get-FileHash -LiteralPath $picaFixturePackage -Algorithm SHA256).Hash.ToLowerInvariant()
    $env:PICA_LIBRARY_BUILD_PROVENANCE = $ExpectedSourceSha
    $env:PICA_REQUIRE_JM_RUNTIME = '0'
    $env:PICA_WINDOWS_LAUNCHER_BASE_VERSION = '0.5.0'
    $env:PICA_WINDOWS_LAUNCHER_BASE_SHA256 = '14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf'
    & "$PSScriptRoot/build-windows-package.ps1" -SourceRuntimes core
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic-version core build failed' }
    $picaFixtureDiff = @(git -C $picaFixtureRoot diff --name-only)
    if ($picaFixtureDiff.Count -ne 1 -or $picaFixtureDiff[0] -ne 'package.json') { throw 'Fixture build changed more than version metadata' }
    $picaFixtureReceipt = [ordered]@{ schemaVersion=1; kind='SYNTHETIC_PUBLISHER_FIRST_HOP_ONLY_NOT_FOR_INSTALLATION'; sourceSha=$ExpectedSourceSha; committedProductVersion='0.5.0'; fixtureVersion='0.5.1'; versionOnlyBuildOverride=$true; compiledSourcesOrHelpersPatched=$false; publishedOrProposedVersion=$false; fixturePackageSha256=$picaFixturePackageHash; originalPackageSha256=$picaFixtureOriginalHash }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $picaFixtureZip = [IO.Compression.ZipFile]::Open($picaFixtureBuilt, [IO.Compression.ZipArchiveMode]::Update)
    try {
        foreach ($picaFixtureEntry in @('FIRST_HOP_FIXTURE.json','TEST_BUILD.txt')) {
            if ($picaFixtureZip.GetEntry($picaFixtureEntry)) { throw 'Unexpected fixture marker collision' }
            $picaFixtureWriter = [IO.StreamWriter]::new($picaFixtureZip.CreateEntry($picaFixtureEntry).Open(), [Text.UTF8Encoding]::new($false))
            try {
                $picaFixtureWriter.Write(($picaFixtureReceipt | ConvertTo-Json -Depth 10))
            } finally { $picaFixtureWriter.Dispose() }
        }
    } finally { $picaFixtureZip.Dispose() }
    Push-Location $picaFixtureRoot
    try {
        pnpm exec tsx scripts/check-windows-runtime-package.ts $picaFixtureBuilt core $ExpectedSourceSha
        if ($LASTEXITCODE -ne 0) { throw 'Actual marked first-hop ZIP composition gate failed' }
    } finally { Pop-Location }
    New-Item -ItemType Directory -Path $picaFixtureOutput | Out-Null
    $picaFixtureTarget = Join-Path $picaFixtureOutput 'SYNTHETIC-NOT-FOR-INSTALLATION.zip'
    # Exact nonrecursive move, inside this checkout's artifacts directory.
    if (-not ([IO.Path]::GetFullPath($picaFixtureBuilt).StartsWith(([IO.Path]::GetFullPath($picaFixtureRoot) + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) -or
        -not ([IO.Path]::GetFullPath($picaFixtureTarget).StartsWith(([IO.Path]::GetFullPath($picaFixtureRoot) + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase))) { throw 'Fixture output escaped checkout' }
    Move-Item -LiteralPath $picaFixtureBuilt -Destination $picaFixtureTarget
    $picaFixtureReceipt['archiveSha256'] = (Get-FileHash -LiteralPath $picaFixtureTarget -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText((Join-Path $picaFixtureOutput 'FIXTURE_BUILD_RECEIPT.json'), ($picaFixtureReceipt | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))
    $picaFixtureReceipt | ConvertTo-Json -Depth 10
} finally {
    [IO.File]::WriteAllBytes($picaFixturePackage, $picaFixtureOriginal)
    if ((Get-FileHash -LiteralPath $picaFixturePackage -Algorithm SHA256).Hash.ToLowerInvariant() -ne $picaFixtureOriginalHash) { throw 'Original package metadata bytes were not restored' }
    foreach ($picaFixtureName in $picaFixtureVariables) { [Environment]::SetEnvironmentVariable($picaFixtureName, $picaFixtureEnvironment[$picaFixtureName], 'Process') }
    if ((git -C $picaFixtureRoot diff --name-only).Length) { throw 'Tracked source was not restored after fixture build' }
}
