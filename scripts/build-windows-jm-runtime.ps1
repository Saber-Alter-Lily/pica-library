param(
    [Parameter(Mandatory = $true)][string]$JdkDirectory,
    [Parameter(Mandatory = $true)][string]$GradleExecutable,
    [string]$BuildOutputRoot
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$runtimeParent = Join-Path $root 'runtime'
$target = [IO.Path]::GetFullPath((Join-Path $runtimeParent 'jm'))
$work = [IO.Path]::GetFullPath((Join-Path $runtimeParent ('.jm-build-' + [guid]::NewGuid().ToString('N'))))
$allowedPrefix = [IO.Path]::GetFullPath($runtimeParent).TrimEnd('\') + '\'
if (-not $target.StartsWith($allowedPrefix,[StringComparison]::OrdinalIgnoreCase) -or -not $work.StartsWith($allowedPrefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'JM runtime path escaped the checkout runtime directory' }
$java = Join-Path $JdkDirectory 'bin\java.exe'
$jlink = Join-Path $JdkDirectory 'bin\jlink.exe'
if (-not (Test-Path -LiteralPath $java) -or -not (Test-Path -LiteralPath $jlink)) { throw 'A complete Windows JDK is required' }
$env:JAVA_HOME = $JdkDirectory
$gradleArgs = @('-p', (Join-Path $root 'source-jvm'))
$buildDirectory = Join-Path $root 'source-jvm\build'
if ($BuildOutputRoot) {
    $buildDirectory = Join-Path ([IO.Path]::GetFullPath($BuildOutputRoot)) 'pica-jm-source'
    $gradleArgs += @('-I', (Join-Path $root 'scripts\acceptance\ascii-build.init.gradle'), "-PpicaAcceptanceBuildRoot=$BuildOutputRoot")
}
& $GradleExecutable @gradleArgs test bundle dependencyNotices --no-daemon --console=plain
if ($LASTEXITCODE -ne 0) { throw 'JM SDK adapter tests/build failed' }
New-Item -ItemType Directory -Force -Path $runtimeParent | Out-Null
& $jlink --add-modules java.base,java.desktop,java.logging,java.naming,java.management,jdk.charsets,jdk.crypto.ec,jdk.unsupported --strip-debug --no-header-files --no-man-pages --compress=2 --output $work
if ($LASTEXITCODE -ne 0) { throw 'JM JRE assembly failed' }
New-Item -ItemType Directory -Force -Path (Join-Path $work 'lib') | Out-Null
$jar = Join-Path $buildDirectory 'libs\pica-jm-source.jar'
Copy-Item -LiteralPath $jar -Destination (Join-Path $work 'lib\pica-jm-source.jar')
Copy-Item -LiteralPath (Join-Path $buildDirectory 'dependency-notices') -Destination (Join-Path $work 'licenses') -Recurse
$probe = '{"id":"build-probe","op":"status"}' | & (Join-Path $work 'bin\java.exe') -Xmx128m '-Dfile.encoding=UTF-8' -jar (Join-Path $work 'lib\pica-jm-source.jar')
if ($LASTEXITCODE -ne 0) { throw 'JM packaged runtime probe failed' }
$status = $probe | ConvertFrom-Json
if ($status.id -ne 'build-probe' -or -not $status.ok -or $status.value.configured -or $status.value.sdkVersion -ne 'v1.1.12') { throw 'JM runtime status contract is invalid' }
$manifest = @{ sdkVersion='v1.1.12'; jarSha256=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $work 'lib\pica-jm-source.jar')).Hash.ToLowerInvariant(); userDataIncluded=$false; statusProbe='PASS' }
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $work 'PICA_JM_RUNTIME.json') -Encoding utf8
if (Test-Path -LiteralPath $target) {
    if (-not (Test-Path -LiteralPath (Join-Path $target 'PICA_JM_RUNTIME.json')) -or (Get-Item -LiteralPath $target).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { throw 'Existing runtime is not an owned generated JM runtime; it was preserved' }
    Remove-Item -LiteralPath $target -Recurse -Force
}
Move-Item -LiteralPath $work -Destination $target
Write-Output "JM runtime ready: $target"
