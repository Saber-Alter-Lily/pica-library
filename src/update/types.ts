import type { RuntimeModuleContracts } from '../modules/contracts'
import type { RuntimeComposition } from '../modules/runtime-composition'

export type UpdatePackageType = 'incremental' | 'local-test'

export interface UpdateManifestFile {
    path: string
    sha256: string
    size: number
    category?: string
}

export interface UpdateManifest {
    manifestVersion: number
    packageType: UpdatePackageType
    sourceVersionRange: string
    sourceSha?: string
    targetVersion: string
    targetSourceSha: string
    targetPlatform?: 'windows' | 'macos' | 'linux'
    targetArch?: 'x64' | 'arm64'
    appApiVersion: number
    databaseSchemaVersion: number
    requiresFullInstall: boolean
    /** Optional for legacy packages. New builders bind this to the actual payload. */
    moduleContracts?: RuntimeModuleContracts
    /** Packaging facts bound to the actual payload; not source-enable state. */
    runtimeComposition?: RuntimeComposition
    files: UpdateManifestFile[]
    deletions: string[]
}

export interface StagedUpdate {
    id: string
    archiveName: string
    archiveSha256: string
    directory: string
    manifest: UpdateManifest
    stagedAt: string
}

export interface StagedFullApplicationUpdate {
    id: string
    archiveName: string
    archiveSha256: string
    directory: string
    targetVersion: string
    targetSourceSha: string
    runtimeComposition: RuntimeComposition
    stagedAt: string
}

export type UpdatePhase =
    | 'idle'
    | 'validating'
    | 'extracting'
    | 'staged'
    | 'preparing-backup'
    | 'waiting-for-exit'
    | 'replacing-files'
    | 'starting'
    | 'health-check'
    | 'rollback'
    | 'complete'
    | 'failed'

export interface UpdateProgress {
    phase: UpdatePhase
    current?: number
    total?: number
    targetVersion?: string
    message?: string
    updatedAt: string
}

export interface UpdaterInstruction {
    desktopHomeRoot: string
    libraryDirectory: string
    readyFile?: string
    readyNonce?: string
    parentPid: number
    applicationRoot: string
    stagingRoot: string
    backupRoot: string
    manifest: UpdateManifest
    launcherPath: string
    runtimePath: string
    desktopEntryPath: string
    instanceFile: string
    progressFile: string
    healthTimeoutMs: number
}

export interface FullApplicationUpdaterInstruction {
    readyFile?: string
    readyNonce?: string
    parentPid: number
    applicationRoot: string
    stagedApplicationRoot: string
    backupRoot: string
    bootstrapRoot: string
    desktopHomeRoot: string
    libraryDirectory: string
    instanceFile: string
    progressFile: string
    targetVersion: string
    targetSourceSha: string
    /** Optional only for legacy instructions; never an instruction to change components. */
    runtimeComposition?: RuntimeComposition
    previousUrl?: string
    healthTimeoutMs: number
}
