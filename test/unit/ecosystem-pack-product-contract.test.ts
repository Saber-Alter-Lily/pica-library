import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Recommendation Ecosystem Pack read-only product contract', () => {
    it('keeps Pack inventory in the Desktop data home and exposes read-only inspection', () => {
        const paths = fs.readFileSync('src/desktop/paths.ts', 'utf8')
        const desktop = fs.readFileSync('src/desktop/main.ts', 'utf8')
        const server = fs.readFileSync('src/library/server.ts', 'utf8')

        expect(paths).toContain("packs: path.join(local, 'packs')")
        expect(desktop).toContain(
            "new EcosystemPackStore(paths.packs, PRODUCT_VERSION)"
        )
        expect(desktop).toContain(
            'ecosystemPackInventory: () => ecosystemPacks.inventory()'
        )
        expect(server).toContain(
            "url.pathname === '/api/v1/desktop/ecosystem/packs'"
        )
        expect(server).toMatch(
            /desktop\/ecosystem\/packs'[\s\S]*?request\.method === 'GET'/
        )
    })

    it('shows only a read-only Pack status surface in Settings', () => {
        const html = fs.readFileSync('web/index.html', 'utf8')
        const ui = fs.readFileSync('web/ecosystem-pack-v1.js', 'utf8')

        expect(html).toContain('id="settings-ecosystem-packs"')
        expect(html).toContain('id="ecosystem-packs-refresh"')
        expect(html).toContain('id="ecosystem-packs-list"')
        expect(ui).toContain("fetch('/api/v1/desktop/ecosystem/packs'")
        expect(ui).toContain("fetch('/api/v1/desktop/open-directory'")
        expect(ui).not.toMatch(/activate|apply|promote/i)
    })

    it('does not add Pack activation or recommendation mutation routes', () => {
        const server = fs.readFileSync('src/library/server.ts', 'utf8')
        const store = fs.readFileSync('src/ecosystem/pack-store.ts', 'utf8')

        expect(server).not.toMatch(
            /desktop\/ecosystem\/(activate|apply|promote)/
        )
        expect(store).not.toContain('RecommendationService')
        expect(store).not.toContain('LibraryDatabase')
        expect(store).not.toContain('writeFileSync')
    })
})
