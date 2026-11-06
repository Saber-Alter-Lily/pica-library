import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import {
    auditLegacyDesktopProfileReadOnly
} from '../../src/desktop/legacy-profile-preflight'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root =>
    fs.rmSync(root, { recursive: true, force: true })
))
function fixture() {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-v050-readonly-'))
    roots.push(home)
    const root = path.join(home, 'Pica Library')
    const data = path.join(root, 'data')
    const config = path.join(root, 'config')
    fs.mkdirSync(data, { recursive: true })
    fs.mkdirSync(config)
    const db = new LibraryDatabase(path.join(data, 'library.db'))
    db.close()
    const configFile = path.join(config, 'config.json')
    const credentialFile = path.join(config, 'credentials.dat')
    const source = {
        schemaVersion: 1, libraryDirectory: data,
        profile: 'balanced', preferredPort: 4789,
        openBrowser: true, externalSources: {
            schemaVersion: 1, revision: 0, enabled: ['pica']
        }
    }
    fs.writeFileSync(configFile, JSON.stringify(source))
    fs.writeFileSync(credentialFile, 'PRIVATE_CREDENTIAL_DO_NOT_READ')
    return { home, root, data, config, configFile, credentialFile, source }
}

describe('v0.5.0 read-only profile migration preflight, no real-user mutations', () => {
    it('produces stable fingerprints without opening credentials or altering DB/config', () => {
        const f = fixture()
        const before = [f.configFile, path.join(f.data, 'library.db')]
            .map(item => ({
                mtime: fs.statSync(item).mtimeMs,
                size: fs.statSync(item).size,
                contents: fs.readFileSync(item)
            }))
        const first = auditLegacyDesktopProfileReadOnly(f.root)
        const second = auditLegacyDesktopProfileReadOnly(f.root)
        expect(first).toEqual(second)
        expect(first).toMatchObject({
            status: 'READ_ONLY_INVENTORY_COMPLETE',
            format: 'PICA_V050_PROFILE_READONLY_PRECHECK_V1',
            libraryLocation: 'inside-profile',
            legacySourcePolicyPresent: true,
            credentialFilePresent: true,
            remoteStorageConfigPresent: false,
            migrationPerformed: false,
            backupCreated: false,
            integrityCheckPerformed: false
        })
        if (first.status !== 'READ_ONLY_INVENTORY_COMPLETE')
            throw new Error('Actual closed SQLite fixture did not pass read-only inventory')
        expect(first.database.bytes).toBeGreaterThan(8192)
        expect(first.database.sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(first.config.sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(JSON.stringify(first)).not.toContain('PRIVATE_CREDENTIAL_DO_NOT_READ')
        expect(JSON.stringify(first)).not.toContain(f.root)
        for (const [index, file] of [
            f.configFile, path.join(f.data, 'library.db')
        ].entries()) {
            expect(fs.statSync(file).mtimeMs).toBe(before[index].mtime)
            expect(fs.statSync(file).size).toBe(before[index].size)
            expect(fs.readFileSync(file)).toEqual(before[index].contents)
        }
    })

    it('blocks even a stale-looking Desktop instance lock without trying to recover or kill it', () => {
        const f = fixture()
        const dir = path.join(f.root, 'runtime-state')
        fs.mkdirSync(dir)
        const lockFile = path.join(dir, 'instance.lock')
        fs.writeFileSync(lockFile, '999999')
        expect(auditLegacyDesktopProfileReadOnly(f.root)).toEqual({
            status: 'BLOCKED', reason: 'DESKTOP_INSTANCE_LOCK_PRESENT',
            migrationPerformed: false
        })
        expect(fs.readFileSync(lockFile, 'utf8')).toBe('999999')
    })

    it('requires separate consent for a valid external library and rejects active WAL/SHM', () => {
        const f = fixture()
        const external = path.join(f.home, 'external')
        fs.mkdirSync(external)
        const next = { ...f.source, libraryDirectory: external }
        fs.writeFileSync(f.configFile, JSON.stringify(next))
        expect(auditLegacyDesktopProfileReadOnly(f.root)).toMatchObject({
            status: 'REVIEW_REQUIRED', reason: 'EXTERNAL_LIBRARY_NEEDS_CONSENT',
            migrationPerformed: false
        })
        fs.writeFileSync(f.configFile, JSON.stringify(f.source))
        const journal = path.join(f.data, 'library.db-wal')
        fs.writeFileSync(journal, 'UNCOMMITTED')
        expect(auditLegacyDesktopProfileReadOnly(f.root)).toMatchObject({
            status: 'REVIEW_REQUIRED', reason: 'SQLITE_SIDECAR_PRESENT',
            migrationPerformed: false
        })
        expect(fs.readFileSync(journal, 'utf8')).toBe('UNCOMMITTED')
    })

    it('rejects missing/invalid config or symlink database without creating anything', () => {
        const f = fixture()
        fs.writeFileSync(f.configFile, '{invalid-json')
        expect(auditLegacyDesktopProfileReadOnly(f.root)).toMatchObject({
            status: 'BLOCKED', reason: 'CONFIG_PARSE_INVALID'
        })
        fs.unlinkSync(f.configFile)
        expect(auditLegacyDesktopProfileReadOnly(f.root)).toMatchObject({
            status: 'BLOCKED', reason: 'CONFIG_READ_UNSAFE'
        })
        expect(auditLegacyDesktopProfileReadOnly('relative-root')).toMatchObject({
            status: 'BLOCKED', reason: 'EXPLICIT_ABSOLUTE_ROOT_REQUIRED'
        })
        if (process.platform !== 'win32') {
            fs.writeFileSync(f.configFile, JSON.stringify(f.source))
            const db = path.join(f.data, 'library.db')
            const moved = db + '.old'
            fs.renameSync(db, moved)
            fs.symlinkSync(moved, db)
            expect(auditLegacyDesktopProfileReadOnly(f.root)).toMatchObject({
                status: 'BLOCKED', reason: 'DATABASE_READ_UNSAFE'
            })
        }
    })

    it('stays source-neutral and does not instantiate LibraryDatabase or read protected credentials', () => {
        const source = fs.readFileSync('src/desktop/legacy-profile-preflight.ts', 'utf8')
        expect(source).not.toContain("import { LibraryDatabase }")
        expect(source).not.toMatch(/from ['"][^'"]*(?:provider-service|sdk|source-hosts|library\/service)/)
        expect(source).not.toMatch(/fs\.(?:writeFile|copyFile|rename|unlink|mkdir|rm)Sync\(/)
        expect(source).not.toMatch(/readFileSync\(.*credentials/)
    })
})
