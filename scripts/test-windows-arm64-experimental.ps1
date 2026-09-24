param(
    [Parameter(Mandatory=$true)]
    [string]$Archive
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Archive)) { throw "Archive not found: $Archive" }
if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [System.Runtime.InteropServices.Architecture]::Arm64) {
    throw 'Windows ARM64 acceptance requires a native ARM64 Windows runner'
}

$work = Join-Path $env:RUNNER_TEMP ("pica-win-arm64-" + [guid]::NewGuid().ToString('N'))
$extract = Join-Path $work 'package'
$dataHome = Join-Path $work 'user-data'
$fixture = Join-Path $work 'favorites.csv'
$pageFile = Join-Path $dataHome 'data\windows-arm64-reader.png'
$instanceFile = Join-Path $dataHome 'runtime-state\instance.json'
$secret = 'windows-arm64-dpapi-secret'
$env:PICA_LIBRARY_DESKTOP_HOME = $dataHome

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

Write-Host '[arm64] extracting package'
New-Item -ItemType Directory -Force -Path $extract,$dataHome | Out-Null
Expand-Archive -LiteralPath $Archive -DestinationPath $extract
$packageRoot = $extract

$node = Join-Path $packageRoot 'runtime\node.exe'
$launcher = Join-Path $packageRoot 'Pica Library.exe'
$cli = Join-Path $packageRoot 'app\pica-library.js'
$desktop = Join-Path $packageRoot 'app\desktop.js'
foreach ($required in @($node,$launcher,$cli,$desktop,(Join-Path $packageRoot 'web\index.html'),(Join-Path $packageRoot 'SOURCE_SHA.txt'))) {
    if (-not (Test-Path -LiteralPath $required) -or (Get-Item -LiteralPath $required).Length -eq 0) {
        throw "Package is missing: $required"
    }
}

Write-Host '[arm64] validating packaged native runtime'
$identity = (& $node -p "process.platform + '/' + process.arch").Trim()
if ($identity -ne 'win32/arm64') { throw "Packaged Node runtime is not Windows ARM64: $identity" }

@'
comic_id,title,author,categories,tags,finished,total_likes,total_views,pages_count,eps_count
windows-arm64-1,Windows ARM64 Fixture One,Preview Author,Drama,Preview | ARM64,true,12,120,24,1
windows-arm64-2,Windows ARM64 Fixture Two,Preview Author,Comedy,Preview | Portable,false,8,80,18,1
'@ | Set-Content -Encoding utf8 -LiteralPath $fixture

$dataDir = Join-Path $dataHome 'data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
Write-Host '[arm64] importing synthetic library with packaged CLI'
& $node $cli import $fixture --data-dir $dataDir --json | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Packaged CLI import failed' }
$cliList = & $node $cli list --data-dir $dataDir --json | ConvertFrom-Json
if (@($cliList).Count -ne 2) { throw 'Packaged CLI did not reopen the imported library' }

$dbFile = Join-Path $dataDir 'library.db'
$seedScript = Join-Path $work 'seed-reader.mjs'
@'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
const [databaseFile, pageFile] = process.argv.slice(2)
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO0sAAAAASUVORK5CYII=',
  'base64'
)
fs.writeFileSync(pageFile, png)
const db = new DatabaseSync(databaseFile)
const now = new Date().toISOString()
db.prepare('INSERT INTO episodes(id, comic_id, title, order_no, updated_at_source, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
  'windows-arm64-ep-1', 'windows-arm64-1', 'Preview Chapter', 1, now, now, now
)
db.prepare('INSERT INTO pictures(id, comic_id, episode_id, position, original_name, media_path, file_server, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
  'windows-arm64-pic-1',
  'windows-arm64-1',
  'windows-arm64-ep-1',
  1,
  'windows-arm64-reader.png',
  'windows-arm64-reader.png',
  'https://fixture.invalid',
  now,
  now
)
db.prepare("UPDATE pictures SET status = 'completed', local_path = ?, byte_size = ?, sha256 = ?, last_seen_at = ? WHERE id = ?").run(
  pageFile,
  png.length,
  crypto.createHash('sha256').update(png).digest('hex'),
  now,
  'windows-arm64-pic-1'
)
db.close()
'@ | Set-Content -Encoding utf8 -LiteralPath $seedScript
Write-Host '[arm64] seeding downloaded Reader fixture'
& $node $seedScript $dbFile $pageFile
if ($LASTEXITCODE -ne 0) { throw 'Reader fixture seeding failed' }

function Wait-Desktop([string]$OldCsrf = '') {
    for ($i = 0; $i -lt 200; $i++) {
        try {
            if (Test-Path -LiteralPath $instanceFile) {
                $info = Get-Content -Raw -LiteralPath $instanceFile | ConvertFrom-Json
                if ($info.url) {
                    $status = Invoke-RestMethod -Uri "$($info.url)/api/v1/desktop/status" -TimeoutSec 2
                    if ($status.application -eq 'Pica Library' -and (!$OldCsrf -or $status.csrfToken -ne $OldCsrf)) {
                        return [pscustomobject]@{ Url=[string]$info.url; Status=$status }
                    }
                }
            }
        } catch {}
        Start-Sleep -Milliseconds 250
    }
    throw 'Windows ARM64 Desktop engine did not become healthy'
}

function Start-Desktop {
    Write-Host '[arm64] launching packaged Pica Library.exe'
    $process = Start-Process -FilePath $launcher -ArgumentList @('--headless','--no-open') -PassThru
    if (-not $process.WaitForExit(15000)) {
        try { $process.Kill() } catch {}
        throw 'Windows ARM64 launcher did not exit within 15 seconds; a blocking launcher dialog or startup failure is likely'
    }
    if ($process.ExitCode -ne 0) { throw "Windows ARM64 launcher failed with code $($process.ExitCode)" }
    Write-Host '[arm64] launcher exited; waiting for Desktop engine'
    return Wait-Desktop
}

function Stop-Desktop([string]$Url) {
    $status = Invoke-RestMethod -Uri "$Url/api/v1/desktop/status" -TimeoutSec 5
    $headers = @{
        'x-pica-csrf' = [string]$status.csrfToken
        'Origin' = $Url
    }
    Invoke-RestMethod -Method Post -Uri "$Url/api/v1/desktop/shutdown" -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 5 | Out-Null
    for ($i = 0; $i -lt 100; $i++) {
        try {
            if (-not (Test-Path -LiteralPath $instanceFile)) { return }
            $info = Get-Content -Raw -LiteralPath $instanceFile | ConvertFrom-Json
            if (-not (Get-Process -Id ([int]$info.pid) -ErrorAction SilentlyContinue)) { return }
        } catch { return }
        Start-Sleep -Milliseconds 250
    }
    throw 'Windows ARM64 Desktop engine did not stop cleanly'
}

function JsonPost([string]$Url,[string]$Path,[object]$Payload,[hashtable]$ExtraHeaders = @{}) {
    $headers = @{ Origin = $Url }
    foreach ($entry in $ExtraHeaders.GetEnumerator()) { $headers[$entry.Key] = $entry.Value }
    return Invoke-RestMethod -Method Post -Uri "$Url$Path" -Headers $headers -ContentType 'application/json' -Body ($Payload | ConvertTo-Json -Depth 8) -TimeoutSec 10
}

Write-Host '[arm64] starting first packaged Desktop session'
$desktopState = Start-Desktop
$url = $desktopState.Url
$status = $desktopState.Status
$caps = Invoke-RestMethod -Uri "$url/api/v1/capabilities" -TimeoutSec 5

if ($status.platform.id -ne 'windows' -or $status.platform.arch -ne 'arm64') { throw 'Windows ARM64 platform identity mismatch' }
if ($status.platform.distributionReady -ne $false) { throw 'Windows ARM64 must remain preview-only' }
if ($status.platform.selfUpdate -ne $false) { throw 'Windows ARM64 self-update must remain disabled' }
if ($status.credentialBackend.kind -ne 'windows-dpapi' -or $status.credentialBackend.securePersistence -ne $true) { throw 'Windows ARM64 DPAPI capability mismatch' }
if ($status.nativePicker.backend -ne 'windows-winforms') { throw 'Windows ARM64 native picker capability mismatch' }
if ($caps.runtime.platform -ne 'windows' -or $caps.runtime.arch -ne 'arm64') { throw 'Windows ARM64 structured capability identity mismatch' }
if ($caps.features.updatePackages -ne $false) { throw 'Windows ARM64 updatePackages must remain false' }
if ($caps.capabilityStates.selfUpdate.available -ne $false) { throw 'Windows ARM64 self-update capability became available' }

$oldCsrf = [string]$status.csrfToken
$settingsHeaders = @{ Origin=$url; 'x-pica-csrf'=$oldCsrf }
$settings = @{
    account = 'windows-arm64-preview-account'
    password = $secret
    libraryDirectory = [string]$status.libraryDirectory
    profile = 'balanced'
}
Write-Host '[arm64] saving synthetic credentials through DPAPI-backed settings'
$settingsTimer = [System.Diagnostics.Stopwatch]::StartNew()
try {
    # Native ARM64 hosted runners occasionally spend more than 10 seconds in
    # the DPAPI/settings restart path under host load. Keep the acceptance
    # bounded, but allow the real platform operation enough time to finish.
    Invoke-RestMethod -Method Post -Uri "$url/api/v1/desktop/settings" -Headers $settingsHeaders -ContentType 'application/json' -Body ($settings | ConvertTo-Json) -TimeoutSec 30 | Out-Null
} finally {
    $settingsTimer.Stop()
    Write-Host ("[arm64] DPAPI settings POST elapsed: {0} ms" -f [math]::Round($settingsTimer.Elapsed.TotalMilliseconds))
}
$restarted = Wait-Desktop -OldCsrf $oldCsrf
$url = $restarted.Url
$status = $restarted.Status
if ($status.configured -ne $true) { throw 'DPAPI-backed settings did not configure the current process' }

$credentialFile = Join-Path $dataHome 'config\credentials.dat'
if (-not (Test-Path -LiteralPath $credentialFile)) { throw 'DPAPI credential file was not created' }
if ((Get-Content -Raw -LiteralPath $credentialFile) -like "*$secret*") { throw 'DPAPI credential file contains plaintext secret' }
$secretScanScript = Join-Path $work 'scan-secret.mjs'
@'
import fs from 'node:fs'
import path from 'node:path'
const [root, secret] = process.argv.slice(2)
const needle = Buffer.from(secret, 'utf8')
const hits = []
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      visit(file)
      continue
    }
    if (!entry.isFile()) continue
    const bytes = fs.readFileSync(file)
    if (bytes.includes(needle)) hits.push(path.relative(root, file))
  }
}
visit(root)
process.stdout.write(JSON.stringify(hits))
'@ | Set-Content -Encoding utf8 -LiteralPath $secretScanScript
$plaintextPaths = @((& $node $secretScanScript $dataHome $secret | ConvertFrom-Json))
if ($LASTEXITCODE -ne 0) { throw 'Windows ARM64 binary secret scan failed' }
if ($plaintextPaths.Count -gt 0) {
    throw "Windows ARM64 synthetic credential leaked into persistent user data files: $($plaintextPaths -join ', ')"
}

Write-Host '[arm64] exercising library, shelf, Reader and download APIs'
$query = JsonPost $url '/api/v1/library/query' @{ scope='favorites'; text='Windows ARM64 Fixture'; limit=20 }
if ([int]$query.total -ne 2) { throw 'Windows ARM64 library query returned the wrong fixture count' }

$detail = Invoke-RestMethod -Uri "$url/api/v1/comics/windows-arm64-1" -TimeoutSec 5
if ($detail.title -ne 'Windows ARM64 Fixture One') { throw 'Windows ARM64 comic detail mismatch' }

$shelf = JsonPost $url '/api/v1/shelves' @{ name='Windows ARM64 Acceptance' }
$shelfId = [uri]::EscapeDataString([string]$shelf.id)
JsonPost $url "/api/v1/shelves/$shelfId/items" @{ comicIds=@('windows-arm64-1') } | Out-Null
$shelfContents = Invoke-RestMethod -Uri "$url/api/v1/shelves/$shelfId" -TimeoutSec 5
if (-not (@($shelfContents.items) | Where-Object { $_.comicId -eq 'windows-arm64-1' })) { throw 'Windows ARM64 shelf membership missing' }

$chapter = Invoke-RestMethod -Uri "$url/api/v1/reader/comics/windows-arm64-1/chapters/windows-arm64-ep-1" -TimeoutSec 5
if (@($chapter.pages).Count -ne 1 -or $chapter.pages[0].id -ne 'windows-arm64-pic-1') { throw 'Windows ARM64 Reader page list mismatch' }
$downloadedPage = Join-Path $work 'reader-page.png'
Invoke-WebRequest -UseBasicParsing -Uri "$url/api/v1/reader/pictures/windows-arm64-pic-1" -OutFile $downloadedPage -TimeoutSec 5
if ((Get-FileHash -Algorithm SHA256 $downloadedPage).Hash -ne (Get-FileHash -Algorithm SHA256 $pageFile).Hash) { throw 'Windows ARM64 Reader page bytes changed' }
JsonPost $url '/api/v1/reader/progress' @{ comicId='windows-arm64-1'; episodeId='windows-arm64-ep-1'; pageIndex=0 } | Out-Null

$queued = @(JsonPost $url '/api/v1/download' @{ comicIds=@('windows-arm64-1'); source='manual'; run=$false })
if ($queued.Count -ne 1 -or $queued[0].status -ne 'QUEUED') { throw 'Windows ARM64 download did not enter QUEUED state' }
$jobId = [uri]::EscapeDataString([string]$queued[0].id)
$paused = JsonPost $url "/api/v1/downloads/$jobId/pause" @{}
if ($paused.status -ne 'PAUSED') { throw 'Windows ARM64 download pause failed' }
$resumed = JsonPost $url "/api/v1/downloads/$jobId/resume" @{}
if ($resumed.status -ne 'QUEUED') { throw 'Windows ARM64 download resume failed' }

Write-Host '[arm64] stopping first Desktop session'
Stop-Desktop $url
if (-not (Test-Path -LiteralPath $dbFile)) { throw 'Windows ARM64 database was not persisted outside the package' }

Write-Host '[arm64] starting second Desktop session for persistence checks'
$desktopState = Start-Desktop
$url = $desktopState.Url
$status = $desktopState.Status
if ($status.configured -ne $true) { throw 'DPAPI credentials did not reload after process restart' }

$queryAfter = JsonPost $url '/api/v1/library/query' @{ scope='favorites'; text='Windows ARM64 Fixture'; limit=20 }
if ([int]$queryAfter.total -ne 2) { throw 'Windows ARM64 library state did not persist across restart' }
$shelvesAfter = @(Invoke-RestMethod -Uri "$url/api/v1/shelves" -TimeoutSec 5)
if (-not ($shelvesAfter | Where-Object { $_.name -eq 'Windows ARM64 Acceptance' })) { throw 'Windows ARM64 shelf did not persist across restart' }
$downloadsAfter = @(Invoke-RestMethod -Uri "$url/api/v1/downloads" -TimeoutSec 5)
if (-not ($downloadsAfter | Where-Object { $_.comicId -eq 'windows-arm64-1' -and $_.status -eq 'PAUSED' })) { throw 'Windows ARM64 graceful shutdown did not persist active download as PAUSED' }
$progressAfter = @(Invoke-RestMethod -Uri "$url/api/v1/reader/progress" -TimeoutSec 5)
if (-not ($progressAfter | Where-Object { $_.comicId -eq 'windows-arm64-1' -and $_.episodeId -eq 'windows-arm64-ep-1' -and [int]$_.pageIndex -eq 0 })) { throw 'Windows ARM64 Reader progress did not persist across restart' }

Write-Host '[arm64] stopping second Desktop session'
Stop-Desktop $url

$packageDatabases = @(Get-ChildItem -LiteralPath $packageRoot -File -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '\.(db|sqlite)(-wal|-shm)?$' })
if ($packageDatabases.Count -gt 0) { throw 'Windows ARM64 package contains user database state' }

Write-Host 'Windows ARM64 experimental package acceptance: PASS'
Cleanup
