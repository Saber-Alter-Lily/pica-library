import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LocalLibraryIngestion } from '../../src/local-library/ingestion'
import { ReaderService } from '../../src/services/reader-service'
import { startOfflineCoreHttp } from '../../src/offline-core/qa-http'
import { stageOfflineFullWebQa } from '../../scripts/stage-offline-full-web-qa'

const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => {
    for (const fn of cleanup.splice(0).reverse()) await fn()
})
const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=', 'base64'
)
async function fixture() {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-full-web-http-'))
    cleanup.push(() => fs.rmSync(home, { recursive: true, force: true }))
    const root = path.join(home, 'owned')
    const selected = path.join(home, 'original-pages')
    fs.mkdirSync(root)
    fs.mkdirSync(selected)
    fs.writeFileSync(path.join(selected, '01.png'), png)
    const db = new LibraryDatabase(path.join(root, 'library.db'))
    cleanup.push(() => db.close())
    const importer = new LocalLibraryIngestion(db, root)
    const preview = await importer.preview(selected, 'folder')
    const comic = await importer.confirm(preview.token)
    const web = path.join(home, 'web')
    const manifest = stageOfflineFullWebQa(web)
    return { home, root, db, web, manifest, comic }
}
describe('real original full Web HTML behind source-free, cookie-protected local HTTP', () => {
    it('serves original HTML/imports, real local catalogue/status/shelves and rejects remote/CSRF abuse', async () => {
        const { db, web, manifest, comic } = await fixture()
        const http = await startOfflineCoreHttp({
            database: db, reader: new ReaderService(db, path.dirname(db.file)),
            webRoot: web
        })
        cleanup.push(() => http.close())
        const entry = new URL(http.url)
        const home = entry.origin
        expect(entry.pathname).toMatch(/^\/qa\/[0-9a-f]{64}$/)
        expect((await fetch(home + '/')).status).toBe(403)
        const opened = await fetch(http.url, { redirect: 'manual' })
        expect(opened.status).toBe(303)
        expect(opened.headers.get('location')).toBe('/')
        const cookie = opened.headers.get('set-cookie')?.split(';')[0]
        expect(cookie).toMatch(/^pica_offline_qa=[0-9a-f]{64}$/)
        const get = (route: string) => fetch(home + route, {
            headers: { cookie: cookie! }
        })
        const html = await (await get('/')).text()
        for (const id of ['home', 'library', 'shelves', 'reader', 'settings'])
            expect(html).toContain('id="' + id + '"')
        expect(html).toContain('src="./app.js"')
        expect(html).toContain('name="pica-core-qa-csrf"')
        expect(html).not.toContain('src="./eh-account.js"')
        expect(html).not.toContain('src="./jm-account.js"')
        const token = /name="pica-core-qa-csrf" content="([a-f0-9]{64})"/
            .exec(html)?.[1]
        expect(token).toMatch(/^[a-f0-9]{64}$/)
        for (const name of [
            'app.js', 'i18n.js', 'alpha7-cloud.js',
            'styles.css', 'ui-polish-v5.css'
        ]) {
            const response = await get('/' + name)
            expect(response.status).toBe(200)
            expect((await response.arrayBuffer()).byteLength).toBe(
                manifest.files.find(row => row.name === name)?.size
            )
            expect(response.headers.get('cache-control')).toBe('no-store')
        }
        expect((await get('/eh-account.js')).status).toBe(404)
        expect((await get('/source-choices.js')).status).toBe(404)
        expect((await get('/full-web-qa-manifest.json')).status).toBe(404)
        expect((await fetch(home + '/app.js')).status).toBe(403)
        expect((await get('/api/v1/status')).status).toBe(200)
        const capabilities = await (await get('/api/v1/capabilities')).json()
        expect(capabilities).toMatchObject({
            providers: {}, sourceModules: [],
            features: { shelves: true, reader: true, recommendationSessions: false }
        })
        const status = await (await get('/api/v1/desktop/status')).json()
        expect(status).toMatchObject({
            configured: true, coreOnly: true, startupReady: true,
            picaAccount: { configured: false },
            remoteStorage: { configured: false }
        })
        expect(status.csrfToken).toBe(token)
        const catalogue = await (await get('/api/v1/comics?limit=5000')).json()
        expect(catalogue).toMatchObject([
            { comicId: comic.comicId, providerId: 'local' }
        ])
        expect((await get('/api/v1/comics?limit=5000&provider=eh')).status)
            .toBe(400)
        expect((await get('/api/v1/comics?limit=50000')).status).toBe(400)
        const mutate = (url: string, input: unknown, headers: Record<string,string>) =>
            fetch(home + url, {
                method: 'POST', headers: {
                    cookie: cookie!,
                    'content-type': 'application/json', ...headers
                },
                body: JSON.stringify(input)
            })
        expect((await mutate('/api/v1/library/query',
            { scope: 'library', limit: 5000 }, { origin: home })).status).toBe(403)
        expect((await mutate('/api/v1/library/query',
            { scope: 'library', limit: 5000 }, {
                origin: 'https://evil.example', 'x-pica-qa-csrf': token!
            })).status).toBe(403)
        const query = await mutate('/api/v1/library/query',
            { scope: 'library', limit: 5000 }, {
                origin: home, 'x-pica-qa-csrf': token!
            })
        expect(query.status).toBe(200)
        expect((await query.json()).total).toBe(1)
        const unsafe = await mutate('/api/v1/library/query',
            { scope: 'library', providerIds: ['eh'] }, {
                origin: home, 'x-pica-qa-csrf': token!
            })
        expect(unsafe.status).toBe(400)
        expect((await get('/api/v1/shelves')).status).toBe(200)
        expect((await get('/api/v1/authors')).status).toBe(200)
        expect((await get('/api/v1/sources')).status).toBe(404)
        expect(db.getComic(comic.comicId)?.providerId).toBe('local')
    }, 60_000)

    it('never serves a mutated full Web script with a stale staged checksum', async () => {
        const { db, web } = await fixture()
        fs.appendFileSync(path.join(web, 'app.js'), '\n// tampered after stage')
        await expect(startOfflineCoreHttp({
            database: db, reader: new ReaderService(db, path.dirname(db.file)),
            webRoot: web
        })).rejects.toThrow(/SHA mismatch|changed after staging/)
    })
})
