import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('P2 H1 maintenance repair runtime contract', () => {
    it('keeps repair file inspection off synchronous filesystem APIs', () => {
        const repair = fs.readFileSync('src/maintenance/repair.ts', 'utf8')
        expect(repair).toContain('fs.promises.stat')
        expect(repair).toContain('await options.checkpoint?.()')
        expect(repair).toContain('options.onProgress?.({')
        expect(repair).not.toContain('fs.existsSync(')
        expect(repair).not.toContain('fs.statSync(')
    })

    it('awaits the asynchronous repair scan in both API and CLI callers', () => {
        const server = fs.readFileSync('src/library/server.ts', 'utf8')
        const cli = fs.readFileSync('src/library-cli.ts', 'utf8')
        expect(server).toContain(
            'const issues = await scanRepairIssues(options.database)'
        )
        expect(cli).toContain(
            'const issues = await scanRepairIssues(database)'
        )
    })
})
