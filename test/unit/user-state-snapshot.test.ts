import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { restoreUserState, snapshotUserState, type UserStateSnapshotContext } from '../../src/update/user-state-snapshot'

const roots: string[] = []
function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-r4-snapshot-'))
    roots.push(root)
    const input: UserStateSnapshotContext = {
        bootstrapRoot: path.join(root, 'bootstrap'),
        desktopHomeRoot: path.join(root, 'user-home'),
        libraryDirectory: path.join(root, 'library')
    }
    for (const directory of [input.bootstrapRoot, path.join(input.desktopHomeRoot, 'config', 'nested'), input.libraryDirectory])
        fs.mkdirSync(directory, { recursive: true })
    const config = path.join(input.desktopHomeRoot, 'config', 'nested', 'settings.json')
    const database = path.join(input.libraryDirectory, 'library.db')
    fs.writeFileSync(config, '{"preference":"old"}')
    fs.writeFileSync(database, 'synthetic original database')
    fs.writeFileSync(database + '-wal', 'synthetic committed WAL')
    return { input, config, database }
}
afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('R4 full-upgrade user-state snapshot safety', () => {
    it('restores config, database and WAL from a verified receipt, without touching library bodies', () => {
        const f = fixture()
        const body = path.join(f.input.libraryDirectory, 'library', 'page.png')
        fs.mkdirSync(path.dirname(body), { recursive: true })
        fs.writeFileSync(body, 'original comic page')
        const snapshot = snapshotUserState(f.input)
        const receipt = JSON.parse(fs.readFileSync(path.join(snapshot, 'snapshot.json'), 'utf8'))
        expect(receipt).toMatchObject({ schemaVersion: 2, databaseExisted: true, configExisted: true })
        expect(receipt.files.map((file: { path: string }) => file.path)).toEqual([
            'config/nested/settings.json', 'database/library.db', 'database/library.db-wal'
        ])
        fs.writeFileSync(f.config, '{"preference":"new"}')
        fs.writeFileSync(f.database, 'new database')
        fs.rmSync(f.database + '-wal')
        restoreUserState(f.input, snapshot)
        expect(fs.readFileSync(f.config, 'utf8')).toBe('{"preference":"old"}')
        expect(fs.readFileSync(f.database, 'utf8')).toBe('synthetic original database')
        expect(fs.readFileSync(f.database + '-wal', 'utf8')).toBe('synthetic committed WAL')
        expect(fs.readFileSync(body, 'utf8')).toBe('original comic page')
    })

    it('rejects missing or changed snapshot files before removing current profile state', () => {
        const f = fixture()
        const snapshot = snapshotUserState(f.input)
        fs.writeFileSync(f.config, 'current preference must survive')
        fs.writeFileSync(f.database, 'current DB must survive')
        fs.appendFileSync(path.join(snapshot, 'database', 'library.db'), 'tampered')
        expect(() => restoreUserState(f.input, snapshot)).toThrow(/snapshot is incomplete or changed/)
        expect(fs.readFileSync(f.config, 'utf8')).toBe('current preference must survive')
        expect(fs.readFileSync(f.database, 'utf8')).toBe('current DB must survive')
        fs.rmSync(path.join(snapshot, 'database', 'library.db'))
        expect(() => restoreUserState(f.input, snapshot)).toThrow(/snapshot is incomplete or changed/)
        expect(fs.readFileSync(f.database, 'utf8')).toBe('current DB must survive')
    })

    it('can still restore an existing schema-v1 recovery snapshot', () => {
        const f = fixture()
        const snapshot = path.join(f.input.bootstrapRoot, 'user-state-snapshot')
        fs.mkdirSync(path.join(snapshot, 'database'), { recursive: true })
        fs.cpSync(path.join(f.input.desktopHomeRoot, 'config'), path.join(snapshot, 'config'), { recursive: true })
        fs.copyFileSync(f.database, path.join(snapshot, 'database', 'library.db'))
        fs.copyFileSync(f.database + '-wal', path.join(snapshot, 'database', 'library.db-wal'))
        fs.writeFileSync(path.join(snapshot, 'snapshot.json'), JSON.stringify({ schemaVersion: 1, configExisted: true }))
        fs.writeFileSync(f.config, 'modified')
        restoreUserState(f.input, snapshot)
        expect(fs.readFileSync(f.config, 'utf8')).toBe('{"preference":"old"}')
    })
})
