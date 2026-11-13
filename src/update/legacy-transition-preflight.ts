import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { desktopPaths } from '../desktop/paths'
import { sqliteDiskFilename } from '../storage/sqlite/filename'
import { fullApplicationAssetName } from './release-assets'
import { normalizeFullPackagePath, validateFullApplicationArchive } from './full-archive'
import type { RuntimeComposition } from '../modules/runtime-composition'
import { checkedLegacyTransitionAuthority, legacyInstalledTreeIdentity, readLegacyRegularFile as regularFile,
    LegacyTransitionPreflightError, type LegacyTransitionAuthority, type LegacyTransitionContext } from './legacy-transition-identity'
export { checkedLegacyTransitionAuthority, legacyInstalledTreeIdentity, LegacyTransitionPreflightError,
    type LegacyTransitionAuthority, type LegacyTransitionContext } from './legacy-transition-identity'

export interface LegacyTransitionSelection {
    applicationRoot: string
    targetZip: string
    workRoot: string
    dataHome?: string
}

function refuse(code: string): never { throw new LegacyTransitionPreflightError(code) }
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
const sourceHomeName = 'Pica Library'
const maxArchive = 512 * 1024 * 1024
const privatePayload = /(?:^|\/)(?:credentials\.dat|remote-storage\.json|library\.db(?:-wal|-shm)?|\.env(?:\..*)?)$|\.(?:cbz|cbr|epub|pdf)$/i

function optionalStat(file: string) {
    try { return fs.lstatSync(file) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}
function physicalPath(value: string) {
    if (!value || value.includes('\0') || !path.isAbsolute(value)) refuse('PATH_MUST_BE_ABSOLUTE')
    const input = path.resolve(value), tail: string[] = []
    let anchor = input
    while (!optionalStat(anchor)) {
        const parent = path.dirname(anchor)
        if (parent === anchor) refuse('PATH_PARENT_UNAVAILABLE')
        tail.unshift(path.basename(anchor)); anchor = parent
    }
    const resolved = path.join(fs.realpathSync.native(anchor), ...tail)
    if (path.dirname(resolved) === resolved) refuse('BROAD_FILESYSTEM_ROOT')
    return { input, resolved, changed: input.toLowerCase() !== resolved.toLowerCase() }
}
function contains(root: string, child: string) {
    const relative = path.relative(root.toLowerCase(), child.toLowerCase())
    return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)
}
function disjoint(first: string, second: string) {
    if (contains(first, second) || contains(second, first)) refuse('PATH_ROLES_OVERLAP')
}
function directoryRole(file: string, required = false) {
    const stat = optionalStat(file)
    if (stat ? !stat.isDirectory() : required) refuse('PATH_ROLE_NOT_DIRECTORY')
}
export function inspectLegacyTransitionTarget(file: string, authority: LegacyTransitionAuthority) {
    if (path.basename(file) !== authority.target.archiveName) refuse('TARGET_ARCHIVE_NAME_MISMATCH')
    const bytes = regularFile(path.dirname(file), path.basename(file), maxArchive)
    if (sha256(bytes) !== authority.target.archiveSha256) refuse('TARGET_ARCHIVE_HASH_MISMATCH')
    const zip = new AdmZip(bytes), entries = zip.getEntries()
    if (entries.length > 20000 || entries.reduce((sum, entry) => sum + entry.header.size, 0) > 1024 * 1024 * 1024)
        refuse('TARGET_ARCHIVE_LIMIT')
    const identities = new Set<string>()
    for (const entry of entries) {
        const name = normalizeFullPackagePath(entry.isDirectory ? entry.entryName.replace(/\/$/, '') : entry.entryName)
        if (!entry.isDirectory) {
            if (identities.has(name.toLowerCase())) refuse('TARGET_CASE_COLLISION')
            identities.add(name.toLowerCase())
        }
        if (((entry.attr >>> 16) & 0o170000) === 0o120000 || privatePayload.test(name)) refuse('TARGET_PRIVATE_OR_LINKED_PAYLOAD')
        if (!entry.isDirectory) entry.getData() // CRC, without extracting/writing.
    }
    if (zip.getEntry('TEST_BUILD.txt')) refuse('TARGET_DATA_PROFILE_MISMATCH')
    const validated = validateFullApplicationArchive(zip)
    if (validated.sourceSha !== authority.target.sourceSha) refuse('TARGET_SOURCE_MISMATCH')
    if (authority.target.channel === 'stable' &&
        fullApplicationAssetName(authority.target.version, { platform: 'windows', arch: 'x64' }, validated.composition) !== authority.target.archiveName)
        refuse('TARGET_ARCHIVE_NAME_MISMATCH')
    return validated
}

/** Only read/stat/hash operations. A preview is never an executable upgrade instruction. */
export function inspectLegacyTransition(selection: LegacyTransitionSelection, context: LegacyTransitionContext) {
    try {
        const authority = checkedLegacyTransitionAuthority(context)
        const application = physicalPath(selection.applicationRoot), tool = physicalPath(context.toolRoot),
            archive = physicalPath(selection.targetZip), work = physicalPath(selection.workRoot),
            expectedHome = physicalPath(path.join(context.localAppData, sourceHomeName)),
            home = physicalPath(selection.dataHome ?? expectedHome.input)
        if (home.resolved.toLowerCase() !== expectedHome.resolved.toLowerCase()) refuse('DATA_PROFILE_MISMATCH')
        directoryRole(application.resolved, true)
        directoryRole(tool.resolved, true)
        directoryRole(work.resolved)
        directoryRole(home.resolved)
        for (const pair of [[application, tool], [application, work], [tool, work]]) disjoint(pair[0].resolved, pair[1].resolved)
        for (const mutable of [application, tool, work]) disjoint(mutable.resolved, home.resolved)
        const installedTreeSha256 = legacyInstalledTreeIdentity(application.resolved, authority)
        const target = inspectLegacyTransitionTarget(archive.resolved, authority)
        if (regularFile(tool.resolved, 'SOURCE_SHA.txt', 4096).toString('utf8').trim() !== authority.target.sourceSha)
            refuse('INDEPENDENT_ENGINE_SOURCE_MISMATCH')
        for (const name of ['runtime/node.exe', 'app/full-upgrader.js'])
            if (sha256(regularFile(tool.resolved, name)) !== sha256(target.declared.get(name)!.getData()))
                refuse('INDEPENDENT_ENGINE_FILE_MISMATCH')
        const paths = desktopPaths(home.resolved), homeExists = optionalStat(home.resolved) !== null
        let configDigest = '', libraryPath: string
        if (homeExists) {
            const configBytes = regularFile(home.resolved, 'config/config.json', 1024 * 1024)
            const config: unknown = JSON.parse(configBytes.toString('utf8'))
            if (!config || typeof config !== 'object' || !('libraryDirectory' in config) ||
                typeof config.libraryDirectory !== 'string' || !path.isAbsolute(config.libraryDirectory))
                refuse('PROFILE_LIBRARY_PATH_INVALID')
            libraryPath = config.libraryDirectory
            configDigest = sha256(configBytes)
        } else libraryPath = paths.data
        const library = physicalPath(libraryPath), database = path.join(library.resolved, 'library.db')
        directoryRole(library.resolved)
        sqliteDiskFilename(database)
        for (const mutable of [application, tool, work]) disjoint(mutable.resolved, library.resolved)
        const dbStat = optionalStat(database)
        if (dbStat) {
            if (!dbStat.isFile() || dbStat.isSymbolicLink() || dbStat.nlink !== 1) refuse('DATABASE_PATH_INVALID')
            const descriptor = fs.openSync(database, 'r')
            fs.closeSync(descriptor) // Never connect to SQLite or create WAL/SHM.
        }
        const previewId = sha256(JSON.stringify({
            installedTreeSha256, target: authority.target, configDigest,
            paths: [application.resolved, tool.resolved, work.resolved, home.resolved, library.resolved]
        }))
        const backupRoot = path.join(path.dirname(application.resolved), path.basename(application.resolved) + '.before-transition-' + previewId.slice(0, 16))
        const stagedRoot = path.join(work.resolved, 'target-' + previewId.slice(0, 16)), bootstrapRoot = path.join(work.resolved, 'bootstrap-' + previewId.slice(0, 16))
        for (const planned of [backupRoot, stagedRoot, bootstrapRoot])
            for (const protectedRoot of [application.resolved, tool.resolved, home.resolved, library.resolved]) disjoint(planned, protectedRoot)
        if ([backupRoot, stagedRoot, bootstrapRoot].some(file => optionalStat(file))) refuse('RECOVERY_LOCATION_ALREADY_EXISTS')
        const pathReview = [application, tool, archive, work, home, library].filter(row => row.changed)
        return {
            kind: 'pica-library-legacy-transition-preview' as const, formatVersion: 1 as const,
            previewId, readOnly: true as const, canApply: false as const, executionAvailable: false as const,
            mustRevalidateBeforeApply: true as const, writeAccess: 'NOT_WRITE_PROBED' as const,
            verdict: pathReview.length ? 'PATH_REVIEW_REQUIRED' as const : 'READY_FOR_EXPLICIT_CONFIRMATION' as const,
            authority: 'EXPECTED_FACTS_FROM_INTERNAL_BUILD_CONTEXT' as const,
            source: { version: authority.source.version, sourceSha: authority.source.sourceSha, installedTreeSha256 },
            target: { ...authority.target, runtimeComposition: target.composition as RuntimeComposition },
            profile: { home: home.resolved, library: library.resolved, database, configured: homeExists,
                downloads: path.join(library.resolved, 'library'), downloadInventory: 'NOT_READ' as const },
            paths: { application: application.resolved, engine: tool.resolved, archive: archive.resolved,
                work: work.resolved, backup: backupRoot, staged: stagedRoot, bootstrap: bootstrapRoot },
            pathReview: pathReview.map(row => ({ input: row.input, resolved: row.resolved })),
            requiresOptionalRuntimeConsent: target.composition.sourceRuntimes.length > 0,
            nextAction: 'EXPLICIT_CONFIRMATION_IN_INDEPENDENT_ENTRY' as const
        }
    } catch (error) {
        if (error instanceof LegacyTransitionPreflightError) throw error
        // Never echo config/JSON/parser text, unknown filesystem errors or credentials.
        refuse('PREFLIGHT_INPUT_UNREADABLE_OR_INVALID')
    }
}

export function runLegacyTransitionPreviewCli(args: string[], context: LegacyTransitionContext) {
    if (args.length === 1 && args[0] === '--help')
        return { exitCode: 0, output: 'Read-only preview: --application-root PATH --target-zip PATH --work-root PATH [--data-home PATH]. No apply command.\n' }
    try {
        const flags: Record<string, string> = {}
        for (let i = 0; i < args.length; i += 2) {
            const key = args[i]
            if (!['--application-root', '--target-zip', '--work-root', '--data-home'].includes(key) ||
                Object.hasOwn(flags, key) || !args[i + 1] || args[i + 1].startsWith('--'))
                refuse('ARGUMENTS_INVALID')
            flags[key] = args[i + 1]
        }
        if (!flags['--application-root'] || !flags['--target-zip'] || !flags['--work-root']) refuse('ARGUMENTS_INVALID')
        const preview = inspectLegacyTransition({
            applicationRoot: flags['--application-root'], targetZip: flags['--target-zip'],
            workRoot: flags['--work-root'], dataHome: flags['--data-home']
        }, context)
        return { exitCode: 0, output: JSON.stringify(preview, null, 2) + '\n' }
    } catch (error) {
        const code = error instanceof LegacyTransitionPreflightError ? error.code : 'PREFLIGHT_INPUT_UNREADABLE_OR_INVALID'
        return { exitCode: 1, output: JSON.stringify({ readOnly: true, canApply: false, error: code }) + '\n' }
    }
}
