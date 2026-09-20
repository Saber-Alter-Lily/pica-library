param(
    [string]$OldInstallPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$TargetVersion = '0.4.1'
$RequiredSourceVersion = '0.4.0'
$TargetZipName = 'Pica-Library-v0.4.1-windows-x64.zip'
$TargetZipUrl = 'https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.4.1/Pica-Library-v0.4.1-windows-x64.zip'
$ExpectedZipSha256 = '88d87a8f0e5a8413656751ff344052eccbfa796e663e4acc8c7fe4a0e0866b3d'
$ExpectedTargetSourceSha = '974d4e9b22379aeed379b71711008332acc213a4'
$ExpectedDatabaseSchema = 13

Add-Type -AssemblyName System.Windows.Forms
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$LocalAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
if ([string]::IsNullOrWhiteSpace($LocalAppData)) {
    throw 'Windows LocalAppData could not be resolved.'
}
$DataRoot = [IO.Path]::GetFullPath((Join-Path $LocalAppData 'Pica Library'))
$SafetyRoot = Join-Path $LocalAppData 'Pica Library Upgrade Backups'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
New-Item -ItemType Directory -Force -Path $SafetyRoot | Out-Null
$LogFile = Join-Path $SafetyRoot "v040-to-v041-$Stamp.log"
$TempRoot = Join-Path ([IO.Path]::GetTempPath()) ("PicaLibrary-v041-" + [Guid]::NewGuid().ToString('N'))
$BackupRoot = $null
$SnapshotRoot = Join-Path $SafetyRoot "v040-to-v041-$Stamp"
$ReplacementStarted = $false
$ResolvedOldRoot = $null
$LibraryDirectory = $null

function Write-UpgradeLog([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message"
    Write-Host $line
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Show-Info([string]$Message, [string]$Title = 'Pica Library 升级助手') {
    [void][Windows.Forms.MessageBox]::Show(
        $Message,
        $Title,
        [Windows.Forms.MessageBoxButtons]::OK,
        [Windows.Forms.MessageBoxIcon]::Information
    )
}

function Show-ErrorBox([string]$Message) {
    [void][Windows.Forms.MessageBox]::Show(
        $Message,
        'Pica Library 升级助手',
        [Windows.Forms.MessageBoxButtons]::OK,
        [Windows.Forms.MessageBoxIcon]::Error
    )
}

function Confirm-Action([string]$Message) {
    return [Windows.Forms.MessageBox]::Show(
        $Message,
        'Pica Library 升级助手',
        [Windows.Forms.MessageBoxButtons]::YesNo,
        [Windows.Forms.MessageBoxIcon]::Question
    ) -eq [Windows.Forms.DialogResult]::Yes
}

function Normalize-Path([string]$Value) {
    return [IO.Path]::GetFullPath($Value).TrimEnd('\')
}

function Test-SameOrUnder([string]$Child, [string]$Parent) {
    $childPath = Normalize-Path $Child
    $parentPath = Normalize-Path $Parent
    return $childPath.Equals($parentPath, [StringComparison]::OrdinalIgnoreCase) -or
        $childPath.StartsWith($parentPath + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Read-InstanceInfo {
    $file = Join-Path $DataRoot 'runtime-state\instance.json'
    if (-not (Test-Path -LiteralPath $file)) { return $null }
    try {
        return Get-Content -Raw -LiteralPath $file | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Resolve-RunningInstallRoot {
    $instance = Read-InstanceInfo
    if ($instance -and $instance.pid) {
        try {
            $process = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$instance.pid)" -ErrorAction Stop
            if ($process.ExecutablePath) {
                $candidate = Split-Path -Parent (Split-Path -Parent ([string]$process.ExecutablePath))
                if (Test-Path -LiteralPath (Join-Path $candidate 'Pica Library.exe')) {
                    return (Normalize-Path $candidate)
                }
            }
        } catch {}
    }

    try {
        $candidates = @(
            Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
                Where-Object {
                    $_.ExecutablePath -and
                    $_.CommandLine -and
                    $_.CommandLine -match '[\\/]app[\\/]desktop\.js'
                } |
                ForEach-Object {
                    $candidate = Split-Path -Parent (Split-Path -Parent ([string]$_.ExecutablePath))
                    if (Test-Path -LiteralPath (Join-Path $candidate 'Pica Library.exe')) {
                        Normalize-Path $candidate
                    }
                } |
                Select-Object -Unique
        )
        if ($candidates.Count -eq 1) { return $candidates[0] }
    } catch {}

    return $null