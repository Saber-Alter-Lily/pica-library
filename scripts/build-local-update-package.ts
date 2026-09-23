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
import { classifyUpdateCompatibility } from '../src/update/compatibility'
import { releasedUpdateBaseline } from '../src/update/released-baselines'
import type { UpdateManifest } from '../src/update/types'
import {
    normalizeUpdateTarget,
    sameUpdateTarget,
    updateTargetKey,
    type UpdateTarget
} from '../src/update/target'

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

const registrySourceRoot = 'src/data/registry-v3-final/'
const registryMirrorRoot = 'app/runtime-assets/registry-v3-final/'

// Distribution documents may be present in a full ZIP without being part of
// the running application tree. Existing updater helpers deliberately use a
// narrow allowlist and must never be replaced merely to add such a document.
// The versioned in-product disclaimer lives under web/ and remains part of the
// incremental update; only this root documentation copy is full-install-only.
const distributionOnlyFiles = new Set(['DISCLAIMER.md'])

function incrementalChanges(
    sourceEntries: Map<string, Buffer>,
    targetEntries: Map<string, Buffer>
) {
    return [...targetEntries.entries()].filter(([name, value]) => {
        if (distributionOnlyFiles.has(name)) return false
        const previous = sourceEntries.get(name)
        if (previous?.equals(value)) return false
        if (!name.startsWith(registrySourceRoot)) return true
        const mirror = targetEntries.get(
            `${registryMirrorRoot}${name.slice(registrySourceRoot.length)}`
        )
        if (!mirror?.equals(value))
            throw new Error(
                `Registry runtime mirror mismatch for incremental update: ${name}`
            )
        // Full packages retain the source-compatible path. Existing updaters
        // can safely install the byte-identical mirror under the established
        // app/ allowlist without replacing their own path-safety helper.
        return false
    })
}

function packageIdentity(file: string): {
    version: string
    stable: boolean
    target: UpdateTarget
} {
    const basename = path.basename(file)
    const stable = basename.match(
        /^Pica-Library-v(\d+\.\d+\.\d+)-(windows|macos|linux)-(x64|arm64)\.zip$/
    )
    const development = basename.match(
        /^Pica-Library-v(.+)-(?:update-base|local-test)-(windows|macos|linux)-(x64|arm64)\.zip$/
    )
    const match = stable ?? development
    if (!match)
        throw new Error(`Could not read package identity from ${basename}`)
    const target = normalizeUpdateTarget(match[2], match[3])
    if (!target)
        throw new Error(`Unsupported update target in ${basename}`)
    return {
        version: match[1],
        stable: Boolean(stable),
        target
    }
}

export function buildLocalUpdatePackage(
    sourceZipFile: string,
    targetZipFile: string,
    outputFile: string
) {
    const source = packageIdentity(sourceZipFile)
    const target = packageIdentity(targetZipFile)
    if (!sameUpdateTarget(source.target, target.target))
        throw new Error(
            `Update package targets do not match: ${updateTargetKey(source.target)} -> ${updateTargetKey(target.target)}`
        )
    const sourceVersion = source.version
    const targetVersion = target.version
    const sourceEntries = files(new AdmZip(sourceZipFile))
    const targetEntries = files(new AdmZip(targetZipFile))
    const changed = incrementalChanges(sourceEntries, targetEntries)
    const deleted = [...sourceEntries.keys()].filter(
        (name) =>
            !distributionOnlyFiles.has(name) && !targetEntries.has(name)
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
    const updaterChanged = updaterSelfReplacement(
        changed.map(([name]) => name)
    )
    if (updaterChanged)
        throw new Error(
            'Updater helper changed; requiresFullInstall must be used'
        )

    const releasedBaseline = source.stable
        ? releasedUpdateBaseline(sourceVersion)
        : null
    if (releasedBaseline) {
        const compatibility = classifyUpdateCompatibility({
            currentAppApiVersion: releasedBaseline.appApiVersion,
            currentDatabaseSchemaVersion:
                releasedBaseline.advertisedDatabaseSchemaVersion,
            targetAppApiVersion: APP_API_VERSION,
            targetDatabaseSchemaVersion: DATABASE_SCHEMA_VERSION,
            updaterHelperChanged: updaterChanged
        })
        if (compatibility.kind !== 'INCREMENTAL')
            throw new Error(
                `Incremental update from public v${sourceVersion} is not compatible (${compatibility.reason}); use a full application upgrade path`
            )
    }
    const manifest: UpdateManifest = {
        manifestVersion: 1,
        packageType:
            source.stable && target.stable ? 'incremental' : 'local-test',
        sourceVersionRange: `=${sourceVersion}`,
        sourceSha: sourceSha(sourceEntries),
        targetVersion,
        targetSourceSha: sourceSha(targetEntries),
        targetPlatform: target.target.platform,
        targetArch: target.target.arch,
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
