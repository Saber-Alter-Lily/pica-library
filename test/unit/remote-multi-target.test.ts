import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { MemoryCredentialStore } from '../../src/desktop/credentials'
import {
    loadRemoteStorageRegistry,
    normalizeRemoteStorageConfig,
    saveRemoteStorageRegistry
} from '../../src/remote-storage/config'
import { RemoteStorageDesktopManager } from '../../src/remote-storage/desktop-manager'

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).reverse().forEach((fn) => fn()))

function tempRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-remote-targets-'))
    cleanup.push(() => fs.rmSync(root, { recursive: true, force: true }))
    return root
}

function managerFixture() {
    const root = tempRoot()
    const db = new LibraryDatabase(path.join(root, 'library.db'))
    cleanup.push(() => db.close())
    const store = new MemoryCredentialStore()
    const manager = new RemoteStorageDesktopManager(
        path.join(root, 'remote.json'),
        store,
        null,
        db,
        root,
        () => {}
    )
    return { root, store, manager }
}

describe('remote storage presets', () => {
    it('normalizes documented fixed WebDAV endpoints', () => {
        expect(
            normalizeRemoteStorageConfig({
                vendor: '123pan',
                baseUrl: 'https://webdav.123pan.cn',
                root: 'PicaLibrary'
            }).baseUrl
        ).toBe('https://webdav.123pan.cn/webdav')
        expect(
            normalizeRemoteStorageConfig({
                vendor: 'jianguoyun',
                baseUrl: 'https://dav.jianguoyun.com',
                root: 'PicaLibrary'
            }).baseUrl
        ).toBe('https://dav.jianguoyun.com/dav')
        expect(
            normalizeRemoteStorageConfig({
                vendor: 'koofr',
                baseUrl: 'https://app.koofr.net',
                root: 'PicaLibrary'
            }).baseUrl
        ).toBe('https://app.koofr.net/dav/Koofr')
        expect(
            normalizeRemoteStorageConfig({
                vendor: 'pcloud-eu',
                root: 'PicaLibrary'
            }).baseUrl
        ).toBe('https://ewebdav.pcloud.com')
    })
})

describe('remote storage registry', () => {
    it('loads a legacy single-target config without destructive migration', () => {
        const root = tempRoot()
        const file = path.join(root, 'remote.json')
        fs.writeFileSync(
            file,
            JSON.stringify({
                kind: 'webdav',
                baseUrl: 'https://dav.jianguoyun.com/dav',
                root: 'PicaLibrary'
            })
        )
        expect(loadRemoteStorageRegistry(file)).toMatchObject({
            schemaVersion: 2,
            targets: [
                {
                    id: 'legacy-default',
                    config: {
                        vendor: 'jianguoyun',
                        baseUrl: 'https://dav.jianguoyun.com/dav'
                    }
                }
            ]
        })
        expect(JSON.parse(fs.readFileSync(file, 'utf8')).schemaVersion).toBeUndefined()
    })

    it('never persists credentials in the public registry', () => {
        const root = tempRoot()
        const file = path.join(root, 'remote.json')
        saveRemoteStorageRegistry(file, {
            schemaVersion: 2,
            targets: [
                {
                    id: 'cloud-a',
                    label: 'Cloud A',
                    config: {
                        kind: 'webdav',
                        vendor: 'generic',
                        baseUrl: 'https://dav.example',
                        root: 'PicaLibrary'
                    }
                }
            ]
        })
        const serialized = fs.readFileSync(file, 'utf8')
        expect(serialized).not.toMatch(/password|authorization|cookie|token/i)
    })
})

describe('desktop multi-target manager', () => {
    it('keeps independent DPAPI credential slots and requires target selection once multiple remotes exist', async () => {
        const { manager, store } = managerFixture()
        const first = manager.save({
            remoteStorageAction: 'save',
            remoteStorage: {
                vendor: 'jianguoyun',
                label: '坚果云',
                baseUrl: 'https://dav.jianguoyun.com/dav',
                root: 'PicaLibrary',
                username: 'a@example.com',
                password: 'first-app-password'
            }
        })
        const second = manager.save({
            remoteStorageAction: 'save',
            createNewTarget: true,
            remoteStorage: {
                vendor: '123pan',
                label: '123 云盘',
                baseUrl: 'https://webdav.123pan.cn',
                root: 'PicaLibrary',
                username: 'user-b',
                password: 'second-app-password'
            }
        })
        const status = manager.status()
        expect(status.targets).toHaveLength(2)
        expect(store.value?.remoteStorageCredentials?.[String(first.targetId)]).toMatchObject({
            username: 'a@example.com',
            password: 'first-app-password'
        })
        expect(store.value?.remoteStorageCredentials?.[String(second.targetId)]).toMatchObject({
            username: 'user-b',
            password: 'second-app-password'
        })
        await expect(manager.inventory({})).rejects.toThrow('选择目标网盘')
    })

    it('updates the only existing target for legacy callers that do not send a target id', () => {
        const { manager } = managerFixture()
        manager.save({
            remoteStorage: {
                vendor: 'generic',
                label: 'Primary',
                baseUrl: 'https://dav.one.example',
                root: 'PicaLibrary',
                username: 'one',
                password: 'secret-one'
            }
        })
        manager.save({
            remoteStorage: {
                vendor: 'generic',
                label: 'Primary renamed',
                baseUrl: 'https://dav.two.example',
                root: 'PicaLibrary',
                username: '',
                password: ''
            }
        })
        const status = manager.status()
        expect(status.targets).toHaveLength(1)
        expect(status.targets[0]).toMatchObject({
            label: 'Primary renamed',
            baseUrl: 'https://dav.two.example'
        })
    })
})