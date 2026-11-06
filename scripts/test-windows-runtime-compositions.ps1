param(
    [Parameter(Mandatory=$true)][string]$CoreZip,
    [Parameter(Mandatory=$true)][string]$WithJmZip,
    [Parameter(Mandatory=$true)][string]$ReleasedBaselineZip,
    [Parameter(Mandatory=$true)][string]$FrozenDev86Zip,
    [Parameter(Mandatory=$true)][string]$ExpectedVersion,
    [Parameter(Mandatory=$true)][string]$ExpectedSourceSha
)
$ErrorActionPreference = 'Stop'
# This recipe is intentionally not a local launch permission or an auto-triggered workflow.
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
    throw 'Runtime/application acceptance is restricted to separately authorized disposable GitHub-hosted Windows CI'
}
if ($ExpectedSourceSha -notmatch '^[0-9a-f]{40}$' -or $ExpectedVersion -ne "0.5.0-postrc.$($ExpectedSourceSha.Substring(0,12))") { throw 'Exact unpublished source/version binding required' }
$picaCompositionRoot = Split-Path -Parent $PSScriptRoot
if ((git -C $picaCompositionRoot rev-parse HEAD).Trim() -ne $ExpectedSourceSha) { throw 'Candidate differs from checked-out source' }
foreach ($entry in @(
    @{ File=$ReleasedBaselineZip; Sha='14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf' },
    @{ File=$FrozenDev86Zip; Sha='c716bc3d0ab001e34e5173a3caf8ee6412a9e8aa355eee2f84eccf3fdf604b9b' }
)) {
    if (-not (Test-Path -LiteralPath $entry.File -PathType Leaf) -or (Get-FileHash -LiteralPath $entry.File -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Sha) { throw 'Pinned predecessor unavailable or changed; never substitute or skip it' }
}
Push-Location $picaCompositionRoot
try {
    foreach ($entry in @(@{ Zip=$CoreZip; Mode='core' }, @{ Zip=$WithJmZip; Mode='jm' })) {
        pnpm exec tsx scripts/check-windows-runtime-package.ts $entry.Zip $entry.Mode $ExpectedSourceSha
        if ($LASTEXITCODE -ne 0) { throw 'Actual ZIP composition gate failed' }
        & "$PSScriptRoot/test-windows-artifact.ps1" -Zip $entry.Zip -ExpectedVersion $ExpectedVersion -DesktopHomeName 'Pica Library Post Stable RC' -LocalOnlySetup -ExpectedSourceRuntimes $entry.Mode
        if ($LASTEXITCODE -ne 0) { throw 'Actual compiled local-only package gate failed' }
    }
    node scripts/audit-released-update-discovery.mjs $ReleasedBaselineZip
    if ($LASTEXITCODE -ne 0) { throw 'Exact released discovery-method audit failed' }
    # Same-composition only. A core -> JM replacement would now be correctly rejected.
    foreach ($entry in @(
        @{ Baseline=$ReleasedBaselineZip; Candidate=$CoreZip; Label='released-core' },
        @{ Baseline=$FrozenDev86Zip; Candidate=$WithJmZip; Label='frozen-dev86-jm' },
        @{ Baseline=$CoreZip; Candidate=$CoreZip; Label='current-core-deep'; Deep=1200 }
    )) {
        foreach ($scenario in @('success', 'health-failure', 'launch-failure')) {
            $parameters = @{ BaselineZip=$entry.Baseline; CandidateZip=$entry.Candidate; CandidateVersion=$ExpectedVersion; CandidateSourceSha=$ExpectedSourceSha; DesktopHomeName='Pica Library Post Stable RC'; DiagnosticsDirectory="artifacts/runtime-composition-evidence/$($entry.Label)/$scenario" }
            if ($entry.Deep) { $parameters.LibraryPathLength=$entry.Deep }
            if ($scenario -eq 'health-failure') { $parameters.ForceHealthFailure=$true }
            if ($scenario -eq 'launch-failure') { $parameters.ForceLaunchFailure=$true }
            & "$PSScriptRoot/test-windows-universal-full-upgrade.ps1" @parameters
            if ($LASTEXITCODE -ne 0) { throw "Same-composition replacement/recovery failed: $($entry.Label)/$scenario" }
        }
    }
    [ordered]@{ source=$ExpectedSourceSha; package_composition='PASS'; compiled_local_only_setup='PASS'; released_discovery_policy='PASS'; same_composition_replacement_recovery='PASS'; old_installed_controller_first_hop_ota='NOT_ESTABLISHED'; production_data_used=$false; release_or_deployment=$false } | ConvertTo-Json
} finally { Pop-Location }
