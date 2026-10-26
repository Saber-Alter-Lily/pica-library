import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { buildSync } from 'esbuild'
import AdmZip from 'adm-zip'
import { checkedLegacyTransitionAuthority, inspectLegacyTransitionTarget, type LegacyTransitionAuthority } from '../src/update/legacy-transition-preflight'
import { normalizeFullPackagePath, validateFullApplicationArchive } from '../src/update/full-archive'

const legacyArchiveSha256 = '14b92b60660b6694e2c8c19a2c1da695127de8dfd0fbafd6bd36fc8b5bc3d2bf'
const legacySourceSha = 'bec7f9f31828e8c57e0a2c103b6b1206c22c37cf'
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')

export interface LegacyTransitionBuildOptions {
    sourceZipFile: string
    targetZipFile: string
    targetVersion: string
    targetSourceSha: string
    targetArchiveSha256: string
    channel: 'stable' | 'unpublished-review'
    provenanceUrl: string
    outputFile: string
}

/** Internal derivation over expected build facts; not a user-loadable trust/manifest file. */
export function deriveLegacyTransitionAuthority(sourceBytes: Buffer, input: {
    expectedSourceArchiveSha256: string
    target: LegacyTransitionAuthority['target']
}): LegacyTransitionAuthority {
    if (!/^[a-f0-9]{64}$/.test(input.expectedSourceArchiveSha256) || sha256(sourceBytes) !== input.expectedSourceArchiveSha256)
        throw Error('PINNED_LEGACY_ARCHIVE_HASH_MISMATCH')
    const zip = new AdmZip(sourceBytes), validated = validateFullApplicationArchive(zip)
    if (validated.sourceSha !== legacySourceSha) throw Error('PINNED_LEGACY_SOURCE_MISMATCH')
    const files: Record<string, string> = {}
    const identities = new Set<string>()
    for (const entry of zip.getEntries()) {
        const name = normalizeFullPackagePath(entry.isDirectory ? entry.entryName.replace(/\/$/, '') : entry.entryName)
        if (((entry.attr >>> 16) & 0o170000) === 0o120000) throw Error('PINNED_LEGACY_LINKED_ENTRY')
        if (entry.isDirectory) continue
        if (identities.has(name.toLowerCase())) throw Error('PINNED_LEGACY_CASE_COLLISION')
        identities.add(name.toLowerCase())
        files[name] = sha256(entry.getData())
    }
    const authority: LegacyTransitionAuthority = { formatVersion: 1, kind: 'pica-library-legacy-transition',
        source: { version: '0.5.0', sourceSha: legacySourceSha, files }, target: input.target }
    return checkedLegacyTransitionAuthority({ authority, platform: 'win32', toolRoot: '', localAppData: '' })
}

function requireExactCleanCheckout(root: string, expectedSource: string) {
    const git = (...args: string[]) => {
        const result = spawnSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), '-C', root, ...args],
            { encoding: 'utf8', windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024 })
        if (result.error || result.status !== 0 || result.signal) throw Error('BUILD_SOURCE_ATTESTATION_UNAVAILABLE')
        return result.stdout.trim()
    }
    if (fs.realpathSync.native(git('rev-parse', '--show-toplevel')).toLowerCase() !== fs.realpathSync.native(root).toLowerCase() ||
        git('rev-parse', 'HEAD') !== expectedSource || git('status', '--porcelain', '--untracked-files=normal'))
        throw Error('BUILD_REQUIRES_EXACT_CLEAN_TARGET_CHECKOUT')
    // Output bytes must come from tracked source, never ignored/untracked injected entrypoints.
    for (const file of ['scripts/run-legacy-transition.ts', 'scripts/preview-legacy-transition.ts',
        'src/update/legacy-transition-coordinator.ts', 'src/update/legacy-transition-guard.ts'])
        git('ls-files', '--error-unmatch', file)
}

/** The real producer ALWAYS pins the public old archive; no CLI/env override for this pin. */
export function buildLegacyTransitionAssistant(options: LegacyTransitionBuildOptions) {
    const root = path.resolve(import.meta.dirname, '..')
    requireExactCleanCheckout(root, options.targetSourceSha)
    const targetFile = path.resolve(options.targetZipFile)
    const authority = deriveLegacyTransitionAuthority(fs.readFileSync(options.sourceZipFile), {
        expectedSourceArchiveSha256: legacyArchiveSha256,
        target: { version: options.targetVersion, sourceSha: options.targetSourceSha, archiveName: path.basename(targetFile),
            archiveSha256: options.targetArchiveSha256, channel: options.channel, provenanceUrl: options.provenanceUrl }
    })
    const bytes = compileLegacyTransitionBundle(authority, targetFile, root)
    // Recheck checkout immediately before material output. Do not attest dirty or changed source.
    requireExactCleanCheckout(root, options.targetSourceSha)
    const destination = path.resolve(options.outputFile)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, bytes, { flag: 'wx' })
    return { path: destination, sha256: sha256(bytes), sizeBytes: bytes.length, sourceVersion: '0.5.0',
        targetVersion: authority.target.version, targetSourceSha: authority.target.sourceSha,
        sourceArchiveSha256: legacyArchiveSha256, targetArchiveSha256: authority.target.archiveSha256,
        channel: authority.target.channel, executionAvailable: authority.target.channel === 'stable' }
}

/** Build-internal byte compiler, shared with synthetic artifact tests. No filesystem output or trust promotion. */
export function compileLegacyTransitionBundle(authority: LegacyTransitionAuthority, targetFile: string, root: string) {
    checkedLegacyTransitionAuthority({ authority, platform: 'win32', toolRoot: '', localAppData: '' })
    const target = inspectLegacyTransitionTarget(targetFile, authority)
    const output = new AdmZip()
    for (const name of ['licenses/Node.js-LICENSE.txt', 'licenses/THIRD_PARTY_LICENSES.txt'])
        if (!target.declared.get(name)?.getData().length) throw Error('TRANSITION_RUNTIME_LICENSE_NOTICES_MISSING')
    const notices = new Set(target.declared.get('licenses/THIRD_PARTY_LICENSES.txt')!.getData().toString('utf8').split(/\r?\n/))
    for (const name of ['SOURCE_SHA.txt', 'runtime/node.exe', 'app/full-upgrader.js', 'licenses/Node.js-LICENSE.txt', 'licenses/THIRD_PARTY_LICENSES.txt'])
        output.addFile(name, target.declared.get(name)!.getData())
    output.addFile('LICENSE', fs.readFileSync(path.join(root, 'LICENSE')))
    for (const [entry, name] of [['run-legacy-transition.ts', 'legacy-transition.cjs'], ['preview-legacy-transition.ts', 'preview-legacy-transition.cjs']] as const) {
        const compiled = buildSync({ entryPoints: [path.join(root, 'scripts', entry)], bundle: true, platform: 'node',
            target: 'node22', format: 'cjs', write: false, sourcemap: false, logLevel: 'silent', metafile: true,
            define: { __PICA_LEGACY_TRANSITION_AUTHORITY__: JSON.stringify(authority), 'import.meta.dirname': '__dirname' } })
        // Reuse the target's existing graph-generated notices. A newly bundled
        // dependency not covered there fails closed instead of dropping its license.
        for (const input of Object.keys(compiled.metafile!.inputs).filter(file => file.includes('node_modules'))) {
            let directory = path.dirname(path.resolve(root, input)), found = false
            while (directory !== path.dirname(directory)) {
                const metadataFile = path.join(directory, 'package.json')
                if (fs.existsSync(metadataFile)) {
                    const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8')) as { name?: string; version?: string }
                    if (metadata.name && metadata.version) {
                        if (!notices.has(metadata.name + '@' + metadata.version)) throw Error('TRANSITION_BUNDLED_DEPENDENCY_NOTICE_MISSING')
                        found = true; break
                    }
                }
                directory = path.dirname(directory)
            }
            if (!found) throw Error('TRANSITION_BUNDLED_DEPENDENCY_NOTICE_MISSING')
        }
        output.addFile('app/' + name, Buffer.from(compiled.outputFiles[0].contents))
    }
    // Read back after binding/compilation, not a second unchecked read of a changeable archive.
    const payload = fs.readFileSync(targetFile)
    if (sha256(payload) !== authority.target.archiveSha256) throw Error('TARGET_ARCHIVE_CHANGED_DURING_BUILD')
    output.addFile('payload/' + authority.target.archiveName, payload)
    output.addFile('Start-Pica-Library-Transition.cmd', Buffer.from([
        '@echo off', 'setlocal', 'set "NODE_OPTIONS="', 'set "NODE_PATH="',
        '"%~dp0runtime\\node.exe" "%~dp0app\\legacy-transition.cjs"', 'if errorlevel 1 pause', 'endlocal', ''
    ].join('\r\n')))
    output.addFile('README.txt', Buffer.from([
        'Pica Library v0.5.0 one-time transition entry',
        'Channel: ' + authority.target.channel,
        'Target source: ' + authority.target.sourceSha,
        'Expected provenance: ' + authority.target.provenanceUrl,
        'Unpublished review bundles and non-interactive calls are PREVIEW ONLY.',
        'Extract all files, close the old app, double-click Start-Pica-Library-Transition.cmd.',
        'Select the OLD PROGRAM directory. Do not copy databases or change profile paths.',
        'Review program/data/download/recovery paths and explicitly confirm before a stable transition.',
        'Uses this bundle\'s target-matched modern helper, never the old installed updater.',
        'No source is enabled, no content bundled. Normal in-app one-click updates continue afterwards.',
        'Process proof is read-only: unknown/running legacy processes refuse; no arbitrary PID termination.',
        'The outer archive hash must be verified against its separately trusted publication/build receipt.', ''
    ].join('\n')))
    const members = output.getEntries().filter(entry => !entry.isDirectory)
    output.addFile('SHA256SUMS.txt', Buffer.from(members.map(entry => sha256(entry.getData()) + '  ' + entry.entryName).join('\n') + '\n'))
    return output.toBuffer()
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const [sourceZipFile, targetZipFile, targetVersion, targetSourceSha, targetArchiveSha256, channel, provenanceUrl, outputFile, ...extra] = process.argv.slice(2)
    if (!outputFile || extra.length || !['stable', 'unpublished-review'].includes(channel))
        throw Error('Usage: build-legacy-transition-assistant <pinnedOldZip> <targetZip> <targetVersion> <targetSourceSha> <expectedTargetSha256> <stable|unpublished-review> <expectedProvenanceUrl> <newOutputZip>')
    console.log(JSON.stringify(buildLegacyTransitionAssistant({ sourceZipFile, targetZipFile, targetVersion, targetSourceSha,
        targetArchiveSha256, channel: channel as LegacyTransitionBuildOptions['channel'], provenanceUrl, outputFile }), null, 2))
}
