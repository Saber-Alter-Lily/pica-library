/**
 * Source-free Reader QA asset stage, NOT an updater, signing tool or release.
 *
 * Only the existing Reader DOM fragment plus its exact approved style and
 * source-neutral browser modules are copied into a new OS-temp directory.
 * The normal Web app.js, accounts, provider code, remote source views,
 * recommendation engine and full index.html are NOT staged.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const WEB = path.join(ROOT, 'web')
const MARKUP_SOURCE = 'index.html'
export const OFFLINE_READER_ASSETS = Object.freeze([
    'offline-core-reader-qa.js',
    'reader-input.js',
    'reader-progress.js',
    'reader-settings.js',
    'reader-viewport.js',
    'styles.css',
    'alpha8-6.css',
    'ui-polish-v5.css',
    'pica-library-icon.webp'
] as const)

function readSafe(name: string) {
    const filename = path.join(WEB, name)
    const stat = fs.lstatSync(filename)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
        stat.size < 1 || stat.size > 1024 * 1024)
        throw new Error('Unsafe Reader QA source asset: ' + name)
    return fs.readFileSync(filename)
}

function readerFragment() {
    const html = readSafe(MARKUP_SOURCE).toString('utf8')
    const start = '<section id="reader" class="view reader-view">'
    const begin = html.indexOf(start)
    const end = html.indexOf('</section>', begin)
    if (begin < 0 || end < 0 || html.indexOf(start, begin + start.length) >= 0)
        throw new Error('Pica Web Reader section is missing or duplicated')
    const section = html.slice(begin, end + '</section>'.length)
    for (const id of [
        'reader-pages', 'reader-chapters', 'reader-mode',
        'reader-direction', 'reader-fit', 'reader-exit', 'reader-message'
    ]) if (!section.includes('id="' + id + '"'))
        throw new Error('Reader markup requires manual compatibility review')
    if (/<(?:script|iframe|form)\b/i.test(section))
        throw new Error('Unexpected executable or login markup in Reader section')
    return Buffer.from(section, 'utf8')
}
function sha256(data: Uint8Array) {
    return createHash('sha256').update(data).digest('hex')
}
/** Caller-supplied destination must be a *nonexistent* subdirectory of OS temp. */
export function stageOfflineReaderAssetsQa(destination: string) {
    const tempRoot = fs.realpathSync.native(os.tmpdir())
    if (typeof destination !== 'string' || !path.isAbsolute(destination))
        throw new Error('Offline Reader QA stage must use an absolute temp path')
    const target = path.resolve(destination)
    const relative = path.relative(tempRoot, target)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
        throw new Error('Offline Reader QA assets must remain in OS temp')
    // fs.mkdir without recursive means the staging root must not exist and
    // the only parent is an already-created disposable QA fixture directory.
    const parent = fs.realpathSync.native(path.dirname(target))
    const parentRelative = path.relative(tempRoot, parent)
    if (!parentRelative || parentRelative.startsWith('..') ||
        path.isAbsolute(parentRelative) || fs.existsSync(target))
        throw new Error('Offline Reader QA stage destination is not disposable')
    fs.mkdirSync(target, { mode: 0o700 })
    const entries: Array<{ name: string; size: number; sha256: string }> = []
    for (const [name, data] of [
        ...OFFLINE_READER_ASSETS.map(name => [name, readSafe(name)] as const),
        ['reader-fragment.html', readerFragment()] as const
    ]) {
        fs.writeFileSync(path.join(target, name), data, {
            flag: 'wx', mode: 0o600
        })
        const copied = fs.readFileSync(path.join(target, name))
        if (!copied.equals(data))
            throw new Error('Offline Reader QA asset changed during staging')
        entries.push({ name, size: copied.length, sha256: sha256(copied) })
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    return {
        status: 'UNSIGNED_OFFLINE_READER_QA_ASSETS',
        sources: 0, files: entries, count: entries.length,
        runnableAppReleased: false
    }
}
