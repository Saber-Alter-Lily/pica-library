function Resolve-PicaSourceRuntimeMode {
    param([string]$Requested = '', [string]$RequireJm = '')
    if ($Requested -notin @('', 'core', 'jm')) { throw 'SourceRuntimes must be core or jm' }
    if ($RequireJm -notin @('', '0', '1')) { throw 'PICA_REQUIRE_JM_RUNTIME must be 0 or 1' }
    if ($Requested -eq 'core' -and $RequireJm -eq '1') { throw 'Core composition conflicts with required JM runtime' }
    if ($Requested) { return $Requested }
    if ($RequireJm -eq '1') { return 'jm' }
    return 'core'
}

function Get-PicaWindowsPackageStem {
    param([Parameter(Mandatory = $true)][string]$Version, [ValidateSet('core','jm')][string]$SourceRuntimes = 'core')
    if ($Version -match '^\d+\.\d+\.\d+$') { $stem = "Pica-Library-v$Version" }
    elseif ($Version -eq '0.2.0-dev.0') { $stem = 'Pica-Library-v0.2.0-dev.0-update-base' }
    elseif ($Version -in @('0.2.0-dev.1','0.2.0-dev.2')) { $stem = "Pica-Library-v$Version-local-test" }
    else { throw "Unsupported Windows package version: $Version" }
    if ($SourceRuntimes -eq 'jm') { $stem += '-with-jm' }
    return "$stem-windows-x64"
}
