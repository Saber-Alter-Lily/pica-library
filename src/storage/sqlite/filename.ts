import path from 'node:path'

// SQLite's built-in win32-longpath VFS retains the ordinary Windows locks.
// Keep the logical filename outside this adapter: manifests/backups/configs must
// never store this URI or move an existing database to a different location.
const recoverySuffix = '.pre-unreleased-schema-reconcile.bak'
const windowsPathCharacters = 32766 // Excludes the terminating NUL.
const windowsLongVfsBytes = 65534
const windowsDefaultVfsBytes = 1040

function uriFilenamesAvailable(version: string) {
    const [major, minor] = version.split('.').map(Number)
    return (
        major >= 24 ||
        (major === 23 && minor >= 10) ||
        (major === 22 && minor >= 15)
    )
}

export class SqliteFilenameError extends Error {
    readonly code = 'SQLITE_DATA_PATH_UNSUPPORTED'
}

/** Pure disk-path/SQLite adapter. It neither opens files nor changes Windows settings. */
export function sqliteDiskFilename(
    file: string,
    platform: NodeJS.Platform = process.platform,
    nodeVersion = process.versions.node
) {
    if (platform !== 'win32') return file
    if (!path.win32.isAbsolute(file) || file.includes('\0'))
        throw new SqliteFilenameError(
            'Choose an absolute database file path / 请选择绝对路径'
        )

    const filename = path.win32.toNamespacedPath(file)
    // Reserve our existing recovery filename as well as SQLite's WAL/journal.
    // This is a native filesystem/VFS limit, not the old MAX_PATH=260 cap.
    if (
        filename.length + recoverySuffix.length > windowsPathCharacters ||
        Buffer.byteLength(filename + recoverySuffix, 'utf8') >
            windowsLongVfsBytes ||
        path.win32.basename(filename).length + recoverySuffix.length > 255
    )
        throw new SqliteFilenameError(
            '数据库路径超过 Windows/SQLite 文件系统限制，请选择较短的数据目录；现有数据不会自动移动或清空。 / Database path exceeds the Windows/SQLite filesystem limit; choose a shorter data folder. Existing data is not moved or cleared.'
        )

    if (!uriFilenamesAvailable(nodeVersion)) {
        // Preserve short-path compatibility for the originally supported Node22.5.
        // Never let an older runtime interpret a SQLite URI as a literal filename.
        if (Buffer.byteLength(filename, 'utf8') + 8 > windowsDefaultVfsBytes)
            throw new SqliteFilenameError(
                '此深路径需要新版 Windows 内置运行时，请使用完整应用包升级；数据不会移动。 / This deep path requires a newer bundled runtime; use a full application upgrade. Data is not moved.'
            )
        return filename
    }

    // Encode the complete path, including the namespace prefix, so filename
    // characters cannot become SQLite URI options (mode/immutable/nolock/etc.).
    return `file:${encodeURIComponent(filename)}?vfs=win32-longpath`
}
