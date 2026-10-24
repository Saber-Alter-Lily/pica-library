import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import {
    normalizeUpdatePath,
    resolveUpdatePath,
    updaterSelfReplacement,
    forbiddenUpdatePayload
} from './path-safety'
import {
    writeProgress,
    reportRecoveryProgress,
    waitForExit,
    launchDetached,
    health,
    stopPublishedInstance
} from './process-lifecycle'
import { snapshotUserState, restoreUserState } from './user-state-snapshot'
import { prepareHelperStartup } from './helper-startup'
import { sqliteDiskFilename } from '../storage/sqlite/filename'
import type { UpdaterInstruction } from './types'

function canonical(value: string): string {
    let parent = path.resolve(value)
    const tail: string[] = []
    while (!fs.existsSync(parent)) {
        const next = path.dirname(parent)
        if (next === parent)
            throw new Error(
                'Update directory has no existing filesystem ancestor'
            )
        tail.unshift(path.basename(parent))
        parent = next
    }
    return path.resolve(fs.realpathSync.native(parent), ...tail)
}
function inside(child: string, parent: string) {
    const relative = path.relative(parent, child)
    return (
        relative === '' ||
        (!relative.startsWith('..' + path.sep) &&
            relative !== '..' &&
            !path.isAbsolute(relative))
    )
}
function assertDisjoint(first: string, second: string, label: string) {
    if (
        inside(canonical(first), canonical(second)) ||
        inside(canonical(second), canonical(first))
    )
        throw new Error(label + ' must not overlap')
}
function plainFile(root: string, name: string, required = false) {
    let current = path.resolve(root)
    const parts = normalizeUpdatePath(name).split('/')
    for (const [index, part] of parts.entries()) {
        current = path.join(current, part)
        let stat: fs.Stats
        try {
            stat = fs.lstatSync(current)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            if (required)
                throw new Error('Required update file is missing: ' + name)
            return false
        }
        if (
            stat.isSymbolicLink() ||
            (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())
        )
            throw new Error(
                'Update path must be a regular non-linked file: ' + name
            )
    }
    return true
}

/** Recheck staged bytes and ownership before acknowledgement or any installed-file mutation. */
function validateIncrementalInstruction(input: UpdaterInstruction) {
    for (const key of [
        'applicationRoot',
        'stagingRoot',
        'backupRoot',
        'desktopHomeRoot',
        'libraryDirectory',
        'instanceFile',
        'progressFile',
        'runtimePath',
        'desktopEntryPath',
        'launcherPath'
    ] as const)
        if (
            typeof input[key] !== 'string' ||
            !input[key] ||
            !path.isAbsolute(input[key])
        )
            throw new Error('Invalid incremental update path: ' + key)
    if (
        !Number.isInteger(input.parentPid) ||
        input.parentPid <= 0 ||
        input.parentPid === process.pid
    )
        throw new Error('Invalid incremental update parent process')
    sqliteDiskFilename(path.resolve(input.libraryDirectory, 'library.db'))
    for (const other of [
        input.stagingRoot,
        input.backupRoot,
        input.desktopHomeRoot,
        input.libraryDirectory
    ])
        assertDisjoint(
            input.applicationRoot,
            other,
            'Application and update/user-data directories'
        )
    assertDisjoint(
        input.stagingRoot,
        input.backupRoot,
        'Staging and backup directories'
    )
    if (
        inside(
            canonical(input.instanceFile),
            canonical(input.applicationRoot)
        ) ||
        inside(canonical(input.progressFile), canonical(input.applicationRoot))
    )
        throw new Error(
            'Update runtime state must be outside the application directory'
        )
    if (fs.existsSync(input.backupRoot))
        throw new Error('Incremental backup directory already exists')
    const manifest = input.manifest
    if (
        !manifest ||
        manifest.manifestVersion !== 1 ||
        !['incremental', 'local-test'].includes(manifest.packageType) ||
        manifest.requiresFullInstall !== false ||
        !Array.isArray(manifest.files) ||
        !Array.isArray(manifest.deletions) ||
        !/^[0-9a-f]{40}$/.test(manifest.targetSourceSha) ||
        !manifest.targetVersion
    )
        throw new Error('Invalid incremental update manifest')
    if (
        updaterSelfReplacement([
            ...manifest.files.map((file) => file.path),
            ...manifest.deletions
        ])
    )
        throw new Error('Updater replacement requires a full install')
    const paths = new Set<string>()
    for (const name of [
        ...manifest.files.map((file) => file.path),
        ...manifest.deletions
    ]) {
        const safe = normalizeUpdatePath(name),
            identity = safe.toUpperCase()
        if (paths.has(identity))
            throw new Error(
                'Duplicate/colliding incremental update path: ' + safe
            )
        if (forbiddenUpdatePayload.test(safe))
            throw new Error(
                'User data is forbidden in update packages: ' + safe
            )
        paths.add(identity)
        plainFile(input.applicationRoot, safe)
    }
    for (const file of manifest.files) {
        plainFile(input.stagingRoot, file.path, true)
        const bytes = fs.readFileSync(
            resolveUpdatePath(input.stagingRoot, file.path)
        )
        if (
            !Number.isSafeInteger(file.size) ||
            file.size < 0 ||
            bytes.length !== file.size ||
            !/^[0-9a-f]{64}$/.test(file.sha256) ||
            createHash('sha256').update(bytes).digest('hex') !== file.sha256
        )
            throw new Error(
                'Staged incremental file hash or size mismatch: ' + file.path
            )
    }
    if (
        !manifest.files.some((file) => file.path === 'SOURCE_SHA.txt') ||
        fs
            .readFileSync(
                resolveUpdatePath(input.stagingRoot, 'SOURCE_SHA.txt'),
                'utf8'
            )
            .trim() !== manifest.targetSourceSha
    )
        throw new Error('Incremental source binding is missing or invalid')
    if (
        manifest.sourceSha &&
        fs
            .readFileSync(
                path.join(input.applicationRoot, 'SOURCE_SHA.txt'),
                'utf8'
            )
            .trim() !== manifest.sourceSha
    )
        throw new Error('Installed source changed after incremental staging')
}

function copyFile(source: string, destination: string) {
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    // A fixed-size, invocation-owned sibling name avoids extending a long basename.
    const temporary = path.join(
        path.dirname(destination),
        '.pica-update-new-' + randomUUID()
    )
    let copied = false
    try {
        fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL)
        copied = true
        fs.renameSync(temporary, destination)
    } finally {
        if (copied && fs.existsSync(temporary))
            fs.rmSync(temporary, { force: true })
    }
}
async function launch(input: UpdaterInstruction) {
    return fs.existsSync(input.launcherPath)
        ? launchDetached(input.launcherPath, ['--no-open'], {
              cwd: input.applicationRoot
          })
        : launchDetached(
              input.runtimePath,
              [input.desktopEntryPath, '--no-open'],
              { cwd: input.applicationRoot }
          )
}
function backup(input: UpdaterInstruction) {
    const existing: string[] = []
    for (const name of [
        ...input.manifest.files.map((file) => file.path),
        ...input.manifest.deletions
    ]) {
        const source = resolveUpdatePath(input.applicationRoot, name)
        if (!fs.existsSync(source)) continue
        copyFile(source, resolveUpdatePath(input.backupRoot, name))
        existing.push(name)
    }
    fs.writeFileSync(
        path.join(input.backupRoot, 'existing.json'),
        JSON.stringify(existing),
        'utf8'
    )
}
function apply(input: UpdaterInstruction) {
    for (const file of input.manifest.files)
        copyFile(
            resolveUpdatePath(input.stagingRoot, file.path),
            resolveUpdatePath(input.applicationRoot, file.path)
        )
    for (const name of input.manifest.deletions)
        fs.rmSync(resolveUpdatePath(input.applicationRoot, name), {
            force: true
        })
}
function rollback(input: UpdaterInstruction) {
    const existing = new Set(
        JSON.parse(
            fs.readFileSync(
                path.join(input.backupRoot, 'existing.json'),
                'utf8'
            )
        ) as string[]
    )
    for (const name of [
        ...input.manifest.files.map((file) => file.path),
        ...input.manifest.deletions
    ]) {
        const destination = resolveUpdatePath(input.applicationRoot, name)
        if (existing.has(name))
            copyFile(resolveUpdatePath(input.backupRoot, name), destination)
        else fs.rmSync(destination, { force: true })
    }
}

export async function runIncrementalUpgrade(input: UpdaterInstruction) {
    validateIncrementalInstruction(input)
    const context = { ...input, bootstrapRoot: input.backupRoot }
    let parentExited = false,
        snapshot = '',
        mutated = false,
        committed = false
    try {
        writeProgress(input.progressFile, {
            phase: 'waiting-for-exit',
            targetVersion: input.manifest.targetVersion
        })
        await prepareHelperStartup(input, 'incremental')
        await waitForExit(input.parentPid)
        parentExited = true
        fs.rmSync(input.instanceFile, { force: true })
        // Do not reuse a stale/foreign recovery directory after waiting for exit.
        if (fs.existsSync(input.backupRoot))
            throw new Error('Incremental backup directory already exists')
        fs.mkdirSync(input.backupRoot, { recursive: false })
        writeProgress(input.progressFile, {
            phase: 'preparing-backup',
            targetVersion: input.manifest.targetVersion
        })
        snapshot = snapshotUserState(context)
        backup(input)
        writeProgress(input.progressFile, {
            phase: 'replacing-files',
            current: 0,
            total:
                input.manifest.files.length + input.manifest.deletions.length,
            targetVersion: input.manifest.targetVersion
        })
        mutated = true
        apply(input)
        if (
            fs
                .readFileSync(
                    path.join(input.applicationRoot, 'SOURCE_SHA.txt'),
                    'utf8'
                )
                .trim() !== input.manifest.targetSourceSha
        )
            throw new Error('Installed incremental source SHA does not match')
        writeProgress(input.progressFile, {
            phase: 'starting',
            targetVersion: input.manifest.targetVersion
        })
        await launch(input)
        writeProgress(input.progressFile, {
            phase: 'health-check',
            targetVersion: input.manifest.targetVersion
        })
        if (
            !(
                await health({
                    instanceFile: input.instanceFile,
                    targetVersion: input.manifest.targetVersion,
                    healthTimeoutMs: input.healthTimeoutMs
                })
            ).ok
        )
            throw new Error('Updated application failed its health check')
        committed = true
        writeProgress(input.progressFile, {
            phase: 'complete',
            targetVersion: input.manifest.targetVersion
        })
        // Preserve the owned backup/snapshot for existing incremental recovery policy.
    } catch (error) {
        if (committed) {
            reportRecoveryProgress(input.progressFile, {
                phase: 'complete',
                targetVersion: input.manifest.targetVersion,
                message: 'Update completed; recovery/report cleanup is pending.'
            })
            return
        }
        if (!parentExited) {
            reportRecoveryProgress(input.progressFile, {
                phase: 'failed',
                targetVersion: input.manifest.targetVersion,
                message: error instanceof Error ? error.message : String(error)
            })
            throw error
        }
        reportRecoveryProgress(input.progressFile, {
            phase: 'rollback',
            targetVersion: input.manifest.targetVersion,
            message: error instanceof Error ? error.message : String(error)
        })
        try {
            if (mutated) {
                await stopPublishedInstance(input.instanceFile)
                fs.rmSync(input.instanceFile, { force: true })
                rollback(input)
                if (snapshot) restoreUserState(context, snapshot)
            }
            await launch(input)
        } catch (recoveryError) {
            reportRecoveryProgress(input.progressFile, {
                phase: 'failed',
                targetVersion: input.manifest.targetVersion,
                message:
                    'Update and rollback failed: ' +
                    (recoveryError instanceof Error
                        ? recoveryError.message
                        : String(recoveryError))
            })
            throw recoveryError
        }
        reportRecoveryProgress(input.progressFile, {
            phase: 'failed',
            targetVersion: input.manifest.targetVersion,
            message: error instanceof Error ? error.message : String(error)
        })
        throw error
    }
}

export const updaterInternals = {
    validateIncrementalInstruction,
    backup,
    rollback
}
async function main() {
    const file = process.argv[2]
    if (!file) throw new Error('Updater instruction is required')
    await runIncrementalUpgrade(
        JSON.parse(fs.readFileSync(file, 'utf8')) as UpdaterInstruction
    )
}
if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
    void main().catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
