import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import AdmZip from 'adm-zip'
import {
    APP_API_VERSION,
    DATABASE_SCHEMA_VERSION,
    UPDATE_MANIFEST_VERSION
} from '../app-capabilities'
import { sanitizedChildEnv } from '../desktop/child-process'
import { normalizeUpdatePath, updaterSelfReplacement } from './path-safety'
import type {
    StagedUpdate,
    UpdateManifest,
    UpdateManifestFile,
    UpdateProgress,
    UpdaterInstruction
} from './types'

const officialRepository = 'Saber-Alter-Lily/pica-library'
const forbiddenPayload =
    /(^|\/)(data|cache|downloads?|previews?|logs?|browser-lite)(\/|$)|\.(?:db|sqlite)(?:-|$)|(^|\/)\.env/i

function sha256(value: Buffer | string) {
    return createHash('sha256').update(value).digest('hex')
}

function prerelease(version: string) {
    return /(?:^|[-.])(dev|alpha|beta|rc)(?:[.-]|\d|$)/i.test(version)
}

function stableVersionParts(version: string) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
    return match ? match.slice(1).map(Number) : null
}

function isNewerStable(candidate: string, current: string) {
    const left = stableVersionParts(candidate)
    const right = stableVersionParts(current)
    if (!left || !right) return false
    for (let index = 0; index < 3; index++) {
        if (left[index] !== right[index]) return left[index] > right[index]
    }
    return false
}

function exactSourceMatches(range: string, version: string) {
    const trimmed = range.trim()
    if (trimmed === version || trimmed === `=${version}`) return true
    const alternatives = trimmed.split(/\s*\|\|\s*/)
    return (
        alternatives.includes(version) || alternatives.includes(`=${version}`)
    )
}

function readManifest(zip: AdmZip): UpdateManifest {
    const entry = zip.getEntry('update-manifest.json')
    if (!entry) throw new Error('update-manifest.json is missing')
    let value: unknown
    try {
        value = JSON.parse(entry.getData().toString('utf8'))
    } catch {
        throw new Error('update-manifest.json is invalid JSON')
    }
    if (!value || typeof value !== 'object')
        throw new Error('Update manifest must be an object')
    const manifest = value as UpdateManifest
    if (manifest.manifestVersion !== UPDATE_MANIFEST_VERSION)
        throw new Error('Unsupported update manifest version')
    if (!['incremental', 'local-test'].includes(manifest.packageType))
        throw new Error('Unsupported update package type')
    for (const key of [
        'sourceVersionRange',
        'targetVersion',
        'targetSourceSha'
    ] as const)
        if (!String(manifest[key] ?? '').trim())
            throw new Error(`Update manifest field is missing: ${key}`)
    if (!/^[0-9a-f]{40}$/.test(manifest.targetSourceSha))
        throw new Error('targetSourceSha must be a full Git commit SHA')
    if (!Number.isInteger(manifest.appApiVersion) || manifest.appApiVersion < 1)
        throw new Error('Invalid appApiVersion')
    if (
        !Number.isInteger(manifest.databaseSchemaVersion) ||
        manifest.databaseSchemaVersion < 1
    )
        throw new Error('Invalid databaseSchemaVersion')
    if (!Array.isArray(manifest.files) || !Array.isArray(manifest.deletions))
        throw new Error('Update manifest file lists are invalid')
    return manifest
}

function validateFileList(zip: AdmZip, manifest: UpdateManifest) {
    const entries = zip
        .getEntries()
        .filter((entry) => !entry.isDirectory)
        .map((entry) => entry.entryName.replaceAll('\\', '/'))
    const declared = new Map<string, UpdateManifestFile>()
    for (const item of manifest.files) {
        const safe = normalizeUpdatePath(String(item.path ?? ''))
        if (forbiddenPayload.test(safe))
            throw new Error(
                `User data is forbidden in update packages: ${safe}`
            )
        if (declared.has(safe))
            throw new Error(`Duplicate update path: ${safe}`)
        if (!/^[0-9a-f]{64}$/.test(item.sha256))
            throw new Error(`Invalid SHA-256 for ${safe}`)
        if (!Number.isSafeInteger(item.size) || item.size < 0)
            throw new Error(`Invalid size for ${safe}`)
        declared.set(safe, item)
    }
    const deletions = new Set(manifest.deletions.map(normalizeUpdatePath))
    if (deletions.size !== manifest.deletions.length)
        throw new Error('Duplicate deletion path')
    for (const deletion of deletions) {
        if (forbiddenPayload.test(deletion))
            throw new Error(
                `User data is forbidden in update packages: ${deletion}`
            )
        if (declared.has(deletion))
            throw new Error(`Path cannot be replaced and deleted: ${deletion}`)
    }
    const payloadEntries = entries.filter(
        (entry) => entry !== 'update-manifest.json'
    )
    if (payloadEntries.length !== declared.size)
        throw new Error('Update package contains undeclared or missing files')
    for (const entryName of payloadEntries) {
        const safe = normalizeUpdatePath(entryName)
        const item = declared.get(safe)
        if (!item) throw new Error(`Undeclared update entry: ${safe}`)
        const entry = zip.getEntry(entryName)
        if (!entry) throw new Error(`Missing update entry: ${safe}`)
        const data = entry.getData()
        if (data.byteLength !== item.size || sha256(data) !== item.sha256)
            throw new Error(`Update file hash or size mismatch: ${safe}`)
    }
    const source = declared.get('SOURCE_SHA.txt')
    if (!source)
        throw new Error('SOURCE_SHA.txt must bind the update to source')
    const sourceEntry = zip.getEntry('SOURCE_SHA.txt')
    if (
        !sourceEntry ||
        sourceEntry.getData().toString('utf8').trim() !==
            manifest.targetSourceSha
    )
        throw new Error('SOURCE_SHA.txt does not match targetSourceSha')
    if (
        updaterSelfReplacement([...declared.keys(), ...deletions]) &&
        !manifest.requiresFullInstall
    )
        throw new Error('Updater replacement requires a full install')
    return declared
}

export interface UpdateManagerOptions {
    currentVersion: string
    currentSourceSha?: string
    applicationRoot: string
    stateRoot: string
    launcherPath: string
    runtimePath: string
    desktopEntryPath: string
    instanceFile: string
    fetchImplementation?: typeof fetch
}

function compatibilityRequiresFullInstall(manifest: UpdateManifest) {
    return (
        manifest.appApiVersion !== APP_API_VERSION ||
        manifest.databaseSchemaVersion < DATABASE_SCHEMA_VERSION ||
        manifest.databaseSchemaVersion > DATABASE_SCHEMA_VERSION + 1
    )
}

export class UpdateManager {
    private staged: StagedUpdate | null = null
    readonly progressFile: string

    constructor(private readonly options: UpdateManagerOptions) {
        this.progressFile = path.join(options.stateRoot, 'update-progress.json')
        fs.mkdirSync(options.stateRoot, { recursive: true })
    }

    progress(): UpdateProgress {
        try {
            return JSON.parse(
                fs.readFileSync(this.progressFile, 'utf8')
            ) as UpdateProgress
        } catch {
            return { phase: 'idle', updatedAt: new Date().toISOString() }
        }
    }

    private writeProgress(value: Omit<UpdateProgress, 'updatedAt'>) {
        fs.writeFileSync(
            this.progressFile,
            JSON.stringify({ ...value, updatedAt: new Date().toISOString() }),
            'utf8'
        )
    }

    private async verifyOfficialRelease(
        manifest: UpdateManifest,
        archiveName: string,
        archiveHash: string
    ) {
        const request = this.options.fetchImplementation ?? fetch
        const tag = `v${manifest.targetVersion}`
        const response = await request(
            `https://api.github.com/repos/${officialRepository}/releases/tags/${encodeURIComponent(tag)}`,
            {
                headers: {
                    accept: 'application/vnd.github+json',
                    'user-agent': 'Pica-Library-UpdateManager'
                },
                signal: AbortSignal.timeout(15_000)
            }
        )
        if (!response.ok)
            throw new Error('Official GitHub Release was not found')
        const release = (await response.json()) as {
            tag_name?: string
            assets?: Array<{
                name?: string
                digest?: string | null
                browser_download_url?: string
            }>
        }
        if (release.tag_name !== tag)
            throw new Error('Official release tag mismatch')
        const asset = release.assets?.find((item) => item.name === archiveName)
        if (!asset)
            throw new Error('Update asset is not in the official release')
        if (asset.digest === `sha256:${archiveHash}`) return
        const sums = release.assets?.find(
            (item) => item.name === 'SHA256SUMS.txt'
        )
        if (!sums?.browser_download_url)
            throw new Error('Official release has no verifiable SHA-256 digest')
        const sumsResponse = await request(sums.browser_download_url, {
            signal: AbortSignal.timeout(15_000)
        })
        if (!sumsResponse.ok)
            throw new Error('Official SHA256SUMS is unavailable')
        const expected = (await sumsResponse.text())
            .split(/\r?\n/)
            .map((line) => line.trim().split(/\s+/, 2))
            .find((parts) => parts[1]?.replace(/^\*/, '') === archiveName)?.[0]
        if (expected !== archiveHash)
            throw new Error(
                'Update archive does not match the official SHA-256'
            )
    }

    async checkForUpdate() {
        const request = this.options.fetchImplementation ?? fetch
        const response = await request(
            `https://api.github.com/repos/${officialRepository}/releases/latest`,
            {
                headers: {
                    accept: 'application/vnd.github+json',
                    'user-agent': 'Pica-Library-UpdateManager'
                },
                signal: AbortSignal.timeout(15_000)
            }
        )
        if (!response.ok)
            throw new Error('无法读取官方 GitHub Release。请稍后重试。')
        const release = (await response.json()) as {
            tag_name?: string
            html_url?: string
            draft?: boolean
            prerelease?: boolean
            assets?: Array<{
                name?: string
                browser_download_url?: string
            }>
        }
        const tag = String(release.tag_name ?? '')
        const version = tag.startsWith('v') ? tag.slice(1) : ''
        if (
            release.draft ||
            release.prerelease ||
            !stableVersionParts(version) ||
            !isNewerStable(version, this.options.currentVersion)
        )
            return {
                status: 'current' as const,
                currentVersion: this.options.currentVersion
            }
        const releaseUrl =
            release.html_url ??
            `https://github.com/${officialRepository}/releases/tag/${encodeURIComponent(tag)}`
        const updateAsset = release.assets?.find((item) =>
            /^Pica-Library-v\d+\.\d+\.\d+-update\.zip$/.test(
                String(item.name ?? '')
            )
        )
        if (!updateAsset?.name || !updateAsset.browser_download_url)
            return {
                status: 'full-install' as const,
                version,
                releaseUrl
            }
        return {
            status: 'incremental' as const,
            version,
            releaseUrl,
            assetName: updateAsset.name,
            assetUrl: updateAsset.browser_download_url
        }
    }

    async stage(archiveName: string, buffer: Buffer) {
        this.writeProgress({ phase: 'validating' })
        const archiveHash = sha256(buffer)
        const zip = new AdmZip(buffer)
        const manifest = readManifest(zip)
        if (
            compatibilityRequiresFullInstall(manifest) &&
            !manifest.requiresFullInstall
        )
            throw new Error(
                'Update API or database compatibility requires a full install'
            )
        if (
            !exactSourceMatches(
                manifest.sourceVersionRange,
                this.options.currentVersion
            )
        )
            throw new Error(
                'Update package does not support the installed version'
            )
        if (
            manifest.sourceSha &&
            this.options.currentSourceSha &&
            manifest.sourceSha !== this.options.currentSourceSha
        )
            throw new Error(
                'Update package does not support the installed source build'
            )
        if (manifest.packageType === 'local-test') {
            if (
                !prerelease(this.options.currentVersion) ||
                !prerelease(manifest.targetVersion)
            )
                throw new Error(
                    'Stable builds reject local-test update packages'
                )
        } else {
            try {
                await this.verifyOfficialRelease(
                    manifest,
                    archiveName,
                    archiveHash
                )
            } catch {
                throw new Error(
                    '无法验证更新包来自官方 GitHub Release。为安全起见，本次更新未执行。'
                )
            }
        }
        const declared = validateFileList(zip, manifest)
        const id = randomUUID()
        const directory = path.join(this.options.stateRoot, `staged-${id}`)
        fs.mkdirSync(directory, { recursive: true })
        this.writeProgress({
            phase: 'extracting',
            current: 0,
            total: declared.size,
            targetVersion: manifest.targetVersion
        })
        let current = 0
        for (const safe of declared.keys()) {
            const destination = path.join(directory, ...safe.split('/'))
            fs.mkdirSync(path.dirname(destination), { recursive: true })
            fs.writeFileSync(destination, zip.getEntry(safe)!.getData())
            current += 1
            this.writeProgress({
                phase: 'extracting',
                current,
                total: declared.size,
                targetVersion: manifest.targetVersion
            })
        }
        fs.writeFileSync(
            path.join(directory, 'update-manifest.json'),
            JSON.stringify(manifest, null, 2),
            'utf8'
        )
        this.staged = {
            id,
            archiveName,
            archiveSha256: archiveHash,
            directory,
            manifest,
            stagedAt: new Date().toISOString()
        }
        this.writeProgress({
            phase: 'staged',
            current: declared.size,
            total: declared.size,
            targetVersion: manifest.targetVersion
        })
        return {
            id,
            archiveName,
            archiveSha256: archiveHash,
            targetVersion: manifest.targetVersion,
            targetSourceSha: manifest.targetSourceSha,
            fileCount: manifest.files.length,
            deletionCount: manifest.deletions.length,
            databaseSchemaVersion: manifest.databaseSchemaVersion,
            requiresFullInstall: manifest.requiresFullInstall,
            packageType: manifest.packageType
        }
    }

    apply(id: string) {
        if (!this.staged || this.staged.id !== id)
            throw new Error('The staged update is no longer available')
        if (this.staged.manifest.requiresFullInstall)
            throw new Error('此更新需要完整安装包。')
        const instruction: UpdaterInstruction = {
            parentPid: process.pid,
            applicationRoot: this.options.applicationRoot,
            stagingRoot: this.staged.directory,
            backupRoot: path.join(
                this.options.stateRoot,
                `backup-${this.staged.id}`
            ),
            manifest: this.staged.manifest,
            launcherPath: this.options.launcherPath,
            runtimePath: this.options.runtimePath,
            desktopEntryPath: this.options.desktopEntryPath,
            instanceFile: this.options.instanceFile,
            progressFile: this.progressFile,
            healthTimeoutMs: 30_000
        }
        const instructionFile = path.join(
            this.options.stateRoot,
            `instruction-${this.staged.id}.json`
        )
        fs.writeFileSync(instructionFile, JSON.stringify(instruction), 'utf8')
        const updater = path.join(
            this.options.applicationRoot,
            'app',
            'updater.js'
        )
        if (!fs.existsSync(updater))
            throw new Error('Updater helper is missing')
        this.writeProgress({
            phase: 'waiting-for-exit',
            targetVersion: this.staged.manifest.targetVersion
        })
        const child = spawn(
            this.options.runtimePath,
            [updater, instructionFile],
            {
                detached: true,
                stdio: 'ignore',
                windowsHide: true,
                env: sanitizedChildEnv()
            }
        )
        child.unref()
        return {
            accepted: true,
            targetVersion: this.staged.manifest.targetVersion
        }
    }
}

export const updateInternals = {
    compatibilityRequiresFullInstall,
    exactSourceMatches,
    prerelease,
    stableVersionParts,
    isNewerStable,
    readManifest,
    validateFileList,
    sha256
}
