import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LocalLibraryIngestion } from '../../src/local-library/ingestion'
import {
    CoreLocalImportController,
    coreLocalImportMatch,
    coreLocalImportReady,
    type CoreLocalPicker
} from '../../src/library/core-local-import'

const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=',
    'base64'
)
const cleanup: Array<() => void> = []
afterEach(() => {
    for (const close of cleanup.splice(0).reverse()) close()
    vi.restoreAllMocks()
})
function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-core-local-import-'))
    const data = path.join(root, 'library')
    const comic = path.join(root, 'my comic')
    fs.mkdirSync(data)
    fs.mkdirSync(comic)
    fs.writeFileSync(path.join(comic, '1.png'), png)
    const db = new LibraryDatabase(path.join(data, 'library.db'))
    cleanup.push(() => {
        db.close()
        fs.rmSync(root, { recursive: true, force: true })
    })
    const picker: CoreLocalPicker = {
        status: () => ({ runtime: { mode: 'interactive' } }),
        configured: () => true,
        chooseLocalComic: vi.fn(async () => comic)
    }
    const controller = new CoreLocalImportController(
        new LocalLibraryIngestion(db, data)
    )
    return { root, data, comic, db, picker, controller }
}

describe('shared production local-import controller', () => {
    it('preserves only the original POST routes and rejects headless/native-picker absence', async () => {
        expect(coreLocalImportMatch('POST', '/api/v1/desktop/local-import/preview'))
            .toBe('preview')
        expect(coreLocalImportMatch('POST', '/api/v1/desktop/local-import/confirm'))
            .toBe('confirm')
        expect(coreLocalImportMatch('POST', '/api/v1/desktop/local-import/cancel'))
            .toBe('cancel')
        expect(coreLocalImportMatch('POST', '/api/v1/desktop/local-import/other'))
            .toBe('unknown')
        expect(coreLocalImportMatch('GET', '/api/v1/desktop/local-import/preview'))
            .toBeNull()
        expect(coreLocalImportMatch('POST', '/api/v1/library/query'))
            .toBeNull()
        const { picker, controller } = fixture()
        const noPicker = { ...picker, chooseLocalComic: undefined }
        expect(coreLocalImportReady(noPicker)).toBe(false)
        expect((await controller.http('preview', { kind: 'folder' }, noPicker)).status)
            .toBe(409)
        const headless = {
            ...picker, status: () => ({ runtime: { mode: 'headless' } })
        }
        expect(coreLocalImportReady(headless)).toBe(false)
        expect((await controller.http('preview', { kind: 'folder' }, headless)).status)
            .toBe(409)
    })

    it('blocks HTTP-supplied paths, provider metadata and missing setup without touching the picker', async () => {
        const { comic, db, picker, controller } = fixture()
        const choose = vi.mocked(picker.chooseLocalComic!)
        expect((await controller.http('preview', {
            kind: 'folder', path: comic
        }, picker)).status).toBe(400)
        expect((await controller.http('preview', {
            kind: 'folder', providerId: 'eh'
        }, picker)).status).toBe(400)
        expect((await controller.http('preview', { kind: 'zip' }, picker)).status)
            .toBe(400)
        expect((await controller.http('preview', { kind: 'folder' }, {
            ...picker, configured: () => false
        })).status).toBe(409)
        expect((await controller.http('unknown', {}, picker)).status).toBe(404)
        expect(choose).not.toHaveBeenCalled()
        expect(db.listComics({})).toHaveLength(0)
    })

    it('reuses real SQLite ingestion with opaque preview, single-use confirmation and cancellation', async () => {
        const { db, picker, controller } = fixture()
        const preview = await controller.http('preview', { kind: 'folder' }, picker)
        expect(preview.status).toBe(200)
        const token = (preview.value as { token: string }).token
        expect(typeof token).toBe('string')
        expect(db.listComics({})).toHaveLength(0)
        expect(await controller.http('cancel', { token }, picker))
            .toEqual({ status: 200, value: { cancelled: true } })
        await expect(controller.http('confirm', { token }, picker))
            .rejects.toThrow(/expired/)
        const second = await controller.http('preview', { kind: 'folder' }, picker)
        const token2 = (second.value as { token: string }).token
        const imported = await controller.http('confirm', { token: token2 }, picker)
        expect(imported.status).toBe(200)
        expect(db.listComics({})).toHaveLength(1)
        expect(db.listComics({})[0].providerId).toBe('local')
        expect((imported.value as { comicId: string }).comicId)
            .toMatch(/^local:[0-9a-f]{64}$/)
        await expect(controller.http('confirm', { token: token2 }, picker))
            .rejects.toThrow(/expired/)
    })

    it('serializes interactive selection and treats picker dismissal as no mutation', async () => {
        const { db, picker, controller } = fixture()
        let release: ((value: string | null) => void) | undefined
        const chosen = new Promise<string | null>(resolve => { release = resolve })
        const choose = vi.fn(() => chosen)
        picker.chooseLocalComic = choose
        const first = controller.http('preview', { kind: 'folder' }, picker)
        expect(choose).toHaveBeenCalledTimes(1)
        const concurrent = await controller.http('preview', { kind: 'folder' }, picker)
        expect(concurrent).toEqual({
            status: 409, value: { error: 'Another local import picker is open' }
        })
        release?.(null)
        expect(await first).toEqual({
            status: 200, value: { cancelled: true }
        })
        expect(db.listComics({})).toHaveLength(0)
        expect(choose).toHaveBeenCalledTimes(1)
    })
})
