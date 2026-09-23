param(
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'Programs\Pica Library ARM64 Preview')
)

$ErrorActionPreference = 'Stop'

$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataRoot = if ($env:PICA_LIBRARY_DESKTOP_HOME) {
    [IO.Path]::GetFullPath($env:PICA_LIBRARY_DESKTOP_HOME)
} else {
    [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Pica Library'))
}
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
$markerName = '.pica-library-arm64-preview-install.json'
$markerFile = Join-Path $InstallRoot $markerName
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$shortcutFile = Join-Path $startMenu 'Pica Library ARM64 Preview.lnk'
$parent = Split-Path -Parent $InstallRoot
$nonce = "$PID-$([guid]::NewGuid().ToString('N'))"
$staging = Join-Path $parent ".pica-library-arm64-preview-stage-$nonce"
$backup = Join-Path $parent ".pica-library-arm64-preview-backup-$nonce"
$shortcutBackup = "$shortcutFile.backup-$nonce"
$appSwapped = $false
$shortcutSwapped = $false

function Normalize-WithSeparator([string]$PathValue) {
    $full = [IO.Path]::GetFullPath($PathValue).TrimEnd('\')
    return "$full\"
}

function Assert-EngineStopped {
    $instanceFile = Join-Path $dataRoot 'runtime-state\instance.json'
    if (-not (Test-Path -LiteralPath $instanceFile)) { return }
    try {
        $instance = Get-Content -Raw -LiteralPath $instanceFile | ConvertFrom-Json
        $pidValue = [int]$instance.pid
        if ($pidValue -gt 0 -and (Get-Process -Id $pidValue -ErrorAction SilentlyContinue)) {
            throw 'Close Pica Library before installing or updating the Windows ARM64 preview'
        }
    } catch {
        if ($_.Exception.Message -like 'Close Pica Library*') { throw }
        # Stale or malformed instance metadata must not block a repair install.
    }
}

function Assert-SeparateRoots {
    $app = Normalize-WithSeparator $InstallRoot
    $data = Normalize-WithSeparator $dataRoot
    if ($app.StartsWith($data, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing install: application root is inside the Pica Library user-data root'
    }
    if ($data.StartsWith($app, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing install: Pica Library user-data root is inside the application root'
    }
    if ($InstallRoot -eq [IO.Path]::GetPathRoot($InstallRoot)) {
        throw "Refusing unsafe application install root: $InstallRoot"
    }
}

function Assert-RecognizedExistingInstall {
    if (-not (Test-Path -LiteralPath $InstallRoot)) { return }
    if (-not (Test-Path -LiteralPath $markerFile)) {
        throw "Refusing to replace an unrecognized directory: $InstallRoot"
    }
    $marker = Get-Content -Raw -LiteralPath $markerFile | ConvertFrom-Json
    if ($marker.schemaVersion -ne 1 -or $marker.channel -ne 'windows-arm64-preview' -or $marker.product -ne 'Pica Library') {
        throw "Refusing to replace an invalid Pica Library ARM64 preview install: $InstallRoot"
    }
}

function Restore-OnFailure {
    $status = $LASTEXITCODE
    try {
        if ($shortcutSwapped) {
            Remove-Item -Force -LiteralPath $shortcutFile -ErrorAction SilentlyContinue
            if (Test-Path -LiteralPath $shortcutBackup) {
                Move-Item -Force -LiteralPath $shortcutBackup -Destination $shortcutFile
            }
        }
        if ($appSwapped) {
            Remove-Item -Recurse -Force -LiteralPath $InstallRoot -ErrorAction SilentlyContinue
            if (Test-Path -LiteralPath $backup) {
                Move-Item -Force -LiteralPath $backup -Destination $InstallRoot
            }
        }
    } finally {
        Remove-Item -Recurse -Force -LiteralPath $staging -ErrorAction SilentlyContinue
        Remove-Item -Force -LiteralPath $shortcutBackup -ErrorAction SilentlyContinue
    }
}

trap {
    $message = ($_ | Out-String)
    Restore-OnFailure
    Write-Error $message
    exit 1
}

Assert-SeparateRoots
Assert-EngineStopped
Assert-RecognizedExistingInstall

foreach ($required in @(
    'Pica Library.exe',
    'runtime\node.exe',
    'app\desktop.js',
    'app\pica-library.js',
    'web\index.html',
    'SOURCE_SHA.txt',
    'PLATFORM_REQUIREMENTS.json',
    'uninstall-windows-arm64-user.ps1'
)) {
    $file = Join-Path $sourceRoot $required
    if (-not (Test-Path -LiteralPath $file) -or (Get-Item -LiteralPath $file).Length -eq 0) {
        throw "Install source is missing: $required"
    }
}

$requirements = Get-Content -Raw -LiteralPath (Join-Path $sourceRoot 'PLATFORM_REQUIREMENTS.json') | ConvertFrom-Json
if ($requirements.platform -ne 'windows' -or $requirements.arch -ne 'arm64' -or $requirements.formalRelease -ne $false) {
    throw 'Install source is not a Windows ARM64 experimental package'
}

$sourceSha = (Get-Content -Raw -LiteralPath (Join-Path $sourceRoot 'SOURCE_SHA.txt')).Trim()
if ($sourceSha -notmatch '^[0-9a-f]{40}$') { throw 'Install source provenance is invalid' }

New-Item -ItemType Directory -Force -Path $parent,$startMenu | Out-Null
if (Test-Path -LiteralPath $staging) { Remove-Item -Recurse -Force -LiteralPath $staging }
New-Item -ItemType Directory -Force -Path $staging | Out-Null

Get-ChildItem -LiteralPath $sourceRoot -Force | Copy-Item -Destination $staging -Recurse -Force

[ordered]@{
    schemaVersion = 1
    product = 'Pica Library'
    channel = 'windows-arm64-preview'
    sourceSha = $sourceSha
    dataRoot = $dataRoot
    installedAt = [DateTimeOffset]::UtcNow.ToString('o')
} | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $staging $markerName)

if (Test-Path -LiteralPath $InstallRoot) {
    Move-Item -LiteralPath $InstallRoot -Destination $backup
}
Move-Item -LiteralPath $staging -Destination $InstallRoot
$appSwapped = $true

$target = Join-Path $InstallRoot 'Pica Library.exe'
if (-not (Test-Path -LiteralPath $target)) { throw 'Installed launcher is missing after application-tree swap' }

if (Test-Path -LiteralPath $shortcutFile) {
    Copy-Item -LiteralPath $shortcutFile -Destination $shortcutBackup -Force
}
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutFile)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $InstallRoot
$shortcut.IconLocation = "$target,0"
$shortcut.Description = 'Pica Library ARM64 Preview'
$shortcut.Save()
$shortcutSwapped = $true

$check = $shell.CreateShortcut($shortcutFile)
if ([IO.Path]::GetFullPath([string]$check.TargetPath) -ne [IO.Path]::GetFullPath($target)) {
    throw 'Start Menu shortcut target validation failed'
}
if ([IO.Path]::GetFullPath([string]$check.WorkingDirectory) -ne $InstallRoot) {
    throw 'Start Menu shortcut working-directory validation failed'
}

Remove-Item -Recurse -Force -LiteralPath $backup -ErrorAction SilentlyContinue
Remove-Item -Force -LiteralPath $shortcutBackup -ErrorAction SilentlyContinue
$appSwapped = $false
$shortcutSwapped = $false
Write-Host 'Pica Library Windows ARM64 preview installed.'
Write-Host "Application: $InstallRoot"
Write-Host "Start Menu shortcut: $shortcutFile"
Write-Host "User data remains separate at: $dataRoot"
