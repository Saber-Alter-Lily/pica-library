import fs from 'node:fs'

const file = 'scripts/build-windows-package.ps1'
let source = fs.readFileSync(file, 'utf8')

function replaceFirst(before, after) {
    if (source.includes(after)) return
    const index = source.indexOf(before)
    if (index < 0)
        throw new Error(
            `Desktop version patch anchor missing: ${before.slice(0, 100)}`
        )
    source =
        source.slice(0, index) + after + source.slice(index + before.length)
}

replaceFirst(
    `} elseif ($version -eq '0.3.0') {
    'Pica-Library-v0.3.0-windows-x64'
} elseif ($version -eq '0.2.0-dev.0') {`,
    `} elseif ($version -eq '0.3.0') {
    'Pica-Library-v0.3.0-windows-x64'
} elseif ($version -eq '0.3.1') {
    'Pica-Library-v0.3.1-windows-x64'
} elseif ($version -eq '0.3.2') {
    'Pica-Library-v0.3.2-windows-x64'
} elseif ($version -eq '0.3.3') {
    'Pica-Library-v0.3.3-windows-x64'
} elseif ($version -eq '0.3.4') {
    'Pica-Library-v0.3.4-windows-x64'
} elseif ($version -eq '0.2.0-dev.0') {`
)

replaceFirst(
    `$sourceSha = (git -C $root rev-parse HEAD).Trim()
`,
    `$gitSourceSha = (git -C $root rev-parse HEAD).Trim()
$sourceSha = if ($env:PICA_LIBRARY_BUILD_PROVENANCE) { [string]$env:PICA_LIBRARY_BUILD_PROVENANCE } else { $gitSourceSha }
`
)

replaceFirst(
    `if ($sourceSha -notmatch '^[0-9a-f]{40}$') { throw 'Could not resolve source commit SHA' }
`,
    `if ($gitSourceSha -notmatch '^[0-9a-f]{40}$') { throw 'Could not resolve Git source commit SHA' }
if ($sourceSha -notmatch '^[0-9a-f]{40}$') { throw 'Build provenance must be exactly 40 lowercase hex characters' }
`
)

replaceFirst(
    `if ($version -in @('0.2.0-dev.1','0.2.0-dev.2','0.3.0')) {`,
    `if ($version -in @('0.2.0-dev.1','0.2.0-dev.2','0.3.0','0.3.1','0.3.2','0.3.3','0.3.4')) {`
)

replaceFirst(
    `    } elseif ($version -eq '0.3.0') {
        Join-Path $root 'artifacts\\Pica-Library-v0.2.0-windows-x64.zip'
    }
`,
    `    } elseif ($version -eq '0.3.0') {
        Join-Path $root 'artifacts\\Pica-Library-v0.2.0-windows-x64.zip'
    } elseif ($version -eq '0.3.1') {
        Join-Path $root 'artifacts\\Pica-Library-v0.3.0-windows-x64.zip'
    } elseif ($version -eq '0.3.2') {
        Join-Path $root 'artifacts\\Pica-Library-v0.3.1-windows-x64.zip'
    } elseif ($version -eq '0.3.3') {
        Join-Path $root 'artifacts\\Pica-Library-v0.3.2-windows-x64.zip'
    } elseif ($version -eq '0.3.4') {
        Join-Path $root 'artifacts\\Pica-Library-v0.3.3-windows-x64.zip'
    }
`
)

replaceFirst(
    `        & git -C $root diff --quiet "$baseSourceSha..$sourceSha" -- 'packaging/windows/Launcher.cs'
        if ($LASTEXITCODE -ne 0) { throw 'Launcher source changed; a full install is required' }
`,
    `        if ($version -in @('0.3.2','0.3.3','0.3.4')) {
            # Stable v0.3.1+ packages intentionally store opaque public provenance rather than private Git SHAs.
            # Verify the launcher source itself is still byte-identical before reusing the accepted launcher binary.
            $launcherBlob = (git -C $root hash-object 'packaging/windows/Launcher.cs').Trim()
            if ($launcherBlob -ne '1351568469abf3edcb61354144498ec9734ad08f') {
                throw 'Launcher source changed since accepted stable package; a full install is required'
            }
        } else {
            & git -C $root diff --quiet "$baseSourceSha..$gitSourceSha" -- 'packaging/windows/Launcher.cs'
            if ($LASTEXITCODE -ne 0) { throw 'Launcher source changed; a full install is required' }
        }
`
)

fs.writeFileSync(file, source, 'utf8')
console.log('alpha8 desktop 0.3.1/0.3.2/0.3.3/0.3.4 packaging patch applied')
