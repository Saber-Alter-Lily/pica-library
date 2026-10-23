param([string]$EvidenceFile = '')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\windows-upgrade-diagnostics.ps1')
$work = Join-Path ([IO.Path]::GetTempPath()) ('pica-universal-upgrade-' + [guid]::NewGuid().ToString('N'))
$reports = Join-Path ([IO.Path]::GetTempPath()) ('pica-upgrade-reports-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $work 'bootstrap'),$reports -Force | Out-Null
try {
    $progress = Join-Path $work 'localappdata\Pica Library Post Stable RC\runtime-state\updates\acceptance-progress.json'
    New-Item -ItemType Directory -Path (Split-Path -Parent $progress) -Force | Out-Null
    $canary = 'synthetic-never-real-private-canary'
    [IO.File]::WriteAllText((Join-Path $work 'bootstrap\helper.stdout.log'), ('x' * 100000) + "`nstdout tail")
    [IO.File]::WriteAllText((Join-Path $work 'bootstrap\helper.stderr.log'), "launch error EACCES`nAuthorization: $canary`nCookie: $canary`nlast error frame")
    [ordered]@{phase='failed';targetVersion='synthetic';message='synthetic launch error';csrfToken=$canary;config=@{password=$canary}} | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 -LiteralPath $progress
    $file = Write-PicaUpgradeDiagnostics -WorkRoot $work -Destination $reports -CandidateSourceSha ('a' * 40) -ProgressFile $progress -Scenario launch-failure -FailureMessage 'synthetic gate failed' -HelperExitCode 1
    $raw = Get-Content -Raw -LiteralPath $file
    $report = $raw | ConvertFrom-Json
    if ($report.progress.phase -ne 'failed' -or $report.helperExitCode -ne 1 -or $report.progressStatus -ne 'PARSED_ALLOWLISTED_FIELDS') { throw 'Progress/exit evidence missing' }
    if ($report.helperStdout.readBytes -ne 65536 -or -not $report.helperStdout.truncated -or -not $report.helperStdout.text.EndsWith('stdout tail')) { throw 'Bounded tail evidence invalid' }
    if (-not $report.helperStderr.text.Contains('launch error EACCES') -or -not $report.helperStderr.text.Contains('last error frame') -or $raw.Contains($canary)) { throw 'Redaction or stderr evidence invalid' }
    if ($null -ne $report.progress.csrfToken -or $null -ne $report.progress.config) { throw 'Nonallowlisted progress fields escaped' }
    $rejected = 0
    try { Read-PicaUpgradeDiagnosticFile $work '../config/password.json'; throw 'Accepted forbidden path' } catch { if ($_.Exception.Message -eq 'Accepted forbidden path') { throw }; $rejected++ }
    try { Read-PicaUpgradeDiagnosticFile $work 'bootstrap/helper.stdout.log' 65537; throw 'Accepted unbounded read' } catch { if ($_.Exception.Message -eq 'Accepted unbounded read') { throw }; $rejected++ }
    try { Write-PicaUpgradeDiagnostics -WorkRoot $work -Destination $reports -CandidateSourceSha ('a'*40) -ProgressFile (Join-Path $work 'library.db'); throw 'Accepted arbitrary progress input' } catch { if ($_.Exception.Message -eq 'Accepted arbitrary progress input') { throw }; $rejected++ }
    $result = [ordered]@{pass=$true;syntheticOnly=$true;boundedTail=$true;helperErrorPreserved=$true;progressAllowlist=$true;sensitiveCanaryExcluded=$true;invalidInputsRejected=$rejected;productionAccessed=$false}
    if ($EvidenceFile) { $result | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath $EvidenceFile }
    $result | ConvertTo-Json
} finally {
    foreach ($target in @($work,$reports)) {
        $resolved=(Resolve-Path -LiteralPath $target).Path
        $tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/')
        if (-not $resolved.StartsWith($tempRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolved) -notmatch '^pica-(?:universal-upgrade|upgrade-reports)-[0-9a-f]{32}$' -or ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Refuse broad diagnostic test cleanup' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
