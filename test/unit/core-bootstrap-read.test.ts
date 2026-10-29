import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { appCapabilities } from '../../src/app-capabilities'
import {
    coreBootstrapStatus, coreBootstrapAuthors, coreBootstrapCapabilities
} from '../../src/library/core-bootstrap-read'

describe('original Desktop read-only bootstrap shared with source-free core', () => {
    it('uses real SQLite status, reconciliation and authors without a ProviderService', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-bootstrap-core-'))
        const db = new LibraryDatabase(path.join(root, 'library.db'))
        try {
            db.importFavorites([{
                comicId: 'fixture-comic', title: 'Local fixture',
                author: 'Fixture author', tags: [], categories: [], finished: true
            }])
            const progress = { state: 'idle', lastSync: null }
            expect(coreBootstrapStatus(db, progress)).toEqual({
                application: 'Pica Library',
                mode: 'connected',
                version: appCapabilities().appVersion,
                database: db.file,
                summary: db.summary(),
                reconciliation: db.reconcileLibraryCounts(),
                favoritesSyncProgress: progress
            })
            expect(coreBootstrapAuthors(db)).toEqual(db.listAuthors())
            expect(coreBootstrapAuthors(db)).toEqual(expect.arrayContaining([
                expect.objectContaining({ canonicalName: 'Fixture author' })
            ]))
        } finally {
            db.close()
            fs.rmSync(root, { recursive: true, force: true })
        }
    })

    it('keeps full Desktop capability semantics and does not misadvertise unavailable sources on source-free core', () => {
        const providerStatus = { pica: { search: true }, eh: { search: false } }
        const sourceModules = [{ id: 'pica', enabled: true }]
        const policy = { schemaVersion: 1, revision: 2, enabled: ['pica'] }
        const desktop = coreBootstrapCapabilities({
            kind: 'provider-enabled',
            favoriteMutation: true,
            providers: providerStatus,
            sourceModules,
            externalSources: policy
        })
        expect(desktop).toEqual({
            ...appCapabilities(true),
            providers: providerStatus,
            sourceModules,
            externalSources: policy
        })
        const isolated = coreBootstrapCapabilities({ kind: 'source-free' })
        expect(isolated).toMatchObject({
            providers: {},
            sourceModules: [],
            externalSources: { enabled: [] },
            features: {
                providerFavoriteMutation: false,
                shelves: true,
                reader: true,
                localFileImport: false,
                recommendationSessions: false,
                recommendationV3: false,
                behaviorLearning: false,
                multiTagPreference: false,
                adaptiveRecommendationBatches: false,
                previewPages: false
            }
        })
        expect(isolated.appVersion).toBe(desktop.appVersion)
        expect(isolated.moduleContracts).toEqual(desktop.moduleContracts)
    })

    it('never imports concrete provider SDK, Desktop composition or source-host runtime', () => {
        const text = fs.readFileSync(path.resolve(
            'src/library/core-bootstrap-read.ts'
        ), 'utf8')
        expect(text).not.toMatch(/from ['"][^'"]*(?:\/sdk|\/providers\/|\/source-hosts\/|\/desktop\/main|provider-service|library\/service)/)
        expect(text).toContain("import type { LibraryDatabase }")
    })
})
