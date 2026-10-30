import fs from 'node:fs'
import path from 'node:path'
import { LibraryDatabase } from '../library/database'

const PROFILE_DIR = 'Pica Library Local'
const MARKER = '.pica-source-free-local-v1'
const MARKER_TEXT = 'PICA_SOURCE_FREE_LOCAL_V1\n'

/**
 * An explicitly selected, persistent source-free library beside the legacy
 * "Pica Library" folder. Never adopt an unmarked directory or migrate v0.5.0
 * automatically. The existing LibraryDatabase remains the only DB engine.
 */
export function openOrCreateIsolatedLocalProfile(appDataDirectory: string) {
    if (!path.isAbsolute(appDataDirectory))
        throw new Error('Source-free profile requires an absolute AppData root')
    const base = fs.realpathSync.native(appDataDirectory)
    const parent = fs.lstatSync(base)
    if (!parent.isDirectory() || parent.isSymbolicLink())
        throw new Error('Source-free profile parent is unavailable')

    const root = path.join(base, PROFILE_DIR)
    const existing = fs.lstatSync(root, { throwIfNoEntry: false })
    if (!existing) {
        // Exclusive creation. An existing legacy/custom folder is never erased,
        // migrated or silently adopted by a newly launched local-only app.
        fs.mkdirSync(root, { mode: 0o700 })
        const database = new LibraryDatabase(path.join(root, 'library.db'))
        database.close()
        fs.writeFileSync(path.join(root, MARKER), MARKER_TEXT, {
            flag: 'wx', mode: 0o600
        })
    }
    const directory = fs.lstatSync(root)
    if (!directory.isDirectory() || directory.isSymbolicLink())
        throw new Error('Source-free profile is not an owned directory')
    for (const file of [MARKER, 'library.db']) {
        const info = fs.lstatSync(path.join(root, file), {
            throwIfNoEntry: false
        })
        if (!info?.isFile() || info.isSymbolicLink() || info.nlink !== 1)
            throw new Error('Source-free profile is incomplete or unowned')
    }
    if (fs.readFileSync(path.join(root, MARKER), 'utf8') !== MARKER_TEXT)
        throw new Error('Source-free profile belongs to a different application')
    return fs.realpathSync.native(root)
}

export function openWindowsLocalProfile() {
    if (process.platform !== 'win32' || !process.env.LOCALAPPDATA)
        throw new Error('Persistent source-free local mode requires Windows AppData')
    return openOrCreateIsolatedLocalProfile(process.env.LOCALAPPDATA)
}
