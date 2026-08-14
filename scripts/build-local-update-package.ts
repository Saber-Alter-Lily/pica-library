import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import AdmZip from 'adm-zip'
import {
    APP_API_VERSION,
    DATABASE_SCHEMA_VERSION
} from '../src/app-capabilities'
import {
    normalizeUpdatePath,
    updaterSelfReplacement
} from '../src/update/path-safety'
import type { UpdateManifest } from '../src/update/types'

function sha256(value: Buffer) {
    return createHash('sha256').update(value).digest('hex')
}

function files(zip: AdmZip) {
    return new Map(
        zip
            .getEntries()
            .filter((entry) => !entry.isDirectory)
            .map((entry) => [
                entry.entryName.replaceAll('\\', '/'),
                entry.getData()
            ])
    )
}

function sourceSha(entries: Map<string, Buffer>) {
    const value = entries.get('SOURCE_SHA.txt')?.toString('utf8').trim() ?? ''
    if (!/^[0-9a-f]{40}$/.test(value))
        throw new Error('Full package SOURCE_SHA.txt is invalid')
    return value
}

function versionFromName(file: string, markers: string[]) {
    const match = path
        .basename(file)
        .match(
            new RegExp(
                `^Pica-Library-v(.+)-(?:${markers.join('|')})-windows-x64\\.zip$`
            )
        )
    if (!match)
        throw new Error(`Could not read version from ${path.basename(file)}`)
    return match[1]
}

export function buildLocalUpdatePackage(
    sourceZipFile: string,
    targetZipFile: string,
    outputFile: string
) {
    const sourceVersion = versionFromName(sourceZipFile, [
        'update-base',
        'local-test'
    ])
    const targetVersion = versionFromName(targetZipFile, ['local-test'])
    const sourceEntries = files(new AdmZip(sourceZipFile))
    const targetEntries = files(new AdmZip(targetZipFile))
    const changed = [...targetEntries.entries()].filter(([name, value]) => {
        const previous = sourceEntries.get(name)
        return !previous || !previous.equals(value)
    })
    const deleted = [...sourceEntries.keys()].filter(
        (name) => !targetEntries.has(name)
    )
    const unsafeChanged = changed
        .map(([name]) => name)
        .filter((name) => {
            try {
                normalizeUpdatePath(name)
                return false
            } catch {
                return true
            }
        })
    const unsafeDeleted = deleted.filter((name) => {
        try {
            normalizeUpdatePath(name)
            return false
        } catch {
            return true
        }
    })
    if (unsafeChanged.length || unsafeDeleted.length)
        throw new Error(
            `Incremental update requires a full install for non-allowlisted paths: ${[
                ...unsafeChanged,
                ...unsafeDeleted
            ].join(', ')}`
        )
    if (updaterSelfReplacement(changed.map(([name]) => name)))
        throw new Error(
            'Updater helper changed; requiresFullInstall must be used'
        )
    const manifest: UpdateManifest = {
        manifestVersion: 1,
        packageType: 'local-test',
        sourceVersionRange: `=${sourceVersion}`,
        sourceSha: sourceSha(sourceEntries),
        targetVersion,
        targetSourceSha: sourceSha(targetEntries),
        appApiVersion: APP_API_VERSION,
        databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
        requiresFullInstall: false,
        files: changed.map(([name, value]) => ({
            path: normalizeUpdatePath(name),
            sha256: sha256(value),
            size: value.byteLength
        })),
        deletions: deleted.map(normalizeUpdatePath)
    }
    const output = new AdmZip()
    output.addFile(
        'update-manifest.json',
        Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')
    )
    for (const [name, value] of changed) output.addFile(name, value)
    fs.mkdirSync(path.dirname(path.resolve(outputFile)), { recursive: true })
    output.writeZip(outputFile)
    const archive = fs.readFileSync(outputFile)
    return {
        path: path.resolve(outputFile),
        sha256: sha256(archive),
        sizeBytes: archive.byteLength,
        fileCount: changed.length,
        fullPackageFileCount: targetEntries.size,
        manifest
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
    const [source, target, output] = process.argv.slice(2)
    if (!source || !target || !output)
        throw new Error(
            'Usage: tsx scripts/build-local-update-package.ts <dev0.zip> <dev1.zip> <output.zip>'
        )
    console.log(
        JSON.stringify(buildLocalUpdatePackage(source, target, output), null, 2)
    )
}
