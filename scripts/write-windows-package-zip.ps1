param(
    [Parameter(Mandatory=$true)][string]$Stage,
    [Parameter(Mandatory=$true)][string]$Zip
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$prefix=(Get-Item -LiteralPath $Stage).FullName.TrimEnd('\')+'\'
if(Test-Path -LiteralPath $Zip){throw "Refusing to overwrite archive: $Zip"}
$files=@(Get-ChildItem -LiteralPath $Stage -Recurse -File -Force)
if(-not $files.Count){throw 'Empty staging directory'}
$out=[IO.Compression.ZipFile]::Open($Zip,[IO.Compression.ZipArchiveMode]::Create)
try {
    foreach($f in $files){
        $entry=$f.FullName.Substring($prefix.Length).Replace('\','/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($out,$f.FullName,$entry,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally {$out.Dispose()}
$verify=[IO.Compression.ZipFile]::OpenRead($Zip)
try {
    if($verify.Entries.Count -ne $files.Count){throw 'Package entry count changed'}
    foreach($f in $files){
        $entry=$f.FullName.Substring($prefix.Length).Replace('\','/')
        $actual=$verify.GetEntry($entry)
        if(-not $actual -or $actual.Length -ne $f.Length){throw "Missing or truncated package entry: $entry"}
    }
} finally {$verify.Dispose()}
