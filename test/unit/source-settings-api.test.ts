import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer } from '../../src/library/server'
import { buildLocalConfig, loadConfig } from '../../src/desktop/config'
import { saveSourceChoices } from '../../src/desktop/source-settings'
import { SourceRuntime } from '../../src/sources/source-policy'

it('source writes require Desktop CSRF/origin and capabilities read back the actual saved runtime', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-source-api-'))
    const db = new LibraryDatabase(path.join(root, 'library.db'))
    let config = buildLocalConfig({
        libraryDirectory: root,
        profile: 'balanced'
    })
    const sources = new SourceRuntime(config.externalSources)
    const service = new LibraryService(
        db,
        root,
        undefined,
        undefined,
        undefined,
        sources
    )
    const file = path.join(root, 'config.json')
    const server = await startLibraryServer({
        database: db,
        service,
        host: '127.0.0.1',
        port: 0,
        desktop: {
            csrfToken: 'fixture-source-csrf',
            configured: () => true,
            status: () => ({ externalSources: sources.snapshot() }),
            save: async (input) => {
                const saved = saveSourceChoices(
                    file,
                    config,
                    sources,
                    input.enabled,
                    input.expectedRevision
                )
                config = saved.config
                service.sourceChoicesApplied(saved.disabled)
                return { success: true, externalSources: sources.snapshot() }
            },
            testConnection: async () => ({}),
            chooseFolder: async () => null,
            exportBrowserLitePackage: async () => ({}),
            openDirectory: async () => {},
            shutdown: () => {}
        }
    })
    const post = (headers: Record<string, string>, revision = 0) =>
        fetch(server.url + '/api/v1/desktop/settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify({
                sourceAction: 'save',
                enabled: ['eh'],
                expectedRevision: revision
            })
        })
    try {
        expect((await post({})).status).toBe(403)
        expect(
            (
                await post({
                    'x-pica-csrf': 'fixture-source-csrf',
                    origin: 'https://untrusted.invalid'
                })
            ).status
        ).toBe(403)
        expect(fs.existsSync(file)).toBe(false)
        expect(
            (await post({ 'x-pica-csrf': 'fixture-source-csrf' })).status
        ).toBe(200)
        expect(loadConfig(file)?.externalSources).toEqual({
            schemaVersion: 1,
            revision: 1,
            enabled: ['eh']
        })
        const response = await fetch(server.url + '/api/v1/capabilities').then(
            (r) => r.json()
        )
        expect(response.externalSources).toEqual(sources.snapshot())
        expect(response.providers.pica.search).toBe(false)
        expect(response.providers.eh.search).toBe(true)
        expect((await post({ 'x-pica-csrf': 'fixture-source-csrf' })).ok).toBe(
            false
        )
        expect(sources.snapshot().revision).toBe(1)
        expect(db.listComics({})).toEqual([])
    } finally {
        await new Promise<void>((resolve) =>
            server.server.close(() => resolve())
        )
        db.close()
        fs.rmSync(root, { recursive: true, force: true })
    }
})
