import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { sqliteDiskFilename } from '../storage/sqlite/filename'
import type { FullApplicationUpdaterInstruction, UpdateProgress } from './types'
import {
    writeProgress,
    reportRecoveryProgress,
    waitForExit,
    launchApplication,
    readInstance,
    safeLoopbackUrl,
    health,
    stopPublishedInstance
} from './process-lifecycle'
import {
    copyTree,
    snapshotUserState,
    restoreUserState
} from './user-state-snapshot'
import { prepareHelperStartup } from './helper-startup'
import { installedRuntimeComposition, requireInstalledRuntimeComposition } from '../runtime/installed-runtime-composition'
import { validateAutomaticFullRuntimeComposition } from './runtime-composition'
import { validateRuntimeChoiceReceipt } from './runtime-choice'
import { sameRuntimeComposition } from '../modules/runtime-composition'
import { assertLegacyTransitionPreApply } from './legacy-transition-guard'
import { releaseLegacyTransitionLock } from './legacy-transition-lock'

/** Status storage must never prevent recovery of the application or user state. */

function normalized(value: string) {
    return path.resolve(value)
}

function assertOutside(child: string, parent: string, label: string) {
    const candidate = normalized(child)
    const root = normalized(parent)
    const relative = path.relative(root, candidate)
    if (
        candidate === root ||
        (!relative.startsWith('..' + path.sep) &&
            relative !== '..' &&
            !path.isAbsolute(relative))
    )
        throw new Error(label + ' must be outside the application directory')
}

function requiredApplicationFiles(root: string) {
    return [
        'Pica Library.exe',
        path.join('runtime', 'node.exe'),
        path.join('app', 'desktop.js'),
        path.join('app', 'updater.js'),
        path.join('app', 'full-upgrader.js'),
        'SOURCE_SHA.txt'
    ].map((item) => path.join(root, item))
}

function validateRuntimeComposition(instruction: FullApplicationUpdaterInstruction) {
    if(instruction.runtimeChoice){
        if(installedRuntimeComposition(instruction.stagedApplicationRoot).status!=='declared')throw Error('Explicit runtime target declaration changed after staging')
        if(!instruction.runtimeComposition || !sameRuntimeComposition(instruction.runtimeComposition,instruction.runtimeChoice.to))throw Error('Explicit runtime choice does not match the instruction composition')
        validateRuntimeChoiceReceipt(instruction.runtimeChoice,{
            current:requireInstalledRuntimeComposition(instruction.applicationRoot),staged:requireInstalledRuntimeComposition(instruction.stagedApplicationRoot),
            sourceSha:fs.readFileSync(path.join(instruction.applicationRoot,'SOURCE_SHA.txt'),'utf8').trim(),targetSourceSha:instruction.targetSourceSha,targetVersion:instruction.targetVersion
        })
        return
    }
    validateAutomaticFullRuntimeComposition(
        requireInstalledRuntimeComposition(instruction.applicationRoot),
        requireInstalledRuntimeComposition(instruction.stagedApplicationRoot),
        instruction.runtimeComposition
    )
}

function validateStagedApplication(
    instruction: FullApplicationUpdaterInstruction
) {
    if (process.platform !== 'win32')
        throw new Error(
            'Universal full-application upgrade is currently supported on Windows only'
        )
    sqliteDiskFilename(path.resolve(instruction.libraryDirectory, 'library.db'))
    assertOutside(
        instruction.bootstrapRoot,
        instruction.applicationRoot,
        'Upgrade bootstrap directory'
    )
    assertOutside(
        instruction.desktopHomeRoot,
        instruction.applicationRoot,
        'Desktop user-data directory'
    )
    assertOutside(
        instruction.libraryDirectory,
        instruction.applicationRoot,
        'Library directory'
    )
    assertOutside(
        instruction.stagedApplicationRoot,
        instruction.applicationRoot,
        'Staged application directory'
    )
    assertOutside(
        instruction.backupRoot,
        instruction.applicationRoot,
        'Application backup directory'
    )
    if (fs.existsSync(instruction.backupRoot))
        throw new Error(
            'Application backup directory already exists: ' +
                instruction.backupRoot
        )
    for (const file of requiredApplicationFiles(
        instruction.stagedApplicationRoot
    ))
        if (!fs.existsSync(file))
            throw new Error(
                'Staged full application is incomplete: ' +
                    path.relative(instruction.stagedApplicationRoot, file)
            )
    const sourceSha = fs
        .readFileSync(
            path.join(instruction.stagedApplicationRoot, 'SOURCE_SHA.txt'),
            'utf8'
        )
        .trim()
    if (sourceSha !== instruction.targetSourceSha)
        throw new Error('Staged full application source SHA does not match')
    validateRuntimeComposition(instruction)
}

function removeApplicationTree(root: string) {
    // Node's bounded retry handles Windows launcher/child/antivirus lock release.
    fs.rmSync(root, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100
    })
}

function cleanupHealthyRecovery(
    instruction: FullApplicationUpdaterInstruction,
    snapshot: string
) {
    try {
        removeApplicationTree(instruction.backupRoot)
        removeApplicationTree(snapshot)
    } catch {
        writeProgress(instruction.progressFile, {
            phase: 'complete',
            targetVersion: instruction.targetVersion,
            message:
                'Update completed; temporary recovery files were retained for later cleanup.'
        })
    }
}

function openBrowserFallback(value: string | null) {
    if (!value || process.platform !== 'win32') return
    const url = safeLoopbackUrl(value)
    if (!url) return
    const child = spawn(
        'rundll32.exe',
        ['url.dll,FileProtocolHandler', url.origin],
        { detached: true, stdio: 'ignore', windowsHide: true }
    )
    child.once('error', () => {
        // Browser opening is a convenience after proven health, not a commit gate.
    })
    child.unref()
}

async function replaceApplication(
    instruction: FullApplicationUpdaterInstruction,
    backedUp: () => void
) {
    for (let attempt = 0; ; attempt++) {
        if (fs.existsSync(instruction.backupRoot))
            throw new Error(
                'Application backup directory already exists: ' +
                    instruction.backupRoot
            )
        try {
            fs.renameSync(instruction.applicationRoot, instruction.backupRoot)
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code
            // The parent has exited, but Windows can release a launcher/image
            // handle slightly later. Never retry arbitrary errors or wait forever.
            if (
                process.platform !== 'win32' ||
                !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') ||
                attempt >= 10
            )
                throw error
            await new Promise((resolve) =>
                setTimeout(resolve, 100 * (attempt + 1))
            )
            continue
        }
        // Record ownership in the same turn as successful rename, before copy/await.
        backedUp()
        break
    }
    copyTree(instruction.stagedApplicationRoot, instruction.applicationRoot)
}

function rollbackApplication(instruction: FullApplicationUpdaterInstruction) {
    if (!fs.existsSync(instruction.backupRoot))
        throw new Error('Application backup is unavailable for rollback')
    removeApplicationTree(instruction.applicationRoot)
    fs.renameSync(instruction.backupRoot, instruction.applicationRoot)
}

export async function runFullApplicationUpgrade(
    instruction: FullApplicationUpdaterInstruction
) {
    process.chdir(instruction.bootstrapRoot)
    validateStagedApplication(instruction)
    let snapshot = ''
    let replaced = false
    let committed = false
    let parentExited = false
    let replacementStarted = false
    let recoveryCompleted = false
    try {
        writeProgress(instruction.progressFile, {
            phase: 'waiting-for-exit',
            targetVersion: instruction.targetVersion
        })
        await prepareHelperStartup(instruction, 'full-application')
        await waitForExit(instruction.parentPid)
        // Refusal here is pre-transaction: do not restore files/DB or launch an
        // old app whose current process ownership is unknown.
        assertLegacyTransitionPreApply(instruction)
        parentExited = true
        validateRuntimeComposition(instruction)
        fs.rmSync(instruction.instanceFile, { force: true })

        writeProgress(instruction.progressFile, {
            phase: 'preparing-backup',
            targetVersion: instruction.targetVersion
        })
        snapshot = snapshotUserState(instruction)

        writeProgress(instruction.progressFile, {
            phase: 'replacing-files',
            targetVersion: instruction.targetVersion
        })
        await replaceApplication(instruction, () => {
            replaced = true
        })

        const installedSource = fs
            .readFileSync(
                path.join(instruction.applicationRoot, 'SOURCE_SHA.txt'),
                'utf8'
            )
            .trim()
        if (installedSource !== instruction.targetSourceSha)
            throw new Error('Installed application source SHA does not match')
        const installedComposition=installedRuntimeComposition(instruction.applicationRoot)
        if(installedComposition.status==='invalid' || !sameRuntimeComposition(installedComposition.composition,requireInstalledRuntimeComposition(instruction.stagedApplicationRoot)) ||
            instruction.runtimeChoice && installedComposition.status!=='declared')throw Error('Installed runtime composition does not match the verified target')

        writeProgress(instruction.progressFile, {
            phase: 'starting',
            targetVersion: instruction.targetVersion
        })
        await launchApplication(instruction.applicationRoot)
        replacementStarted = true

        writeProgress(instruction.progressFile, {
            phase: 'health-check',
            targetVersion: instruction.targetVersion
        })
        const healthy = await health(instruction)
        if (!healthy.ok)
            throw new Error(
                'Updated application failed its startup/migration health check'
            )

        committed = true

        writeProgress(instruction.progressFile, {
            phase: 'complete',
            targetVersion: instruction.targetVersion
        })

        if (
            healthy.url &&
            instruction.previousUrl &&
            safeLoopbackUrl(instruction.previousUrl)?.origin !== healthy.url
        )
            openBrowserFallback(healthy.url)

        cleanupHealthyRecovery(instruction, snapshot)
    } catch (error) {
        if (committed) {
            // Reporting/cleanup failure after proven health must not undo a good installation.
            try {
                writeProgress(instruction.progressFile, {
                    phase: 'complete',
                    targetVersion: instruction.targetVersion,
                    message:
                        'Update completed; recovery/report cleanup is pending.'
                })
            } catch {
                /* Preserve the healthy application and recovery files. */
            }
            return
        }
        if (!parentExited) {
            reportRecoveryProgress(instruction.progressFile, {
                phase: 'failed',
                targetVersion: instruction.targetVersion,
                message: error instanceof Error ? error.message : String(error)
            })
            throw error
        }
        reportRecoveryProgress(instruction.progressFile, {
            phase: 'rollback',
            targetVersion: instruction.targetVersion,
            message: error instanceof Error ? error.message : String(error)
        })
        try {
            if (
                replacementStarted &&
                !(await stopPublishedInstance(instruction.instanceFile))
            )
                throw new Error(
                    'Replacement exit cannot be verified; application and user-state backups retained'
                )
            fs.rmSync(instruction.instanceFile, { force: true })
            if (replaced) rollbackApplication(instruction)
            if (snapshot) restoreUserState(instruction, snapshot)
            await launchApplication(instruction.applicationRoot)
            recoveryCompleted = true
        } catch (rollbackError) {
            reportRecoveryProgress(instruction.progressFile, {
                phase: 'failed',
                targetVersion: instruction.targetVersion,
                message:
                    'Full update and rollback failed: ' +
                    (rollbackError instanceof Error
                        ? rollbackError.message
                        : String(rollbackError))
            })
            throw rollbackError
        }
        reportRecoveryProgress(instruction.progressFile, {
            phase: 'failed',
            targetVersion: instruction.targetVersion,
            message: error instanceof Error ? error.message : String(error)
        })
        throw error
    } finally {
        if (instruction.legacyTransition && (committed || !parentExited || recoveryCompleted) &&
            !releaseLegacyTransitionLock(instruction.legacyTransition.lock, instruction.applicationRoot))
            console.error('Legacy transition ownership lock retained for review.')
    }
}

export const fullUpgradeInternals = {
    stopPublishedInstance,
    removeApplicationTree,
    rollbackApplication,
    cleanupHealthyRecovery
}

async function main() {
    const instructionFile = process.argv[2]
    if (!instructionFile)
        throw new Error('Full-upgrader instruction is required')
    const instruction = JSON.parse(
        fs.readFileSync(instructionFile, 'utf8')
    ) as FullApplicationUpdaterInstruction
    await runFullApplicationUpgrade(instruction)
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
    void main().catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
