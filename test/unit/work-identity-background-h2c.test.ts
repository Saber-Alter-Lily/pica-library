import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'

describe('P2 H2C Work Identity background runtime', () => {
    it('can cancel a detached evidence refresh before incomplete evidence is committed', async () => {
        const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-work-identity-h2c-')
        )
        const database = new LibraryDatabase(path.join(dir, 'library.sqlite'))
        database.importCatalog(
            [
                {
                    comicId: 'pica:h2c-1',
                    title: 'Background Work',
                    author: 'Artist',
                    tags: [],
                    categories: [],
                    finished: true,
                    pagesCount: 20
                },
                {
                    comicId: 'eh:h2c-2',
                    title: '[Digital] Background Work',
                    author: 'Artist',
                    tags: [],
                    categories: [],
                    finished: true,
                    pagesCount: 21
                }
            ],
            'test'
        )
        const service = new LibraryService(database, dir)

        const started =
            service.startRecommendationV5WorkIdentityEvidenceRefresh(500)
        expect(started.started).toBe(true)
        expect(started.active).toBe(true)

        service.recommendationV5WorkIdentityEvidenceRefreshControl('cancel')

        for (let attempt = 0; attempt < 100; attempt++) {
            const current =
                service.recommendationV5WorkIdentityEvidenceRefreshStatus()
            if (!current.active) break
            await new Promise((resolve) => setTimeout(resolve, 5))
        }

        expect(
            service.recommendationV5WorkIdentityEvidenceRefreshStatus().state
        ).toBe('cancelled')
        expect(database.workIdentityStorageStatus().counts.evidence).toBe(0)

        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('exposes authoritative status/control routes and reload-safe Web controls', () => {
        const server = fs.readFileSync('src/library/server.ts', 'utf8')
        const ui = fs.readFileSync('web/work-identity-review.js', 'utf8')

        expect(server).toContain(
            '/work-identity/evidence/refresh/status'
        )
        expect(server).toContain(
            '/work-identity/evidence/refresh/control'
        )
        expect(server).toContain(
            'startRecommendationV5WorkIdentityEvidenceRefresh'
        )
        expect(server).toContain('202')
        expect(ui).toContain('watchEvidenceRefresh')
        expect(ui).toContain('reattachEvidenceRefresh')
        expect(ui).toContain("controlEvidenceRefresh('pause')")
        expect(ui).toContain("controlEvidenceRefresh('resume')")
        expect(ui).toContain("controlEvidenceRefresh('cancel')")
    })
})
