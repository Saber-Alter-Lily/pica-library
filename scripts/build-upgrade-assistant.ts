import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import AdmZip from 'adm-zip'

function sha256(value: Buffer) {
    return createHash('sha256').update(value).digest('hex')
}

function stableVersion(value: string, label: string) {
    const normalized = String(value ?? '').trim()
    if (!/^\d+\.\d+\.\d+$/.test(normalized))
        throw new Error(`${label} must be a stable semantic version`)
    return normalized
}

function sourceSha(value: string) {
    const normalized = String(value ?? '').trim().toLowerCase()
    if (!/^[0-9a-f]{40}$/.test(normalized))
        throw new Error('Target source SHA must be 40 lowercase hex characters')
    return normalized
}

export function buildUpgradeAssistant(options: {
    sourceVersion: string
    targetVersion: string
    targetZipFile: string
    targetSourceSha: string
    targetDatabaseSchema: number
    outputFile: string
}) {
    const sourceVersion = stableVersion(
        options.sourceVersion,
        'Source version'
    )
    const targetVersion = stableVersion(
        options.targetVersion,
        'Target version'
    )
    const targetSourceSha = sourceSha(options.targetSourceSha)
    const schema = Number(options.targetDatabaseSchema)
    if (!Number.isInteger(schema) || schema < 1)
        throw new Error('Target database schema must be a positive integer')

    const targetZipFile = path.resolve(options.targetZipFile)
    const outputFile = path.resolve(options.outputFile)
    if (!fs.existsSync(targetZipFile))
        throw new Error('Target Windows package does not exist')

    const targetBuffer = fs.readFileSync(targetZipFile)
    const targetZip = new AdmZip(targetBuffer)
    const packagedSourceSha = targetZip
        .getEntry('SOURCE_SHA.txt')
        ?.getData()
        .toString('utf8')
        .trim()
    if (packagedSourceSha !== targetSourceSha)
        throw new Error(
            'Target Windows package SOURCE_SHA does not match release source'
        )

    const targetZipName = path.basename(targetZipFile)
    const expectedTargetName =
        `Pica-Library-v${targetVersion}-windows-x64.zip`
    if (targetZipName !== expectedTargetName)
        throw new Error(
            `Target Windows package must be named ${expectedTargetName}`
        )

    const root = path.resolve(import.meta.dirname, '..')
    const templateRoot = path.join(
        root,
        'packaging',
        'windows',
        'upgrade-assistant-v041'
    )
    let script = fs.readFileSync(
        path.join(templateRoot, 'Upgrade-Pica-Library-v0.4.1.ps1'),
        'utf8'
    )
    let launcher = fs.readFileSync(
        path.join(templateRoot, 'Upgrade-Pica-Library-v0.4.1.cmd'),
        'utf8'
    )
    const templateReadme = fs.readFileSync(
        path.join(templateRoot, 'README.txt'),
        'utf8'
    )

    const targetHash = sha256(targetBuffer)
    script = script
        .replace(
            "$TargetVersion = '0.4.1'",
            `$TargetVersion = '${targetVersion}'`
        )
        .replace(
            "$RequiredSourceVersion = '0.4.0'",
            `$RequiredSourceVersion = '${sourceVersion}'`
        )
        .replace(
            "$TargetZipName = 'Pica-Library-v0.4.1-windows-x64.zip'",
            `$TargetZipName = '${targetZipName}'`
        )
        .replace(
            "$TargetZipUrl = 'https://github.com/Saber-Alter-Lily/pica-library/releases/download/v0.4.1/Pica-Library-v0.4.1-windows-x64.zip'",
            `$TargetZipUrl = 'https://github.com/Saber-Alter-Lily/pica-library/releases/download/v${targetVersion}/${targetZipName}'`
        )
        .replace(
            "$ExpectedZipSha256 = '88d87a8f0e5a8413656751ff344052eccbfa796e663e4acc8c7fe4a0e0866b3d'",
            `$ExpectedZipSha256 = '${targetHash}'`
        )
        .replace(
            "$ExpectedTargetSourceSha = '974d4e9b22379aeed379b71711008332acc213a4'",
            `$ExpectedTargetSourceSha = '${targetSourceSha}'`
        )
        .replace(
            '$ExpectedDatabaseSchema = 13',
            `$ExpectedDatabaseSchema = ${schema}`
        )
        .replaceAll('v0.4.1', `v${targetVersion}`)
        .replaceAll('v0.4.0', `v${sourceVersion}`)

    const targetScriptName =
        `Upgrade-Pica-Library-v${targetVersion}.ps1`
    launcher = launcher
        .replaceAll('v0.4.1', `v${targetVersion}`)
        .replaceAll('v0.4.0', `v${sourceVersion}`)
        .replace(
            'Upgrade-Pica-Library-v0.4.1.ps1',
            targetScriptName
        )

    const readme = [
        `Pica Library v${sourceVersion} -> v${targetVersion} fallback Upgrade Assistant`,
        '',
        `Normal v${sourceVersion} users should use the in-app one-click update first.`,
        'Use this assistant only if the official in-app update path cannot complete.',
        'It verifies the official full Windows package, preserves the external Desktop data root,',
        'snapshots configuration and SQLite state, and rolls back when target health checks fail.',
        '',
        'Template lineage:',
        templateReadme.trim(),
        ''
    ].join('\n')

    const output = new AdmZip()
    output.addFile(
        targetScriptName,
        Buffer.from(script, 'utf8')
    )
    output.addFile(
        `Upgrade-Pica-Library-v${targetVersion}.cmd`,
        Buffer.from(launcher, 'utf8')
    )
    output.addFile('README.txt', Buffer.from(readme, 'utf8'))
    fs.mkdirSync(path.dirname(outputFile), { recursive: true })
    output.writeZip(outputFile)
    const archive = fs.readFileSync(outputFile)

    return {
        path: outputFile,
        sha256: sha256(archive),
        sizeBytes: archive.byteLength,
        sourceVersion,
        targetVersion,
        targetZipName,
        targetZipSha256: targetHash,
        targetSourceSha,
        targetDatabaseSchema: schema
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
    const [
        sourceVersion,
        targetVersion,
        targetZipFile,
        targetSourceSha,
        targetDatabaseSchema,
        outputFile
    ] = process.argv.slice(2)
    if (
        !sourceVersion ||
        !targetVersion ||
        !targetZipFile ||
        !targetSourceSha ||
        !targetDatabaseSchema ||
        !outputFile
    )
        throw new Error(
            'Usage: tsx scripts/build-upgrade-assistant.ts <sourceVersion> <targetVersion> <targetZip> <targetSourceSha> <targetDatabaseSchema> <outputZip>'
        )
    console.log(
        JSON.stringify(
            buildUpgradeAssistant({
                sourceVersion,
                targetVersion,
                targetZipFile,
                targetSourceSha,
                targetDatabaseSchema: Number(targetDatabaseSchema),
                outputFile
            }),
            null,
            2
        )
    )
}
