param(
    [Parameter(Mandatory = $true)][string]$Zip,
    [switch]$PortCollision,
    [switch]$SetupPersistence
)
$ErrorActionPreference = 'Stop'

$work = Join-Path ([IO.Path]::GetTempPath()) ("pica-artifact-smoke-" + [guid]::NewGuid().ToString('N'))
$extract = Join-Path $work 'extract'
$local = Join-Path $work 'localappdata'
$listener = $null
New-Item -ItemType Directory -Force -Path $extract,$local | Out-Null
Copy-Item -LiteralPath $Zip -Destination (Join-Path $work 'candidate.zip')
Expand-Archive -LiteralPath (Join-Path $work 'candidate.zip') -DestinationPath $extract
$rootPath = $extract
if (-not (Test-Path -LiteralPath (Join-Path $rootPath 'Pica Library.exe'))) {
    $directories = @(Get-ChildItem -LiteralPath $extract -Directory)
    if ($directories.Count -eq 1) { $rootPath = $directories[0].FullName }
}
$launcher = Join-Path $rootPath 'Pica Library.exe'
if (-not (Test-Path -LiteralPath $launcher)) { throw 'Pica Library.exe is missing' }
$sourceSha = [IO.File]::ReadAllText((Join-Path $rootPath 'SOURCE_SHA.txt')).Trim()
if ($sourceSha -notmatch '^[0-9a-f]{40}$') { throw 'Packaged source SHA is invalid' }
foreach ($license in @('licenses\Node.js-LICENSE.txt','licenses\THIRD_PARTY_LICENSES.txt')) {
    $licenseFile = Join-Path $rootPath $license
    if (-not (Test-Path -LiteralPath $licenseFile) -or (Get-Item -LiteralPath $licenseFile).Length -eq 0) {
        throw "Packaged license material is missing: $license"
    }
}

$originalPath = $env:PATH
$originalLocal = $env:LOCALAPPDATA
$env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
$env:LOCALAPPDATA = $local
try {
    if ($PortCollision) {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,4789)
        $listener.Start()
    }
    $watch = [Diagnostics.Stopwatch]::StartNew()
    Start-Process -FilePath $launcher -ArgumentList '--no-open' -WorkingDirectory $rootPath -WindowStyle Hidden
    $instanceFile = Join-Path $local 'Pica Library\runtime-state\instance.json'
    $deadline = (Get-Date).AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 150
        if (Test-Path -LiteralPath $instanceFile) {
            try { $instance = Get-Content -Raw -LiteralPath $instanceFile | ConvertFrom-Json } catch { $instance = $null }
        }
    } while (-not $instance -and (Get-Date) -lt $deadline)
    if (-not $instance) { throw 'Packaged service did not publish instance state' }
    $publishedMs = $watch.ElapsedMilliseconds
    if ($PortCollision -and $instance.url -eq 'http://127.0.0.1:4789') { throw 'Packaged app attached to unrelated port occupant' }
    $status = Invoke-RestMethod -Uri ($instance.url + '/api/v1/desktop/status') -TimeoutSec 10
    if ($status.application -ne 'Pica Library' -or $status.version -ne '0.1.2' -or $status.configured) { throw 'Unexpected packaged status' }
    $setup = Invoke-WebRequest -UseBasicParsing -Uri ($instance.url + '/setup') -TimeoutSec 10
    if ($setup.StatusCode -ne 200 -or $setup.Content -notmatch 'Welcome to Pica Library') { throw 'Setup page is unavailable' }
    if ($setup.Content -notmatch 'id="language-select"' -or $setup.Content -notmatch '简体中文') { throw 'Language controls are unavailable' }

    $initialCsrfToken = $status.csrfToken
    $credentialEncrypted = $null
    if ($SetupPersistence) {
        $library = [string]$status.libraryDirectory
        $payload = @{ account='synthetic-account'; password='synthetic-password'; libraryDirectory=$library; profile='fast'; proxyUrl='http://proxy-user:proxy-password@127.0.0.1:7890' } | ConvertTo-Json
        Invoke-RestMethod -Method Post -Uri ($instance.url + '/api/v1/desktop/settings') -Headers @{ 'x-pica-csrf'=$status.csrfToken; Origin=$instance.url } -ContentType 'application/json' -Body $payload -TimeoutSec 15 | Out-Null
        Start-Sleep -Seconds 1
        $configFile = Join-Path $local 'Pica Library\config\config.json'
        $credentialFile = Join-Path $local 'Pica Library\config\credentials.dat'
        $configText = [IO.File]::ReadAllText($configFile)
        $credentialText = [IO.File]::ReadAllText($credentialFile)
        foreach ($secret in @('synthetic-account','synthetic-password','proxy-user','proxy-password')) {
            if ($configText.Contains($secret) -or $credentialText.Contains($secret)) { throw 'Plaintext credential found in persisted files' }
        }
        $credentialEncrypted = $true
        $instance = Get-Content -Raw -LiteralPath $instanceFile | ConvertFrom-Json
        $status = Invoke-RestMethod -Uri ($instance.url + '/api/v1/desktop/status') -TimeoutSec 10
        if ($status.csrfToken -eq $initialCsrfToken) { throw 'Onboarding CSRF capability was not invalidated' }
    }

    # A duplicate launcher must leave the published PID and URL unchanged.
    $firstPid = $instance.pid
    Start-Process -FilePath $launcher -ArgumentList '--no-open' -WorkingDirectory $rootPath -WindowStyle Hidden
    Start-Sleep -Seconds 1
    $again = Get-Content -Raw -LiteralPath $instanceFile | ConvertFrom-Json
    if ($again.pid -ne $firstPid -or $again.url -ne $instance.url) { throw 'Second launcher created another engine' }

    Invoke-RestMethod -Method Post -Uri ($instance.url + '/api/v1/desktop/shutdown') -Headers @{ 'x-pica-csrf' = $status.csrfToken; Origin = $instance.url } -ContentType 'application/json' -Body '{}' -TimeoutSec 10 | Out-Null
    $exitDeadline = (Get-Date).AddSeconds(15)
    do { Start-Sleep -Milliseconds 150 } while ((Get-Process -Id $firstPid -ErrorAction SilentlyContinue) -and (Get-Date) -lt $exitDeadline)
    if (Get-Process -Id $firstPid -ErrorAction SilentlyContinue) { throw 'Packaged process did not stop' }
    if (Test-Path -LiteralPath $instanceFile) { throw 'Instance state was not released' }
    $port = ([uri]$instance.url).Port
    $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$port)
    try { $probe.Start() } finally { $probe.Stop() }
    $relaunch = 'NOT_RUN'
    if ($SetupPersistence) {
        Start-Process -FilePath $launcher -ArgumentList '--no-open' -WorkingDirectory $rootPath -WindowStyle Hidden
        $deadline = (Get-Date).AddSeconds(20); $second = $null
        do { Start-Sleep -Milliseconds 150; if(Test-Path $instanceFile){try{$second=Get-Content -Raw $instanceFile|ConvertFrom-Json}catch{}} } while(-not $second -and (Get-Date)-lt $deadline)
        if(-not $second){throw 'Configured packaged app did not relaunch'}
        $secondStatus=Invoke-RestMethod -Uri ($second.url+'/api/v1/desktop/status') -TimeoutSec 10
        if(-not $secondStatus.configured -or $secondStatus.profile -ne 'fast' -or -not $secondStatus.proxyEnabled){throw 'Configured state was not recovered'}
        Invoke-RestMethod -Method Post -Uri ($second.url+'/api/v1/desktop/shutdown') -Headers @{'x-pica-csrf'=$secondStatus.csrfToken;Origin=$second.url} -ContentType 'application/json' -Body '{}'|Out-Null
        $secondExit=(Get-Date).AddSeconds(15)
        do { Start-Sleep -Milliseconds 150 } while ((Get-Process -Id $second.pid -ErrorAction SilentlyContinue) -and (Get-Date)-lt $secondExit)
        if (Get-Process -Id $second.pid -ErrorAction SilentlyContinue) { throw 'Relaunched packaged process did not stop' }
        $relaunch='PASS'
    }
    [ordered]@{ artifact_only_smoke='PASS'; source_sha=$sourceSha; port_collision=if($PortCollision){'PASS'}else{'NOT_RUN'}; version=$status.version; setup_available=$true; credential_encrypted=$credentialEncrypted; relaunch=$relaunch; single_instance='PASS'; shutdown='PASS'; port_released=$true; startup_to_instance_ms=$publishedMs; url=$instance.url } | ConvertTo-Json
} finally {
    if ($listener) { $listener.Stop() }
    $env:PATH = $originalPath
    $env:LOCALAPPDATA = $originalLocal
    if (Test-Path -LiteralPath $work) {
        for ($attempt=0; $attempt -lt 5; $attempt++) {
            try { Remove-Item -Recurse -Force -LiteralPath $work -ErrorAction Stop; break }
            catch { if ($attempt -eq 4) { Write-Warning "Temporary smoke directory remains for diagnosis: $work"; break }; Start-Sleep -Milliseconds 300 }
        }
    }
}
