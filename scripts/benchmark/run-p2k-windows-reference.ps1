param(
    [string]$OutputRoot = "",
    [switch]$IncludeVisual,
    [switch]$AllowDirty
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $IsWindows) {
    throw "P2-K K1 Windows reference collection must run on Windows."
}

$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
if ($architecture -ne "X64") {
    throw "P2-K K1 Windows reference collection requires Windows x64; observed $architecture."
}

$git = (Get-Command git -ErrorAction Stop).Source
$node = (Get-Command node -ErrorAction Stop).Source
$pnpm = (Get-Command pnpm -ErrorAction Stop).Source

$commit = (& $git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-fA-F]{40}$') {
    throw "Unable to resolve current git commit."
}
$dirtyLines = @(& $git status --porcelain)
$dirty = $dirtyLines.Count -gt 0
if ($dirty -and -not $AllowDirty) {
    throw "Working tree is dirty. Commit/stash changes or rerun with -AllowDirty; dirty evidence cannot be promoted silently."
}

if (-not $OutputRoot) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutputRoot = Join-Path "test-results/p2k/windows-x64" $stamp
}
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
$OutputRoot = (Resolve-Path $OutputRoot).Path

$osInfo = Get-CimInstance Win32_OperatingSystem
$computer = Get-CimInstance Win32_ComputerSystem
$processors = @(Get-CimInstance Win32_Processor)
$gpus = @(Get-CimInstance Win32_VideoController)
$powerPlan = (& powercfg /GETACTIVESCHEME | Out-String).Trim()

$environment = [ordered]@{
    schemaVersion = 1
    collectedAt = (Get-Date).ToUniversalTime().ToString("o")
    commit = $commit
    dirty = $dirty
    platform = "win32"
    architecture = $architecture
    os = [ordered]@{
        caption = [string]$osInfo.Caption
        version = [string]$osInfo.Version
        buildNumber = [string]$osInfo.BuildNumber
    }
    computer = [ordered]@{
        manufacturer = [string]$computer.Manufacturer
        model = [string]$computer.Model
        physicalMemoryBytes = [int64]$computer.TotalPhysicalMemory
    }
    cpu = @($processors | ForEach-Object {
        [ordered]@{
            name = [string]$_.Name
            cores = [int]$_.NumberOfCores
            logicalProcessors = [int]$_.NumberOfLogicalProcessors
            maxClockMHz = [int]$_.MaxClockSpeed
        }
    })
    gpu = @($gpus | ForEach-Object {
        [ordered]@{
            name = [string]$_.Name
            driverVersion = [string]$_.DriverVersion
            currentRefreshRateHz = if ($null -eq $_.CurrentRefreshRate) { $null } else { [int]$_.CurrentRefreshRate }
        }
    })
    activePowerPlan = $powerPlan
    node = (& $node --version).Trim()
    pnpm = (& $pnpm --version).Trim()
}

$environmentPath = Join-Path $OutputRoot "environment.json"
$environment | ConvertTo-Json -Depth 8 | Set-Content -Path $environmentPath -Encoding utf8

$results = @()

function Invoke-ReferenceBenchmark {
    param(
        [Parameter(Mandatory=$true)][string]$Id,
        [Parameter(Mandatory=$true)][string]$Executable,
        [Parameter(Mandatory=$true)][string[]]$Arguments,
        [Parameter(Mandatory=$true)][string]$OutputFile
    )

    Write-Host ""
    Write-Host "=== P2-K $Id ==="
    Write-Host "$Executable $($Arguments -join ' ')"

    $started = (Get-Date).ToUniversalTime()
    & $Executable @Arguments
    $exitCode = $LASTEXITCODE
    $finished = (Get-Date).ToUniversalTime()

    $script:results += [pscustomobject]@{
        id = $Id
        executable = [System.IO.Path]::GetFileName($Executable)
        arguments = @($Arguments)
        output = [System.IO.Path]::GetRelativePath($OutputRoot, $OutputFile)
        outputExists = Test-Path $OutputFile
        exitCode = $exitCode
        startedAt = $started.ToString("o")
        finishedAt = $finished.ToString("o")
        elapsedMs = [math]::Round(($finished - $started).TotalMilliseconds, 3)
    }
}

function EvidencePath([string]$Name) {
    return Join-Path $OutputRoot $Name
}

Invoke-ReferenceBenchmark -Id "J3_DESKTOP_STARTUP" -Executable $pnpm -Arguments @(
    "benchmark:desktop-startup", "--",
    "--rounds=7",
    "--poll-ms=20",
    "--output=$(EvidencePath 'j3-desktop-startup.json')"
) -OutputFile (EvidencePath "j3-desktop-startup.json")

Invoke-ReferenceBenchmark -Id "J4_BROWSER_HOME_LIBRARY" -Executable $node -Arguments @(
    "scripts/run-desktop-browser-home-harness.mjs",
    "--rounds=7",
    "--output=$(EvidencePath 'j4-browser-home-library.json')"
) -OutputFile (EvidencePath "j4-browser-home-library.json")

Invoke-ReferenceBenchmark -Id "J5_DETAIL_SHELF_READER" -Executable $node -Arguments @(
    "scripts/run-desktop-browser-detail-reader-harness.mjs",
    "--rounds=7",
    "--output=$(EvidencePath 'j5-detail-shelf-reader.json')"
) -OutputFile (EvidencePath "j5-detail-shelf-reader.json")

Invoke-ReferenceBenchmark -Id "J6_READER_LONG_SESSION" -Executable $node -Arguments @(
    "scripts/run-desktop-reader-long-session-harness.mjs",
    "--cycles=80",
    "--output=$(EvidencePath 'j6-reader-long-session.json')"
) -OutputFile (EvidencePath "j6-reader-long-session.json")

Invoke-ReferenceBenchmark -Id "J7A_RECOMMENDATION_BATCH" -Executable $node -Arguments @(
    "scripts/run-desktop-recommendation-batch-harness.mjs",
    "--rounds=5",
    "--output=$(EvidencePath 'j7a-recommendation-batch.json')"
) -OutputFile (EvidencePath "j7a-recommendation-batch.json")

Invoke-ReferenceBenchmark -Id "J8_ACTIVE_DOWNLOAD" -Executable $pnpm -Arguments @(
    "benchmark:desktop-download-load", "--",
    "--rounds=5",
    "--iterations=10",
    "--warmup=2",
    "--interval-ms=25",
    "--output=$(EvidencePath 'j8-active-download.json')"
) -OutputFile (EvidencePath "j8-active-download.json")

Invoke-ReferenceBenchmark -Id "J9_WEBDAV" -Executable $pnpm -Arguments @(
    "benchmark:desktop-webdav-load", "--",
    "--rounds=5",
    "--iterations=10",
    "--warmup=2",
    "--interval-ms=25",
    "--output=$(EvidencePath 'j9-webdav.json')"
) -OutputFile (EvidencePath "j9-webdav.json")

Invoke-ReferenceBenchmark -Id "J11_OVERLAP" -Executable $pnpm -Arguments @(
    "benchmark:desktop-overlap-load", "--",
    "--rounds=5",
    "--iterations=10",
    "--warmup=2",
    "--interval-ms=25",
    "--output=$(EvidencePath 'j11-overlap.json')"
) -OutputFile (EvidencePath "j11-overlap.json")

if ($IncludeVisual) {
    Invoke-ReferenceBenchmark -Id "J10_VISUAL_REAL_MODEL" -Executable $pnpm -Arguments @(
        "benchmark:desktop-visual-index", "--",
        "--allow-model-network",
        "--rounds=5",
        "--timeout-ms=180000",
        "--output=$(EvidencePath 'j10-visual-real-model.json')"
    ) -OutputFile (EvidencePath "j10-visual-real-model.json")
}

$statusPath = Join-Path $OutputRoot "run-status.json"
@{
    schemaVersion = 1
    commit = $commit
    dirty = $dirty
    includeVisual = [bool]$IncludeVisual
    runs = @($results)
} | ConvertTo-Json -Depth 10 | Set-Content -Path $statusPath -Encoding utf8

& $node "scripts/benchmark/build-p2k-evidence-manifest.mjs" "--root=$OutputRoot" "--commit=$commit"
$manifestExit = $LASTEXITCODE
if ($manifestExit -ne 0) {
    throw "P2-K evidence manifest construction failed with exit code $manifestExit."
}

$failed = @($results | Where-Object { $_.exitCode -ne 0 -or -not $_.outputExists })
if ($failed.Count -gt 0) {
    Write-Error "P2-K collection completed with $($failed.Count) failed/missing benchmark result(s). See run-status.json and p2k-evidence-manifest.json."
    exit 2
}

Write-Host ""
Write-Host "P2-K K1 Windows reference collection completed."
Write-Host "Evidence root: $OutputRoot"
Write-Host "Manifest: $(Join-Path $OutputRoot 'p2k-evidence-manifest.json')"
Write-Host ""
Write-Host "Not collected automatically:"
Write-Host "- J7B real Provider regeneration (requires configured Desktop and explicit confirmation)"
if (-not $IncludeVisual) {
    Write-Host "- J10 real DINOv2 evidence (rerun with -IncludeVisual to allow model network)"
}
