import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { desktopPaths } from '../desktop/paths'
import { sanitizedChildEnv } from '../desktop/child-process'
import { sameRuntimeComposition } from '../modules/runtime-composition'
import { requireInstalledRuntimeComposition } from '../runtime/installed-runtime-composition'
import { extractValidatedFullApplication } from './full-application-staging'
import { assertLegacyApplicationStopped } from './legacy-transition-guard'
import { startUpgradeHelper, UpgradeHelperStopError } from './helper-startup'
import { inspectLegacyTransition, inspectLegacyTransitionTarget, type LegacyTransitionContext, type LegacyTransitionSelection } from './legacy-transition-preflight'
import { readLegacyRegularFile } from './legacy-transition-identity'
import { legacyTransitionLock, acquireLegacyTransitionLock, releaseLegacyTransitionLock } from './legacy-transition-lock'
import { RUNTIME_CHOICE_TTL_MS, validateRuntimeChoiceReceipt } from './runtime-choice'
import type { FullApplicationUpdaterInstruction } from './types'

export interface LegacyTransitionConfirmation {
    previewId: string
    confirmed: boolean
    canonicalPathsAccepted: boolean
    runtimeCompositionAccepted: boolean
}

/** Exclusive tiny probes only, after confirmation. Never overwrite profile files or databases. */
function probeWritableDirectory(directory: string) {
    let existing = directory
    for (;;) {
        try {
            const stat = fs.lstatSync(existing)
            if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync.native(existing).toLowerCase() !== existing.toLowerCase())
                throw Error('LEGACY_WRITE_PROBE_PATH_CHANGED')
            break
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw Error('LEGACY_WRITE_PROBE_UNAVAILABLE')
            const parent = path.dirname(existing)
            if (parent === existing) throw Error('LEGACY_WRITE_PROBE_UNAVAILABLE')
            existing = parent
        }
    }
    const file = path.join(existing, '.pica-transition-write-' + randomUUID())
    try { fs.writeFileSync(file, '', { flag: 'wx' }) }
    catch { throw Error('LEGACY_WRITE_ACCESS_REQUIRED') }
    // This exact file was exclusively created above. Failure retains it as evidence.
    try { fs.unlinkSync(file) } catch { throw Error('LEGACY_WRITE_PROBE_CLEANUP_REQUIRED') }
}

/** No replacement, snapshot, rollback or process-killing engine lives in this coordinator. */
export async function handoffLegacyTransition(
    selection: LegacyTransitionSelection,
    context: LegacyTransitionContext,
    confirmation: LegacyTransitionConfirmation
) {
    const preview = inspectLegacyTransition(selection, context)
    if (!confirmation.confirmed || confirmation.previewId !== preview.previewId)
        throw Error('LEGACY_TRANSITION_CONFIRMATION_REQUIRED')
    // Unpublished artifacts can demonstrate preview/build integrity, never migrate a real profile.
    if (preview.target.channel !== 'stable') throw Error('UNPUBLISHED_TRANSITION_IS_PREVIEW_ONLY')
    if (preview.pathReview.length && !confirmation.canonicalPathsAccepted) throw Error('CANONICAL_PATH_REVIEW_REQUIRED')
    const currentComposition = requireInstalledRuntimeComposition(preview.paths.application)
    const changesComposition = !sameRuntimeComposition(currentComposition, preview.target.runtimeComposition)
    if ((preview.requiresOptionalRuntimeConsent || changesComposition) && !confirmation.runtimeCompositionAccepted)
        throw Error('EXPLICIT_RUNTIME_COMPONENT_CONSENT_REQUIRED')
    const configSha256 = preview.profile.configured ? createHash('sha256')
        .update(readLegacyRegularFile(preview.profile.home, 'config/config.json', 1024 * 1024)).digest('hex') : null
    const paths = desktopPaths(preview.profile.home)
    assertLegacyApplicationStopped(preview.paths.application, paths.instance)
    for (const directory of new Set([path.dirname(preview.paths.application), path.join(preview.profile.home, 'config'), preview.profile.library]))
        probeWritableDirectory(directory)

    const authority = context.authority!, validated = inspectLegacyTransitionTarget(preview.paths.archive, authority)
    fs.mkdirSync(preview.paths.work, { recursive: true })
    // Exclusive preparation. Failures remain explicit recovery evidence, never silently reused/deleted.
    const preparation = fs.mkdtempSync(path.join(preview.paths.work, 'preparing-transition-'))
    const application = path.join(preparation, 'application'), engine = path.join(preparation, 'engine')
    extractValidatedFullApplication(validated, application)
    fs.mkdirSync(engine)
    for (const [source, destination] of [['runtime/node.exe', 'node.exe'], ['app/full-upgrader.js', 'full-upgrader.js']] as const)
        fs.writeFileSync(path.join(engine, destination), validated.declared.get(source)!.getData(), { flag: 'wx' })

    // Rehash the complete old app/target/tool and the bounded profile config AFTER preparation.
    // Planned final roots do not exist yet, so the normal no-recovery-collision preflight still applies.
    const fresh = inspectLegacyTransition(selection, context)
    if (fresh.previewId !== preview.previewId) throw Error('LEGACY_TRANSITION_PREVIEW_CHANGED')
    assertLegacyApplicationStopped(preview.paths.application, paths.instance)
    fs.renameSync(application, preview.paths.staged)
    fs.renameSync(engine, preview.paths.bootstrap)
    const nonce = randomUUID()
    const ownership = legacyTransitionLock(preview.paths.application, randomUUID())
    const instruction: FullApplicationUpdaterInstruction = {
        parentPid: process.pid, applicationRoot: preview.paths.application, stagedApplicationRoot: preview.paths.staged,
        backupRoot: preview.paths.backup, bootstrapRoot: preview.paths.bootstrap, desktopHomeRoot: preview.profile.home,
        libraryDirectory: preview.profile.library, instanceFile: paths.instance,
        progressFile: path.join(preview.paths.bootstrap, 'update-progress.json'),
        readyNonce: nonce, readyFile: path.join(preview.paths.bootstrap, `helper-ready-${nonce}.json`),
        targetVersion: preview.target.version, targetSourceSha: preview.target.sourceSha,
        runtimeComposition: preview.target.runtimeComposition, healthTimeoutMs: 60_000,
        legacyTransition: { authority, installedTreeSha256: preview.source.installedTreeSha256,
            lock: ownership,
            profile: { home: preview.profile.home, library: preview.profile.library,
                configSha256 } }
    }
    if (changesComposition) {
        instruction.runtimeChoice = {
            kind: 'user-selected-runtime-composition', id: randomUUID(), from: currentComposition, to: preview.target.runtimeComposition,
            sourceSha: preview.source.sourceSha, sourceVersion: preview.source.version,
            targetSourceSha: preview.target.sourceSha, targetVersion: preview.target.version,
            archiveName: preview.target.archiveName, archiveSha256: preview.target.archiveSha256,
            validUntil: Date.now() + RUNTIME_CHOICE_TTL_MS
        }
        validateRuntimeChoiceReceipt(instruction.runtimeChoice, { current: currentComposition, staged: validated.composition,
            sourceSha: preview.source.sourceSha, targetSourceSha: preview.target.sourceSha, targetVersion: preview.target.version,
            expectedArchiveName: preview.target.archiveName, expectedArchiveSha256: preview.target.archiveSha256 })
    }
    const instructionFile = path.join(preview.paths.bootstrap, 'instruction.json')
    fs.writeFileSync(instructionFile, JSON.stringify(instruction), { flag: 'wx' })
    fs.writeFileSync(path.join(preparation, 'receipt.json'), JSON.stringify({ formatVersion: 1, previewId: preview.previewId,
        targetSourceSha: preview.target.sourceSha, nextOwner: 'existing-full-application-helper', instructionFile }), { flag: 'wx' })
    acquireLegacyTransitionLock(ownership, preview.paths.application)
    try {
        await startUpgradeHelper(path.join(preview.paths.bootstrap, 'node.exe'),
            [path.join(preview.paths.bootstrap, 'full-upgrader.js'), instructionFile],
            { cwd: preview.paths.bootstrap, env: sanitizedChildEnv() }, instruction, 'full-application')
    } catch (error) {
        if (error instanceof UpgradeHelperStopError) throw Error('HELPER_EXIT_UNKNOWN_RECOVERY_RETAINED')
        if (!releaseLegacyTransitionLock(ownership, preview.paths.application)) throw Error('HELPER_NOT_ACCEPTED_LOCK_REVIEW_REQUIRED')
        throw Error('HELPER_NOT_ACCEPTED_INSTALLATION_UNCHANGED')
    }
    // No fallible IO/cleanup after ACK: the accepted helper owns the transaction once THIS parent exits.
    return { status: 'HELPER_ACCEPTED_PARENT_MUST_EXIT' as const, previewId: preview.previewId,
        instructionFile, progressFile: instruction.progressFile, targetVersion: preview.target.version }
}
