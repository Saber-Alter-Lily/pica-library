param(
    [Parameter(Mandatory = $true)][string]$BaselineZip,
    [Parameter(Mandatory = $true)][string]$CandidateZip,
    [Parameter(Mandatory = $true)][string]$IncrementalZip,
    [Parameter(Mandatory = $true)][string]$CandidateVersion,
    [Parameter(Mandatory = $true)][string]$CandidateSourceSha
)

$ErrorActionPreference = 'Stop'

function Expand-AppPackage([string]$Zip, [string]$Destination) {
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Expand-Archive -LiteralPath $Zip -DestinationPath $Destination
    if (Test-Path -LiteralPath (Join-Path $Destination 'Pica Library.exe')) {
        return $Destination
    }
    $directories = @(Get-ChildItem -LiteralPath $Destination -Directory)
    if (
        $directories.Count -eq 1 -and
        (Test-Path -LiteralPath (Join-Path $directories[0].FullName 'Pica Library.exe'))
    ) {
        return $directories[0].FullName
    }
    throw "Package does not contain one Pica Library application root: $Zip"
}

function Wait-Instance([string]$InstanceFile, [int]$TimeoutSeconds = 30) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        Start-Sleep -Milliseconds 150
        if (Test-Path -LiteralPath $InstanceFile) {
            try {
                $instance = Get-Content -Raw -LiteralPath $InstanceFile | ConvertFrom-Json
                if ($instance.pid -and $instance.url) { return $instance }
            } catch {}
        }
    } while ((Get-Date) -lt $deadline)
    throw "Desktop instance was not published: $InstanceFile"
}

function Stop-Desktop($Instance) {
    if (-not $Instance) { return }
    try {
        $status = Invoke-RestMethod -Uri ($Instance.url + '/api/v1/desktop/status') -TimeoutSec 5
        Invoke-RestMethod -Method Post -Uri ($Instance.url + '/api/v1/desktop/shutdown') -Headers @{
            'x-pica-csrf' = $status.csrfToken
            Origin = $Instance.url
        } -ContentType 'application/json' -Body '{}' -TimeoutSec 5 | Out-Null
    } catch {
        Stop-Process -Id ([int]$Instance.pid) -Force -ErrorAction SilentlyContinue
    }
    $deadline = (Get-Date).AddSeconds(15)
    do {
        Start-Sleep -Milliseconds 150
    } while (
        (Get-Process -Id ([int]$Instance.pid) -ErrorAction SilentlyContinue) -and
        (Get-Date) -lt $deadline
    )
    if (Get-Process -Id ([int]$Instance.pid) -ErrorAction SilentlyContinue) {
        Stop-Process -Id ([int]$Instance.pid) -Force -ErrorAction SilentlyContinue
    }
}

function File-Sha256([string]$Path) {
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

if ($CandidateSourceSha -notmatch '^[0-9a-f]{40}$') {
    throw 'CandidateSourceSha must be a full Git commit SHA'
}

$work = Join-Path ([IO.Path]::GetTempPath()) ("pica-v0411-incremental-" + [guid]::NewGuid().ToString('N'))
$installExtract = Join-Path $work 'install'
$candidateExtract = Join-Path $work 'candidate'
$stagingRoot = Join-Path $work 'staging'
$local = Join-Path $work 'localappdata'
$backupRoot = Join-Path $work 'application-backup'
$instructionFile = Join-Path $work 'instruction.json'
$originalLocal = $env:LOCALAPPDATA
$originalHome = $env:PICA_LIBRARY_DESKTOP_HOME
$currentInstance = $null
$success = $false

New-Item -ItemType Directory -Force -Path $work,$local,$stagingRoot | Out-Null

try {
    $installRoot = Expand-AppPackage $BaselineZip $installExtract
    $candidateRoot = Expand-AppPackage $CandidateZip $candidateExtract
    Expand-Archive -LiteralPath $IncrementalZip -DestinationPath $stagingRoot

    $manifestFile = Join-Path $stagingRoot 'update-manifest.json'
    if (-not (Test-Path -LiteralPath $manifestFile)) {
        throw 'Incremental package is missing update-manifest.json'
    }
    $manifest = Get-Content -Raw -LiteralPath $manifestFile | ConvertFrom-Json
    if ([string]$manifest.sourceVersionRange -ne '=0.4.11') {
        throw "Unexpected incremental source range: $($manifest.sourceVersionRange)"
    }
    if ([string]$manifest.targetVersion -ne $CandidateVersion) {
        throw "Unexpected incremental target version: $($manifest.targetVersion)"
    }
    if ([int]$manifest.appApiVersion -ne 2) {
        throw "Unexpected incremental App API: $($manifest.appApiVersion)"
    }
    if ([int]$manifest.databaseSchemaVersion -ne 14) {
        throw "Unexpected incremental database schema: $($manifest.databaseSchemaVersion)"
    }
    if ([bool]$manifest.requiresFullInstall) {
        throw 'Incremental package unexpectedly requires a full install'
    }

    $paths = @($manifest.files | ForEach-Object { [string]$_.path })
    if ($paths -contains 'app/updater.js') {
        throw 'v0.4.11 incremental acceptance must not replace app/updater.js'
    }
    if ($paths -notcontains 'app/full-upgrader.js') {
        throw 'v0.4.11 incremental acceptance must install app/full-upgrader.js'
    }

    foreach ($required in @(
        'Pica Library.exe',
        'runtime\node.exe',
        'app\desktop.js',
        'app\updater.js',
        'app\full-upgrader.js',
        'SOURCE_SHA.txt'
    )) {
        if (-not (Test-Path -LiteralPath (Join-Path $candidateRoot $required))) {
            throw "Candidate is missing required component: $required"
        }
    }

    if ((File-Sha256 (Join-Path $installRoot 'app\updater.js')) -ne (File-Sha256 (Join-Path $candidateRoot 'app\updater.js'))) {
        throw 'Candidate updater.js is not byte-identical to public v0.4.11'
    }
    if ((File-Sha256 (Join-Path $installRoot 'Pica Library.exe')) -ne (File-Sha256 (Join-Path $candidateRoot 'Pica Library.exe'))) {
        throw 'Candidate launcher is not byte-identical to public v0.4.11'
    }

    $candidateSha = [IO.File]::ReadAllText(
        (Join-Path $candidateRoot 'SOURCE_SHA.txt')
    ).Trim()
    if ($candidateSha -ne $CandidateSourceSha) {
        throw "Candidate source SHA mismatch: $candidateSha"
    }

    $env:LOCALAPPDATA = $local
    $desktopHome = Join-Path $local 'Pica Library Incremental Acceptance'
    $env:PICA_LIBRARY_DESKTOP_HOME = $desktopHome
    $instanceFile = Join-Path $desktopHome 'runtime-state\instance.json'
    $progressFile = Join-Path $desktopHome 'runtime-state\updates\v0411-incremental-progress.json'
    $libraryDirectory = Join-Path $desktopHome 'data'

    Start-Process -FilePath (Join-Path $installRoot 'Pica Library.exe') -ArgumentList '--no-open' -WorkingDirectory $installRoot -WindowStyle Hidden
    $currentInstance = Wait-Instance $instanceFile
    $baselineCaps = Invoke-RestMethod -Uri ($currentInstance.url + '/api/v1/capabilities') -TimeoutSec 10
    if ([string]$baselineCaps.appVersion -ne '0.4.11') {
        throw "Baseline version mismatch: $($baselineCaps.appVersion)"
    }
    if ([int]$baselineCaps.databaseSchemaVersion -ne 13) {
        throw "Baseline schema mismatch: $($baselineCaps.databaseSchemaVersion)"
    }
    $baselinePid = [int]$currentInstance.pid

    New-Item -ItemType Directory -Force -Path (Join-Path $desktopHome 'config') | Out-Null
    $marker = Join-Path $desktopHome 'config\v0411-incremental-preservation.txt'
    [IO.File]::WriteAllText($marker, 'preserve-me')
    $database = Join-Path $libraryDirectory 'library.db'
    if (-not (Test-Path -LiteralPath $database)) {
        throw 'Baseline did not create the external Library database'
    }

    Stop-Desktop $currentInstance
    $currentInstance = $null
    Remove-Item -Force -ErrorAction SilentlyContinue $instanceFile

    $instruction = [ordered]@{
        parentPid = $baselinePid
        applicationRoot = $installRoot
        stagingRoot = $stagingRoot
        backupRoot = $backupRoot
        manifest = $manifest
        launcherPath = (Join-Path $installRoot 'Pica Library.exe')
        runtimePath = (Join-Path $installRoot 'runtime\node.exe')
        desktopEntryPath = (Join-Path $installRoot 'app\desktop.js')
        instanceFile = $instanceFile
        progressFile = $progressFile
        healthTimeoutMs = 60000
    }
    $instruction | ConvertTo-Json -Depth 50 | Set-Content -Encoding utf8 -LiteralPath $instructionFile

    $oldUpdater = Join-Path $installRoot 'app\updater.js'
    $updaterProcess = Start-Process -FilePath (Join-Path $installRoot 'runtime\node.exe') -ArgumentList @($oldUpdater,$instructionFile) -WorkingDirectory $installRoot -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddSeconds(120)
    do {
        Start-Sleep -Milliseconds 250
        $updaterProcess.Refresh()
    } while (-not $updaterProcess.HasExited -and (Get-Date) -lt $deadline)
    if (-not $updaterProcess.HasExited) {
        Stop-Process -Id $updaterProcess.Id -Force -ErrorAction SilentlyContinue
        throw 'v0.4.11 updater did not finish within the acceptance timeout'
    }
    if ($updaterProcess.ExitCode -ne 0) {
        throw "v0.4.11 updater exited with code $($updaterProcess.ExitCode)"
    }

    $progress = Get-Content -Raw -LiteralPath $progressFile | ConvertFrom-Json
    if ($progress.phase -ne 'complete') {
        throw "v0.4.11 updater did not report completion: $($progress.phase)"
    }

    $candidateInstance = Wait-Instance $instanceFile
    $candidateCaps = Invoke-RestMethod -Uri ($candidateInstance.url + '/api/v1/capabilities') -TimeoutSec 10
    if ([string]$candidateCaps.appVersion -ne $CandidateVersion) {
        throw "Candidate version mismatch after incremental replacement: $($candidateCaps.appVersion)"
    }
    if ([int]$candidateCaps.databaseSchemaVersion -ne 14) {
        throw "Candidate schema mismatch after incremental replacement: $($candidateCaps.databaseSchemaVersion)"
    }

    $installedSha = [IO.File]::ReadAllText(
        (Join-Path $installRoot 'SOURCE_SHA.txt')
    ).Trim()
    if ($installedSha -ne $CandidateSourceSha) {
        throw 'Incremental replacement did not install candidate SOURCE_SHA'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $installRoot 'app\full-upgrader.js'))) {
        throw 'Incremental replacement did not install the universal full-upgrader'
    }

    $assistantRoot = Join-Path $desktopHome 'runtime-state\upgrade-assistant'
    $assistantRuntime = Join-Path $assistantRoot 'runtime\node.exe'
    $assistantHelper = Join-Path $assistantRoot 'full-upgrader.js'
    $assistantMetadata = Join-Path $assistantRoot 'assistant.json'
    foreach ($requiredAssistantFile in @(
        $assistantRuntime,
        $assistantHelper,
        $assistantMetadata
    )) {
        if (-not (Test-Path -LiteralPath $requiredAssistantFile)) {
            throw "Candidate startup did not register persistent upgrade assistant: $requiredAssistantFile"
        }
    }
    if ((File-Sha256 $assistantRuntime) -ne (File-Sha256 (Join-Path $installRoot 'runtime\node.exe'))) {
        throw 'Persistent upgrade assistant runtime does not match installed runtime'
    }
    if ((File-Sha256 $assistantHelper) -ne (File-Sha256 (Join-Path $installRoot 'app\full-upgrader.js'))) {
        throw 'Persistent upgrade assistant helper does not match installed helper'
    }
    $assistant = Get-Content -Raw -LiteralPath $assistantMetadata | ConvertFrom-Json
    if ([int]$assistant.schemaVersion -ne 1) {
        throw "Unexpected persistent assistant metadata schema: $($assistant.schemaVersion)"
    }
    if ([string]$assistant.productVersion -ne $CandidateVersion) {
        throw "Persistent assistant version mismatch: $($assistant.productVersion)"
    }
    if ([string]$assistant.sourceSha -ne $CandidateSourceSha) {
        throw "Persistent assistant source SHA mismatch: $($assistant.sourceSha)"
    }

    if ((File-Sha256 (Join-Path $installRoot 'app\updater.js')) -ne (File-Sha256 (Join-Path $candidateRoot 'app\updater.js'))) {
        throw 'Legacy updater changed during incremental replacement'
    }
    if (-not (Test-Path -LiteralPath $marker) -or [IO.File]::ReadAllText($marker) -ne 'preserve-me') {
        throw 'External Desktop configuration was not preserved'
    }
    if (-not (Test-Path -LiteralPath $database)) {
        throw 'External Library database was not preserved'
    }
    $migrationBackup = "$database.pre-migration-v14.bak"
    if (-not (Test-Path -LiteralPath $migrationBackup)) {
        throw 'Schema 13 -> 14 incremental replacement did not create the required pre-migration backup'
    }

    foreach ($item in @($manifest.files)) {
        $relative = ([string]$item.path).Replace('/','\')
        $installed = Join-Path $installRoot $relative
        $candidate = Join-Path $candidateRoot $relative
        if (-not (Test-Path -LiteralPath $installed) -or -not (Test-Path -LiteralPath $candidate)) {
            throw "Installed/candidate path missing after incremental replacement: $($item.path)"
        }
        if ((File-Sha256 $installed) -ne (File-Sha256 $candidate)) {
            throw "Installed candidate byte mismatch: $($item.path)"
        }
    }

    Stop-Desktop $candidateInstance
    $currentInstance = $null

    [ordered]@{
        v0411_incremental_upgrade = 'PASS'
        baseline_version = '0.4.11'
        baseline_schema = 13
        candidate_version = $CandidateVersion
        candidate_schema = 14
        source_sha = $CandidateSourceSha
        legacy_updater_preserved = $true
        universal_full_upgrader_installed = $true
        persistent_upgrade_assistant = 'PASS'
        persistent_upgrade_assistant_root = '%LOCALAPPDATA%\Pica Library Incremental Acceptance\runtime-state\upgrade-assistant'
        external_config_preserved = $true
        external_database_preserved = $true
        pre_migration_backup = 'PASS'
    } | ConvertTo-Json
    $success = $true
} finally {
    if ($currentInstance) { Stop-Desktop $currentInstance }
    $env:LOCALAPPDATA = $originalLocal
    if ($null -eq $originalHome) {
        Remove-Item Env:PICA_LIBRARY_DESKTOP_HOME -ErrorAction SilentlyContinue
    } else {
        $env:PICA_LIBRARY_DESKTOP_HOME = $originalHome
    }
    if ($success -and (Test-Path -LiteralPath $work)) {
        Remove-Item -Recurse -Force -LiteralPath $work -ErrorAction SilentlyContinue
    } elseif (-not $success) {
        Write-Warning "v0.4.11 incremental acceptance retained for diagnosis: $work"
    }
}
