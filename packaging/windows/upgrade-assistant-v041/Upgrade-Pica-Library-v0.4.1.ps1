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
}

function Select-OldInstallFolder {
    $dialog = New-Object Windows.Forms.FolderBrowserDialog
    $dialog.Description = "请选择旧版 Pica Library v0.4.0 程序文件夹。`r`n该文件夹中应包含 Pica Library.exe。"
    $dialog.ShowNewFolderButton = $false
    if ($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { return $null }
    return (Normalize-Path $dialog.SelectedPath)
}

function Read-InstalledVersion([string]$Root) {
    $readme = Join-Path $Root 'README-WINDOWS.txt'
    if (Test-Path -LiteralPath $readme) {
        $first = (Get-Content -LiteralPath $readme -TotalCount 1)
        if ($first -match 'Pica Library v(\d+\.\d+\.\d+)') { return $Matches[1] }
    }
    $instance = Read-InstanceInfo
    if ($instance -and $instance.url) {
        try {
            $status = Invoke-RestMethod -Uri ($instance.url.TrimEnd('/') + '/api/v1/status') -TimeoutSec 4
            if ($status.version) { return [string]$status.version }
        } catch {}
    }
    return $null
}

function Validate-OldInstall([string]$Root) {
    foreach ($relative in @('Pica Library.exe', 'runtime\node.exe', 'app\desktop.js', 'SOURCE_SHA.txt')) {
        if (-not (Test-Path -LiteralPath (Join-Path $Root $relative))) {
            throw "选择的文件夹不是完整的 Pica Library 程序目录：缺少 $relative"
        }
    }

    $driveRoot = [IO.Path]::GetPathRoot($Root)
    if ((Normalize-Path $Root) -eq (Normalize-Path $driveRoot)) {
        throw '拒绝把磁盘根目录作为程序目录。'
    }
    if (Test-SameOrUnder $DataRoot $Root) {
        throw "用户数据目录位于所选程序目录之下，自动替换已停止。`r`n受保护目录：$DataRoot"
    }
    if (Test-SameOrUnder $PSScriptRoot $Root) {
        throw '升级助手当前位于旧程序目录中。请把升级助手 ZIP 解压到“下载”或桌面等其他位置后再运行。'
    }

    $version = Read-InstalledVersion $Root
    if ($version -ne $RequiredSourceVersion) {
        $displayVersion = if ($version) { $version } else { '无法确认版本' }
        throw "此助手只接受已验证的 v$RequiredSourceVersion → v$TargetVersion 路径。当前检测到：$displayVersion"
    }
}

function Read-LibraryDirectory {
    $config = Join-Path $DataRoot 'config\config.json'
    if (Test-Path -LiteralPath $config) {
        try {
            $value = Get-Content -Raw -LiteralPath $config | ConvertFrom-Json
            if ($value.libraryDirectory) {
                return Normalize-Path ([string]$value.libraryDirectory)
            }
        } catch {
            throw "无法读取本地配置：$config"
        }
    }
    return Normalize-Path (Join-Path $DataRoot 'data')
}

function Assert-UserDataOutsideInstall([string]$Root, [string]$LibraryRoot) {
    if (Test-SameOrUnder $LibraryRoot $Root) {
        throw @"
检测到漫画库/下载目录位于旧程序目录内部：
$LibraryRoot

为了避免替换程序时移动或隐藏你的漫画文件，升级助手已停止。
请先在旧版中把漫画保存目录迁移到程序目录之外，再重新运行升级助手。
"@
    }
}

function Download-And-VerifyTarget {
    New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
    $zip = Join-Path $TempRoot $TargetZipName
    Write-UpgradeLog "Downloading official $TargetZipName"
    Invoke-WebRequest -UseBasicParsing -Uri $TargetZipUrl -OutFile $zip
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()
    Write-UpgradeLog "Downloaded SHA-256: $hash"
    if ($hash -ne $ExpectedZipSha256) {
        throw "官方 Windows 包 SHA-256 不匹配。期望 $ExpectedZipSha256，实际 $hash。"
    }

    $extract = Join-Path $TempRoot 'target'
    Expand-Archive -LiteralPath $zip -DestinationPath $extract
    foreach ($relative in @('Pica Library.exe', 'runtime\node.exe', 'app\desktop.js', 'SOURCE_SHA.txt')) {
        if (-not (Test-Path -LiteralPath (Join-Path $extract $relative))) {
            throw "下载的目标包不完整：缺少 $relative"
        }
    }
    $sourceSha = (Get-Content -Raw -LiteralPath (Join-Path $extract 'SOURCE_SHA.txt')).Trim()
    if ($sourceSha -ne $ExpectedTargetSourceSha) {
        throw "目标包来源 SHA 不匹配：$sourceSha"
    }
    return $extract
}

function Request-GracefulShutdown {
    $instance = Read-InstanceInfo
    if (-not $instance) { return }
    if ($instance.url) {
        try {
            $base = ([string]$instance.url).TrimEnd('/')
            $desktop = Invoke-RestMethod -Uri ($base + '/api/v1/desktop/status') -TimeoutSec 4
            if ($desktop.csrfToken) {
                Invoke-RestMethod -Method Post -Uri ($base + '/api/v1/desktop/shutdown') `
                    -Headers @{ 'x-pica-csrf' = [string]$desktop.csrfToken } `
                    -ContentType 'application/json' -Body '{}' -TimeoutSec 5 | Out-Null
                Write-UpgradeLog 'Requested graceful shutdown through the local Desktop API.'
            }
        } catch {
            Write-UpgradeLog "Graceful shutdown request did not complete: $($_.Exception.Message)"
        }
    }

    if ($instance.pid) {
        $deadline = (Get-Date).AddSeconds(20)
        do {
            Start-Sleep -Milliseconds 300
            $alive = Get-Process -Id ([int]$instance.pid) -ErrorAction SilentlyContinue
        } while ($alive -and (Get-Date) -lt $deadline)
    }
}

function Get-InstallRuntimeProcesses([string]$Root) {
    $runtime = Normalize-Path (Join-Path $Root 'runtime\node.exe')
    return @(
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object {
                $_.ExecutablePath -and
                (Normalize-Path ([string]$_.ExecutablePath)).Equals($runtime, [StringComparison]::OrdinalIgnoreCase)
            }
    )
}

function Ensure-OldAppStopped([string]$Root) {
    Request-GracefulShutdown
    $running = @(Get-InstallRuntimeProcesses $Root)
    if ($running.Count -gt 0) {
        if (-not (Confirm-Action "旧版 Pica Library 仍在运行。`r`n`r`n是否强制结束旧版后台进程后继续？")) {
            throw '用户取消：旧版仍在运行。'
        }
        foreach ($process in $running) {
            Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction Stop
        }
        Start-Sleep -Milliseconds 600
    }
    if (@(Get-InstallRuntimeProcesses $Root).Count -gt 0) {
        throw '无法停止旧版后台进程。'
    }
}

function Save-SafetySnapshot([string]$LibraryRoot) {
    New-Item -ItemType Directory -Force -Path $SnapshotRoot | Out-Null
    $configBackup = Join-Path $SnapshotRoot 'config'
    New-Item -ItemType Directory -Force -Path $configBackup | Out-Null

    foreach ($relative in @('config\config.json', 'config\credentials.dat', 'config\remote-storage.json')) {
        $source = Join-Path $DataRoot $relative
        if (Test-Path -LiteralPath $source) {
            Copy-Item -LiteralPath $source -Destination (Join-Path $configBackup ([IO.Path]::GetFileName($source))) -Force
        }
    }

    $dbBackup = Join-Path $SnapshotRoot 'database'
    New-Item -ItemType Directory -Force -Path $dbBackup | Out-Null
    foreach ($name in @('library.db', 'library.db-wal', 'library.db-shm')) {
        $source = Join-Path $LibraryRoot $name
        if (Test-Path -LiteralPath $source) {
            Copy-Item -LiteralPath $source -Destination (Join-Path $dbBackup $name) -Force
        }
    }

    [ordered]@{
        createdAt = (Get-Date).ToString('o')
        sourceVersion = $RequiredSourceVersion
        targetVersion = $TargetVersion
        oldInstall = $ResolvedOldRoot
        protectedDataRoot = $DataRoot
        libraryDirectory = $LibraryRoot
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $SnapshotRoot 'snapshot.json') -Encoding UTF8
    Write-UpgradeLog "Safety snapshot created: $SnapshotRoot"
}

function Restore-SafetySnapshot([string]$LibraryRoot) {
    $configBackup = Join-Path $SnapshotRoot 'config'
    if (Test-Path -LiteralPath $configBackup) {
        foreach ($item in @(Get-ChildItem -LiteralPath $configBackup -File -ErrorAction SilentlyContinue)) {
            $target = Join-Path (Join-Path $DataRoot 'config') $item.Name
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
            Copy-Item -LiteralPath $item.FullName -Destination $target -Force
        }
    }

    $dbBackup = Join-Path $SnapshotRoot 'database'
    if (Test-Path -LiteralPath $dbBackup) {
        foreach ($name in @('library.db', 'library.db-wal', 'library.db-shm')) {
            $target = Join-Path $LibraryRoot $name
            Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
            $source = Join-Path $dbBackup $name
            if (Test-Path -LiteralPath $source) {
                New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
                Copy-Item -LiteralPath $source -Destination $target -Force
            }
        }
    }
    Write-UpgradeLog 'Safety snapshot restored.'
}

function Replace-ApplicationTree([string]$Root, [string]$TargetRoot) {
    $parent = Split-Path -Parent $Root
    $leaf = Split-Path -Leaf $Root
    $script:BackupRoot = Join-Path $parent ($leaf + ".backup-before-v$TargetVersion-$Stamp")
    if (Test-Path -LiteralPath $BackupRoot) {
        throw "程序备份目录已存在：$BackupRoot"
    }

    Write-UpgradeLog "Renaming old application tree to $BackupRoot"
    Rename-Item -LiteralPath $Root -NewName (Split-Path -Leaf $BackupRoot)
    $script:ReplacementStarted = $true

    New-Item -ItemType Directory -Force -Path $Root | Out-Null
    foreach ($item in @(Get-ChildItem -LiteralPath $TargetRoot -Force)) {
        Copy-Item -LiteralPath $item.FullName -Destination $Root -Recurse -Force
    }
    foreach ($relative in @('Pica Library.exe', 'runtime\node.exe', 'app\desktop.js', 'SOURCE_SHA.txt')) {
        if (-not (Test-Path -LiteralPath (Join-Path $Root $relative))) {
            throw "替换后的程序目录缺少 $relative"
        }
    }
    Write-UpgradeLog 'New application tree copied successfully.'
}

function Wait-NewHealth {
    $launcher = Join-Path $ResolvedOldRoot 'Pica Library.exe'
    Start-Process -FilePath $launcher | Out-Null
    Write-UpgradeLog 'Started v0.4.1 for health verification.'

    $deadline = (Get-Date).AddSeconds(45)
    $instance = $null
    do {
        Start-Sleep -Milliseconds 350
        $instance = Read-InstanceInfo
    } while (-not $instance -and (Get-Date) -lt $deadline)
    if (-not $instance -or -not $instance.url) {
        throw 'v0.4.1 启动后未发布本地实例信息。'
    }

    $base = ([string]$instance.url).TrimEnd('/')
    $status = Invoke-RestMethod -Uri ($base + '/api/v1/status') -TimeoutSec 5
    $caps = Invoke-RestMethod -Uri ($base + '/api/v1/capabilities') -TimeoutSec 5
    if ([string]$status.version -ne $TargetVersion) {
        throw "新版本健康检查返回错误版本：$($status.version)"
    }
    if ([string]$caps.appVersion -ne $TargetVersion) {
        throw "新版本能力接口返回错误版本：$($caps.appVersion)"
    }
    if ([int]$caps.databaseSchemaVersion -ne $ExpectedDatabaseSchema) {
        throw "数据库架构异常：$($caps.databaseSchemaVersion)"
    }
    Write-UpgradeLog "Health verification passed: v$TargetVersion / schema $ExpectedDatabaseSchema."
}

function Rollback-Upgrade {
    Write-UpgradeLog 'Starting rollback.'
    try { Request-GracefulShutdown } catch {}
    try {
        foreach ($process in @(Get-InstallRuntimeProcesses $ResolvedOldRoot)) {
            Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 500
    } catch {}
    if ($ReplacementStarted) {
        if (Test-Path -LiteralPath $ResolvedOldRoot) {
            Remove-Item -LiteralPath $ResolvedOldRoot -Recurse -Force
        }
        if ($BackupRoot -and (Test-Path -LiteralPath $BackupRoot)) {
            Rename-Item -LiteralPath $BackupRoot -NewName (Split-Path -Leaf $ResolvedOldRoot)
        }
    }
    if ($LibraryDirectory) {
        Restore-SafetySnapshot $LibraryDirectory
    }
    $oldLauncher = Join-Path $ResolvedOldRoot 'Pica Library.exe'
    if (Test-Path -LiteralPath $oldLauncher) {
        Start-Process -FilePath $oldLauncher | Out-Null
    }
    Write-UpgradeLog 'Rollback completed.'
}

try {
    Write-UpgradeLog "Pica Library upgrade assistant started. Target v$TargetVersion."

    if ($OldInstallPath) {
        $ResolvedOldRoot = Normalize-Path $OldInstallPath
    } else {
        $ResolvedOldRoot = Resolve-RunningInstallRoot
        if (-not $ResolvedOldRoot) {
            $ResolvedOldRoot = Select-OldInstallFolder
        }
    }
    if (-not $ResolvedOldRoot) {
        throw '未选择旧版程序目录。'
    }

    Validate-OldInstall $ResolvedOldRoot
    $LibraryDirectory = Read-LibraryDirectory
    Assert-UserDataOutsideInstall $ResolvedOldRoot $LibraryDirectory

    if (-not (Confirm-Action @"
准备执行已验证的升级：

旧版：v$RequiredSourceVersion
新版：v$TargetVersion
旧程序目录：
$ResolvedOldRoot

用户数据目录不会被当作程序文件替换：
$DataRoot

漫画库目录：
$LibraryDirectory

继续后，助手会下载官方完整包、校验 SHA-256、关闭旧版、建立安全快照并替换程序文件。
是否继续？
"@)) {
        throw '用户取消升级。'
    }

    $target = Download-And-VerifyTarget
    Ensure-OldAppStopped $ResolvedOldRoot
    Save-SafetySnapshot $LibraryDirectory
    Replace-ApplicationTree $ResolvedOldRoot $target
    Wait-NewHealth

    Show-Info @"
升级完成：Pica Library v$TargetVersion 已通过启动和数据库健康检查。

用户数据目录未作为程序文件替换：
$DataRoot

旧程序备份：
$BackupRoot

升级前安全快照：
$SnapshotRoot

建议正常使用一段时间确认无误后，再手动删除旧程序备份。
日志：
$LogFile
"@
    Write-UpgradeLog 'Upgrade completed successfully.'
    exit 0
} catch {
    $message = $_.Exception.Message
    Write-UpgradeLog "ERROR: $message"
    if ($ReplacementStarted) {
        try {
            Rollback-Upgrade
            Show-ErrorBox "升级未完成，已自动恢复旧版程序和升级前数据快照。`r`n`r`n原因：$message`r`n`r`n日志：$LogFile"
        } catch {
            $rollbackMessage = $_.Exception.Message
            Write-UpgradeLog "ROLLBACK ERROR: $rollbackMessage"
            Show-ErrorBox "升级失败，并且自动回滚未能完全完成。`r`n`r`n升级错误：$message`r`n回滚错误：$rollbackMessage`r`n`r`n请不要删除任何备份目录，并保留日志：$LogFile"
        }
    } else {
        Show-ErrorBox "没有修改旧程序。`r`n`r`n原因：$message`r`n`r`n日志：$LogFile"
    }
    exit 1
} finally {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
