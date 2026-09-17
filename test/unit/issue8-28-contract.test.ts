import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('issue 8 and 28 regression contracts', () => {
    it('uses bounded download summary/page endpoints in the Web UI', () => {
        const app = fs.readFileSync('web/app.js', 'utf8')
        expect(app).toContain("api('/api/v1/downloads/summary')")
        expect(app).toContain('/api/v1/downloads/page?view=')
        expect(app).toContain('downloadVisibleLimit')
        const server = fs.readFileSync('src/library/server.ts', 'utf8')
        expect(server).toContain("url.pathname === '/api/v1/downloads/summary'")
        expect(server).toContain("url.pathname === '/api/v1/downloads/page'")
    })

    it('refreshes Web author works from provider sources without manual typing', () => {
        const web = fs.readFileSync('web/v040-parity.js', 'utf8')
        expect(web).toContain('/api/v1/authors/${encodeURIComponent(authorId)}/refresh')
        expect(web).toContain('正在联网补全 Pica / E-H 作者作品')
        const service = fs.readFileSync('src/library/service.ts', 'utf8')
        expect(service).toContain('async refreshAuthorWorks(authorId: string)')
        expect(service).toContain("await run('pica', picaQuery.trim())")
        expect(service).toContain("await run('eh', `artist:\"${cleanEh}\"`)")
        expect(service).toContain("await run('exh', `artist:\"${cleanEh}\"`)")
    })
})
