import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('P2 H1C organizer runtime contract', () => {
    it('keeps heavy organizer filesystem operations asynchronous', () => {
        const organizer = fs.readFileSync('src/library/organizer.ts', 'utf8')
        expect(organizer).toContain('fs.promises.cp(')
        expect(organizer).toContain('fs.promises.symlink(')
        expect(organizer).toContain('fs.promises.writeFile(')
        expect(organizer).toContain('await options.checkpoint?.()')
        expect(organizer).toContain('onProgress')
        expect(organizer).not.toContain('fs.cpSync(')
        expect(organizer).not.toContain('fs.symlinkSync(')
        expect(organizer).not.toContain('fs.existsSync(')
        expect(organizer).not.toContain('fs.writeFileSync(')
    })

    it('runs the Web organize route as a controllable background task', () => {
        const server = fs.readFileSync('src/library/server.ts', 'utf8')
        const service = fs.readFileSync('src/library/service.ts', 'utf8')
        expect(server).toContain(
            "url.pathname === '/api/v1/organize/status'"
        )
        expect(server).toContain(
            "url.pathname === '/api/v1/organize/control'"
        )
        expect(server).toContain('options.service.startLibraryOrganize()')
        expect(server).toContain('response,\n                    202')
        expect(service).toContain('startLibraryOrganize()')
        expect(service).toContain(
            "libraryOrganizeControl(action: 'pause' | 'resume' | 'cancel')"
        )
        expect(service).toContain('this.database.listAllComics()')
    })

    it('keeps explicit CLI organize/export complete and uncapped', () => {
        const cli = fs.readFileSync('src/library-cli.ts', 'utf8')
        expect(cli).toContain('await organizeLibraryViews(')
        expect(cli).toContain('await materializePortableLibrary(')
        const organizeStart = cli.indexOf("if (command === 'organize')")
        const artifactStart = cli.indexOf("if (command === 'artifact')")
        const block = cli.slice(organizeStart, artifactStart)
        expect(block).toContain('database.listAllComics()')
        expect(block).not.toContain('limit: 5000')
    })

    it('publishes final indexes only after all checkpoints complete', () => {
        const organizer = fs.readFileSync('src/library/organizer.ts', 'utf8')
        expect(organizer).toContain('writeJsonAtomically(')
        expect(organizer).toContain("path.join(viewsRoot, 'index.json')")
        expect(organizer).toContain(
            "path.join(outputDir, 'pica-library-manifest.json')"
        )
        expect(organizer).toContain('pica-new-')
    })
})
