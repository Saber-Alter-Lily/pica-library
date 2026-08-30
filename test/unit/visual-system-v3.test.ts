import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const read = (relative: string) =>
    fs.readFileSync(path.join(root, relative), 'utf8')

describe('Visual System V3 / Result Card Print V4 contracts', () => {
    it('ships a branded Web icon without changing application APIs', () => {
        const index = read('web/index.html')
        expect(index).toContain('pica-library-icon.svg')
        expect(index).toContain('class="app-brand-icon"')
        expect(
            fs.existsSync(path.join(root, 'web/pica-library-icon.svg'))
        ).toBe(true)
    })

    it('builds the collection profile PDF as one fixed A4 landscape result sheet', () => {
        const app = read('web/app.js')
        const css = read('web/styles.css')
        expect(app).toContain('class="rc-sheet"')
        expect(app).toContain('class="rc-panel rc-semantic"')
        expect(app).toContain('class="rc-panel rc-universe"')
        expect(app).toContain('class="rc-panel rc-signatures"')
        expect(app).not.toContain('class="atlas-result-sheet"')
        expect(css).toMatch(
            /@page\s*\{\s*size:\s*A4 landscape;\s*margin:\s*0;\s*\}/
        )
        expect(css).toContain('.rc-sheet {')
        expect(css).toContain('position: relative;')
        expect(css).toMatch(
            /\.rc-semantic\s*\{[^}]*left:\s*8mm;[^}]*width:\s*95mm;/s
        )
        expect(css).toMatch(
            /\.rc-universe\s*\{[^}]*left:\s*107mm;[^}]*width:\s*78mm;/s
        )
        expect(css).toMatch(
            /\.rc-signatures\s*\{[^}]*left:\s*189mm;[^}]*width:\s*100mm;/s
        )
        expect(css).toMatch(
            /\.rc-footer-traits\s*\{[^}]*left:\s*228mm;[^}]*width:\s*61mm;/s
        )
    })

    it('uses a bounded fixed SVG universe and compressed summary content', () => {
        const app = read('web/app.js')
        expect(app).toContain('viewBox="0 0 300 410"')
        expect(app).toContain('.slice(0, 4)')
        expect(app).toContain('.slice(0, 6)')
        expect(app).toContain('.slice(0, 3)')
    })

    it('keeps software update discoverable from Maintenance', () => {
        const index = read('web/index.html')
        expect(index).toContain('data-tab="software-updates"')
        expect(index).toContain('id="update-one-click"')
        expect(index).toContain('id="update-file"')
    })
})
