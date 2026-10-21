import type { ComicProvider, OnlineSource, ProviderId } from './types'

/** Routing authority. Legacy unprefixed Pica IDs are preserved; unknown namespaces fail closed. */
export class ProviderRegistry {
    private readonly providers = new Map<ProviderId, ComicProvider>()

    constructor(providers: ComicProvider[] = []) {
        for (const provider of providers) this.register(provider)
    }

    register(provider: ComicProvider) {
        if (this.providers.has(provider.id))
            throw new Error(`Provider already registered: ${provider.id}`)
        this.providers.set(provider.id, provider)
    }

    get(id: ProviderId): ComicProvider {
        const provider = this.providers.get(id)
        if (!provider) throw new Error(`Source is not available: ${id}`)
        return provider
    }

    forSource(source: OnlineSource): ComicProvider {
        return this.get(source === 'exh' ? 'eh' : source)
    }

    forComic(comicId: string): ComicProvider {
        if (typeof comicId !== 'string' || !comicId.trim())
            throw new Error('Comic identity is empty')
        const colon = comicId.indexOf(':')
        if (colon < 0) return this.get('pica')
        const id = comicId.slice(0, colon)
        if (id !== 'eh' && id !== 'jm')
            throw new Error('Unrecognized comic source')
        return this.get(id)
    }

    capabilities() {
        return Object.fromEntries(
            [...this.providers].map(([id, provider]) => [
                id,
                provider.capabilities
            ])
        ) as Record<ProviderId, ComicProvider['capabilities']>
    }
}
