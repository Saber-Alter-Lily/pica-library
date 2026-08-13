import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    knownProxyPorts,
    proxyCandidates,
    redactProxyUrl,
    validateProxyCandidates
} from '../../src/desktop/proxy-detection'

const root = path.resolve(import.meta.dirname, '../..')

describe('v0.1.4 local user flow', () => {
    it('collects and deduplicates only supported proxy candidates', () => {
        expect(
            proxyCandidates({
                saved: 'http://127.0.0.1:7890',
                windows: 'http://127.0.0.1:7890',
                environment: { HTTPS_PROXY: 'https://127.0.0.1:8080' },
                listeningPorts: [7890, 12345]
            })
        ).toEqual([
            { url: 'http://127.0.0.1:7890', source: 'saved' },
            { url: 'https://127.0.0.1:8080', source: 'environment' }
        ])
        expect(knownProxyPorts()).toEqual([
            7890, 7891, 7897, 10809, 1080, 8080, 8888
        ])
    })

    it('redacts proxy credentials', () => {
        expect(redactProxyUrl('http://user:secret@127.0.0.1:7890')).toBe(
            'http://***:***@127.0.0.1:7890'
        )
    })

    it('stops proxy auto-detection after the first provider-validated candidate', async () => {
        const attempted: string[] = []
        const candidates = proxyCandidates({
            saved: 'http://127.0.0.1:7890',
            windows: 'http://127.0.0.1:7891',
            environment: { HTTPS_PROXY: 'http://127.0.0.1:7897' }
        })
        const result = await validateProxyCandidates(
            candidates,
            async (url) => {
                attempted.push(url)
                if (url.endsWith(':7890'))
                    throw new Error('provider unavailable')
            }
        )

        expect(attempted).toEqual([
            'http://127.0.0.1:7890',
            'http://127.0.0.1:7891'
        ])
        expect(result.map(({ usable }) => usable)).toEqual([false, true])
    })

    it('reports no usable proxy when every candidate fails validation', async () => {
        const candidates = proxyCandidates({ listeningPorts: [7890, 7891] })
        const result = await validateProxyCandidates(candidates, async () => {
            throw new Error('provider rejected request')
        })

        expect(result).toHaveLength(2)
        expect(result.every(({ usable }) => !usable)).toBe(true)
    })

    it('redacts credentials from provider-failed auto-detection results', async () => {
        const result = await validateProxyCandidates(
            [
                {
                    url: 'http://proxy-user:proxy-secret@127.0.0.1:7890',
                    source: 'saved'
                }
            ],
            async () => {
                throw new Error('provider validation failed')
            }
        )

        expect(result).toEqual([
            {
                url: 'http://***:***@127.0.0.1:7890',
                source: 'saved',
                usable: false
            }
        ])
        expect(JSON.stringify(result)).not.toContain('proxy-secret')
    })

    it('contains health polling, forced Browser Lite, and recommendation batching', () => {
        const app = fs.readFileSync(path.join(root, 'web/app.js'), 'utf8')
        expect(app).toContain('waitForDesktopHealth')
        expect(app).not.toContain("setTimeout(() => location.assign('/'), 500)")
        expect(app).toContain("get('mode') === 'browser-lite'")
        expect(app).toContain('state.recommendations.slice(start, start + 12)')
        expect(app).toContain("localStorage.setItem('pica-covers-enabled'")
        expect(app).toContain("localStorage.setItem('pica-recommendation-view'")
        expect(app).toContain('/api/v1/desktop/sync-export-browser-lite')
        expect(app).toContain('limit: 60')
        expect(app).toContain("$('#lite-reimport').onclick")
    })

    it('keeps proxy onboarding visible above the first-run fold', () => {
        const html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8')
        const setup = html.slice(
            html.indexOf('<section id="setup"'),
            html.indexOf('<section id="home"')
        )
        expect(setup).toContain('id="detect-proxy"')
        expect(setup).toContain('id="setup-proxy"')
        expect(setup).not.toContain('<summary>Advanced</summary>')
        expect(html).toContain('id="open-browser-lite"')
        expect(html).toContain('id="recommend-next-batch"')
        expect(html).toContain('id="cover-toggle-label"')
        expect(html).toContain('id="recommend-cover-toggle-label"')
        expect(html).toContain('id="settings-detect-proxy"')
        expect(html).toContain('id="home-sync"')
        expect(html).toContain('id="setup-sync"')
        expect(html).toContain('id="lite-snapshot-time"')
        expect(html).toContain('id="lite-reimport"')
    })

    it('creates Windows-readable UTF-8 logs with a BOM', () => {
        const logging = fs.readFileSync(
            path.join(root, 'src/desktop/logging.ts'),
            'utf8'
        )
        expect(logging).toContain(
            "fs.writeFileSync(this.file, '\\uFEFF', 'utf8')"
        )
    })
})
