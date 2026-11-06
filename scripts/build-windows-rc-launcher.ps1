param(
    [Parameter(Mandatory = $true)][string]$Output,
    [switch]$PostStable
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $csc)) {
    throw 'The Windows .NET Framework compiler is unavailable'
}
# Keep a real argument array even when there is only one conditional option.
# Assigning an if-expression with one string then splatting it expands chars.
$compilerArguments = @(
    '/nologo', '/target:winexe', '/optimize+', '/platform:x64',
    '/reference:System.Windows.Forms.dll',
    "/out:$([IO.Path]::GetFullPath($Output))",
    (Join-Path $root 'packaging\windows\RcLauncher.cs')
)
if ($PostStable) { $compilerArguments += '/define:POST_STABLE_RC' }
& $csc @compilerArguments
if ($LASTEXITCODE -ne 0) { throw 'RC launcher compilation failed' }
