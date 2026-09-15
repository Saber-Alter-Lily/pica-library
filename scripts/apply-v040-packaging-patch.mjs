import fs from 'node:fs'

function replaceOne(file, pattern, replacement, label) {
  const before = fs.readFileSync(file, 'utf8')
  const after = before.replace(pattern, replacement)
  if (after === before) throw new Error(`Patch target not found: ${label}`)
  fs.writeFileSync(file, after)
}

replaceOne(
  'src/providers/eh-provider.ts',
  "const USER_AGENT = 'Pica-Library/0.3 (+https://github.com/Saber-Alter-Lily/pica-library)'",
  "const USER_AGENT = 'Pica-Library/0.4 (+https://github.com/Saber-Alter-Lily/pica-library)'",
  'E-H user agent'
)

replaceOne(
  'scripts/build-windows-package.ps1',
  "} elseif ($version -eq '0.3.14') {\n    'Pica-Library-v0.3.14-windows-x64'\n} elseif ($version -eq '0.2.0-dev.0') {",
  "} elseif ($version -eq '0.3.14') {\n    'Pica-Library-v0.3.14-windows-x64'\n} elseif ($version -eq '0.4.0') {\n    'Pica-Library-v0.4.0-windows-x64'\n} elseif ($version -eq '0.2.0-dev.0') {",
  'v0.4 package name'
)

replaceOne(
  'scripts/build-windows-package.ps1',
  "'0.3.12','0.3.13','0.3.14')) {",
  "'0.3.12','0.3.13','0.3.14','0.4.0')) {",
  'v0.4 incremental eligibility'
)
replaceOne(
  'scripts/build-windows-package.ps1',
  "    } elseif ($version -eq '0.3.14') {\n        Join-Path $root 'artifacts\\release-base\\Pica-Library-v0.3.13-windows-x64.zip'\n    }",
  "    } elseif ($version -eq '0.3.14') {\n        Join-Path $root 'artifacts\\release-base\\Pica-Library-v0.3.13-windows-x64.zip'\n    } elseif ($version -eq '0.4.0') {\n        Join-Path $root 'artifacts\\release-base\\Pica-Library-v0.3.14-windows-x64.zip'\n    }",
  'v0.4 official base'
)
replaceOne(
  'scripts/build-windows-package.ps1',
  "    if ($version -eq '0.3.14' -and (Get-Sha256 $baseZip) -ne '4575cc0c073d68baac4a6e34979d25c062b83086053f86a87bd0d4d847cf1c77') {\n        throw 'The v0.3.13 official base package checksum does not match'\n    }",
  "    if ($version -eq '0.3.14' -and (Get-Sha256 $baseZip) -ne '4575cc0c073d68baac4a6e34979d25c062b83086053f86a87bd0d4d847cf1c77') {\n        throw 'The v0.3.13 official base package checksum does not match'\n    }\n    if ($version -eq '0.4.0' -and (Get-Sha256 $baseZip) -ne '211bc7d7d4f384af0389288439e38a645a7e8a458e56d947d005cd179848cb56') {\n        throw 'The v0.3.14 official base package checksum does not match'\n    }",
  'v0.4 official base checksum'
)
replaceOne(
  'scripts/build-windows-package.ps1',
  "'0.3.12','0.3.13','0.3.14')) {\n            # Stable v0.3.1+ packages",
  "'0.3.12','0.3.13','0.3.14','0.4.0')) {\n            # Stable packages",
  'v0.4 accepted launcher reuse'
)

console.log('V040_PACKAGING_PATCH=PASS')
