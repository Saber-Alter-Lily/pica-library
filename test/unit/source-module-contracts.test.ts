import { describe, expect, it, vi } from 'vitest'
import { ProviderRegistry } from '../../src/providers/provider-registry'
import { sourceModuleManifest } from '../../src/providers/module-manifests'
import type { ComicProvider, ProviderId } from '../../src/providers/types'

function provider(id: ProviderId): ComicProvider {
    return {
        id,
        capabilities: {
            publicBrowse: false,
            search: true,
            metadata: true,
            chapters: true,
            pages: true,
            imageFetch: true,
            remoteFavoritesRead: false,
            remoteFavoritesWrite: false,
            account: false,
            exHentai: false
        },
        search: vi.fn(async () => []),
        details: vi.fn(),
        episodes: vi.fn(async () => []),
        pages: vi.fn(async () => []),
        fetchPage: vi.fn(async () => ({
            data: Buffer.from('fixture'),
            contentType: 'image/png'
        }))
    }
}
describe('compiled source module routing contract', () => {
    it('routes identities, aliases and image schemes through one registry without provider I/O', () => {
        const pica = provider('pica'),
            eh = provider('eh'),
            jm = provider('jm')
        const registry = new ProviderRegistry([pica, eh, jm])
        expect(registry.forSource('exh')).toBe(eh)
        expect(registry.forComic('raw-legacy-id')).toBe(pica)
        expect(registry.forComic('eh:123:abc')).toBe(eh)
        expect(registry.forComic('jm:123')).toBe(jm)
        expect(registry.forPage('https://images.example.test/page.jpg')).toBe(
            pica
        )
        expect(registry.forPage('eh-page:fixture')).toBe(eh)
        expect(registry.forPage('jm-page:123:1')).toBe(jm)
        for (const p of [pica, eh, jm])
            expect(p.fetchPage).not.toHaveBeenCalled()
    })
    it('binds page resolution to the work owner, not an arbitrary HTTP locator', () => {
        const pica=provider('pica'),eh=provider('eh'),jm=provider('jm')
        const registry=new ProviderRegistry([pica,eh,jm])
        expect(registry.forPageForComic('old-pica-id','https://images.example.test/0.jpg')).toBe(pica)
        expect(registry.forPageForComic('eh:123','eh-page:abc')).toBe(eh)
        expect(registry.forPageForComic('jm:12','jm-page:12:2')).toBe(jm)

        for(const [comic,page] of [
            ['jm:12','https://another.example.test/0.jpg'],
            ['eh:123','jm-page:12:2'],
            ['old-pica-id','eh-page:abc'],
            ['host:user-selected','https://images.example.test/0.jpg']
        ])expect(()=>registry.forPageForComic(comic,page)).toThrow()
        for(const item of [pica,eh,jm]) expect(item.fetchPage).not.toHaveBeenCalled()
    })
    it('rejects unknown or missing schemes and identities before choosing any account', () => {
        const registry = new ProviderRegistry([provider('eh'), provider('jm')])
        for (const id of [
            'raw-id',
            'ehx',
            'eh:',
            'jm:',
            'unknown:123',
            'file:C:/secret'
        ])
            expect(() => registry.forComic(id)).toThrow()
        for (const locator of [
            '',
            'raw-url',
            'file:C:/secret',
            'javascript:alert(1)',
            'unknown-page:1',
            'https://example.test/'
        ])
            expect(() => registry.forPage(locator)).toThrow()
    })
    it('validates atomically and never installs half a conflicting or incompatible adapter', () => {
        const registry = new ProviderRegistry([provider('pica')]),
            eh = provider('eh')
        expect(() =>
            registry.register(eh, {
                ...sourceModuleManifest('eh'),
                sourceAliases: ['pica']
            })
        ).toThrow(/already registered/)
        expect(() => registry.get('eh')).toThrow(/not available/)
        expect(() =>
            registry.register(eh, {
                ...sourceModuleManifest('eh'),
                apiVersion: 2
            })
        ).toThrow(/contract/)
        expect(() => registry.get('eh')).toThrow(/not available/)
        registry.register(eh)
        expect(registry.forSource('exh')).toBe(eh)
    })
    it('keeps descriptor/capability inspection pure, isolated from caller mutations and current availability', () => {
        const pica = provider('pica'),
            registry = new ProviderRegistry([pica])
        const manifest = registry.manifests()[0]
        manifest.sourceAliases.push('jm')
        manifest.pageSchemes.push('file')
        expect(() => registry.forSource('jm')).toThrow()
        expect(() => registry.forPage('file:/secret')).toThrow()
        pica.capabilities.search = false
        expect(registry.capabilities().pica.search).toBe(false)
        expect(pica.search).not.toHaveBeenCalled()
    })
})
