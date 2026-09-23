param(
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'Programs\Pica Library ARM64 Preview')
)

$ErrorActionPreference = 'Stop'

$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
$dataRoot = if ($env:PICA_LIBRARY_DESKTOP_HOME) {
    [IO.Path]::GetFullPath($env:PICA_LIBRARY_DESKTOP_HOME)
} else {
    [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Pica Library'))
}
$markerFile = Join-Path $InstallRoot '.pica-library-arm64-preview-install.json'
$shortcutFile = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Pica Library ARM64 Preview.lnk'
$expectedLauncher = Join-Path $InstallRoot 'Pica Library.exe'

function Normalize-WithSeparator([string]$PathValue) {
    $full = [IO.Path]::GetFullPath($PathValue).TrimEnd('\')
    return "$full\"
}

$app = Normalize-WithSeparator $InstallRoot
$data = Normalize-WithSeparator $dataRoot
if ($app.StartsWith($data, [StringComparison]::OrdinalIgnoreCase) -or $data.StartsWith($app, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing uninstall because the application and user-data roots overlap'
}
if ($InstallRoot -eq [IO.Path]::GetPathRoot($InstallRoot)) {
    throw "Refusing unsafe application uninstall root: $InstallRoot"
}
if (-not (Test-Path -LiteralPath $markerFile)) {
    throw "Refusing to remove an unrecognized directory: $InstallRoot"
}

$marker = Get-Content -Raw -LiteralPath $markerFile | ConvertFrom-Json
if ($marker.schemaVersion -ne 1 -or $marker.channel -ne 'windows-arm64-preview' -or $marker.product -ne 'Pica Library') {
    throw "Refusing to remove an invalid Pica Library ARM64 preview install: $InstallRoot"
}

if (Test-Path -LiteralPath $shortcutFile) {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutFile)
    $target = [IO.Path]::GetFullPath([string]$shortcut.TargetPath)
    if ($target -eq [IO.Path]::GetFullPath($expectedLauncher)) {
        Remove-Item -Force -LiteralPath $shortcutFile
    } else {
        Write-Warning "Start Menu shortcut points elsewhere and was preserved: $shortcutFile"
    }
}

Remove-Item -Recurse -Force -LiteralPath $InstallRoot

Write-Host 'Pica Library Windows ARM64 preview application files were removed.'
Write-Host "User data was not removed: $dataRoot"
