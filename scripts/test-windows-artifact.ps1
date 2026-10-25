param(
    [Parameter(Mandatory = $true)][string]$Zip,
    [switch]$PortCollision,
    [switch]$SetupPersistence,
    [switch]$LocalOnlySetup,
    [ValidateSet('', 'core', 'jm')][string]$ExpectedSourceRuntimes = '',
    [string]$ExpectedVersion = '',
    [string]$DesktopHomeName = 'Pica Library'
)
$ErrorActionPreference = 'Stop'
if ($LocalOnlySetup -and $SetupPersistence) { throw 'Choose one isolated setup mode per artifact smoke' }
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$expectedVersion = if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    [string]((Get-Content -Raw -LiteralPath (Join-Path $repositoryRoot 'package.json') | ConvertFrom-Json).version)
} else {
    [string]$ExpectedVersion
}
if ([string]::IsNullOrWhiteSpace($DesktopHomeName) -or $DesktopHomeName -match '[\\/:*?"<>|]') {
    throw 'DesktopHomeName must be one safe Windows directory name'
}

$work = Join-Path ([IO.Path]::GetTempPath()) ("pica-artifact-smoke-" + [guid]::NewGuid().ToString('N'))
$extract = Join-Path $work 'extract'
$local = Join-Path $work 'localappdata'
$listener = $null
$smokePassed = $false
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
foreach ($helper in @('app\updater.js','app\full-upgrader.js')) {
    if (-not (Test-Path -LiteralPath (Join-Path $rootPath $helper))) {
        throw "Packaged update helper is missing: $helper"
    }
}
foreach ($guide in @('README-WINDOWS.txt','README-WINDOWS.zh-CN.txt')) {
    if (-not (Test-Path -LiteralPath (Join-Path $rootPath $guide))) { throw "Windows guide is missing: $guide" }
}
$sourceSha = [IO.File]::ReadAllText((Join-Path $rootPath 'SOURCE_SHA.txt')).Trim()
if ($sourceSha -notmatch '^[0-9a-f]{40}$') { throw 'Packaged source SHA is invalid' }
$registryRoot = Join-Path $rootPath 'app\runtime-assets\tag-runtime-v1'
foreach ($legacy in @('src\data\registry-v3-final','app\runtime-assets\registry-v3-final')) {
    if (Test-Path -LiteralPath (Join-Path $rootPath $legacy)) { throw 'Reviewed tag evidence was bundled into the application' }
}
$registryManifestFile = Join-Path $registryRoot 'TAG_RUNTIME_MANIFEST.json'
if (-not (Test-Path -LiteralPath $registryManifestFile)) { throw 'Minimal tag runtime manifest is missing' }
$registryManifest = Get-Content -Raw -LiteralPath $registryManifestFile | ConvertFrom-Json
if ($registryManifest.formatVersion -ne 1 -or $registryManifest.semanticAuthoritySha256 -ne 'ef28fda608510bf4ce91307d71af5d76af3bce07950e107b0b02a71a21517ffb' -or $registryManifest.semanticContentSha256 -ne 'ff375402b9e39fa0a636af4533badbedc363fee4238eec6a300944827551e899') { throw 'Tag semantic authority changed' }
$registryNames = @('semantic-v2.csv','semantic-v3.csv','entities-v3.csv','unresolved-v3.csv','aliases-v2.json','aliases-v3.json')
$actualRegistryNames = @((Get-ChildItem -LiteralPath $registryRoot -Force).Name | Sort-Object)
$expectedRegistryNames = @(($registryNames + 'TAG_RUNTIME_MANIFEST.json') | Sort-Object)
if (Compare-Object $actualRegistryNames $expectedRegistryNames) { throw 'Unexpected tag runtime payload' }
foreach ($asset in $registryNames) {
    $file = Join-Path $registryRoot $asset
    $integrity = $registryManifest.files.PSObject.Properties[$asset].Value
    if (-not $integrity -or (Get-Item -LiteralPath $file).Length -ne $integrity.bytes -or (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant() -ne $integrity.sha256) {
        throw "Minimal tag runtime integrity failure: $asset"
    }
}
foreach ($license in @('licenses\Node.js-LICENSE.txt','licenses\THIRD_PARTY_LICENSES.txt')) {
    $licenseFile = Join-Path $rootPath $license
    if (-not (Test-Path -LiteralPath $licenseFile) -or (Get-Item -LiteralPath $licenseFile).Length -eq 0) {
        throw "Packaged license material is missing: $license"
    }
}

$originalPath = $env:PATH
$originalLocal = $env:LOCALAPPDATA
$originalPicaEnvironment = @{}
foreach ($entry in @(Get-ChildItem Env: | Where-Object { $_.Name -like 'PICA_*' })) {
    $originalPicaEnvironment[$entry.Name] = $entry.Value
    # Remove the variable, not merely set it to an empty string. Modern .NET
    # preserves empty environment values, which are meaningful to nullish fallback.
    Remove-Item -LiteralPath ('Env:' + $entry.Name)
}
$env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
$env:LOCALAPPDATA = $local
try {
    if ($PortCollision) {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,4789)
        try { $listener.Start() }
        catch [Net.Sockets.SocketException] {
            if ($_.Exception.SocketErrorCode -ne [Net.Sockets.SocketError]::AddressAlreadyInUse) { throw }
            $listener = $null
        }
    }
    $watch = [Diagnostics.Stopwatch]::StartNew()
    Start-Process -FilePath $launcher -ArgumentList '--no-open' -WorkingDirectory $rootPath -WindowStyle Hidden
    $desktopHome = Join-Path $local $DesktopHomeName
    $instanceFile = Join-Path $desktopHome 'runtime-state\instance.json'
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
    if ($status.application -ne 'Pica Library' -or $status.version -ne $expectedVersion -or $status.configured) { throw 'Unexpected packaged status' }
    if ($ExpectedSourceRuntimes) {
        $actual = $status.runtimeComposition
        $runtimeNames = @($actual.composition.sourceRuntimes)
        if ($actual.status -ne 'declared' -or $actual.composition.formatVersion -ne 1 -or
            ($ExpectedSourceRuntimes -eq 'core' -and $runtimeNames.Count -ne 0) -or
            ($ExpectedSourceRuntimes -eq 'jm' -and ($runtimeNames.Count -ne 1 -or $runtimeNames[0] -ne 'jm'))) {
            throw 'Actual compiled Desktop runtime composition does not match the selected package'
        }
    }
    $atlas = Invoke-RestMethod -Method Post -Uri ($instance.url + '/api/v1/recommendation/profile/rebuild') -Headers @{ 'x-pica-csrf'=$status.csrfToken; Origin=$instance.url } -ContentType 'application/json' -Body '{}' -TimeoutSec 30
    if (-not $atlas.available -or $atlas.snapshot.snapshotVersion -ne 2) { throw 'Clean package Atlas rebuild failed' }
    $recommendation = Invoke-RestMethod -Method Post -Uri ($instance.url + '/api/v1/recommendations') -Headers @{ 'x-pica-csrf'=$status.csrfToken; Origin=$instance.url } -ContentType 'application/json' -Body '{"limit":12}' -TimeoutSec 30
    if (-not $recommendation.engine -or $null -eq $recommendation.recommendations) { throw 'Clean package recommendation preparation failed' }
    $setup = Invoke-WebRequest -UseBasicParsing -Uri ($instance.url + '/setup') -TimeoutSec 10
    if ($setup.StatusCode -ne 200 -or $setup.Content -notmatch 'Set up Pica Library') { throw 'Setup page is unavailable' }
    if ($setup.Content -notmatch 'id="language-select"' -or $setup.Content -notmatch 'option value="zh-CN"') { throw 'Language controls are unavailable' }
    $ui = Invoke-WebRequest -UseBasicParsing -Uri ($instance.url + '/') -TimeoutSec 10
    foreach ($marker in @(
        'id="home"',
        'id="library"',
        'id="discover"',
        'id="downloads"',
        'id="downloaded"',
        'id="settings"',
        'id="download-summary"',
        'id="downloaded-grid-items"',
        'id="downloaded-table"',
        'id="downloaded-cover-toggle"',
        'data-grid-size="small"',
        'data-grid-size="medium"',
        'data-grid-size="large"'
    )) {
        if ($ui.Content -notmatch [regex]::Escape($marker)) { throw "Packaged UI marker is missing: $marker" }
    }
    $styles = (Invoke-WebRequest -UseBasicParsing -Uri ($instance.url + '/styles.css') -TimeoutSec 10).Content
    foreach ($rule in @('@media (max-width: 980px)','@media (max-width: 760px)','minmax(250px, 1fr)','minmax(175px, 1fr)','minmax(120px, 1fr)')) {
        if (-not $styles.Contains($rule)) { throw "Packaged responsive/grid rule is missing: $rule" }
    }
    $appScript = (Invoke-WebRequest -UseBasicParsing -Uri ($instance.url + '/app.js') -TimeoutSec 10).Content
    foreach ($contract in @('setInterval(() => void loadJobs(), 1000)','job.comicTitle','job.chapterTitle','job.expectedBytes','state.downloadedCoversEnabled')) {
        if (-not $appScript.Contains($contract)) { throw "Packaged download UI contract is missing: $contract" }
    }

    $initialCsrfToken = $status.csrfToken
    $moduleContractGate = 'LEGACY_NOT_DECLARED'
    $capabilities = Invoke-RestMethod -Uri ($instance.url + '/api/v1/capabilities') -TimeoutSec 10
    if ($capabilities.moduleContracts) {
        $moduleFile = Join-Path $rootPath 'app\module-contracts.json'
        if (-not (Test-Path -LiteralPath $moduleFile)) { throw 'Packaged module contracts are missing' }
        $moduleFileContent = Get-Content -Raw -LiteralPath $moduleFile | ConvertFrom-Json
        $moduleKeys = @($moduleFileContent.apis.PSObject.Properties.Name | Sort-Object)
        $capabilityKeys = @($capabilities.moduleContracts.apis.PSObject.Properties.Name | Sort-Object)
        if ($moduleFileContent.formatVersion -ne 1 -or $capabilities.moduleContracts.formatVersion -ne 1 -or (Compare-Object $moduleKeys $capabilityKeys)) { throw 'Packaged module contract format/key mismatch' }
        foreach ($key in $moduleKeys) { if ($moduleFileContent.apis.$key -ne $capabilities.moduleContracts.apis.$key) { throw 'Packaged module API differs from the actual running engine' } }
        $moduleContractGate = 'PASS'
    }
    $localOnlyGate = 'NOT_RUN'
    if ($LocalOnlySetup) {
        $initialCsrfToken = $status.csrfToken
        $localPayload = @{ setupMode='local'; libraryDirectory=[string]$status.libraryDirectory; profile='fast' } | ConvertTo-Json
        $saved = Invoke-RestMethod -Method Post -Uri ($instance.url + '/api/v1/desktop/settings') -Headers @{ 'x-pica-csrf'=$status.csrfToken; Origin=$instance.url } -ContentType 'application/json' -Body $localPayload -TimeoutSec 15
        if (-not $saved.localOnly) { throw 'Local-only setup did not use its explicit non-credential path' }
        $deadline = (Get-Date).AddSeconds(20)
        do {
            Start-Sleep -Milliseconds 200
            try {
                $instance = Get-Content -Raw -LiteralPath $instanceFile | ConvertFrom-Json
                $status = Invoke-RestMethod -Uri ($instance.url + '/api/v1/desktop/status') -TimeoutSec 2
            } catch { $status = $null }
        } while ((-not $status -or -not $status.configured -or -not $status.startupReady) -and (Get-Date) -lt $deadline)
        if (-not $status.configured -or $status.picaAccount.configured -or $status.csrfToken -eq $initialCsrfToken) { throw 'Local-only configuration/account/CSRF state is incorrect' }
        if ($ExpectedSourceRuntimes) {
            $jmState = Invoke-RestMethod -Uri ($instance.url + '/api/v1/desktop/sources/jm/status') -TimeoutSec 10
            if ($jmState.enabled -or $jmState.configured -or ($jmState.available -ne ($ExpectedSourceRuntimes -eq 'jm'))) {
                throw 'Packaged local-only source availability/enablement/account boundary failed'
            }
        }
        $ordinarySettings = @{ libraryDirectory=[string]$status.libraryDirectory; profile='fast'; proxyUrl='' } | ConvertTo-Json
        $settingsResult = Invoke-RestMethod -Method Post -Uri ($instance.url + '/api/v1/desktop/settings') -Headers @{ 'x-pica-csrf'=$status.csrfToken; Origin=$instance.url } -ContentType 'application/json' -Body $ordinarySettings -TimeoutSec 15
        if (-not $settingsResult.success) { throw 'Ordinary local library settings still require a source account' }
        if (Test-Path -LiteralPath (Join-Path $desktopHome 'config\credentials.dat')) { throw 'Local-only setup unexpectedly persisted source credentials' }
        $localCatalog = Invoke-RestMethod -Uri ($instance.url + '/api/v1/comics?limit=1') -TimeoutSec 10
        if ($null -ne $localCatalog -and @($localCatalog).Count -ne 0) { throw 'Fresh local-only install unexpectedly contains comic records' }
        $localOnlyGate = 'PASS'
    }
    $credentialEncrypted = $null
    if ($SetupPersistence) {
        $library = [string]$status.libraryDirectory
        $payload = @{ account='synthetic-account'; password='synthetic-password'; libraryDirectory=$library; profile='fast'; proxyUrl='http://proxy-user:proxy-password@127.0.0.1:7890' } | ConvertTo-Json
        Invoke-RestMethod -Method Post -Uri ($instance.url + '/api/v1/desktop/settings') -Headers @{ 'x-pica-csrf'=$status.csrfToken; Origin=$instance.url } -ContentType 'application/json' -Body $payload -TimeoutSec 15 | Out-Null
        Start-Sleep -Seconds 1
        $configFile = Join-Path $desktopHome 'config\config.json'
        $credentialFile = Join-Path $desktopHome 'config\credentials.dat'
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
    if ($SetupPersistence -or $LocalOnlySetup) {
        Start-Process -FilePath $launcher -ArgumentList '--no-open' -WorkingDirectory $rootPath -WindowStyle Hidden
        $deadline = (Get-Date).AddSeconds(20); $second = $null
        do { Start-Sleep -Milliseconds 150; if(Test-Path $instanceFile){try{$second=Get-Content -Raw $instanceFile|ConvertFrom-Json}catch{}} } while(-not $second -and (Get-Date)-lt $deadline)
        if(-not $second){throw 'Configured packaged app did not relaunch'}
        $secondStatus=Invoke-RestMethod -Uri ($second.url+'/api/v1/desktop/status') -TimeoutSec 10
        if(-not $secondStatus.configured -or $secondStatus.profile -ne 'fast' -or ($SetupPersistence -and -not $secondStatus.proxyEnabled)){throw 'Configured state was not recovered'}
        if($SetupPersistence -and $moduleContractGate -eq 'PASS' -and -not $secondStatus.picaAccount.configured){throw 'DPAPI-backed Pica session was not recovered'}
        if($LocalOnlySetup -and ($secondStatus.picaAccount.configured -or (Test-Path -LiteralPath (Join-Path $desktopHome 'config\credentials.dat')))){throw 'Local-only relaunch required or persisted source credentials'}
        Invoke-RestMethod -Method Post -Uri ($second.url+'/api/v1/desktop/shutdown') -Headers @{'x-pica-csrf'=$secondStatus.csrfToken;Origin=$second.url} -ContentType 'application/json' -Body '{}'|Out-Null
        $secondExit=(Get-Date).AddSeconds(15)
        do { Start-Sleep -Milliseconds 150 } while ((Get-Process -Id $second.pid -ErrorAction SilentlyContinue) -and (Get-Date)-lt $secondExit)
        if (Get-Process -Id $second.pid -ErrorAction SilentlyContinue) { throw 'Relaunched packaged process did not stop' }
        $relaunch='PASS'
    }
    [ordered]@{ artifact_only_smoke='PASS'; source_sha=$sourceSha; port_collision=if($PortCollision){'PASS'}else{'NOT_RUN'}; version=$status.version; desktop_home_name=$DesktopHomeName; module_contracts=$moduleContractGate; local_only_setup=$localOnlyGate; registry_runtime_assets='PASS'; atlas_clean_package='PASS'; recommendation_clean_package='PASS'; setup_available=$true; ui_contracts='PASS'; responsive_contracts='PASS'; download_progress_fixture_contract='PASS'; credential_encrypted=$credentialEncrypted; relaunch=$relaunch; single_instance='PASS'; shutdown='PASS'; port_released=$true; startup_to_instance_ms=$publishedMs; url=$instance.url } | ConvertTo-Json
    $smokePassed = $true
} finally {
    if ($listener) { $listener.Stop() }
    $env:PATH = $originalPath
    $env:LOCALAPPDATA = $originalLocal
    foreach ($key in $originalPicaEnvironment.Keys) { [Environment]::SetEnvironmentVariable($key, $originalPicaEnvironment[$key], 'Process') }
    if (-not $smokePassed) { Write-Warning "Failed smoke retained for isolated diagnosis: $work" }
    if ($smokePassed -and (Test-Path -LiteralPath $work)) {
        $resolvedSmoke = (Resolve-Path -LiteralPath $work).Path
        $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
        if (
            -not $resolvedSmoke.StartsWith($resolvedTemp + '\', [StringComparison]::OrdinalIgnoreCase) -or
            (Split-Path -Leaf $resolvedSmoke) -notmatch '^pica-artifact-smoke-[0-9a-f]{32}$' -or
            ((Get-Item -LiteralPath $resolvedSmoke).Attributes -band [IO.FileAttributes]::ReparsePoint)
        ) { throw 'Refusing cleanup outside the isolated artifact smoke directory' }
        for ($attempt=0; $attempt -lt 5; $attempt++) {
            try { Remove-Item -Recurse -Force -LiteralPath $work -ErrorAction Stop; break }
            catch { if ($attempt -eq 4) { Write-Warning "Temporary smoke directory remains for diagnosis: $work"; break }; Start-Sleep -Milliseconds 300 }
        }
    }
}
