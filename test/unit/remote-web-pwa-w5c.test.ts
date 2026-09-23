import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string) => fs.readFileSync(file, 'utf8')

describe('Remote Web installable PWA shell W5C', () => {
    it('publishes a scoped standalone manifest with a dedicated non-binary icon', () => {
        const manifest = JSON.parse(read('web/remote/manifest.webmanifest'))
        const icon = read('web/remote/icon.svg')
        const html = read('web/remote/index.html')

        expect(manifest).toMatchObject({
            id: '/remote/',
            name: 'Pica Library Remote',
            short_name: 'Pica Library',
            start_url: '/remote/',
            scope: '/remote/',
            display: 'standalone'
        })
        expect(manifest.icons).toEqual([
            expect.objectContaining({
                src: '/remote/icon.svg',
                sizes: '192x192',
                type: 'image/svg+xml',
                purpose: 'any'
            }),
            expect.objectContaining({
                src: '/remote/icon.svg',
                sizes: '512x512',
                type: 'image/svg+xml',
                purpose: 'any maskable'
            })
        ])
        expect(icon).toContain('<svg')
        expect(icon).toContain('viewBox="0 0 512 512"')
        expect(html).toContain(
            '<link rel="manifest" href="/remote/manifest.webmanifest">'
        )
        expect(html).toContain(
            '<link rel="icon" href="/remote/icon.svg" type="image/svg+xml">'
        )
        expect(html).toContain('name="theme-color"')
        expect(html).toContain('name="mobile-web-app-capable"')
        expect(html).toContain('name="apple-mobile-web-app-capable"')
    })

    it('caches only a fixed non-sensitive shell allowlist', () => {
        const worker = read('web/remote/sw.js')

        expect(worker).toContain("const CACHE_NAME = 'pica-remote-shell-w5c-v1'")
        for (const asset of [
            '/remote/',
            '/remote/remote.js',
            '/remote/remote.css',
            '/remote/manifest.webmanifest',
            '/remote/icon.svg'
        ])
            expect(worker).toContain(`'${asset}'`)

        expect(worker).toContain("if (request.method !== 'GET') return")
        expect(worker).toContain('url.origin !== self.location.origin')
        expect(worker).toContain('!SHELL_PATHS.has(url.pathname)')
        expect(worker).toContain("credentials: 'omit'")
        expect(worker).toContain('fetch(request)')
        expect(worker).toContain('cache.put(url.pathname')
        expect(worker).toContain('caches.match(url.pathname)')

        for (const forbidden of [
            '/api/',
            '/remote/v1/',
            '/covers/',
            '/reader/',
            'Authorization',
            '__Host-pica_session'
        ])
            expect(worker).not.toContain(forbidden)
    })

    it('keeps CSP closed except for same-origin manifest and worker execution', () => {
        const gateway = read('src/remote-api/gateway.ts')
        expect(gateway).toContain('"default-src \'none\'"')
        expect(gateway).toContain('"script-src \'self\'"')
        expect(gateway).toContain('"manifest-src \'self\'"')
        expect(gateway).toContain('"worker-src \'self\'"')
        expect(gateway).toContain(
            "'/remote/manifest.webmanifest'"
        )
        expect(gateway).toContain("'/remote/sw.js'")
        expect(gateway).toContain("'/remote/icon.svg'")
        expect(gateway).not.toContain("manifest-src *")
        expect(gateway).not.toContain("worker-src *")
    })

    it('reports PWA availability separately from sessions and shell capability', () => {
        const capabilities = read('src/app-capabilities.ts')
        const main = read('src/desktop/main.ts')
        expect(capabilities).toContain('remoteWebPwa: boolean')
        expect(capabilities).toContain('remoteWebPwa: CapabilityState')
        expect(capabilities).toContain(
            'remoteWebPwa: remoteWebPwa.available'
        )
        expect(main).toContain(
            'webPwa: remoteApiGateway.webPwaEnabled'
        )
    })
})
