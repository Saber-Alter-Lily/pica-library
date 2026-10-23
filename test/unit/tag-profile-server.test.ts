import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer } from '../../src/library/server'

it('protects actual tag-profile HTTP export/preview/apply/undo with Desktop CSRF and explicit regeneration', async () => {
    const dir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'pica-tag-http-fixture-')
        ),
        database = new LibraryDatabase(path.join(dir, 'library.db')),
        service = new LibraryService(database, dir)
    database.importFavorites(
        [
            {
                comicId: 'fixture',
                title: 'Private title',
                author: 'Fixture',
                tags: ['School'],
                categories: [],
                finished: true
            }
        ],
        'fixture'
    )
    const build = vi
        .spyOn(service, 'buildFinalRecommendationCycleV3')
        .mockRejectedValue(new Error('Synthetic builder unavailable'))
    const started = await startLibraryServer({
        database,
        service,
        host: '127.0.0.1',
        port: 0,
        desktop: {
            csrfToken: 'fixture',
            configured: () => true,
            status: () => ({}),
            save: async () => ({}),
            testConnection: async () => ({}),
            chooseFolder: async () => null,
            exportBrowserLitePackage: async () => ({}),
            openDirectory: async () => {},
            shutdown: () => {}
        }
    })
    try {
        const call = (
            action: string,
            value: unknown,
            csrf = 'fixture',
            origin = started.url
        ) =>
            fetch(
                started.url +
                    '/api/v1/desktop/recommendation-v5/tag-profile/' +
                    action,
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'x-pica-csrf': csrf,
                        origin
                    },
                    body: JSON.stringify(value)
                }
            )
        for (const r of [
            await call('export', {}, ''),
            await call('export', {}, 'fixture', 'https://untrusted.invalid')
        ]) {
            expect(r.status).toBe(403)
            await r.text()
        }
        const archive = await call('export', {})
        expect(archive.status).toBe(200)
        expect(archive.headers.get('cache-control')).toBe('no-store')
        const zip = new AdmZip(Buffer.from(await archive.arrayBuffer())),
            template = JSON.parse(zip.readAsText('edit_template.json'))
        const text = JSON.stringify({
            ...template,
            changes: [
                { op: 'set_mode', mode: 'SELECTED' },
                { op: 'set_participation', ids: ['pica|school'], enabled: true }
            ]
        })
        const p = await call('preview', { text }).then((r) => r.json())
        expect(p.changed).toBe(true)
        expect(service.recommendationTagPolicyV1().revision).toBe(0)
        const applied = await call('apply', {
            previewId: p.previewId,
            apply: false
        }).then((r) => r.json())
        expect(applied.revision).toBe(1)
        expect(applied.recommendationRefresh).toBeNull()
        expect(build).not.toHaveBeenCalled()
        expect(
            await call('apply', { previewId: p.previewId, apply: true }).then(
                (r) => r.json()
            )
        ).toMatchObject({ alreadyApplied: true, recommendationRefresh: null })
        expect(build).not.toHaveBeenCalled()
        const undone = await call('undo', { apply: false }).then((r) =>
            r.json()
        )
        expect(undone.revision).toBe(2)
        expect(service.recommendationTagPolicyV1().tagPolicy.mode).toBe('ALL')
        const stale = await call('preview', { text })
        expect(stale.status).toBe(409)
        await stale.text()
        const bad = await call('preview', { text, execute: true })
        expect(bad.status).toBe(400)
        await bad.text()
        const second = new AdmZip(
                Buffer.from(await (await call('export', {})).arrayBuffer())
            ),
            secondTemplate = JSON.parse(second.readAsText('edit_template.json'))
        const misleadingId = await call('preview', {
            text: JSON.stringify({
                ...secondTemplate,
                changes: [
                    {
                        op: 'set_participation',
                        ids: ['pica|CONFLICT'],
                        enabled: true
                    }
                ]
            })
        })
        expect(misleadingId.status).toBe(400)
        await misleadingId.text()
        const q = await call('preview', {
            text: JSON.stringify({
                ...secondTemplate,
                changes: [{ op: 'set_mode', mode: 'SELECTED' }]
            })
        }).then((r) => r.json())
        const regenerate = await call('apply', {
            previewId: q.previewId,
            apply: true
        }).then((r) => r.json())
        expect(regenerate.recommendationRefresh.requested).toBe(true)
        expect(database.getComic('fixture')?.title).toBe('Private title')
    } finally {
        await new Promise<void>((resolve) =>
            started.server.close(() => resolve())
        )
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    }
})

it('does not expose Desktop file exchange in the non-Desktop server', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-tag-nondesktop-')),
        database = new LibraryDatabase(path.join(dir, 'library.db')),
        service = new LibraryService(database, dir)
    const started = await startLibraryServer({
        database,
        service,
        host: '127.0.0.1',
        port: 0
    })
    try {
        const r = await fetch(
            started.url +
                '/api/v1/desktop/recommendation-v5/tag-profile/export',
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{}'
            }
        )
        expect(r.status).toBe(403)
        await r.text()
    } finally {
        await new Promise<void>((resolve) =>
            started.server.close(() => resolve())
        )
        database.close()
        fs.rmSync(dir, { recursive: true, force: true })
    }
})
