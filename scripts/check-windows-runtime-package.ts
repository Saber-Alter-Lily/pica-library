import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import AdmZip from 'adm-zip'
import { compositionFromPayload, RUNTIME_COMPOSITION_PATH, sameRuntimeComposition } from '../src/modules/runtime-composition'

/** Reads an actual ZIP; never extracts or executes application/source code. Not a content/licensing audit. */
export function checkWindowsRuntimePackage(file: string, mode: 'core' | 'jm', expectedSourceSha: string) {
    if (!['core', 'jm'].includes(mode) || !/^[0-9a-f]{40}$/.test(expectedSourceSha)) throw Error('Explicit composition and source SHA required')
    const bytes = fs.readFileSync(file), zip = new AdmZip(bytes), entries = zip.getEntries().filter(entry => !entry.isDirectory)
    const names = entries.map(entry => entry.entryName)
    for (const entry of entries) {
        if (entry.entryName.includes('\\') || entry.entryName.includes('\0') || entry.entryName.split('/').some(segment => !segment || segment === '.' || segment === '..' || /[:. ]$/.test(segment)) || entry.entryName.includes(':')) throw Error('Unsafe package path')
        if (((entry.attr >>> 16) & 0o170000) === 0o120000) throw Error('Linked package file')
        if (/(?:^|\/)(?:credentials\.dat|remote-storage\.json|library\.db(?:-wal|-shm)?|\.env(?:\..*)?)$|\.(?:cbz|cbr|epub|pdf)$/i.test(entry.entryName)) throw Error('Private state or comic/document payload in application package')
    }
    for (const name of ['Pica Library.exe', 'runtime/node.exe', 'app/desktop.js', 'app/updater.js', 'app/full-upgrader.js', 'SOURCE_SHA.txt', RUNTIME_COMPOSITION_PATH])
        if (!names.includes(name)) throw Error('Incomplete declared application package: ' + name)
    const descriptor = zip.readAsText(RUNTIME_COMPOSITION_PATH)
    const composition = compositionFromPayload(names, descriptor)
    if (!sameRuntimeComposition(composition, { formatVersion: 1, sourceRuntimes: mode === 'jm' ? ['jm'] : [] })) throw Error('Unexpected package composition')
    if (zip.readAsText('SOURCE_SHA.txt').trim() !== expectedSourceSha) throw Error('Unexpected package source SHA')
    const runtimeEntries = entries.filter(entry => entry.entryName.startsWith('runtime/'))
    if (runtimeEntries.some(entry => entry.entryName !== 'runtime/node.exe' && !(mode === 'jm' && entry.entryName.startsWith('runtime/jm/')))) throw Error('Unexpected executable runtime payload')
    const sourceEntries = runtimeEntries.filter(entry => entry.entryName.startsWith('runtime/jm/'))
    return { file: path.resolve(file), sha256: createHash('sha256').update(bytes).digest('hex'), sourceSha: expectedSourceSha,
        composition, files: entries.length, sourceRuntimeFiles: sourceEntries.length,
        sourceRuntimeUncompressedBytes: sourceEntries.reduce((total, entry) => total + entry.header.size, 0),
        applicationOrJavaExecuted: false, semanticContentAndLicenseAudit: 'NOT_ESTABLISHED' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const [file, mode, sourceSha, ...extra] = process.argv.slice(2)
    if (!file || !['core', 'jm'].includes(mode) || !sourceSha || extra.length) throw Error('Usage: tsx scripts/check-windows-runtime-package.ts <zip> <core|jm> <source-sha>')
    console.log(JSON.stringify(checkWindowsRuntimePackage(file, mode as 'core' | 'jm', sourceSha), null, 2))
}
