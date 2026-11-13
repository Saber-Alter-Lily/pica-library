param([Parameter(Mandatory=$true)][string]$ExpectedSourceSha)
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') { throw 'T3 fixture build is disposable Windows CI-only' }
$t3Checkout=Split-Path -Parent $PSScriptRoot
if ($ExpectedSourceSha -notmatch '^[a-f0-9]{40}$' -or (git -C $t3Checkout rev-parse HEAD).Trim() -ne $ExpectedSourceSha -or (git -C $t3Checkout status --porcelain --untracked-files=normal).Length) { throw 'Exact clean committed T3 source required' }
function Assert-T3BuildPath([string]$file) {
  $full=[IO.Path]::GetFullPath($file)
  if (-not $full.StartsWith([IO.Path]::GetFullPath($t3Checkout)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Build target escaped checkout' }
  return $full
}
$t3Output=Assert-T3BuildPath (Join-Path $t3Checkout 'artifacts/legacy-transition-t3-private-fixtures')
if (Test-Path -LiteralPath $t3Output) { throw 'Never overwrite prior T3 fixtures' }
$t3Old=Assert-T3BuildPath (Join-Path $t3Checkout 'artifacts/release-base/Pica-Library-v0.5.0-windows-x64.zip')
if ((Get-FileHash -LiteralPath $t3Old -Algorithm SHA256).Hash.ToLowerInvariant() -ne '14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf') { throw 'Pinned public old archive required' }
$t3Package=Join-Path $t3Checkout 'package.json'
$t3Original=[IO.File]::ReadAllBytes($t3Package)
$t3OriginalHash=(Get-FileHash -LiteralPath $t3Package -Algorithm SHA256).Hash.ToLowerInvariant()
$t3Metadata=[Text.Encoding]::UTF8.GetString($t3Original) | ConvertFrom-Json
if ($t3Metadata.version -ne '0.5.0') { throw 'Re-audit fixture versions when the committed product version changes' }
$t3EnvKeys=@('PICA_LIBRARY_BUILD_PROVENANCE','PICA_REQUIRE_JM_RUNTIME','PICA_WINDOWS_LAUNCHER_BASE_VERSION','PICA_WINDOWS_LAUNCHER_BASE_SHA256')
$t3Previous=@{}
foreach ($name in $t3EnvKeys) { $t3Previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process') }
$t3Targets=@()
New-Item -ItemType Directory -Path $t3Output | Out-Null
try {
  $env:PICA_LIBRARY_BUILD_PROVENANCE=$ExpectedSourceSha
  $env:PICA_REQUIRE_JM_RUNTIME='0'
  $env:PICA_WINDOWS_LAUNCHER_BASE_VERSION='0.5.0'
  $env:PICA_WINDOWS_LAUNCHER_BASE_SHA256='14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf'
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  foreach ($version in @('0.5.1','0.5.2')) {
    $built=Assert-T3BuildPath (Join-Path $t3Checkout "artifacts/Pica-Library-v$version-windows-x64.zip")
    $stage=Assert-T3BuildPath (Join-Path $t3Checkout "artifacts/windows-package/Pica-Library-v$version-windows-x64")
    $runtimeExtract=Assert-T3BuildPath (Join-Path $t3Checkout 'artifacts/windows-package/runtime-extract')
    if ((Test-Path -LiteralPath $built) -or (Test-Path -LiteralPath $stage)) { throw 'Refuse to replace an earlier version fixture' }
    # Standard producer; only build-time numeric version metadata differs.
    # No TEST_BUILD.txt: that correctly means a different data profile and is
    # rejected by the actual migration guard. These raw fixtures never upload.
    $t3Metadata.version=$version
    [IO.File]::WriteAllText($t3Package,(($t3Metadata | ConvertTo-Json -Depth 30)+"`n"),[Text.UTF8Encoding]::new($false))
    & (Join-Path $PSScriptRoot 'build-windows-package.ps1') -SourceRuntimes core
    if ($LASTEXITCODE -ne 0) { throw 'T3 standard core producer failed' }
    $changed=@(git -C $t3Checkout diff --name-only)
    if ($changed.Count -ne 1 -or $changed[0] -ne 'package.json') { throw 'Fixture build modified source/helper code' }
    $marker=[ordered]@{kind='SYNTHETIC_LEGACY_TRANSITION_T3_ONLY_NO_DISTRIBUTABLE_TOOL';sourceSha=$ExpectedSourceSha;version=$version;versionOnlyBuildOverride=$true;productOrHelperBytesPatched=$false;publishedOrProposedVersion=$false;publicationAuthenticated=$false;temporaryCiProfileOnly=$true}
    $archive=[IO.Compression.ZipFile]::Open($built,[IO.Compression.ZipArchiveMode]::Update)
    try {
      if ($archive.GetEntry('TEST_BUILD.txt') -or $archive.GetEntry('LEGACY_TRANSITION_T3_FIXTURE.json')) { throw 'Unexpected profile/fixture marker' }
      $writer=[IO.StreamWriter]::new($archive.CreateEntry('LEGACY_TRANSITION_T3_FIXTURE.json').Open(),[Text.UTF8Encoding]::new($false))
      try {$writer.Write(($marker | ConvertTo-Json -Depth 8))} finally {$writer.Dispose()}
    } finally {$archive.Dispose()}
    $destination=Assert-T3BuildPath (Join-Path $t3Output ([IO.Path]::GetFileName($built)))
    Move-Item -LiteralPath $built -Destination $destination
    $t3Targets += [pscustomobject]@{version=$version;file=[IO.Path]::GetFileName($destination);sha256=(Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()}
  }
} finally {
  [IO.File]::WriteAllBytes($t3Package,$t3Original)
  foreach ($name in $t3EnvKeys) {[Environment]::SetEnvironmentVariable($name,$t3Previous[$name],'Process')}
  if ((Get-FileHash -LiteralPath $t3Package -Algorithm SHA256).Hash.ToLowerInvariant() -ne $t3OriginalHash -or (git -C $t3Checkout status --porcelain --untracked-files=normal).Length) { throw 'Tracked source not restored before trusted tool production' }
}
$first=$t3Targets[0]
$target=Join-Path $t3Output $first.file
$stableUrl='https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.5.1/'+$first.file
$reviewUrl='https://github.com/Saber-Alter-Lily/pica-library/actions/runs/'+$env:GITHUB_RUN_ID+'/artifacts/1'
foreach ($tool in @(@{name='transition-execution-fixture.zip';channel='stable';url=$stableUrl},@{name='transition-preview.zip';channel='unpublished-review';url=$reviewUrl})) {
  pnpm exec tsx scripts/build-legacy-transition-assistant.ts $t3Old $target '0.5.1' $ExpectedSourceSha $first.sha256 $tool.channel $tool.url (Join-Path $t3Output $tool.name)
  if ($LASTEXITCODE -ne 0) { throw 'Actual pinned/clean-source legacy tool producer failed' }
}
$receipt=[ordered]@{schemaVersion=1;kind='SYNTHETIC_LEGACY_TRANSITION_T3_ONLY_NO_DISTRIBUTABLE_TOOL';sourceSha=$ExpectedSourceSha;frozenProductCandidate='40b3a555cb0dcb1732fe0f80ba5cb152d1fa136a';oldArchiveSha256='14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf';targets=$t3Targets;committedProductVersion='0.5.0';versionOnlyBuildOverride=$true;productOrHelperBytesPatched=$false;publishedOrProposedVersion=$false;publicationAuthenticated=$false;syntheticStableAuthorityOnly=$true;rawToolsOrInstallersMayBeUploaded=$false;expectedProvenanceUrlsAreNotResolvedPublications=$true}
[IO.File]::WriteAllText((Join-Path $t3Output 'BUILD_RECEIPT.json'),($receipt | ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
$receipt | ConvertTo-Json -Depth 10
