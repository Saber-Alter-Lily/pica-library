import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'
import { LibraryService } from '../../src/library/service'
import { startLibraryServer } from '../../src/library/server'
import { PRODUCT_VERSION } from '../../src/version'
import {
    UPDATE_RECONNECT_STABILITY_MS,
    probeUpdateReconnect,
    waitForUpdateReconnect
} from '../../web/update-reconnect.js'

describe('post-v0.5.0 update reconnect stabilization', () => {
    it('requires both target capabilities and a loadable Web shell', async () => {
        const fetchFn = vi.fn(async (url: string) => {
            if (url === '/api/v1/capabilities')
                return {
                    ok: true,
                    json: async () => ({ appVersion: '0.5.1' })
                }
            if (url === '/?pica-update-ready=123')
                return {
                    ok: true,
                    text: async () => '<!doctype html><html><body>Pica Library</body></html>'
                }
            throw new Error(`Unexpected probe URL: ${url}`)
        })
        const ready = await probeUpdateReconnect('0.5.1', {
            fetchFn: fetchFn as unknown as typeof fetch,
            now: () => 123
        })
        expect(ready).toBe(true)
        expect(fetchFn).toHaveBeenCalledTimes(2)
    })

    it('resets the stabilization window after a transient failure', async () => {
        expect(UPDATE_RECONNECT_STABILITY_MS).toBe(1_500)
        let now = 0
        let index = 0
        const outcomes = [true, true, false, true, true, true]
        const ready = await waitForUpdateReconnect('0.5.1', {
            timeoutMs: 5_000,
            pollMs: 250,
            stabilityMs: 500,
            now: () => now,
            sleepFn: async (ms: number) => {
                now += ms
            },
            probe: async () =>
                outcomes[Math.min(index++, outcomes.length - 1)]
        })
        expect(ready).toBe(true)
        expect(index).toBe(6)
    })

    it('withholds Desktop capabilities until startup is fully ready', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-update-ready-'))
        const database = new LibraryDatabase(path.join(dir, 'library.db'))
        const service = new LibraryService(database, dir)
        let startupReady = false
        const started = await startLibraryServer({
            database,
            service,
            host: '127.0.0.1',
            port: 0,
            desktop: {
                csrfToken: 'test',
                configured: () => true,
                status: () => ({ startupReady })
            } as any
        })
        try {
            let response = await fetch(
                `${started.url}/api/v1/capabilities`
            )
            expect(response.status).toBe(503)
            expect(await response.json()).toMatchObject({
                startupReady: false
            })

            startupReady = true
            response = await fetch(
                `${started.url}/api/v1/capabilities`
            )
            expect(response.status).toBe(200)
            expect(await response.json()).toMatchObject({
                appVersion: PRODUCT_VERSION
            })
        } finally {
            await new Promise<void>((resolve, reject) =>
                started.server.close((error) =>
                    error ? reject(error) : resolve()
                )
            )
            database.close()
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })

    it('keeps a manual-refresh recovery message as the final fallback', () => {
        const root = path.resolve(import.meta.dirname, '../..')
        const i18n = fs.readFileSync(path.join(root, 'web/i18n.js'), 'utf8')
        const ja = fs.readFileSync(
            path.join(root, 'web/i18n-ja-common.js'),
            'utf8'
        )
        expect(i18n).toContain('请稍等片刻后刷新本页')
        expect(i18n).toContain('Wait a moment and refresh this page')
        expect(ja).toContain('少し待ってからこのページを再読み込み')
    })
})
