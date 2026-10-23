# Test-harness diagnostics only. Never copy a profile, database, instruction or credentials file.
function Assert-PicaUpgradeDiagnosticRoot([string]$WorkRoot) {
    $resolved = (Resolve-Path -LiteralPath $WorkRoot -ErrorAction Stop).Path
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/')
    if (-not $resolved.StartsWith($tempRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path -Leaf $resolved) -notmatch '^pica-universal-upgrade-[0-9a-f]{32}$' -or
        ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Upgrade diagnostics require the exact synthetic acceptance root'
    }
    return $resolved
}

function Protect-PicaUpgradeDiagnosticText([string]$Text) {
    # Drop the whole line rather than guessing how an accidental credential was formatted.
    return [regex]::Replace($Text, '(?im)^.*(?:authorization|credential|password|cookie|csrf|token|secret).*(?:\r?\n|$)', '[sensitive diagnostic line omitted]' + "`n")
}

function Read-PicaUpgradeDiagnosticFile([string]$WorkRoot, [string]$RelativePath, [int]$MaxBytes = 65536) {
    $root = Assert-PicaUpgradeDiagnosticRoot $WorkRoot
    if ($RelativePath -notin @('bootstrap/helper.stdout.log','bootstrap/helper.stderr.log')) { throw 'Diagnostic input is not allowlisted' }
    $file = Join-Path $root $RelativePath
    if (-not (Test-Path -LiteralPath $file)) { return [ordered]@{ available = $false; relativePath = $RelativePath } }
    $cursor = Get-Item -LiteralPath $file -Force
    while ($cursor -and $cursor.FullName -ne $root) {
        if ($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Diagnostic links are forbidden' }
        $cursor = if ($cursor -is [IO.DirectoryInfo]) { $cursor.Parent } else { $cursor.Directory }
        if ($cursor -and -not $cursor.FullName.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw 'Diagnostic file escaped its acceptance root' }
    }
    if ($MaxBytes -lt 1 -or $MaxBytes -gt 65536) { throw 'Diagnostic read exceeds bound' }
    $stream = [IO.File]::Open($file, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try {
        $length = $stream.Length
        $count = [int][Math]::Min($length, $MaxBytes)
        if ($length -gt $count) { $stream.Seek($length - $count, [IO.SeekOrigin]::Begin) | Out-Null }
        $bytes = New-Object byte[] $count
        $offset = 0
        while ($offset -lt $count) { $n = $stream.Read($bytes, $offset, $count - $offset); if ($n -le 0) { break }; $offset += $n }
        $text = [Text.Encoding]::UTF8.GetString($bytes, 0, $offset)
        return [ordered]@{ available = $true; relativePath = $RelativePath; sourceBytes = $length; readBytes = $offset; truncated = ($length -gt $offset); text = (Protect-PicaUpgradeDiagnosticText $text) }
    } finally { $stream.Dispose() }
}

function Write-PicaUpgradeDiagnostics {
    param(
        [Parameter(Mandatory=$true)][string]$WorkRoot,
        [Parameter(Mandatory=$true)][string]$Destination,
        [Parameter(Mandatory=$true)][string]$CandidateSourceSha,
        [Parameter(Mandatory=$true)][string]$ProgressFile,
        [string]$Scenario = 'normal',
        [string]$FailureMessage = '',
        [bool]$GatePassed = $false,
        [Nullable[int]]$HelperExitCode = $null
    )
    $root = Assert-PicaUpgradeDiagnosticRoot $WorkRoot
    if ($CandidateSourceSha -notmatch '^[0-9a-f]{40}$' -or $Scenario -notin @('normal','health-failure','launch-failure')) { throw 'Invalid diagnostic authority' }
    $relative = [IO.Path]::GetRelativePath($root, [IO.Path]::GetFullPath($ProgressFile))
    if ($relative.StartsWith('..') -or [IO.Path]::IsPathRooted($relative)) { throw 'Progress file is outside the synthetic root' }
    # Only the expected fixed isolated profile path is readable; never an arbitrary source file.
    if ($relative.Replace('\','/') -notmatch '^localappdata/Pica Library (?:P2 RC|Post Stable RC)/runtime-state/updates/acceptance-progress\.json$') { throw 'Unexpected progress file location' }
    $progress = $null
    $progressStatus = 'MISSING'
    if (Test-Path -LiteralPath $ProgressFile) {
        $cursor = Get-Item -LiteralPath $ProgressFile -Force
        while ($cursor -and $cursor.FullName -ne $root) {
            if ($cursor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Progress links are forbidden' }
            $cursor = if ($cursor -is [IO.DirectoryInfo]) { $cursor.Parent } else { $cursor.Directory }
        }
        if ((Get-Item -LiteralPath $ProgressFile).Length -le 65536) {
            try {
                $raw = Get-Content -Raw -LiteralPath $ProgressFile | ConvertFrom-Json
                $progress = [ordered]@{}
                foreach ($key in @('phase','current','total','targetVersion','message','updatedAt')) {
                    $value = $raw.$key
                    if ($null -ne $value -and ($value -is [string] -or $value -is [ValueType])) { $progress[$key] = if ($value -is [string]) { Protect-PicaUpgradeDiagnosticText $value } else { $value } }
                }
                $progressStatus = 'PARSED_ALLOWLISTED_FIELDS'
            } catch { $progressStatus = 'INVALID_JSON' }
        } else { $progressStatus = 'EXCEEDS_64K_BOUND' }
    }
    $target = Join-Path ([IO.Path]::GetFullPath($Destination)) ($Scenario + '-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    $report = [ordered]@{
        schemaVersion = 1; sourceSha = $CandidateSourceSha; scenario = $Scenario; observedAt = [DateTime]::UtcNow.ToString('o')
        syntheticOnly = $true; productionAccessed = $false; gatePassed = $GatePassed; helperExitCode = $HelperExitCode
        failureMessage = Protect-PicaUpgradeDiagnosticText $FailureMessage
        progressStatus = $progressStatus; progress = $progress
        helperStdout = Read-PicaUpgradeDiagnosticFile $root 'bootstrap/helper.stdout.log'
        helperStderr = Read-PicaUpgradeDiagnosticFile $root 'bootstrap/helper.stderr.log'
        exclusions = @('instructions','environment','instance token/CSRF','config','database','user-state-snapshot','comic bodies','signing inputs')
    }
    $file = Join-Path $target 'upgrade-diagnostics.json'
    $report | ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 -LiteralPath $file
    return $file
}
