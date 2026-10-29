import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { MemoryCredentialStore } from '../../src/desktop/credentials'
import { RemoteStorageDesktopManager } from '../../src/remote-storage/desktop-manager'
import {
    coreRemoteStorageActionName,
    coreRemoteStorageDispatch,
    coreRemoteStorageStatus,
    type CoreRemoteStoragePort
} from '../../src/remote-storage/core-action-port'

const cleanup: Array<() => void> = []
afterEach(() => {
    for (const task of cleanup.splice(0).reverse()) task()
    vi.restoreAllMocks()
})
function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-core-remote-port-'))
    const db = new LibraryDatabase(path.join(root, 'library.db'))
    const store = new MemoryCredentialStore()
    const manager = new RemoteStorageDesktopManager(
        path.join(root, 'remote-storage.json'),
        store, null, db, root, () => {}
    )
    cleanup.push(() => {
        db.close()
        fs.rmSync(root, { recursive: true, force: true })
    })
    return { root, db, store, manager }
}

describe('source-neutral WebDAV/remote storage command port', () => {
    it('reuses the real manager for local config and secure credentials; no remote request occurs on mere status', async () => {
        const { root, store, manager } = fixture()
        expect(coreRemoteStorageStatus()).toEqual({
            configured: false, kind: 'webdav'
        })
        expect(coreRemoteStorageStatus(manager).configured).toBe(false)
        const input = {
            remoteStorageAction: 'save',
            remoteStorage: {
                vendor: 'generic', label: 'My private WebDAV',
                baseUrl: 'https://dav.example.invalid',
                root: 'PicaLibrary',
                username: 'owner',
                password: 'app-secret'
            }
        }
        const result = await coreRemoteStorageDispatch(input, manager)
        expect(result.handled).toBe(true)
        expect(result).toMatchObject({
            handled: true,
            value: { success: true, remoteStorage: { configured: true } }
        })
        const publicFile = fs.readFileSync(path.join(root, 'remote-storage.json'), 'utf8')
        expect(publicFile).not.toContain('app-secret')
        expect(publicFile).not.toContain('owner')
        expect(store.value?.remoteStorageCredentials).toBeDefined()
        expect(coreRemoteStorageStatus(manager).configured).toBe(true)
        const actual = coreRemoteStorageStatus(manager)
        expect(actual.targets).toHaveLength(1)
        expect(actual.targets[0].label).toBe('My private WebDAV')
        expect(manager.status().targets).toHaveLength(1)
    })

    it('dispatches the original action names exactly once and preserves scope/deletion guard authority', async () => {
        const actions: Array<[string, string, Record<string, unknown>]> = [
            ['sync', 'sync', { comicIds: ['local:fixture'] }],
            ['pause-sync', 'pause', {}],
            ['resume-sync', 'resume', {}],
            ['cancel-sync', 'cancel', {}],
            ['delete-remote', 'delete', { confirmation: 'DELETE_REMOTE_ONLY' }]
        ]
        const methods = {
            save: vi.fn(() => ({ saved: true })),
            sync: vi.fn(async () => ({ synced: true })),
            syncControl: vi.fn((action: string) => ({ action })),
            deleteCopies: vi.fn(async () => ({ deleted: true })),
            status: vi.fn(() => ({ configured: true }))
        }
        const port = methods as unknown as CoreRemoteStoragePort
        for (const [action, method, extras] of actions) {
            const input = { remoteStorageAction: action, ...extras }
            const reply = await coreRemoteStorageDispatch(input, port)
            expect(reply.handled).toBe(true)
            if (method === 'sync') {
                expect(methods.sync).toHaveBeenCalledWith(input)
                expect(reply).toEqual({ handled: true, value: { synced: true } })
            } else if (method === 'delete') {
                expect(methods.deleteCopies).toHaveBeenCalledWith(input)
                expect(reply).toEqual({ handled: true, value: { deleted: true } })
            } else {
                const expected = action.split('-')[0]
                expect(methods.syncControl).toHaveBeenLastCalledWith(expected)
                expect(reply).toEqual({
                    handled: true,
                    value: { success: true, syncProgress: { action: expected } }
                })
            }
        }
        expect(methods.sync).toHaveBeenCalledTimes(1)
        expect(methods.deleteCopies).toHaveBeenCalledTimes(1)
        expect(methods.syncControl).toHaveBeenCalledTimes(3)
        expect(methods.save).not.toHaveBeenCalled()
        expect(methods.status).not.toHaveBeenCalled()
    })

    it('does not activate any remote operation for unknown actions or missing manager', async () => {
        for (const action of [undefined, '', 'test', 'remove-target', 'sync-all', {}]) {
            const input = { remoteStorageAction: action }
            expect(coreRemoteStorageActionName(input)).toBeNull()
            await expect(coreRemoteStorageDispatch(input))
                .resolves.toEqual({ handled: false })
        }
        for (const action of ['save', 'sync', 'pause-sync', 'delete-remote']) {
            await expect(coreRemoteStorageDispatch({ remoteStorageAction: action }))
                .rejects.toThrow('Remote storage is not ready')
        }
    })

    it('propagates manager validation for incomplete destructive confirmation and no saved target', async () => {
        const { manager } = fixture()
        await expect(coreRemoteStorageDispatch({
            remoteStorageAction: 'delete-remote',
            confirmation: 'wrong'
        }, manager)).rejects.toThrow()
        await expect(coreRemoteStorageDispatch({
            remoteStorageAction: 'sync',
            remoteStorage: { root: 'unsaved' }
        }, manager)).rejects.toThrow()
    })

    it('keeps port runtime import-closure independent of online providers, Desktop and source hosts', () => {
        const source = fs.readFileSync(
            path.resolve('src/remote-storage/core-action-port.ts'), 'utf8'
        )
        expect(source).toMatch(/^import type \{ RemoteStorageDesktopManager \} from '\.\/desktop-manager'/)
        expect(source).not.toMatch(/^import (?!type\b).*from /m)
        expect(source).not.toMatch(/from ['"][^'"]*(?:provider-service|source-hosts|\.\.\/sdk|desktop\/main)/)
    })
})
