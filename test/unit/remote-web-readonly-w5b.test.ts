import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string) => fs.readFileSync(file, 'utf8')

describe('Remote Web read-only shell W5B', () => {
    it('uses an isolated static shell with no inline executable content', () => {
        const html = read('web/remote/index.html')
        expect(html).toContain('Pica Library Remote')
        expect(html).toContain('href="/remote/remote.css"')
        expect(html).toContain('src="/remote/remote.js"')
        expect(html).toContain('type="module"')
        expect(html).not.toMatch(/<script(?![^>]*src=)[^>]*>/i)
        expect(html).not.toMatch(/<style[\s>]/i)
        expect(html).not.toContain('onclick=')
        expect(html).not.toContain('onerror=')
    })

    it('never persists the bearer/session in browser storage or registers offline workers', () => {
        const app = read('web/remote/remote.js')
        expect(app).toContain('/remote/v1/session/bootstrap')
        expect(app).toContain('/remote/v1/session/logout')
        expect(app).not.toContain('localStorage')
        expect(app).not.toContain('sessionStorage')
        expect(app).not.toContain('indexedDB')
        expect(app).not.toContain('serviceWorker')
        expect(app).not.toContain('caches.')
    })

    it('limits the shell to local library, shelf, detail and downloaded-reader surfaces', () => {
        const app = read('web/remote/remote.js')
        expect(app).toContain('/api/v1/library/query')
        expect(app).toContain('/api/v1/shelves')
        expect(app).toContain('/api/v1/downloaded')
        expect(app).toContain('/api/v1/comics/')
        expect(app).toContain('/api/v1/reader/comics/')
        expect(app).toContain("image.src = pages[index].url")
        expect(app).not.toContain('/api/v1/reader/progress')
        expect(app).not.toContain('/api/v1/desktop/')
        expect(app).not.toContain('/api/v1/import')
        expect(app).not.toContain('/api/v1/online')
        expect(app).not.toContain('/api/v1/provider')
        expect(app).not.toContain('/api/v1/recommend')
        expect(app).not.toContain('/api/v1/update')
    })

    it('keeps reader navigation single-page and explicitly non-persistent', () => {
        const html = read('web/remote/index.html')
        const app = read('web/remote/remote.js')
        expect(html).toContain('id="reader-prev"')
        expect(html).toContain('id="reader-next"')
        expect(html).toContain('readerNoWrite')
        expect(app).toContain('state.reader.pageIndex -= 1')
        expect(app).toContain('state.reader.pageIndex += 1')
        expect(app).toContain("image.src = pages[index].url")
        expect(app).not.toContain('Promise.all(pages')
    })

    it('is included in recursive Web syntax and Chromium smoke gates', () => {
        const syntax = read('scripts/check-web-syntax.mjs')
        const smoke = read('scripts/run-web-browser-smoke.sh')
        expect(syntax).toContain('javascriptFiles(directory)')
        expect(smoke).toContain('test/e2e/remote-web-readonly.spec.mjs')
    })
})
