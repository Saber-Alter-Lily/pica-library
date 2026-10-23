// Synthetic Playwright host adapter, NOT a native file-picker/device acceptance claim.
import path from 'node:path'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer } from '../../src/library/server'

const root = path.resolve(process.argv[2])
const db = new LibraryDatabase(path.join(root, 'data', 'library.db'))
const service = new LibraryService(db, path.join(root, 'data'))
service.connect = async () => {
    throw new Error('Provider access forbidden in local import browser fixture')
}
const started = await startLibraryServer({
    database: db,
    service,
    port: 0,
    desktop: {
        csrfToken: 'synthetic-local-import-browser',
        configured: () => true,
        status: () => ({
            version: '0.5.0-local-fixture',
            libraryDirectory: path.join(root, 'data'),
            runtime: { mode: 'interactive' },
            platform: { runtimeFoundation: true },
            nativePicker: { folderPicker: true },
            picaAccount: { configured: false },
            ehAccount: { configured: false }
        }),
        chooseLocalComic: async (kind) =>
            path.join(root, kind === 'folder' ? 'original' : 'comic.cbz'),
        chooseFolder: async () => null,
        save: async () => ({}),
        testConnection: async () => ({}),
        exportBrowserLitePackage: async () => ({}),
        openDirectory: async () => {},
        shutdown: () => {}
    }
})
process.stdout.write(JSON.stringify({ url: started.url }) + '\n')
let closing = false
const close = () => {
    if (closing) return
    closing = true
    started.server.closeAllConnections()
    started.server.close(() => {
        db.close()
        process.exit(0)
    })
}
process.on('SIGTERM', close)
process.on('SIGINT', close)
process.stdin.resume()
process.stdin.on('data', close)
