param(
    [Parameter(Mandatory = $true)][string]$BaselineZip,
    [Parameter(Mandatory = $true)][string]$CandidateZip,
    [Parameter(Mandatory = $true)][string]$CandidateVersion,
    [Parameter(Mandatory = $true)][string]$CandidateSourceSha,
    [string]$DesktopHomeName = 'Pica Library P2 RC'
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

if ($CandidateSourceSha -notmatch '^[0-9a-f]{40}$') {
    throw 'CandidateSourceSha must be a full Git commit SHA'
}
if ($DesktopHomeName -notin @('Pica Library P2 RC', 'Pica Library Post Stable RC')) {
    throw 'Acceptance requires one of the isolated RC home names'
}

$work = Join-Path ([IO.Path]::GetTempPath()) ("pica-universal-upgrade-" + [guid]::NewGuid().ToString('N'))
$currentExtract = Join-Path $work 'current'
$candidateExtract = Join-Path $work 'candidate'
$local = Join-Path $work 'localappdata'
$bootstrap = Join-Path $work 'bootstrap'
$backupRoot = Join-Path $work 'application-backup'
$progressFile = Join-Path (Join-Path $local $DesktopHomeName) 'runtime-state\updates\acceptance-progress.json'
$instructionFile = Join-Path $bootstrap 'instruction.json'
$originalLocal = $env:LOCALAPPDATA
$originalHome = $env:PICA_LIBRARY_DESKTOP_HOME
$currentInstance = $null
$success = $false

New-Item -ItemType Directory -Force -Path $work,$local,$bootstrap | Out-Null

try {
    $currentRoot = Expand-AppPackage $BaselineZip $currentExtract
    $candidateRoot = Expand-AppPackage $CandidateZip $candidateExtract

    foreach ($required in @(
        'Pica Library.exe',
        'runtime\node.exe',
        'app\desktop.js',
        'app\updater.js',
        'app\full-upgrader.js',
        'SOURCE_SHA.txt'
    )) {
        if (-not (Test-Path -LiteralPath (Join-Path $candidateRoot $required))) {
            throw "Candidate is missing universal-upgrade component: $required"
        }
    }

    $candidateSha = [IO.File]::ReadAllText(
        (Join-Path $candidateRoot 'SOURCE_SHA.txt')
    ).Trim()
    if ($candidateSha -ne $CandidateSourceSha) {
        throw "Candidate source SHA mismatch: $candidateSha"
    }

    $env:LOCALAPPDATA = $local
    $desktopHome = Join-Path $local $DesktopHomeName
    $env:PICA_LIBRARY_DESKTOP_HOME = $desktopHome
    $instanceFile = Join-Path $desktopHome 'runtime-state\instance.json'
    $libraryDirectory = Join-Path $desktopHome 'data'

    Start-Process -FilePath (Join-Path $currentRoot 'Pica Library.exe') -ArgumentList '--no-open' -WorkingDirectory $currentRoot -WindowStyle Hidden
    $currentInstance = Wait-Instance $instanceFile
    $baselineCaps = Invoke-RestMethod -Uri ($currentInstance.url + '/api/v1/capabilities') -TimeoutSec 10
    $baselineSchema = [int]$baselineCaps.databaseSchemaVersion

    New-Item -ItemType Directory -Force -Path (Join-Path $desktopHome 'config') | Out-Null
    $marker = Join-Path $desktopHome 'config\universal-upgrade-preservation.txt'
    [IO.File]::WriteAllText($marker, 'preserve-me')
    $database = Join-Path $libraryDirectory 'library.db'
    if (-not (Test-Path -LiteralPath $database)) {
        throw 'Baseline did not create the external Library database'
    }

    $bootstrapRuntime = Join-Path $bootstrap 'node.exe'
    $bootstrapHelper = Join-Path $bootstrap 'full-upgrader.js'
    Copy-Item -LiteralPath (Join-Path $candidateRoot 'runtime\node.exe') -Destination $bootstrapRuntime
    Copy-Item -LiteralPath (Join-Path $candidateRoot 'app\full-upgrader.js') -Destination $bootstrapHelper

    $instruction = [ordered]@{
        parentPid = [int]$currentInstance.pid
        applicationRoot = $currentRoot
        stagedApplicationRoot = $candidateRoot
        backupRoot = $backupRoot
        bootstrapRoot = $bootstrap
        desktopHomeRoot = $desktopHome
        libraryDirectory = $libraryDirectory
        instanceFile = $instanceFile
        progressFile = $progressFile
        targetVersion = $CandidateVersion
        targetSourceSha = $CandidateSourceSha
        previousUrl = [string]$currentInstance.url
        healthTimeoutMs = 60000
    }
    $instruction | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8 -LiteralPath $instructionFile

    $helperProcess = Start-Process -FilePath $bootstrapRuntime -ArgumentList @($bootstrapHelper,$instructionFile) -WorkingDirectory $bootstrap -WindowStyle Hidden -PassThru
    Start-Sleep -Milliseconds 300
    Stop-Desktop $currentInstance
    $currentInstance = $null

    $deadline = (Get-Date).AddSeconds(120)
    do {
        Start-Sleep -Milliseconds 250
        $helperProcess.Refresh()
    } while (-not $helperProcess.HasExited -and (Get-Date) -lt $deadline)
    if (-not $helperProcess.HasExited) {
        Stop-Process -Id $helperProcess.Id -Force -ErrorAction SilentlyContinue
        throw 'Universal full-upgrader did not finish within the acceptance timeout'
    }
    if ($helperProcess.ExitCode -ne 0) {
        throw "Universal full-upgrader exited with code $($helperProcess.ExitCode)"
    }

    $progress = Get-Content -Raw -LiteralPath $progressFile | ConvertFrom-Json
    if ($progress.phase -ne 'complete') {
        throw "Universal full-upgrader did not report completion: $($progress.phase)"
    }

    $candidateInstance = Wait-Instance $instanceFile
    $currentInstance = $candidateInstance
    $candidateCaps = Invoke-RestMethod -Uri ($candidateInstance.url + '/api/v1/capabilities') -TimeoutSec 10
    if ([string]$candidateCaps.appVersion -ne $CandidateVersion) {
        throw "Candidate version mismatch after full replacement: $($candidateCaps.appVersion)"
    }
    $candidateSchema = [int]$candidateCaps.databaseSchemaVersion
    if ($candidateSchema -lt $baselineSchema) {
        throw "Candidate database schema moved backwards: $baselineSchema -> $candidateSchema"
    }

    $installedSha = [IO.File]::ReadAllText(
        (Join-Path $currentRoot 'SOURCE_SHA.txt')
    ).Trim()
    if ($installedSha -ne $CandidateSourceSha) {
        throw 'Full replacement did not install the candidate application tree'
    }
    if (-not (Test-Path -LiteralPath $marker) -or [IO.File]::ReadAllText($marker) -ne 'preserve-me') {
        throw 'External Desktop configuration was not preserved'
    }
    if (-not (Test-Path -LiteralPath $database)) {
        throw 'External Library database was not preserved'
    }
    if ($candidateSchema -gt $baselineSchema) {
        $migrationBackup = "$database.pre-migration-v$candidateSchema.bak"
        if (-not (Test-Path -LiteralPath $migrationBackup)) {
            throw 'Schema-changing full replacement did not create the required pre-migration database backup'
        }
    }
    if (Test-Path -LiteralPath $backupRoot) {
        throw 'Successful full replacement left the temporary application backup behind'
    }

    Stop-Desktop $candidateInstance
    $currentInstance = $null

    [ordered]@{
        universal_full_upgrade = 'PASS'
        baseline_schema = $baselineSchema
        candidate_schema = $candidateSchema
        candidate_version = $CandidateVersion
        source_sha = $CandidateSourceSha
        external_config_preserved = $true
        external_database_preserved = $true
        pre_migration_backup = if ($candidateSchema -gt $baselineSchema) { 'PASS' } else { 'NOT_REQUIRED' }
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
        $resolved = [IO.Path]::GetFullPath($work)
        $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
        if (-not $resolved.StartsWith($tempRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
            (Split-Path -Leaf $resolved) -notmatch '^pica-universal-upgrade-[0-9a-f]{32}$' -or
            ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Refusing cleanup outside the task-owned upgrade acceptance directory'
        }
        Remove-Item -Recurse -Force -LiteralPath $resolved -ErrorAction SilentlyContinue
    } elseif (-not $success) {
        Write-Warning "Universal full-upgrade acceptance retained for diagnosis: $work"
    }
}
