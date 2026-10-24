import fs from 'node:fs'
import path from 'node:path'
export interface UserStateSnapshotContext {
    bootstrapRoot: string
    desktopHomeRoot: string
    libraryDirectory: string
}

export function copyTree(source: string, destination: string) {
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.cpSync(source, destination, {
        recursive: true,
        force: true,
        errorOnExist: false
    })
}

export function snapshotUserState(instruction: UserStateSnapshotContext) {
    const snapshot = path.join(instruction.bootstrapRoot, 'user-state-snapshot')
    if (fs.existsSync(snapshot))
        throw new Error('User-state snapshot directory already exists')
    fs.mkdirSync(snapshot, { recursive: true })

    const config = path.join(instruction.desktopHomeRoot, 'config')
    if (fs.existsSync(config)) copyTree(config, path.join(snapshot, 'config'))

    const database = path.join(instruction.libraryDirectory, 'library.db')
    const databaseSnapshot = path.join(snapshot, 'database')
    fs.mkdirSync(databaseSnapshot, { recursive: true })
    for (const suffix of ['', '-wal', '-shm']) {
        const source = database + suffix
        if (fs.existsSync(source))
            fs.copyFileSync(
                source,
                path.join(databaseSnapshot, 'library.db' + suffix)
            )
    }
    fs.writeFileSync(
        path.join(snapshot, 'snapshot.json'),
        JSON.stringify({
            schemaVersion: 1,
            configExisted: fs.existsSync(config)
        }),
        'utf8'
    )
    return snapshot
}

export function restoreUserState(
    instruction: UserStateSnapshotContext,
    snapshot: string
) {
    const savedConfig = path.join(snapshot, 'config')
    const config = path.join(instruction.desktopHomeRoot, 'config')
    const record = JSON.parse(
        fs.readFileSync(path.join(snapshot, 'snapshot.json'), 'utf8')
    )
    if (
        record.schemaVersion !== 1 ||
        typeof record.configExisted !== 'boolean' ||
        record.configExisted !== fs.existsSync(savedConfig)
    )
        throw new Error(
            'User-state snapshot is incomplete; recovery copies retained'
        )
    fs.rmSync(config, { recursive: true, force: true })
    if (record.configExisted) copyTree(savedConfig, config)

    const database = path.join(instruction.libraryDirectory, 'library.db')
    const savedDatabase = path.join(snapshot, 'database')
    for (const suffix of ['', '-wal', '-shm']) {
        const target = database + suffix
        fs.rmSync(target, { force: true })
        const source = path.join(savedDatabase, 'library.db' + suffix)
        if (fs.existsSync(source)) {
            fs.mkdirSync(path.dirname(target), { recursive: true })
            fs.copyFileSync(source, target)
        }
    }
}
