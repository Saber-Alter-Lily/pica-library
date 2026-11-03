import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export interface UserStateSnapshotContext {
    bootstrapRoot: string
    desktopHomeRoot: string
    libraryDirectory: string
}

interface FileDigest {
    path: string
    bytes: number
    sha256: string
}

interface ProtectedInventory {
    configExisted: boolean
    databaseExisted: boolean
    files: FileDigest[]
}

interface VerifiedSnapshotReceipt extends ProtectedInventory {
    schemaVersion: 2
}

const incomplete = 'User-state snapshot is incomplete or changed; recovery copies retained'

function optionalStat(file: string) {
    try { return fs.lstatSync(file) }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
    }
}

function digestRegularFile(file: string) {
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(incomplete)
    const hash = createHash('sha256')
    const block = Buffer.allocUnsafe(1024 * 1024)
    const descriptor = fs.openSync(file, 'r')
    let bytes = 0
    try {
        for (;;) {
            const count = fs.readSync(descriptor, block, 0, block.length, null)
            if (count === 0) break
            hash.update(block.subarray(0, count))
            bytes += count
        }
    } finally {
        fs.closeSync(descriptor)
    }
    if (bytes !== stat.size) throw new Error(incomplete)
    return { bytes, sha256: hash.digest('hex') }
}

function walkDirectory(directory: string, prefix: string, files: FileDigest[]) {
    const stat = fs.lstatSync(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(incomplete)
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name)
        const relative = prefix + '/' + entry.name
        if (entry.isSymbolicLink()) throw new Error(incomplete)
        if (entry.isDirectory()) walkDirectory(file, relative, files)
        else if (entry.isFile()) files.push({ path: relative, ...digestRegularFile(file) })
        else throw new Error(incomplete)
    }
}

function inventory(config: string, database: string): ProtectedInventory {
    const files: FileDigest[] = []
    const configExisted = optionalStat(config) !== null
    if (configExisted) walkDirectory(config, 'config', files)
    const databaseExisted = optionalStat(database) !== null
    for (const suffix of ['', '-wal', '-shm']) {
        const file = database + suffix
        if (optionalStat(file)) {
            if (!databaseExisted) throw new Error(incomplete)
            files.push({ path: 'database/library.db' + suffix, ...digestRegularFile(file) })
        }
    }
    files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    return { configExisted, databaseExisted, files }
}

function sameInventory(first: ProtectedInventory, second: ProtectedInventory) {
    return first.configExisted === second.configExisted &&
        first.databaseExisted === second.databaseExisted &&
        JSON.stringify(first.files) === JSON.stringify(second.files)
}

export function copyTree(source: string, destination: string) {
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.cpSync(source, destination, {
        recursive: true,
        force: true,
        errorOnExist: false
    })
}

/** The application has stopped before this is called; no SQLite connection or profile migration. */
export function snapshotUserState(instruction: UserStateSnapshotContext) {
    const snapshot = path.join(instruction.bootstrapRoot, 'user-state-snapshot')
    if (optionalStat(snapshot)) throw new Error('User-state snapshot directory already exists')
    const config = path.join(instruction.desktopHomeRoot, 'config')
    const database = path.join(instruction.libraryDirectory, 'library.db')
    const before = inventory(config, database)
    fs.mkdirSync(snapshot, { recursive: true })
    if (before.configExisted) copyTree(config, path.join(snapshot, 'config'))
    const databaseSnapshot = path.join(snapshot, 'database')
    fs.mkdirSync(databaseSnapshot, { recursive: true })
    for (const suffix of ['', '-wal', '-shm']) {
        const source = database + suffix
        if (optionalStat(source))
            fs.copyFileSync(source, path.join(databaseSnapshot, 'library.db' + suffix))
    }
    const copied = inventory(path.join(snapshot, 'config'), path.join(databaseSnapshot, 'library.db'))
    if (!sameInventory(before, copied) || !sameInventory(before, inventory(config, database)))
        throw new Error(incomplete)
    const receipt: VerifiedSnapshotReceipt = { schemaVersion: 2, ...copied }
    fs.writeFileSync(path.join(snapshot, 'snapshot.json'), JSON.stringify(receipt), { flag: 'wx' })
    return snapshot
}

/** Verify the entire retained snapshot BEFORE touching any current config or database file. */
export function restoreUserState(instruction: UserStateSnapshotContext, snapshot: string) {
    const savedConfig = path.join(snapshot, 'config')
    const savedDatabase = path.join(snapshot, 'database')
    const record: unknown = JSON.parse(fs.readFileSync(path.join(snapshot, 'snapshot.json'), 'utf8'))
    if (!record || typeof record !== 'object' || !('schemaVersion' in record))
        throw new Error(incomplete)
    const version = record.schemaVersion
    let expected: ProtectedInventory | null = null
    if (version === 2) {
        const candidate = record as VerifiedSnapshotReceipt
        const saved = inventory(savedConfig, path.join(savedDatabase, 'library.db'))
        if (typeof candidate.configExisted !== 'boolean' ||
            typeof candidate.databaseExisted !== 'boolean' ||
            !Array.isArray(candidate.files) || !sameInventory(candidate, saved))
            throw new Error(incomplete)
        expected = saved
    } else if (version !== 1 || !('configExisted' in record) ||
        typeof record.configExisted !== 'boolean' ||
        record.configExisted !== Boolean(optionalStat(savedConfig))) {
        throw new Error(incomplete)
    }

    const config = path.join(instruction.desktopHomeRoot, 'config')
    fs.rmSync(config, { recursive: true, force: true })
    if (optionalStat(savedConfig)) copyTree(savedConfig, config)
    const database = path.join(instruction.libraryDirectory, 'library.db')
    for (const suffix of ['', '-wal', '-shm']) {
        const target = database + suffix
        fs.rmSync(target, { force: true })
        const source = path.join(savedDatabase, 'library.db' + suffix)
        if (optionalStat(source)) {
            fs.mkdirSync(path.dirname(target), { recursive: true })
            fs.copyFileSync(source, target)
        }
    }
    if (expected && !sameInventory(expected, inventory(config, database)))
        throw new Error(incomplete)
}
