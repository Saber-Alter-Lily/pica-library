import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** One shared ownership fence for all disposable source-free core entrypoints. */
export const OFFLINE_QA_SENTINEL = '.pica-offline-core-qa-v1'
export const OFFLINE_QA_SENTINEL_TEXT = 'PICA_OFFLINE_CORE_QA_V1\n'

export function assertDisposableCoreRoot(root: string) {
    if (typeof root !== 'string' || !path.isAbsolute(root))
        throw new Error('QA data root must be absolute')
    const status = fs.lstatSync(root, { throwIfNoEntry: false })
    if (!status?.isDirectory() || status.isSymbolicLink())
        throw new Error('QA data root is not a regular directory')
    const marker = path.join(root, OFFLINE_QA_SENTINEL)
    const info = fs.lstatSync(marker, { throwIfNoEntry: false })
    if (!info?.isFile() || info.isSymbolicLink() || info.nlink !== 1 ||
        fs.readFileSync(marker, 'utf8') !== OFFLINE_QA_SENTINEL_TEXT)
        throw new Error('This directory is not an owned disposable QA root')
    const dbFile = path.join(root, 'library.db')
    const dbInfo = fs.lstatSync(dbFile, { throwIfNoEntry: false })
    if (!dbInfo || !dbInfo.isFile() || dbInfo.isSymbolicLink() ||
        dbInfo.nlink !== 1)
        throw new Error('QA library database is absent or unsafe')
}

/** A native Desktop preview may never open an installed/user data directory. */
export function assertTemporaryCorePreviewRoot(root: string) {
    assertDisposableCoreRoot(root)
    const nativeTemp = fs.realpathSync.native(os.tmpdir())
    const nativeRoot = fs.realpathSync.native(root)
    const relative = path.relative(nativeTemp, nativeRoot)
    if (!relative || relative.startsWith('..') ||
        path.isAbsolute(relative))
        throw new Error('Source-free Desktop preview must use owned OS temp')
    return nativeRoot
}
