param(
    [Parameter(Mandatory=$true)]
    [string]$BaselineArchive,
    [Parameter(Mandatory=$true)]
    [string]$CandidateArchive
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $BaselineArchive)) { throw "Baseline archive not found: $BaselineArchive" }
if (-not (Test-Path -LiteralPath $CandidateArchive)) { throw "Candidate archive not found: $CandidateArchive" }
if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [System.Runtime.InteropServices.Architecture]::Arm64) {
    throw 'Windows ARM64 replacement acceptance requires a native ARM64 Windows runner'
}

$work = Join-Path $env:RUNNER_TEMP ("pica-win-arm64-replace-" + [guid]::NewGuid().ToString('N'))
$baselineRoot = Join-Path $work 'baseline'
$candidateRoot = Join-Path $work 'candidate'
$installRoot = Join-Path $work 'install'
$dataHome = Join-Path $work 'user-data'
$dataSnapshot = Join-Path $work 'pre-upgrade-data'
$fixture = Join-Path $work 'favorites.csv'
$instanceFile = Join-Path $dataHome 'runtime-state\instance.json'
$env:PICA_LIBRARY_DESKTOP_HOME = $dataHome
$script:CurrentNode = $null
$script:CurrentUrl = $null

function Cleanup {
    try {
        if (Test-Path -LiteralPath $instanceFile) {
            $info = Get-Content -Raw -LiteralPath $instanceFile | ConvertFrom-Json
            if ($info.pid) {
                Stop-Process -Id ([int]$info.pid) -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}
    Remove-Item -Recurse -Force -LiteralPath $work -ErrorAction SilentlyContinue
}

trap {
    $message = ($_ | Out-String)
    Cleanup
    Write-Error $message
    exit 1
}

function Expand-Package([string]$Archive,[string]$Destination) {
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Expand-Archive -LiteralPath $Archive -DestinationPath $Destination
    foreach ($required in @('Pica Library.exe','runtime\node.exe','app\desktop.js','app\pica-library.js','SOURCE_SHA.txt')) {
        $file = Join-Path $Destination $required
        if (-not (Test-Path -LiteralPath $file) -or (Get-Item -LiteralPath $file).Length -eq 0) {
            throw "Archive is missing required file: $required"
        }
    }
}

function Install-Package([string]$SourceRoot) {
    if (Test-Path -LiteralPath $installRoot) {
        Remove-Item -Recurse -Force -LiteralPath $installRoot
    }
    New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
    Get-ChildItem -LiteralPath $SourceRoot -Force | Copy-Item -Destination $installRoot -Recurse -Force
    $script:CurrentNode = Join-Path $installRoot 'runtime\node.exe'
    $identity = (& $script:CurrentNode -p "process.platform + '/' + process.arch").Trim()
    if ($identity -ne 'win32/arm64') { throw "Installed runtime identity mismatch: $identity" }
}

function Wait-Desktop {
    for ($i = 0; $i -lt 160; $i++) {
        try {
            if (Test-Path -LiteralPath $instanceFile) {
                $info = Get-Content -Raw -LiteralPath $instanceFile | ConvertFrom-Json
                if ($info.url) {
                    $status = Invoke-RestMethod -Uri "$($info.url)/api/v1/desktop/status" -TimeoutSec 2
                    if ($status.application -eq 'Pica Library') {
                        $script:CurrentUrl = [string]$info.url
                        return $status
                    }
                }
            }
        } catch {}
        Start-Sleep -Milliseconds 250
    }
    throw 'Windows ARM64 replacement engine did not become healthy'
}

function Start-Installed {
    $launcher = Join-Path $installRoot 'Pica Library.exe'
    Write-Host "[arm64-replace] launching $((Get-Content -Raw -LiteralPath (Join-Path $installRoot 'SOURCE_SHA.txt')).Trim())"
    $process = Start-Process -FilePath $launcher -ArgumentList @('--headless','--no-open') -PassThru
    if (-not $process.WaitForExit(15000)) {
        try { $process.Kill() } catch {}
        throw 'Windows ARM64 replacement launcher did not exit within 15 seconds'
    }
    if ($process.ExitCode -ne 0) { throw "Windows ARM64 replacement launcher failed with code $($process.ExitCode)" }
    return Wait-Desktop
}

function Stop-Installed {
    $status = Invoke-RestMethod -Uri "$script:CurrentUrl/api/v1/desktop/status" -TimeoutSec 5
    $headers = @{
        'x-pica-csrf' = [string]$status.csrfToken
        'Origin' = $script:CurrentUrl
    }
    Invoke-RestMethod -Method Post -Uri "$script:CurrentUrl/api/v1/desktop/shutdown" -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 5 | Out-Null
    for ($i = 0; $i -lt 100; $i++) {
        if (-not (Test-Path -LiteralPath $instanceFile)) {
            $script:CurrentUrl = $null
            return
        }
        try {
            $info = Get-Content -Raw -LiteralPath $instanceFile | ConvertFrom-Json
            if (-not (Get-Process -Id ([int]$info.pid) -ErrorAction SilentlyContinue)) {
                $script:CurrentUrl = $null
                return
            }
        } catch {
            $script:CurrentUrl = $null
            return
        }
        Start-Sleep -Milliseconds 250
    }
    throw 'Windows ARM64 replacement engine did not stop cleanly'
}

function Json-Post([string]$Path,[object]$Payload) {
    return Invoke-RestMethod -Method Post -Uri "$script:CurrentUrl$Path" -Headers @{ Origin=$script:CurrentUrl } -ContentType 'application/json' -Body ($Payload | ConvertTo-Json -Depth 8) -TimeoutSec 10
}

function Snapshot-Data {
    if (Test-Path -LiteralPath $dataSnapshot) {
        Remove-Item -Recurse -Force -LiteralPath $dataSnapshot
    }
    New-Item -ItemType Directory -Force -Path $dataSnapshot | Out-Null
    Get-ChildItem -LiteralPath $dataHome -Force | Copy-Item -Destination $dataSnapshot -Recurse -Force
}

function Restore-Data {
    if (Test-Path -LiteralPath $dataHome) {
        Remove-Item -Recurse -Force -LiteralPath $dataHome
    }
    New-Item -ItemType Directory -Force -Path $dataHome | Out-Null
    Get-ChildItem -LiteralPath $dataSnapshot -Force | Copy-Item -Destination $dataHome -Recurse -Force
}

Write-Host '[arm64-replace] extracting baseline and candidate packages'
New-Item -ItemType Directory -Force -Path $work,$dataHome | Out-Null
Expand-Package $BaselineArchive $baselineRoot
Expand-Package $CandidateArchive $candidateRoot

$baselineSha = (Get-Content -Raw -LiteralPath (Join-Path $baselineRoot 'SOURCE_SHA.txt')).Trim()
$candidateSha = (Get-Content -Raw -LiteralPath (Join-Path $candidateRoot 'SOURCE_SHA.txt')).Trim()
if ($baselineSha -notmatch '^[0-9a-f]{40}$' -or $candidateSha -notmatch '^[0-9a-f]{40}$') {
    throw 'Replacement packages have invalid source provenance'
}
if ($baselineSha -eq $candidateSha) { throw 'Replacement gate requires distinct baseline and candidate source SHAs' }

@'
comic_id,title,author,categories,tags,finished,total_likes,total_views,pages_count,eps_count
windows-arm64-replace-1,Windows ARM64 Replacement One,Preview Author,Drama,Preview | Replacement,true,12,120,24,1
windows-arm64-replace-2,Windows ARM64 Replacement Two,Preview Author,Comedy,Preview | Rollback,false,8,80,18,1
'@ | Set-Content -Encoding utf8 -LiteralPath $fixture

Write-Host '[arm64-replace] installing and seeding baseline'
Install-Package $baselineRoot
$dataDir = Join-Path $dataHome 'data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
& $script:CurrentNode (Join-Path $installRoot 'app\pica-library.js') import $fixture --data-dir $dataDir --json | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Baseline packaged CLI import failed' }

$status = Start-Installed
$baselineCaps = Invoke-RestMethod -Uri "$script:CurrentUrl/api/v1/capabilities" -TimeoutSec 5
$baselineSchema = [int]$baselineCaps.databaseSchemaVersion
if ($baselineCaps.runtime.platform -ne 'windows' -or $baselineCaps.runtime.arch -ne 'arm64') {
    throw 'Baseline runtime identity mismatch'
}
if ($baselineCaps.features.updatePackages -ne $false) { throw 'Baseline ARM64 self-update must be disabled' }

$baselineQuery = Json-Post '/api/v1/library/query' @{ scope='favorites'; text='Windows ARM64 Replacement'; limit=20 }
if ([int]$baselineQuery.total -ne 2) { throw 'Baseline library query failed' }

$baselineShelf = Json-Post '/api/v1/shelves' @{ name='ARM64 Replacement Baseline' }
$shelfId = [uri]::EscapeDataString([string]$baselineShelf.id)
Json-Post "/api/v1/shelves/$shelfId/items" @{ comicIds=@('windows-arm64-replace-1') } | Out-Null

$jobs = @(Json-Post '/api/v1/download' @{ comicIds=@('windows-arm64-replace-1'); source='manual'; run=$false })
if ($jobs.Count -ne 1) { throw 'Baseline download job was not created' }

Stop-Installed
Snapshot-Data

Write-Host '[arm64-replace] replacing application tree with candidate'
Install-Package $candidateRoot
if ((Get-Content -Raw -LiteralPath (Join-Path $installRoot 'SOURCE_SHA.txt')).Trim() -ne $candidateSha) {
    throw 'Candidate application replacement did not take effect'
}

$status = Start-Installed
$candidateCaps = Invoke-RestMethod -Uri "$script:CurrentUrl/api/v1/capabilities" -TimeoutSec 5
$candidateSchema = [int]$candidateCaps.databaseSchemaVersion
if ($candidateSchema -lt $baselineSchema) { throw 'Candidate schema unexpectedly moved backwards' }
if ($candidateCaps.runtime.platform -ne 'windows' -or $candidateCaps.runtime.arch -ne 'arm64') {
    throw 'Candidate runtime identity mismatch'
}
if ($candidateCaps.features.updatePackages -ne $false) { throw 'Candidate ARM64 self-update must remain disabled' }

if ($candidateSchema -gt $baselineSchema) {
    $migrationBackup = Join-Path $dataHome "data\library.db.pre-migration-v$candidateSchema.bak"
    if (-not (Test-Path -LiteralPath $migrationBackup)) {
        throw 'Schema-changing ARM64 candidate did not create the required pre-migration database backup'
    }
}

$candidateQuery = Json-Post '/api/v1/library/query' @{ scope='favorites'; text='Windows ARM64 Replacement'; limit=20 }
if ([int]$candidateQuery.total -ne 2) { throw 'Candidate did not inherit baseline library state' }
$candidateShelf = Invoke-RestMethod -Uri "$script:CurrentUrl/api/v1/shelves/$shelfId" -TimeoutSec 5
if (-not (@($candidateShelf.items) | Where-Object { $_.comicId -eq 'windows-arm64-replace-1' })) {
    throw 'Candidate did not inherit baseline shelf membership'
}
$candidateDownloads = @(Invoke-RestMethod -Uri "$script:CurrentUrl/api/v1/downloads" -TimeoutSec 5)
if (-not ($candidateDownloads | Where-Object { $_.comicId -eq 'windows-arm64-replace-1' })) {
    throw 'Candidate did not inherit baseline download state'
}

Json-Post '/api/v1/shelves' @{ name='ARM64 Candidate Marker' } | Out-Null
$candidateShelves = @(Invoke-RestMethod -Uri "$script:CurrentUrl/api/v1/shelves" -TimeoutSec 5)
if (-not ($candidateShelves | Where-Object { $_.name -eq 'ARM64 Candidate Marker' })) {
    throw 'Candidate-only marker was not written'
}
Stop-Installed

Write-Host '[arm64-replace] restoring pre-upgrade data snapshot and baseline application'
Restore-Data
Install-Package $baselineRoot
if ((Get-Content -Raw -LiteralPath (Join-Path $installRoot 'SOURCE_SHA.txt')).Trim() -ne $baselineSha) {
    throw 'Baseline application rollback did not take effect'
}

$status = Start-Installed
$rollbackCaps = Invoke-RestMethod -Uri "$script:CurrentUrl/api/v1/capabilities" -TimeoutSec 5
if ([int]$rollbackCaps.databaseSchemaVersion -ne $baselineSchema) { throw 'Rollback schema does not match baseline' }

$rollbackQuery = Json-Post '/api/v1/library/query' @{ scope='favorites'; text='Windows ARM64 Replacement'; limit=20 }
if ([int]$rollbackQuery.total -ne 2) { throw 'Rollback did not restore baseline library state' }
$rollbackShelves = @(Invoke-RestMethod -Uri "$script:CurrentUrl/api/v1/shelves" -TimeoutSec 5)
if (-not ($rollbackShelves | Where-Object { $_.name -eq 'ARM64 Replacement Baseline' })) {
    throw 'Rollback lost the baseline shelf'
}
if ($rollbackShelves | Where-Object { $_.name -eq 'ARM64 Candidate Marker' }) {
    throw 'Rollback retained candidate-only state'
}
$rollbackShelf = Invoke-RestMethod -Uri "$script:CurrentUrl/api/v1/shelves/$shelfId" -TimeoutSec 5
if (-not (@($rollbackShelf.items) | Where-Object { $_.comicId -eq 'windows-arm64-replace-1' })) {
    throw 'Rollback lost baseline shelf membership'
}
$rollbackDownloads = @(Invoke-RestMethod -Uri "$script:CurrentUrl/api/v1/downloads" -TimeoutSec 5)
if (-not ($rollbackDownloads | Where-Object { $_.comicId -eq 'windows-arm64-replace-1' })) {
    throw 'Rollback lost baseline download state'
}
Stop-Installed

$packageDatabases = @(Get-ChildItem -LiteralPath $installRoot -File -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '\.(db|sqlite)(-wal|-shm)?$' })
if ($packageDatabases.Count -gt 0) { throw 'ARM64 application tree contains user database state after replacement' }

Write-Host 'Windows ARM64 preview replacement/rollback acceptance: PASS'
Cleanup
