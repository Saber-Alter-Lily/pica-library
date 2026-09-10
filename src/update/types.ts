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
    appApiVersion: number
    databaseSchemaVersion: number
    requiresFullInstall: boolean
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
