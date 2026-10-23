param(
    [Parameter(Mandatory = $true)][string]$BaselineZip,
    [Parameter(Mandatory = $true)][string]$CandidateZip,
    [Parameter(Mandatory = $true)][string]$CandidateVersion,
    [Parameter(Mandatory = $true)][string]$CandidateSourceSha,
    [switch]$ForceHealthFailure,
    [switch]$ForceLaunchFailure,
    [ValidateRange(0,4096)][int]$LibraryPathLength = 0,
    [string]$DiagnosticsDirectory = '',
    [string]$DesktopHomeName = 'Pica Library P2 RC'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\windows-upgrade-diagnostics.ps1')

function Quote-UpgradeArgument([string]$Value) {
    if ($Value.Contains('"')) { throw 'Invalid quoted upgrade argument' }
    return '"' + $Value + '"'
}

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
    $owned = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$Instance.pid)" -ErrorAction SilentlyContinue
    if (-not $owned) { return }
    if (-not $owned.ExecutablePath -or -not $owned.ExecutablePath.StartsWith($work + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing to stop a process outside the exact upgrade acceptance root'
    }
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

function Assert-DeepDatabaseCanary([string]$Runtime,[string]$Database) {
    if (-not $LibraryPathLength) { return }
    $code = 'const {DatabaseSync}=require("node:sqlite"),path=require("node:path");const db=new DatabaseSync("file:"+encodeURIComponent(path.toNamespacedPath(process.argv[1]))+"?vfs=win32-longpath",{readOnly:true});const value=db.prepare("SELECT value FROM synthetic_upgrade_path").get().value;db.close();if(String(value)!=="12345")process.exit(2);'
    & $Runtime -e $code $Database
    if ($LASTEXITCODE -ne 0) { throw 'Deep-path upgrade lost the original synthetic database row' }
}

if ($CandidateSourceSha -notmatch '^[0-9a-f]{40}$') {
    throw 'CandidateSourceSha must be a full Git commit SHA'
}
if ($ForceHealthFailure -and $ForceLaunchFailure) { throw 'Select only one synthetic failure mode' }
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
$helperProcess = $null
$failureMessage = ''
$scenario = if ($ForceLaunchFailure) { 'launch-failure' } elseif ($ForceHealthFailure) { 'health-failure' } else { 'normal' }
$expectedFailure = $ForceHealthFailure -or $ForceLaunchFailure

New-Item -ItemType Directory -Force -Path $work,$local,$bootstrap | Out-Null

try {
    $currentRoot = Expand-AppPackage $BaselineZip $currentExtract
    $candidateRoot = Expand-AppPackage $CandidateZip $candidateExtract
    $baselineSha = [IO.File]::ReadAllText((Join-Path $currentRoot 'SOURCE_SHA.txt')).Trim()

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
    if ($LibraryPathLength) {
        # Only the task-owned data directory becomes deep; the launcher/profile
        # paths stay short so this gate isolates SQLite and its real sidecars.
        $libraryDirectory = Join-Path $work 'deep data with spaces'
        while ($libraryDirectory.Length + 11 -lt $LibraryPathLength) {
            $remaining = $LibraryPathLength - $libraryDirectory.Length - 11
            if ($remaining -eq 1) { $libraryDirectory += 'x' }
            else { $libraryDirectory = Join-Path $libraryDirectory ('x' * [Math]::Min($remaining - 1,60)) }
        }
        if ((Join-Path $libraryDirectory 'library.db').Length -ne $LibraryPathLength) { throw 'Exact synthetic database length could not be constructed' }
        New-Item -ItemType Directory -Force -Path (Join-Path $desktopHome 'config'),$libraryDirectory | Out-Null
        [ordered]@{ schemaVersion=1; libraryDirectory=$libraryDirectory; profile='balanced'; openBrowser=$false; preferredPort=4789; externalSources=@{ schemaVersion=1; revision=0; enabled=@() } } | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $desktopHome 'config\config.json')
        $seedCode = 'const {DatabaseSync}=require("node:sqlite"),path=require("node:path");const db=new DatabaseSync("file:"+encodeURIComponent(path.toNamespacedPath(process.argv[1]))+"?vfs=win32-longpath");db.exec("CREATE TABLE synthetic_upgrade_path(value TEXT); INSERT INTO synthetic_upgrade_path VALUES (12345)");db.close();'
        & (Join-Path $candidateRoot 'runtime\node.exe') -e $seedCode (Join-Path $libraryDirectory 'library.db')
        if ($LASTEXITCODE -ne 0) { throw 'Could not seed the isolated deep-path database' }
    }

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
        targetVersion = if ($ForceHealthFailure) { $CandidateVersion + '-deliberate-health-failure' } else { $CandidateVersion }
        targetSourceSha = $CandidateSourceSha
        previousUrl = [string]$currentInstance.url
        healthTimeoutMs = if ($ForceHealthFailure) { 5000 } else { 60000 }
    }
    $instruction | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8 -LiteralPath $instructionFile

    $helperArguments = @((Quote-UpgradeArgument $bootstrapHelper),(Quote-UpgradeArgument $instructionFile))
    if ($ForceLaunchFailure) {
        # Deterministic asynchronous API fault, not an assertion about a real OS/antivirus fault.
        $faultLoader = Join-Path $bootstrap 'synthetic-launch-error.cjs'
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'fixtures\upgrade-launch-error.cjs') -Destination $faultLoader
        $helperArguments = @('--require',(Quote-UpgradeArgument $faultLoader)) + $helperArguments
    }
    $helperProcess = Start-Process -FilePath $bootstrapRuntime -ArgumentList $helperArguments -WorkingDirectory $bootstrap -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $bootstrap 'helper.stdout.log') -RedirectStandardError (Join-Path $bootstrap 'helper.stderr.log')
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
    if ($helperProcess.ExitCode -ne 0 -and -not $expectedFailure) {
        throw "Universal full-upgrader exited with code $($helperProcess.ExitCode)"
    }

    $progress = Get-Content -Raw -LiteralPath $progressFile | ConvertFrom-Json
    if ($expectedFailure) {
        if ($helperProcess.ExitCode -ne 1 -or $progress.phase -ne 'failed') {
            throw "Deliberate $scenario did not take the actual rollback path"
        }
        $restored = Wait-Instance $instanceFile
        $currentInstance = $restored
        $restoredCaps = Invoke-RestMethod -Uri ($restored.url + '/api/v1/capabilities') -TimeoutSec 10
        if ($restoredCaps.appVersion -ne $baselineCaps.appVersion -or
            [IO.File]::ReadAllText((Join-Path $currentRoot 'SOURCE_SHA.txt')).Trim() -ne $baselineSha) {
            throw 'Rollback did not restore the original released application'
        }
        if (-not (Test-Path -LiteralPath $marker) -or
            [IO.File]::ReadAllText($marker) -ne 'preserve-me' -or
            -not (Test-Path -LiteralPath $database)) {
            throw 'Rollback did not preserve external configuration/database'
        }
        Assert-DeepDatabaseCanary (Join-Path $candidateRoot 'runtime\node.exe') $database
        Stop-Desktop $restored
        $currentInstance = $null
        [ordered]@{
            universal_full_rollback = 'PASS'
            universal_full_launch_rollback = if ($ForceLaunchFailure) { 'PASS' } else { 'NOT_RUN' }
            injected_failure = $scenario
            injection_mode = if ($ForceLaunchFailure) { 'TEST_ONLY_FIRST_SPAWN_ASYNC_ERROR' } else { 'TEST_ONLY_TARGET_VERSION_MISMATCH' }
            original_version_restored = $baselineCaps.appVersion
            original_source_restored = $baselineSha
            external_config_preserved = $true
            external_database_preserved = $true
            library_database_path_characters = $database.Length
            same_source_recovery_fixture = $baselineSha -eq $CandidateSourceSha
            source_sha = $CandidateSourceSha
        } | ConvertTo-Json
        $success = $true
        return
    }
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
    Assert-DeepDatabaseCanary (Join-Path $candidateRoot 'runtime\node.exe') $database
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
        library_database_path_characters = $database.Length
        same_source_recovery_fixture = $baselineSha -eq $CandidateSourceSha
        pre_migration_backup = if ($candidateSchema -gt $baselineSchema) { 'PASS' } else { 'NOT_REQUIRED' }
    } | ConvertTo-Json
    $success = $true
} catch {
    $failureMessage = $_.Exception.Message
    throw
} finally {
    if ($currentInstance) { try { Stop-Desktop $currentInstance } catch { Write-Warning 'Owned instance cleanup needs inspection' } }
    # Recover the instance published by a rollback, even if the test threw before assigning it.
    if (Test-Path -LiteralPath (Join-Path (Join-Path $local $DesktopHomeName) 'runtime-state\instance.json')) {
        try { Stop-Desktop (Get-Content -Raw -LiteralPath (Join-Path (Join-Path $local $DesktopHomeName) 'runtime-state\instance.json') | ConvertFrom-Json) } catch { Write-Warning 'Published owned process cleanup needs inspection' }
    }
    $ownedProcesses = @(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='Pica Library.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($work + '\', [StringComparison]::OrdinalIgnoreCase) })
    foreach ($ownedProcess in $ownedProcesses) {
        Stop-Process -Id $ownedProcess.ProcessId -Force -ErrorAction SilentlyContinue
        Wait-Process -Id $ownedProcess.ProcessId -Timeout 5 -ErrorAction SilentlyContinue
    }
    $diagnosticError = $null
    if ($DiagnosticsDirectory) {
        try {
            $exitCode = if ($helperProcess -and $helperProcess.HasExited) { $helperProcess.ExitCode } else { $null }
            $diagnostic = Write-PicaUpgradeDiagnostics -WorkRoot $work -Destination $DiagnosticsDirectory -CandidateSourceSha $CandidateSourceSha -ProgressFile $progressFile -Scenario $scenario -FailureMessage $failureMessage -GatePassed $success -HelperExitCode $exitCode
            Write-Host "UPGRADE_DIAGNOSTICS: $diagnostic"
        } catch { $diagnosticError = $_; Write-Warning 'Could not export bounded upgrade diagnostics; synthetic work directory retained' }
    }
    $env:LOCALAPPDATA = $originalLocal
    if ($null -eq $originalHome) {
        Remove-Item Env:PICA_LIBRARY_DESKTOP_HOME -ErrorAction SilentlyContinue
    } else {
        $env:PICA_LIBRARY_DESKTOP_HOME = $originalHome
    }
    if ($success -and -not $diagnosticError -and (Test-Path -LiteralPath $work)) {
        $resolved = [IO.Path]::GetFullPath($work)
        $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
        if (-not $resolved.StartsWith($tempRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
            (Split-Path -Leaf $resolved) -notmatch '^pica-universal-upgrade-[0-9a-f]{32}$' -or
            ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Refusing cleanup outside the task-owned upgrade acceptance directory'
        }
        Remove-Item -Recurse -Force -LiteralPath $resolved -ErrorAction SilentlyContinue
    } elseif (-not $success -or $diagnosticError) {
        Write-Warning "Universal full-upgrade acceptance retained for diagnosis: $work"
    }
    if ($success -and $diagnosticError) { throw $diagnosticError }
}
