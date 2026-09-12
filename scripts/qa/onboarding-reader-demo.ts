/** Isolated UI fixture. All provider traffic is intercepted; never loads .env. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AxiosHeaders } from 'axios'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer } from '../../src/library/server'
import { Pica } from '../../src/sdk'

const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pica-onboarding-demo-')
)
const database = new LibraryDatabase(path.join(directory, 'demo.db'))
const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO0sAAAAASUVORK5CYII=',
    'base64'
)
for (let index = 1; index <= 4; index++) {
    const id = `demo-${index}`
    database.importCatalog([
        {
            comicId: id,
            title: `星海旅途 ${index}`,
            author: '示例作者',
            categories: ['冒险'],
            tags: ['奇幻'],
            finished: true
        }
    ])
    database.upsertEpisode({
        id: `${id}-ep`,
        comicId: id,
        title: '第一章',
        order: 1
    })
    database.upsertPicture({
        id: `${id}-pic`,
        comicId: id,
        episodeId: `${id}-ep`,
        position: 1,
        originalName: 'page.png',
        mediaPath: 'page.png',
        fileServer: 'https://media.example'
    })
    const file = path.join(directory, `${id}.png`)
    fs.writeFileSync(file, png)
    database.markPictureDownloaded(`${id}-pic`, file, png.length, 'demo')
}
const pica = new Pica({
    proxyUrl: false,
    apiAdapter: async (config) => {
        const route = config.url ?? ''
        let data: unknown
        if (route === 'auth/sign-in') data = { token: 'synthetic-demo-session' }
        else if (route === 'auth/register') data = {}
        else if (/^comics\/demo-\d\/eps/.test(route))
            data = {
                eps: {
                    page: 1,
                    pages: 1,
                    total: 2,
                    docs: [
                        { id: 'online-1', title: '在线第一章', order: 1 },
                        { id: 'online-2', title: '在线第二章', order: 2 }
                    ]
                }
            }
        else if (/^comics\/demo-\d\/order/.test(route))
            data = {
                pages: {
                    page: 1,
                    pages: 1,
                    total: 3,
                    docs: [1, 2, 3].map((i) => ({
                        id: `page-${i}`,
                        media: {
                            originalName: 'page.png',
                            fileServer: 'https://media.example',
                            path: `page-${i}.png`
                        }
                    }))
                }
            }
        else if (/^comics\/demo-\d$/.test(route))
            data = {
                comic: {
                    _id: route.split('/')[1],
                    title: '星海旅途',
                    author: '示例作者',
                    tags: ['奇幻'],
                    categories: ['冒险']
                }
            }
        else throw new Error(`Demo blocks unmocked provider route: ${route}`)
        return {
            config,
            data: { code: 200, data },
            status: 200,
            statusText: 'OK',
            headers: new AxiosHeaders()
        }
    },
    mediaAdapter: async (config) => ({
        config,
        data: png,
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders({ 'content-type': 'image/png' })
    })
})
const service = new LibraryService(database, directory)
service.connect = async () => pica
service.recommendations = async () => {
    throw new Error('Demo: recommendation generation disabled')
}
let configured = false
const cloud = new Set(['demo-1', 'demo-3'])
const started = await startLibraryServer({
    database,
    service,
    host: '127.0.0.1',
    port: 4187,
    desktop: {
        csrfToken: 'demo-csrf-only',
        configured: () => configured,
        status: () => ({
            libraryDirectory: 'D:\\PicaLibrary-Demo',
            profile: 'balanced',
            remoteStorage: { configured: true },
            demo: true
        }),
        registerAccount: async (input) => pica.register(input),
        testConnection: async (input) => {
            if (input.remoteStorageAction === 'inventory')
                return {
                    comics: [1, 2, 3, 4].map((i) => ({
                        comicId: `demo-${i}`,
                        state: cloud.has(`demo-${i}`)
                            ? 'remote-present'
                            : 'not-uploaded'
                    }))
                }
            return { success: true }
        },
        save: async (input) => {
            if (input.remoteStorageAction === 'sync')
                for (const id of input.comicIds as string[]) cloud.add(id)
            else if (input.remoteStorageAction === 'delete-remote')
                for (const id of input.comicIds as string[]) cloud.delete(id)
            else configured = true
            return { success: true }
        },
        chooseFolder: async () => null,
        exportBrowserLitePackage: async () => ({}),
        openDirectory: async () => {},
        shutdown: () => {}
    }
})
console.log(`DEMO_ONLY ${started.url}/setup`)
process.once('SIGINT', () => {
    started.server.close()
    database.close()
    process.exit(0)
})
