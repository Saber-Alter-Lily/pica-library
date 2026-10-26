import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { SpawnOptions } from 'node:child_process'
import { startUpgradeHelper, UpgradeHelperStopError, type HelperReadiness, type UpgradeHelperKind } from './helper-startup'
import AdmZip from 'adm-zip'
import {
    APP_API_VERSION,
    DATABASE_SCHEMA_VERSION,
    UPDATE_MANIFEST_VERSION
} from '../app-capabilities'
import { sanitizedChildEnv } from '../desktop/child-process'
import { sqliteDiskFilename } from '../storage/sqlite/filename'
import { applicationFetch } from './application-fetch'
import { classifyUpdateCompatibility } from './compatibility'
import { MODULE_CONTRACT_PATH, normalizeModuleContracts, parseModuleContracts, runtimeModuleContracts, sameModuleContracts } from '../modules/contracts'
import { normalizeUpdatePath, updaterSelfReplacement, forbiddenUpdatePayload as forbiddenPayload } from './path-safety'
import { normalizeRuntimeComposition, RUNTIME_COMPOSITION_PATH, sameRuntimeComposition, type RuntimeComposition } from '../modules/runtime-composition'
import { validateFullApplicationArchive } from './full-archive'
import { extractValidatedFullApplication } from './full-application-staging'
import { installedRuntimeComposition, requireInstalledRuntimeComposition } from '../runtime/installed-runtime-composition'
import { validateAutomaticFullRuntimeComposition, validateIncrementalRuntimeComposition } from './runtime-composition'
import { RUNTIME_CHOICE_TTL_MS, runtimeChoiceComposition, validateRuntimeChoiceReceipt, validateRuntimeChoiceVersion, type RuntimeChoiceReceipt } from './runtime-choice'
import { discoverRuntimeChoiceRelease, type RuntimeChoiceRelease } from './runtime-choice-release'
import type { UpdatePackageDownload } from './download-task'
import {
    selectReleaseUpdateAsset,
    updateAssetNamesForChecksums,
    fullApplicationAssetName
} from './release-assets'
import {
    LEGACY_GENERIC_UPDATE_TARGET,
    isLegacyGenericUpdateTarget,
    normalizeUpdateTarget,
    sameUpdateTarget,
    updateTargetKey,
    type UpdateTarget
} from './target'
import type {
    FullApplicationUpdaterInstruction,
    StagedFullApplicationUpdate,
    StagedUpdate,
    UpdateManifest,
    UpdateManifestFile,
    UpdateProgress,
    UpdaterInstruction
} from './types'

const officialRepository = 'Saber-Alter-Lily/pica-library'

function sha256(value: Buffer | string) {
    return createHash('sha256').update(value).digest('hex')
}

function prerelease(version: string) {
    return /(?:^|[-.])(dev|alpha|beta|rc|postrc)(?:[.-]|\d|$)/i.test(version)
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

function manifestUpdateTarget(manifest: UpdateManifest) {
    const hasPlatform = manifest.targetPlatform !== undefined
    const hasArch = manifest.targetArch !== undefined
    if (hasPlatform !== hasArch)
        throw new Error(
            'Update manifest targetPlatform and targetArch must be declared together'
        )
    if (!hasPlatform) return null
    const target = normalizeUpdateTarget(
        manifest.targetPlatform,
        manifest.targetArch
    )
    if (!target) throw new Error('Update manifest target is unsupported')
    return target
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
    if (manifest.moduleContracts !== undefined)
        manifest.moduleContracts = normalizeModuleContracts(manifest.moduleContracts)
    if (manifest.runtimeComposition !== undefined)
        manifest.runtimeComposition = normalizeRuntimeComposition(manifest.runtimeComposition)
    manifestUpdateTarget(manifest)
    return manifest
}

function validateModulePayload(zip: AdmZip, manifest: UpdateManifest) {
    const moduleEntries = zip.getEntries().filter(entry => !entry.isDirectory && entry.entryName.replaceAll('\\', '/').toLowerCase() === MODULE_CONTRACT_PATH)
    if (moduleEntries.length > 1 || moduleEntries.some(entry => entry.entryName !== MODULE_CONTRACT_PATH))
        throw new Error('Runtime module payload must use the canonical path case')
    if (manifest.deletions.some(name => name.replaceAll('\\', '/').toLowerCase() === MODULE_CONTRACT_PATH))
        throw new Error('Module contracts cannot be removed by an incremental update')
    const entry = zip.getEntry(MODULE_CONTRACT_PATH)
    if (!manifest.moduleContracts) {
        if (entry) throw new Error('Module contract payload is not declared in the update manifest')
        return // Legacy manifests remain readable, but cannot silently replace the new metadata.
    }
    const target = entry ? parseModuleContracts(entry.getData().toString('utf8')) : runtimeModuleContracts()
    if (!sameModuleContracts(manifest.moduleContracts, target))
        throw new Error('Update module contracts do not match the target payload')
}

function validateFileList(zip: AdmZip, manifest: UpdateManifest) {
    const entries = zip
        .getEntries()
        .filter((entry) => !entry.isDirectory)
        .map((entry) => entry.entryName.replaceAll('\\', '/'))
    const declared = new Map<string, UpdateManifestFile>()
    const declaredIdentities = new Set<string>()
    for (const item of manifest.files) {
        const safe = normalizeUpdatePath(String(item.path ?? ''))
        if (forbiddenPayload.test(safe))
            throw new Error(
                `User data is forbidden in update packages: ${safe}`
            )
        if (declaredIdentities.has(safe.toUpperCase()))
            throw new Error(`Duplicate update path: ${safe}`)
        if (!/^[0-9a-f]{64}$/.test(item.sha256))
            throw new Error(`Invalid SHA-256 for ${safe}`)
        if (!Number.isSafeInteger(item.size) || item.size < 0)
            throw new Error(`Invalid size for ${safe}`)
        declared.set(safe, item)
        declaredIdentities.add(safe.toUpperCase())
    }
    const deletions = new Set(manifest.deletions.map(normalizeUpdatePath))
    if (new Set([...deletions].map(name=>name.toUpperCase())).size !== manifest.deletions.length)
        throw new Error('Duplicate deletion path')
    for (const deletion of deletions) {
        if (forbiddenPayload.test(deletion))
            throw new Error(
                `User data is forbidden in update packages: ${deletion}`
            )
        if (declaredIdentities.has(deletion.toUpperCase()))
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
    assistantRoot?: string
    launcherPath: string
    runtimePath: string
    desktopEntryPath: string
    instanceFile: string
    target?: UpdateTarget | null
    fetchImplementation?: typeof fetch
}

interface RuntimeChoicePlan {
    id:string; from:RuntimeComposition; to:RuntimeComposition; sourceSha:string
    release:RuntimeChoiceRelease; validUntil:number
}

export class UpdateManager {
    private staged: StagedUpdate | null = null
    private stagedFull: StagedFullApplicationUpdate | null = null
    private activeApply: {id:string;promise:Promise<{accepted:true;mode:UpgradeHelperKind;targetVersion:string}>}|null=null
    private preparationEpoch=0
    private runtimePlanRevision=0
    private runtimeChoicePlan:RuntimeChoicePlan|null=null
    readonly progressFile: string

    constructor(private readonly options: UpdateManagerOptions) {
        this.progressFile = path.join(options.stateRoot, 'update-progress.json')
        fs.mkdirSync(options.stateRoot, { recursive: true })
    }

    private persistentAssistantRoot() {
        return (
            this.options.assistantRoot ??
            path.join(path.dirname(this.options.stateRoot), 'upgrade-assistant')
        )
    }

    preparePersistentUpgradeAssistant(
        options: { verifyExisting?: boolean } = {}
    ) {
        const target = this.updateTarget()
        if (!target || updateTargetKey(target) !== 'windows-x64')
            return {
                available: false as const,
                reason: 'unsupported-target'
            }

        const sourceRuntime = this.options.runtimePath
        const sourceHelper = path.join(
            this.options.applicationRoot,
            'app',
            'full-upgrader.js'
        )
        if (!fs.existsSync(sourceRuntime))
            throw new Error(
                'Bundled runtime is unavailable for the persistent upgrade assistant'
            )
        if (!fs.existsSync(sourceHelper))
            throw new Error(
                'Full application upgrade helper is unavailable for persistent registration'
            )

        const root = this.persistentAssistantRoot()
        const applicationRoot = path.resolve(this.options.applicationRoot)
        const assistantRoot = path.resolve(root)
        const assistantRelative = path.relative(
            applicationRoot,
            assistantRoot
        )
        if (
            assistantRoot === applicationRoot ||
            (!assistantRelative.startsWith('..' + path.sep) &&
                assistantRelative !== '..' &&
                !path.isAbsolute(assistantRelative))
        )
            throw new Error(
                'Persistent upgrade assistant must be outside the application directory'
            )

        const runtimeDirectory = path.join(root, 'runtime')
        const runtimePath = path.join(runtimeDirectory, 'node.exe')
        const helperPath = path.join(root, 'full-upgrader.js')
        const metadataPath = path.join(root, 'assistant.json')
        const currentIdentity = {
            schemaVersion: 1,
            productVersion: this.options.currentVersion,
            sourceSha: this.options.currentSourceSha ?? null
        }

        const existingMetadata = (() => {
            try {
                const value = JSON.parse(
                    fs.readFileSync(metadataPath, 'utf8')
                ) as Record<string, unknown>
                if (
                    value.schemaVersion !== currentIdentity.schemaVersion ||
                    value.productVersion !== currentIdentity.productVersion ||
                    value.sourceSha !== currentIdentity.sourceSha ||
                    typeof value.runtimeSha256 !== 'string' ||
                    typeof value.helperSha256 !== 'string' ||
                    typeof value.installedAt !== 'string'
                )
                    return null
                return {
                    ...currentIdentity,
                    runtimeSha256: value.runtimeSha256,
                    helperSha256: value.helperSha256,
                    installedAt: value.installedAt
                }
            } catch {
                return null
            }
        })()

        const result = (metadata: {
            schemaVersion: number
            productVersion: string
            sourceSha: string | null
            runtimeSha256: string
            helperSha256: string
            installedAt: string
        }) => ({
            available: true as const,
            root,
            runtimePath,
            helperPath,
            metadataPath,
            ...metadata
        })

        if (
            existingMetadata &&
            fs.existsSync(runtimePath) &&
            fs.existsSync(helperPath)
        ) {
            if (!options.verifyExisting) return result(existingMetadata)

            const runtimeSha256 = sha256(fs.readFileSync(runtimePath))
            const helperSha256 = sha256(fs.readFileSync(helperPath))
            const externalGood =
                runtimeSha256 === existingMetadata.runtimeSha256 &&
                helperSha256 === existingMetadata.helperSha256
            if (externalGood) return result(existingMetadata)

            const sourceRuntimeSha256 = sha256(
                fs.readFileSync(sourceRuntime)
            )
            const sourceHelperSha256 = sha256(
                fs.readFileSync(sourceHelper)
            )
            const installedGood =
                sourceRuntimeSha256 === existingMetadata.runtimeSha256 &&
                sourceHelperSha256 === existingMetadata.helperSha256
            if (!installedGood)
                throw new Error(
                    'Persistent and installed upgrade assistants both failed verification'
                )
        }

        fs.mkdirSync(runtimeDirectory, { recursive: true })
        const sourceRuntimeSha256 = sha256(fs.readFileSync(sourceRuntime))
        const sourceHelperSha256 = sha256(fs.readFileSync(sourceHelper))
        if (existingMetadata && options.verifyExisting) {
            if (
                sourceRuntimeSha256 !== existingMetadata.runtimeSha256 ||
                sourceHelperSha256 !== existingMetadata.helperSha256
            )
                throw new Error(
                    'Installed upgrade assistant no longer matches the registered release identity'
                )
        }
        const installFile = (
            source: string,
            destination: string,
            expectedSha256: string
        ) => {
            const temporary = destination + '.next'
            fs.rmSync(temporary, { force: true })
            fs.copyFileSync(source, temporary)
            const actual = sha256(fs.readFileSync(temporary))
            if (actual !== expectedSha256) {
                fs.rmSync(temporary, { force: true })
                throw new Error(
                    'Persistent upgrade assistant copy verification failed'
                )
            }
            fs.rmSync(destination, { force: true })
            fs.renameSync(temporary, destination)
        }

        installFile(sourceRuntime, runtimePath, sourceRuntimeSha256)
        installFile(sourceHelper, helperPath, sourceHelperSha256)
        const metadata = {
            ...currentIdentity,
            runtimeSha256: sourceRuntimeSha256,
            helperSha256: sourceHelperSha256,
            installedAt: new Date().toISOString()
        }
        const temporaryMetadata = metadataPath + '.next'
        fs.writeFileSync(
            temporaryMetadata,
            JSON.stringify(metadata, null, 2),
            'utf8'
        )
        fs.rmSync(metadataPath, { force: true })
        fs.renameSync(temporaryMetadata, metadataPath)
        return result(metadata)
    }

    private updateTarget() {
        // Omitted target preserves the historical Windows x64 behavior for
        // tests and old internal callers. Production Desktop passes an
        // explicit runtime target (or null when unsupported).
        return this.options.target === undefined
            ? LEGACY_GENERIC_UPDATE_TARGET
            : this.options.target
    }

    progress(): UpdateProgress {
        try {
            const value = JSON.parse(
                fs.readFileSync(this.progressFile, 'utf8')
            ) as UpdateProgress
            if (
                value.phase === 'complete' &&
                value.targetVersion === this.options.currentVersion
            )
                return { phase: 'idle', updatedAt: value.updatedAt }
            return value
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

    private requirePreparation(epoch:number) {
        if(this.activeApply || epoch!==this.preparationEpoch) throw Error('Update preparation was superseded; select the intended update again')
    }

    private installedChoiceSource() {
        const sha=fs.readFileSync(path.join(this.options.applicationRoot,'SOURCE_SHA.txt'),'utf8').trim()
        if(!/^[a-f0-9]{40}$/.test(sha) || this.options.currentSourceSha!==undefined && sha!==this.options.currentSourceSha) throw Error('Installed application source changed; restart before selecting components')
        return sha
    }

    async planRuntimeChoice(choice:unknown,signal?:AbortSignal) {
        if(this.activeApply)throw Error('An update is already being applied')
        const target=this.updateTarget()
        if(!target || updateTargetKey(target)!=='windows-x64')throw Error('Optional runtime replacement is currently supported only on Windows x64')
        validateRuntimeChoiceVersion(this.options.currentVersion,this.options.currentVersion)
        const from=requireInstalledRuntimeComposition(this.options.applicationRoot),to=runtimeChoiceComposition(choice)
        const revision=++this.runtimePlanRevision;this.runtimeChoicePlan=null
        if(sameRuntimeComposition(from,to))return{status:'unchanged' as const,composition:from}
        const sourceSha=this.installedChoiceSource()
        const release=await discoverRuntimeChoiceRelease(to,this.options.fetchImplementation??applicationFetch,signal)
        if(signal?.aborted || this.activeApply || revision!==this.runtimePlanRevision)throw Error('Runtime component preview was cancelled or superseded')
        validateRuntimeChoiceVersion(this.options.currentVersion,release.version)
        const plan:RuntimeChoicePlan={id:randomUUID(),from,to,sourceSha,release,validUntil:Date.now()+RUNTIME_CHOICE_TTL_MS}
        this.runtimeChoicePlan=plan
        return{status:'preview' as const,id:plan.id,from:normalizeRuntimeComposition(from),to:normalizeRuntimeComposition(to),
            version:release.version,archiveName:release.archiveName,archiveSha256:release.sha256,bytes:release.bytes,validUntil:plan.validUntil,
            replacement:'complete-application',sourceEnablement:'unchanged',accountsAndData:'retained',restartRequired:true}
    }

    async prepareRuntimeChoice(id:string,download:UpdatePackageDownload,signal?:AbortSignal) {
        if(this.activeApply)throw Error('An update is already being applied')
        const plan=this.runtimeChoicePlan
        if(!plan || plan.id!==id || plan.validUntil<=Date.now() || signal?.aborted)throw Error('Runtime component preview expired; preview and confirm again')
        this.runtimeChoicePlan=null // Consume once, before any asynchronous download.
        if(this.installedChoiceSource()!==plan.sourceSha || !sameRuntimeComposition(requireInstalledRuntimeComposition(this.options.applicationRoot),plan.from))throw Error('Installed runtime changed after preview')
        const epoch=++this.preparationEpoch
        const bytes=await download(plan.release.url,plan.release.version)
        if(signal?.aborted)throw Error('Runtime component selection was cancelled')
        this.requirePreparation(epoch)
        if(sha256(bytes)!==plan.release.sha256)throw Error('Runtime package changed after preview; preview and confirm again')
        return this.stageCompleteApplication(plan.release.version,plan.release.archiveName,bytes,epoch,plan,signal)
    }

    private async verifyOfficialArchive(
        version: string,
        archiveName: string,
        archiveHash: string
    ) {
        const request = this.options.fetchImplementation ?? applicationFetch
        const tag = `v${version}`
        try {
            const response = await request(
                `https://api.github.com/repos/${officialRepository}/releases/tags/${encodeURIComponent(tag)}`,
                {
                    headers: {
                        accept: 'application/vnd.github+json',
                        'user-agent': 'Pica-Library-UpdateManager'
                    },
                    signal: AbortSignal.timeout(12_000)
                }
            )
            if (response.ok) {
                const release = (await response.json()) as {
                    tag_name?: string
                    draft?: boolean
                    prerelease?: boolean
                    assets?: Array<{
                        name?: string
                        digest?: string | null
                        browser_download_url?: string
                    }>
                }
                if (release.tag_name !== tag)
                    throw new Error('Official release tag mismatch')
                if (release.draft || release.prerelease)
                    throw new Error(
                        'Official release must be a published stable release'
                    )
                const asset = release.assets?.find(
                    (item) => item.name === archiveName
                )
                if (!asset)
                    throw new Error(
                        'Update asset is not in the official release'
                    )
                if (asset.digest === `sha256:${archiveHash}`) return
                const sums = release.assets?.find(
                    (item) => item.name === 'SHA256SUMS.txt'
                )
                if (sums?.browser_download_url) {
                    const sumsResponse = await request(
                        sums.browser_download_url,
                        { signal: AbortSignal.timeout(12_000) }
                    )
                    if (sumsResponse.ok) {
                        const expected = this.shaFromSums(
                            await sumsResponse.text(),
                            archiveName
                        )
                        if (expected === archiveHash) return
                    }
                }
            }
        } catch {
            // Fall through to the GitHub-hosted checksum path below.
        }

        const sumsUrl =
            `https://github.com/${officialRepository}/releases/download/${encodeURIComponent(tag)}/SHA256SUMS.txt`
        const sumsResponse = await request(sumsUrl, {
            headers: { 'user-agent': 'Pica-Library-UpdateManager' },
            signal: AbortSignal.timeout(12_000)
        })
        if (!sumsResponse.ok)
            throw new Error('Official release checksum is unavailable')
        const expected = this.shaFromSums(
            await sumsResponse.text(),
            archiveName
        )
        if (expected !== archiveHash)
            throw new Error(
                'Update archive does not match the official SHA-256'
            )
    }

    private async verifyOfficialRelease(
        manifest: UpdateManifest,
        archiveName: string,
        archiveHash: string
    ) {
        await this.verifyOfficialArchive(
            manifest.targetVersion,
            archiveName,
            archiveHash
        )
    }

    private shaFromSums(text: string, archiveName: string) {
        return text
            .split(/\r?\n/)
            .map((line) => line.trim().split(/\s+/, 2))
            .find((parts) => parts[1]?.replace(/^\*/, '') === archiveName)?.[0]
    }

    private availableFromRelease(
        version: string,
        releaseUrl: string,
        assetName?: string,
        assetUrl?: string,
        fullAssetName?: string,
        fullAssetUrl?: string
    ) {
        if (
            !stableVersionParts(version) ||
            !isNewerStable(version, this.options.currentVersion)
        )
            return {
                status: 'current' as const,
                currentVersion: this.options.currentVersion
            }
        if (!assetName || !assetUrl) {
            if (fullAssetName && fullAssetUrl)
                return {
                    status: 'full-install' as const,
                    version,
                    releaseUrl,
                    assetName: fullAssetName,
                    assetUrl: fullAssetUrl,
                    oneClick: true
                }
            return {
                status: 'full-install' as const,
                version,
                releaseUrl
            }
        }
        return {
            status: 'incremental' as const,
            version,
            releaseUrl,
            assetName,
            assetUrl
        }
    }

    async checkForUpdate() {
        this.writeProgress({ phase: 'idle' })
        // Invalid installed packaging facts must not be mislabeled as a network outage.
        const composition = requireInstalledRuntimeComposition(this.options.applicationRoot)
        const request = this.options.fetchImplementation ?? applicationFetch
        try {
            const response = await request(
                `https://api.github.com/repos/${officialRepository}/releases/latest`,
                {
                    headers: {
                        accept: 'application/vnd.github+json',
                        'user-agent': 'Pica-Library-UpdateManager'
                    },
                    signal: AbortSignal.timeout(12_000)
                }
            )
            if (response.ok) {
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
                if (!release.draft && !release.prerelease) {
                    const releaseUrl = release.html_url ??
                        `https://github.com/${officialRepository}/releases/tag/${encodeURIComponent(tag)}`
                    const target = this.updateTarget()
                    const updateAsset = target
                        ? selectReleaseUpdateAsset(
                              release.assets,
                              version,
                              this.options.currentVersion,
                              target,
                              composition
                          )
                        : null
                    const fullAssetName =
                        target &&
                        updateTargetKey(target) === 'windows-x64'
                            ? fullApplicationAssetName(version, target, composition)
                            : undefined
                    const fullAsset = fullAssetName
                        ? release.assets?.find(
                              (item) => item.name === fullAssetName
                          )
                        : undefined
                    return this.availableFromRelease(
                        version,
                        releaseUrl,
                        updateAsset?.name,
                        updateAsset?.url,
                        fullAsset?.name,
                        fullAsset?.browser_download_url
                    )
                }
            }
        } catch {
            // GitHub REST may be rate-limited or blocked while release assets remain reachable.
        }

        try {
            const sumsResponse = await request(
                `https://github.com/${officialRepository}/releases/latest/download/SHA256SUMS.txt`,
                {
                    headers: { 'user-agent': 'Pica-Library-UpdateManager' },
                    signal: AbortSignal.timeout(12_000)
                }
            )
            if (!sumsResponse.ok) throw new Error('checksum fallback unavailable')
            const finalUrl = sumsResponse.url || ''
            const match = finalUrl.match(/\/releases\/download\/v(\d+\.\d+\.\d+)\/SHA256SUMS\.txt(?:\?|$)/)
            if (!match) throw new Error('could not resolve latest version from checksum redirect')
            const version = match[1]
            const sums = await sumsResponse.text()
            const target = this.updateTarget()
            const assetName = target
                ? updateAssetNamesForChecksums(
                      version,
                      this.options.currentVersion,
                      target,
                      composition
                  ).find((name) => this.shaFromSums(sums, name))
                : undefined
            const releaseUrl = `https://github.com/${officialRepository}/releases/tag/v${version}`
            const fullAssetName =
                target &&
                updateTargetKey(target) === 'windows-x64'
                    ? fullApplicationAssetName(version, target, composition)
                    : undefined
            const verifiedFullAssetName =
                fullAssetName && this.shaFromSums(sums, fullAssetName)
                    ? fullAssetName
                    : undefined
            return this.availableFromRelease(
                version,
                releaseUrl,
                assetName,
                assetName
                    ? `https://github.com/${officialRepository}/releases/download/v${version}/${assetName}`
                    : undefined,
                verifiedFullAssetName,
                verifiedFullAssetName
                    ? `https://github.com/${officialRepository}/releases/download/v${version}/${verifiedFullAssetName}`
                    : undefined
            )
        } catch {
            const message =
                '无法读取官方更新通道。GitHub API 与 Release 下载通道均不可用，请检查网络或代理后重试。'
            this.writeProgress({ phase: 'failed', message })
            throw new Error(message)
        }
    }

    async stage(archiveName: string, buffer: Buffer) {
        if(this.activeApply)throw new Error('An update is already being applied')
        const epoch=++this.preparationEpoch
        this.writeProgress({ phase: 'validating' })
        try {
            const archiveHash = sha256(buffer)
        const zip = new AdmZip(buffer)
        const manifest = readManifest(zip)
        const composition = requireInstalledRuntimeComposition(this.options.applicationRoot)
        const installedTarget = this.updateTarget()
        if (!installedTarget)
            throw new Error(
                'Automatic updates are not supported on this OS/architecture'
            )
        const packageTarget = manifestUpdateTarget(manifest)
        if (packageTarget) {
            if (!sameUpdateTarget(packageTarget, installedTarget))
                throw new Error(
                    `Update package targets ${updateTargetKey(packageTarget)}; installed runtime is ${updateTargetKey(installedTarget)}`
                )
        } else if (!isLegacyGenericUpdateTarget(installedTarget)) {
            throw new Error(
                'Legacy update packages without target metadata are supported only on windows-x64'
            )
        }
        const compatibility = classifyUpdateCompatibility({
            currentAppApiVersion: APP_API_VERSION,
            currentDatabaseSchemaVersion: DATABASE_SCHEMA_VERSION,
            targetAppApiVersion: manifest.appApiVersion,
            targetDatabaseSchemaVersion: manifest.databaseSchemaVersion,
            currentModuleContracts: runtimeModuleContracts(),
            targetModuleContracts: manifest.moduleContracts,
            currentRuntimeComposition: composition,
            targetRuntimeComposition: manifest.runtimeComposition,
            updaterHelperChanged: updaterSelfReplacement([
                ...manifest.files.map((item) => String(item.path ?? '')),
                ...manifest.deletions
            ])
        })
        if (compatibility.kind === 'UNSUPPORTED')
            throw new Error(
                'Database schema downgrade is not supported by automatic updates'
            )
        if (
            compatibility.kind === 'FULL_APPLICATION' &&
            !manifest.requiresFullInstall
        )
            throw new Error(
                compatibility.reason === 'UPDATER_HELPER_CHANGED'
                    ? 'Updater replacement requires a full install'
                    : 'Update compatibility requires a full application install'
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
            if (
                stableVersionParts(this.options.currentVersion) &&
                (!stableVersionParts(manifest.targetVersion) ||
                    !isNewerStable(
                        manifest.targetVersion,
                        this.options.currentVersion
                    ))
            )
                throw new Error(
                    'Stable builds require a strictly newer stable target version'
                )
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
        validateModulePayload(zip, manifest)
        validateIncrementalRuntimeComposition({ current: composition, target: manifest.runtimeComposition,
            files: manifest.files.map(file => file.path), deletions: manifest.deletions,
            descriptor: zip.getEntry(RUNTIME_COMPOSITION_PATH)?.getData().toString('utf8') })
        this.requirePreparation(epoch)
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
        this.stagedFull = null
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
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            if(epoch===this.preparationEpoch&&!this.activeApply)this.writeProgress({ phase: 'failed', message })
            throw error
        }
    }

    async stageFullApplication(
        version: string,
        archiveName: string,
        buffer: Buffer
    ) {
        if(this.activeApply)throw new Error('An update is already being applied')
        return this.stageCompleteApplication(version,archiveName,buffer,++this.preparationEpoch)
    }

    private async stageCompleteApplication(version:string,archiveName:string,buffer:Buffer,epoch:number,choice?:RuntimeChoicePlan,signal?:AbortSignal) {
        if(this.activeApply)throw new Error('An update is already being applied')
        this.writeProgress({ phase: 'validating' })
        try {
            const target = this.updateTarget()
            if (!target || updateTargetKey(target) !== 'windows-x64')
                throw new Error(
                    'One-click full application upgrade is currently supported only on Windows x64'
                )
            if (choice) validateRuntimeChoiceVersion(this.options.currentVersion,version)
            else if (
                !stableVersionParts(version) ||
                !isNewerStable(version, this.options.currentVersion)
            )
                throw new Error(
                    'Full application upgrade requires a newer stable version'
                )
            const composition = requireInstalledRuntimeComposition(this.options.applicationRoot)
            const expectedName = fullApplicationAssetName(version, target, choice?.to??composition)
            if (archiveName !== expectedName)
                throw new Error(
                    'Unexpected full application package name'
                )
            const archiveHash = sha256(buffer)
            await this.verifyOfficialArchive(
                version,
                archiveName,
                archiveHash
            )
            const zip = new AdmZip(buffer)
            const validated = validateFullApplicationArchive(zip)
            if(signal?.aborted)throw Error('Runtime component selection was cancelled')
            let runtimeChoice:RuntimeChoiceReceipt|undefined
            if(choice){
                if(!validated.declared.has(RUNTIME_COMPOSITION_PATH))throw Error('Explicit runtime replacement requires declared target composition')
                runtimeChoice={kind:'user-selected-runtime-composition',id:choice.id,from:choice.from,to:choice.to,sourceSha:choice.sourceSha,
                    sourceVersion:this.options.currentVersion,targetSourceSha:validated.sourceSha,targetVersion:version,archiveName,archiveSha256:archiveHash,validUntil:choice.validUntil}
                validateRuntimeChoiceReceipt(runtimeChoice,{current:composition,staged:validated.composition,sourceSha:this.installedChoiceSource(),targetSourceSha:validated.sourceSha,targetVersion:version,
                    expectedArchiveName:choice.release.archiveName,expectedArchiveSha256:choice.release.sha256})
            }else validateAutomaticFullRuntimeComposition(composition, validated.composition)
            this.requirePreparation(epoch)
            const id = randomUUID()
            const directory = path.join(
                this.options.stateRoot,
                `full-staged-${id}`,
                'application'
            )
            fs.mkdirSync(path.dirname(directory), { recursive: true })
            extractValidatedFullApplication(validated, directory, (current, total) => {
                this.writeProgress({
                    phase: 'extracting',
                    current,
                    total,
                    targetVersion: version
                })
            })
            this.staged = null
            this.stagedFull = {
                id,
                archiveName,
                archiveSha256: archiveHash,
                directory,
                targetVersion: version,
                targetSourceSha: validated.sourceSha,
                runtimeComposition: validated.composition,
                ...(runtimeChoice?{runtimeChoice}:{}),
                stagedAt: new Date().toISOString()
            }
            this.writeProgress({
                phase: 'staged',
                current: validated.declared.size,
                total: validated.declared.size,
                targetVersion: version
            })
            return {
                id,
                mode: 'full-application' as const,
                archiveName,
                archiveSha256: archiveHash,
                targetVersion: version,
                targetSourceSha: validated.sourceSha,
                fileCount: validated.declared.size,
                deletionCount: 0,
                requiresFullInstall: true,
                oneClick: true,
                ...(runtimeChoice?{expectedRuntimeComposition:normalizeRuntimeComposition(validated.composition)}:{})
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error)
            if(epoch===this.preparationEpoch&&!this.activeApply)this.writeProgress({ phase: 'failed', message })
            throw error
        }
    }

    private launchApply(id:string,kind:UpgradeHelperKind,targetVersion:string,executable:string,args:string[],options:Pick<SpawnOptions,'cwd'|'env'>,instruction:HelperReadiness){
        const promise=startUpgradeHelper(executable,args,options,instruction,kind)
            .then(()=>({accepted:true as const,mode:kind,targetVersion}))
            .catch(error=>{
                // A failed helper must not close the current app or hide the original failure.
                try{this.writeProgress({phase:'failed',targetVersion,message:error instanceof Error?error.message:String(error)})}catch{/* App remains running even if its status store is unavailable. */}
                if(!(error instanceof UpgradeHelperStopError)&&this.activeApply?.id===id)this.activeApply=null
                throw error
            })
        this.activeApply={id,promise}
        return promise
    }

    apply(
        id: string,
        context?: {
            desktopHomeRoot: string
            libraryDirectory: string
            currentUrl?: string
        }
    ) {
        if(this.activeApply){
            if(this.activeApply.id!==id)throw new Error('An update is already being applied')
            return this.activeApply.promise
        }
        if (this.stagedFull?.id === id) {
            if (!context)
                throw new Error(
                    'Full application upgrade context is unavailable'
                )
            // Fail before preparing a helper or asking the live app to exit.
            sqliteDiskFilename(path.resolve(context.libraryDirectory, 'library.db'))
            const full = this.stagedFull
            if(full.runtimeChoice && installedRuntimeComposition(full.directory).status!=='declared')throw Error('Explicit runtime target declaration changed after staging')
            if(full.runtimeChoice)validateRuntimeChoiceReceipt(full.runtimeChoice,{
                current:requireInstalledRuntimeComposition(this.options.applicationRoot),staged:requireInstalledRuntimeComposition(full.directory),sourceSha:this.installedChoiceSource(),
                targetSourceSha:fs.readFileSync(path.join(full.directory,'SOURCE_SHA.txt'),'utf8').trim(),targetVersion:full.targetVersion,expectedArchiveName:full.archiveName,expectedArchiveSha256:full.archiveSha256
            })
            else validateAutomaticFullRuntimeComposition(requireInstalledRuntimeComposition(this.options.applicationRoot),requireInstalledRuntimeComposition(full.directory),full.runtimeComposition)
            ++this.preparationEpoch
            const persistentAssistant =
                this.preparePersistentUpgradeAssistant({
                    verifyExisting: true
                })
            if (!persistentAssistant.available)
                throw new Error(
                    'Persistent upgrade assistant is unavailable on this target'
                )
            const bootstrapRoot = path.join(
                this.options.stateRoot,
                `bootstrap-${full.id}`
            )
            fs.rmSync(bootstrapRoot, {
                recursive: true,
                force: true
            })
            fs.mkdirSync(bootstrapRoot, { recursive: true })
            const bootstrapRuntime = path.join(
                bootstrapRoot,
                'node.exe'
            )
            const bootstrapHelper = path.join(
                bootstrapRoot,
                'full-upgrader.js'
            )
            fs.copyFileSync(
                persistentAssistant.runtimePath,
                bootstrapRuntime
            )
            fs.copyFileSync(
                persistentAssistant.helperPath,
                bootstrapHelper
            )
            if (
                sha256(fs.readFileSync(bootstrapRuntime)) !==
                    persistentAssistant.runtimeSha256 ||
                sha256(fs.readFileSync(bootstrapHelper)) !==
                    persistentAssistant.helperSha256
            )
                throw new Error(
                    'Detached upgrade bootstrap does not match the persistent assistant'
                )

            const stamp = new Date()
                .toISOString()
                .replace(/[:.]/g, '-')
            const backupRoot = path.join(
                path.dirname(this.options.applicationRoot),
                `${path.basename(
                    this.options.applicationRoot
                )}.backup-before-v${full.targetVersion}-${stamp}`
            )
            const readyNonce=randomUUID()
            const instruction: FullApplicationUpdaterInstruction = {
                readyNonce,
                readyFile:path.join(bootstrapRoot,`helper-ready-${readyNonce}.json`),
                parentPid: process.pid,
                applicationRoot: this.options.applicationRoot,
                stagedApplicationRoot: full.directory,
                backupRoot,
                bootstrapRoot,
                desktopHomeRoot: context.desktopHomeRoot,
                libraryDirectory: context.libraryDirectory,
                instanceFile: this.options.instanceFile,
                progressFile: this.progressFile,
                targetVersion: full.targetVersion,
                targetSourceSha: full.targetSourceSha,
                runtimeComposition: full.runtimeComposition,
                ...(full.runtimeChoice?{runtimeChoice:full.runtimeChoice}:{}),
                previousUrl: context.currentUrl,
                healthTimeoutMs: 60_000
            }
            const instructionFile = path.join(
                bootstrapRoot,
                'instruction.json'
            )
            fs.writeFileSync(
                instructionFile,
                JSON.stringify(instruction),
                'utf8'
            )
            this.writeProgress({
                phase: 'waiting-for-exit',
                targetVersion: full.targetVersion
            })
            return this.launchApply(id,'full-application',full.targetVersion,
                bootstrapRuntime,
                [bootstrapHelper, instructionFile],
                {
                    cwd: bootstrapRoot,
                    env: sanitizedChildEnv()
                },instruction
            )
        }

        if (!this.staged || this.staged.id !== id)
            throw new Error(
                'The staged update is no longer available'
            )
        if (this.staged.manifest.requiresFullInstall)
            throw new Error(
                'This update requires the full application upgrade path'
            )
        if(!context)throw new Error('Incremental application upgrade context is unavailable')
        ++this.preparationEpoch
        sqliteDiskFilename(path.resolve(context.libraryDirectory,'library.db'))
        const readyNonce=randomUUID()
        const instruction: UpdaterInstruction = {
            desktopHomeRoot:context.desktopHomeRoot,
            libraryDirectory:context.libraryDirectory,
            readyNonce,
            readyFile:path.join(this.options.stateRoot,`helper-ready-${readyNonce}.json`),
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
        fs.writeFileSync(
            instructionFile,
            JSON.stringify(instruction),
            'utf8'
        )
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
        return this.launchApply(id,'incremental',this.staged.manifest.targetVersion,
            this.options.runtimePath,
            [updater, instructionFile],
            {
                cwd:this.options.applicationRoot,
                env: sanitizedChildEnv()
            },instruction
        )
    }
}

export const updateInternals = {
    classifyUpdateCompatibility,
    exactSourceMatches,
    prerelease,
    stableVersionParts,
    isNewerStable,
    readManifest,
    manifestUpdateTarget,
    validateFileList,
    validateModulePayload,
    sha256
}
