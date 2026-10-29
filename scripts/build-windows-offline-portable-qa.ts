/**
 * Unpublished, temporary S3 Windows x64 portable offline-Reader proof.
 *
 * Uses the already verified source-free build and Reader-only web stage;
 * consumes an officially SHA-verified Node x64 runtime and its LICENSE as
 * prepared by a separate CI step. NEVER signs/publishes/installs a package,
 * alters source versions, or accesses a real user library/OTA channel.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import { buildOfflineCoreCandidate } from './build-offline-core-candidate'
import {
    OFFLINE_READER_ASSETS,
    stageOfflineReaderAssetsQa
} from './stage-offline-reader-assets-qa'

export const OFFLINE_PORTABLE_NODE_VERSION = '24.15.0'
const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const SHA256 = /^[0-9a-f]{64}$/
const SOURCE_SHA = /^[0-9a-f]{40}$/
const MAX_RUNTIME = 140 * 1024 * 1024
const ZIP_TIMESTAMP = new Date('1980-01-01T00:00:00.000Z')
const TOP_LEVEL = [
    'LICENSE', 'NOTICE.md', 'UPSTREAM.md', 'DISCLAIMER.md'
] as const
const NOTICE_PATHS = [
    'licenses/Node.js-LICENSE.txt', 'licenses/AdmZip-LICENSE.txt'
] as const
const LAUNCHER = [
    '@echo off',
    'setlocal',
    'rem Local-only temporary QA. No auto-creation, login, install or update.',
    'if "%~1"=="" (',
    '  echo OFFLINE_READER_QA_ONLY: pass the absolute path to an existing disposable QA library.',
    '  exit /b 2',
    ')',
    '"%~dp0runtime\\node.exe" "%~dp0app\\core.mjs" serve --root "%~1"',
    'exit /b %ERRORLEVEL%'
].join('\r\n') + '\r\n'
const README = [
    'Pica Library - OFFLINE READER PORTABLE ENGINEERING QA ONLY',
    'UNSIGNED / NOT DISTRIBUTABLE / NOT AN OFFICIAL RELEASE.',
    '',
    'No Pica, EH, ExH, JM, online sources, downloader, account, Host or updater.',
    'Only a disposable QA library can be opened. Existing v0.5.0 user',
    'profiles are never migrated or opened by this test candidate.',
    '',
    'One-time test-only initialization of a NEW, nonexistent directory:',
    '  runtime\\node.exe app\\core.mjs init --root ABSOLUTE_PATH --confirm-disposable',
    'Test-only import of your OWN local folder/CBZ (explicit permission):',
    '  runtime\\node.exe app\\core.mjs import --root ABSOLUTE_PATH --path ABSOLUTE_SOURCE --kind folder --confirm',
    'Start-Offline-Reader-QA.cmd ABSOLUTE_PATH',
    'Copy the one-time http://127.0.0.1 URL printed in the terminal into a browser.',
    'Close the command window to terminate the temporary local listener.',
    '',
    'This candidate is built and destroyed by CI. It is not signed or published.',
    'It does not prove production Windows app UI, source isolation as an OS',
    'sandbox, a v0.5.0 upgrade, or Android feature parity.'
].join('\r\n') + '\r\n'

function sha256(data: Uint8Array) {
    return createHash('sha256').update(data).digest('hex')
}
function checkedFile(file: string, limit: number, allowHardlink = false) {
    if (!path.isAbsolute(file)) throw new Error('QA runtime input must be absolute')
    const info = fs.lstatSync(file)
    if (!info.isFile() || info.isSymbolicLink() ||
        (!allowHardlink && info.nlink !== 1) ||
        info.size < 1 || info.size > limit)
        throw new Error('Unsafe QA file ' + JSON.stringify({
            name: path.basename(file), bytes: info.size,
            hardlinks: info.nlink, expectedMax: limit
        }))
    return fs.readFileSync(file)
}
function admZipLicense() {
    const folder = fs.realpathSync.native(path.join(ROOT, 'node_modules', 'adm-zip'))
    const metadata = JSON.parse(
        checkedFile(path.join(folder, 'package.json'), 100_000, true).toString('utf8')
    ) as { name?: unknown; license?: unknown }
    if (metadata.name !== 'adm-zip' || metadata.license !== 'MIT')
        throw new Error('Bundled AdmZip license metadata changed')
    const names = fs.readdirSync(folder).filter(name =>
        /^licen[sc]e(?:\..+)?$/i.test(name))
    if (names.length !== 1)
        throw new Error('AdmZip license requires manual inventory review')
    // pnpm intentionally hard-links audited package files into its virtual
    // store. A hard-linked license inside the exactly verified ADM-Zip package
    // is safe to COPY; this exception never applies to Node.exe, archive
    // credentials, project files or an executable payload.
    return checkedFile(path.join(folder, names[0]), 1024 * 1024, true)
}

export interface WindowsOfflinePortableInput {
    runtimeExe: string
    runtimeLicense: string
    verifiedRuntimeArchiveSha256: string
    sourceSha: string
}
export interface WindowsOfflinePortableQa {
    directory: string
    packageRoot: string
    zipPath: string
    manifestPath: string
    manifest: {
        schemaVersion: 1
        label: string
        sourceSha: string
        runtimeVersion: string
        verifiedNodeArchiveSha256: string
        executableSourceFree: boolean
        sourceCount: 0
        userInstallable: false
        signed: false
        publishAuthorized: false
        otaChanged: false
        files: Array<{ path: string; sha256: string; bytes: number }>
    }
}
function fileSource(name: string) {
    return checkedFile(path.join(ROOT, name), 1024 * 1024)
}
function ensureWithinTemp(file: string) {
    const tempRoot = fs.realpathSync.native(os.tmpdir())
    const real = fs.realpathSync.native(file)
    const relative = path.relative(tempRoot, real)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
        throw new Error('QA artifact must remain under OS temporary directory')
}
export async function buildWindowsOfflinePortableQa(
    options: WindowsOfflinePortableInput
): Promise<WindowsOfflinePortableQa> {
    if (process.platform !== 'win32' || process.arch !== 'x64')
        throw new Error('Portable Windows QA must run on Windows x64')
    if (!SOURCE_SHA.test(options.sourceSha) ||
        !SHA256.test(options.verifiedRuntimeArchiveSha256))
        throw new Error('Missing validated source or official runtime archive identity')
    const runtime = checkedFile(options.runtimeExe, MAX_RUNTIME)
    const license = checkedFile(options.runtimeLicense, 8 * 1024 * 1024)
    const version = spawnSync(options.runtimeExe, ['--version'], {
        encoding: 'utf8', timeout: 15_000, windowsHide: true
    })
    if (version.error || version.status !== 0 ||
        version.stdout.trim() !== 'v' + OFFLINE_PORTABLE_NODE_VERSION)
        throw new Error('Verified Node Windows runtime version mismatch')

    const candidate = await buildOfflineCoreCandidate()
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-s3-portable-'))
    ensureWithinTemp(directory)
    const root = path.join(directory, 'portable')
    fs.mkdirSync(root, { mode: 0o700 })
    const bytes = new Map<string, Uint8Array>()
    function add(name: string, value: Uint8Array) {
        if (name.includes('..') || name.includes('\\') ||
            name.startsWith('/') || bytes.has(name))
            throw new Error('Unsafe QA portable package entry')
        const destination = path.join(root, ...name.split('/'))
        fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
        fs.writeFileSync(destination, value, { flag: 'wx', mode: 0o600 })
        const copy = fs.readFileSync(destination)
        if (!copy.equals(Buffer.from(value)))
            throw new Error('Portable QA source changed when staged')
        bytes.set(name, copy)
    }
    add('app/core.mjs', candidate.bytes)
    add('runtime/node.exe', runtime)
    for (const name of TOP_LEVEL) add(name, fileSource(name))
    add(NOTICE_PATHS[0], license)
    add(NOTICE_PATHS[1], admZipLicense())
    add('Start-Offline-Reader-QA.cmd', Buffer.from(LAUNCHER))
    add('README-OFFLINE-QA.txt', Buffer.from(README))
    const staged = stageOfflineReaderAssetsQa(path.join(root, 'app', 'web'))
    if (staged.count !== OFFLINE_READER_ASSETS.length + 1 ||
        staged.sources !== 0)
        throw new Error('Portable core has unexpected Reader assets')
    for (const row of staged.files) {
        const name = 'app/web/' + row.name
        const data = fs.readFileSync(path.join(root, ...name.split('/')))
        if (sha256(data) !== row.sha256 || data.byteLength !== row.size)
            throw new Error('Reader assets do not match their trusted stage')
        bytes.set(name, data)
    }

    const entries = [...bytes].map(([entry, value]) => ({
        path: entry, sha256: sha256(value), bytes: value.length
    })).sort((a, b) => a.path.localeCompare(b.path, 'en'))
    if (entries.length !== 20 ||
        entries.some(item => /(?:^|\/)(?:node_modules|\.git|library\.db|app\.js|source-hosts\.js|eh-account\.js|jm-account\.js)(?:\/|$)/i.test(item.path)))
        throw new Error('Portable QA package inventory includes forbidden files')

    const manifest: WindowsOfflinePortableQa['manifest'] = {
        schemaVersion: 1,
        label: 'UNSIGNED_S3_WINDOWS_X64_PORTABLE_QA_ONLY',
        sourceSha: options.sourceSha,
        runtimeVersion: OFFLINE_PORTABLE_NODE_VERSION,
        verifiedNodeArchiveSha256: options.verifiedRuntimeArchiveSha256,
        executableSourceFree: true,
        sourceCount: 0,
        userInstallable: false,
        signed: false,
        publishAuthorized: false,
        otaChanged: false,
        files: entries
    }
    const manifestPath = path.join(root, 'BUILD-MANIFEST.json')
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
    fs.writeFileSync(manifestPath, manifestBytes, { flag: 'wx', mode: 0o600 })
    const zip = new AdmZip()
    for (const name of [...bytes.keys(), 'BUILD-MANIFEST.json'].sort()) {
        const data = name === 'BUILD-MANIFEST.json'
            ? manifestBytes : Buffer.from(bytes.get(name)!)
        zip.addFile(name, data)
        const entry = zip.getEntry(name)
        if (!entry) throw new Error('Portable QA ZIP entry missing')
        entry.header.time = ZIP_TIMESTAMP
    }
    const zipPath = path.join(directory, 'offline-source-free-reader-qa-windows-x64.zip')
    zip.writeZip(zipPath)
    const check = new AdmZip(zipPath).getEntries()
    if (check.length !== 21 ||
        check.some(entry => entry.isDirectory ||
            ![...bytes.keys(), 'BUILD-MANIFEST.json'].includes(entry.entryName)))
        throw new Error('Portable QA ZIP file list changed after assembly')
    return {
        directory, packageRoot: root, zipPath, manifestPath, manifest
    }
}

async function main() {
    const args = process.argv.slice(2)
    if (args.length !== 8 ||
        args[0] !== '--runtime' || args[2] !== '--runtime-license' ||
        args[4] !== '--archive-sha256' || args[6] !== '--source-sha')
        throw new Error('Expected fixed runtime/license/archive/source CI inputs')
    const built = await buildWindowsOfflinePortableQa({
        runtimeExe: args[1],
        runtimeLicense: args[3],
        verifiedRuntimeArchiveSha256: args[5],
        sourceSha: args[7]
    })
    process.stdout.write(JSON.stringify({
        status: built.manifest.label,
        packageRoot: built.packageRoot,
        zipPath: built.zipPath,
        manifestPath: built.manifestPath,
        fileCount: built.manifest.files.length + 1,
        zipSha256: sha256(fs.readFileSync(built.zipPath)),
        nodeExeSha256: built.manifest.files.find(row =>
            row.path === 'runtime/node.exe')?.sha256,
        verifiedNodeArchiveSha256: built.manifest.verifiedNodeArchiveSha256,
        publishAuthorized: false,
        artifactUploaded: false
    }, null, 2) + '\n')
}
if (process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    main().catch(error => {
        process.stderr.write(String(error instanceof Error ? error.message : error) + '\n')
        process.exitCode = 1
    })
