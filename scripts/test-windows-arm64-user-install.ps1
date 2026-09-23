param(
    [Parameter(Mandatory=$true)]
    [string]$Archive
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Archive)) { throw "Archive not found: $Archive" }
if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [System.Runtime.InteropServices.Architecture]::Arm64) {
    throw 'Windows ARM64 user-install acceptance requires a native ARM64 Windows runner'
}

$work = Join-Path $env:RUNNER_TEMP ("pica-win-arm64-install-" + [guid]::NewGuid().ToString('N'))
$extract = Join-Path $work 'package'
$env:LOCALAPPDATA = Join-Path $work 'Local AppData'
$env:APPDATA = Join-Path $work 'Roaming AppData'
Remove-Item Env:PICA_LIBRARY_DESKTOP_HOME -ErrorAction SilentlyContinue

$installRoot = Join-Path $env:LOCALAPPDATA 'Programs\Pica Library ARM64 Preview'
$dataRoot = Join-Path $env:LOCALAPPDATA 'Pica Library'
$shortcutFile = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Pica Library ARM64 Preview.lnk'
$instanceFile = Join-Path $dataRoot 'runtime-state\instance.json'
$script:CurrentUrl = $null

function Cleanup {
    try {
        if (Test-Path -LiteralPath $instanceFile) {
            $info = Get-Content -Raw -LiteralPath $instanceFile | ConvertFrom-Json
            if ($info.pid) { Stop-Process -Id ([int]$info.pid) -Force -ErrorAction SilentlyContinue }
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

function Wait-Desktop {
    for ($i = 0; $i -lt 160; $i++) {
        try {
            if (Test-Path -LiteralPath $instanceFile) {
                $info = Get-Content -Raw -LiteralPath $instanceFile | ConvertFrom-Json
                if ($info.url) {
                    $status = Invoke-RestMethod -Uri "$($info.url)/api/v1/desktop/status" -TimeoutSec 2
                    if ($status.application -eq 'Pica Library') {
                        $script:CurrentUrl = [string]$info.url
                        return [pscustomobject]@{ Info=$info; Status=$status }
                    }
                }
            }
        } catch {}
        Start-Sleep -Milliseconds 250
    }
    throw 'Installed Windows ARM64 Desktop engine did not become healthy'
}

function Start-Installed {
    $launcher = Join-Path $installRoot 'Pica Library.exe'
    $process = Start-Process -FilePath $launcher -ArgumentList @('--headless','--no-open') -PassThru
    if (-not $process.WaitForExit(15000)) {
        try { $process.Kill() } catch {}
        throw 'Installed Windows ARM64 launcher did not exit within 15 seconds'
    }
    if ($process.ExitCode -ne 0) { throw "Installed Windows ARM64 launcher failed with code $($process.ExitCode)" }
    return Wait-Desktop
}

function Stop-Installed {
    $current = Wait-Desktop
    $enginePid = [int]$current.Info.pid
    $headers = @{
        'x-pica-csrf' = [string]$current.Status.csrfToken
        'Origin' = $script:CurrentUrl
    }
    Invoke-RestMethod -Method Post -Uri "$script:CurrentUrl/api/v1/desktop/shutdown" -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 5 | Out-Null
    for ($i = 0; $i -lt 120; $i++) {
        if (-not (Get-Process -Id $enginePid -ErrorAction SilentlyContinue)) {
            $script:CurrentUrl = $null
            return
        }
        Start-Sleep -Milliseconds 250
    }
    throw "Installed Windows ARM64 engine PID $enginePid did not terminate after shutdown"
}

Write-Host '[arm64-install] extracting package'
New-Item -ItemType Directory -Force -Path $extract,$env:LOCALAPPDATA,$env:APPDATA | Out-Null
Expand-Archive -LiteralPath $Archive -DestinationPath $extract
$packageRoot = $extract

foreach ($required in @(
    'install-windows-arm64-user.ps1',
    'uninstall-windows-arm64-user.ps1',
    'Pica Library.exe',
    'runtime\node.exe',
    'app\desktop.js',
    'SOURCE_SHA.txt'
)) {
    $file = Join-Path $packageRoot $required
    if (-not (Test-Path -LiteralPath $file) -or (Get-Item -LiteralPath $file).Length -eq 0) {
        throw "Package is missing user-install asset: $required"
    }
}

Write-Host '[arm64-install] installing per-user preview'
& (Join-Path $packageRoot 'install-windows-arm64-user.ps1') -InstallRoot $installRoot

$markerFile = Join-Path $installRoot '.pica-library-arm64-preview-install.json'
if (-not (Test-Path -LiteralPath $markerFile)) { throw 'Windows ARM64 install marker missing' }
$marker = Get-Content -Raw -LiteralPath $markerFile | ConvertFrom-Json
if ($marker.channel -ne 'windows-arm64-preview' -or $marker.product -ne 'Pica Library') { throw 'Windows ARM64 install marker identity mismatch' }

$packageSha = (Get-Content -Raw -LiteralPath (Join-Path $packageRoot 'SOURCE_SHA.txt')).Trim()
$installedSha = (Get-Content -Raw -LiteralPath (Join-Path $installRoot 'SOURCE_SHA.txt')).Trim()
if ($installedSha -ne $packageSha -or $marker.sourceSha -ne $packageSha) { throw 'Windows ARM64 installed provenance mismatch' }

if (-not (Test-Path -LiteralPath $shortcutFile)) { throw 'Windows ARM64 Start Menu shortcut missing' }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutFile)
$expectedTarget = Join-Path $installRoot 'Pica Library.exe'
if ([IO.Path]::GetFullPath([string]$shortcut.TargetPath) -ne [IO.Path]::GetFullPath($expectedTarget)) { throw 'Windows ARM64 Start Menu shortcut target mismatch' }
if ([IO.Path]::GetFullPath([string]$shortcut.WorkingDirectory) -ne [IO.Path]::GetFullPath($installRoot)) { throw 'Windows ARM64 Start Menu shortcut working directory mismatch' }

if ([IO.Path]::GetFullPath($installRoot).StartsWith(([IO.Path]::GetFullPath($dataRoot) + '\'), [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Windows ARM64 application root overlaps user data'
}

Write-Host '[arm64-install] launching installed preview'
$state = Start-Installed
if ($state.Status.platform.id -ne 'windows' -or $state.Status.platform.arch -ne 'arm64') { throw 'Installed Windows ARM64 platform identity mismatch' }
if ($state.Status.platform.distributionReady -ne $false -or $state.Status.platform.selfUpdate -ne $false) { throw 'Installed Windows ARM64 preview was promoted unexpectedly' }
$caps = Invoke-RestMethod -Uri "$script:CurrentUrl/api/v1/capabilities" -TimeoutSec 5
if ($caps.features.updatePackages -ne $false) { throw 'Installed Windows ARM64 preview advertised update packages' }
Stop-Installed

$dbFile = Join-Path $dataRoot 'data\library.db'
if (-not (Test-Path -LiteralPath $dbFile)) { throw 'Installed Windows ARM64 preview did not use the external user-data root' }
$sentinel = Join-Path $dataRoot 'user-data-preserved.txt'
Set-Content -Encoding utf8 -LiteralPath $sentinel -Value 'preserve-me'
$stale = Join-Path $installRoot 'stale-application-file.txt'
Set-Content -Encoding utf8 -LiteralPath $stale -Value 'remove-me'

Write-Host '[arm64-install] reinstalling preview to prove program/data separation'
& (Join-Path $packageRoot 'install-windows-arm64-user.ps1') -InstallRoot $installRoot
if (Test-Path -LiteralPath $stale) { throw 'Windows ARM64 reinstall did not replace the old application tree' }
if (-not (Test-Path -LiteralPath $sentinel)) { throw 'Windows ARM64 reinstall removed user data' }
if ((Get-Content -Raw -LiteralPath (Join-Path $installRoot 'SOURCE_SHA.txt')).Trim() -ne $packageSha) { throw 'Windows ARM64 reinstall provenance mismatch' }

Write-Host '[arm64-install] proving uninstaller fails closed for unknown directories'
$unknownRoot = Join-Path $env:LOCALAPPDATA 'Programs\Not Pica Library'
New-Item -ItemType Directory -Force -Path $unknownRoot | Out-Null
$unknownSentinel = Join-Path $unknownRoot 'keep.txt'
Set-Content -Encoding utf8 -LiteralPath $unknownSentinel -Value 'keep'
$failedClosed = $false
try {
    & (Join-Path $packageRoot 'uninstall-windows-arm64-user.ps1') -InstallRoot $unknownRoot
} catch {
    $failedClosed = $true
}
if (-not $failedClosed) { throw 'Windows ARM64 uninstaller accepted an unrecognized directory' }
if (-not (Test-Path -LiteralPath $unknownSentinel)) { throw 'Windows ARM64 fail-closed uninstall damaged an unknown directory' }

Write-Host '[arm64-install] uninstalling recognized preview'
$installedUninstaller = Join-Path $installRoot 'uninstall-windows-arm64-user.ps1'
& $installedUninstaller -InstallRoot $installRoot

if (Test-Path -LiteralPath $installRoot) { throw 'Windows ARM64 uninstaller left application files behind' }
if (Test-Path -LiteralPath $shortcutFile) { throw 'Windows ARM64 uninstaller left the Start Menu shortcut behind' }
if (-not (Test-Path -LiteralPath $dbFile)) { throw 'Windows ARM64 uninstaller removed the user database' }
if (-not (Test-Path -LiteralPath $sentinel)) { throw 'Windows ARM64 uninstaller removed preserved user data' }

Write-Host 'Windows ARM64 user install/uninstall acceptance: PASS'
Cleanup
