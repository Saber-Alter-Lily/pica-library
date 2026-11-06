import type { ComicProvider, OnlineSource, ProviderId } from './types'
import {
    normalizeSourceModuleManifest,
    sourceModuleManifest,
    type SourceModuleManifest
} from './module-manifests'

/** Routing authority. Legacy unprefixed Pica IDs are preserved; unknown namespaces fail closed. */
export class ProviderRegistry {
    private readonly providers = new Map<ProviderId, ComicProvider>()
    private readonly modules = new Map<ProviderId, SourceModuleManifest>()
    private readonly namespaces = new Map<string, ProviderId>()
    private readonly aliases = new Map<string, ProviderId>()
    private readonly pageSchemes = new Map<string, ProviderId>()
    private legacyProvider?: ProviderId

    constructor(providers: ComicProvider[] = []) {
        for (const provider of providers) this.register(provider)
    }

    register(
        provider: ComicProvider,
        manifest = sourceModuleManifest(provider.id)
    ) {
        if (this.providers.has(provider.id))
            throw new Error(`Provider already registered: ${provider.id}`)
        const module = normalizeSourceModuleManifest(manifest, provider.id)
        if (
            (module.comicNamespace &&
                this.namespaces.has(module.comicNamespace)) ||
            module.sourceAliases.some((alias) => this.aliases.has(alias)) ||
            module.pageSchemes.some((scheme) => this.pageSchemes.has(scheme)) ||
            (module.legacyUnprefixedIds && this.legacyProvider)
        )
            throw new Error('Source module route already registered')
        this.providers.set(provider.id, provider)
        this.modules.set(provider.id, module)
        if (module.comicNamespace)
            this.namespaces.set(module.comicNamespace, provider.id)
        for (const alias of module.sourceAliases)
            this.aliases.set(alias, provider.id)
        for (const scheme of module.pageSchemes)
            this.pageSchemes.set(scheme, provider.id)
        if (module.legacyUnprefixedIds) this.legacyProvider = provider.id
    }

    get(id: ProviderId): ComicProvider {
        const provider = this.providers.get(id)
        if (!provider) throw new Error(`Source is not available: ${id}`)
        return provider
    }

    forSource(source: OnlineSource): ComicProvider {
        const id = this.aliases.get(source)
        if (!id) throw new Error('Source is not available')
        return this.get(id)
    }

    forComic(comicId: string): ComicProvider {
        if (typeof comicId !== 'string' || !comicId.trim())
            throw new Error('Comic identity is empty')
        const colon = comicId.indexOf(':')
        if (colon < 0) {
            if (this.legacyProvider) return this.get(this.legacyProvider)
            throw new Error('Unrecognized comic source')
        }
        const id = this.namespaces.get(comicId.slice(0, colon))
        if (!id || colon === comicId.length - 1)
            throw new Error('Unrecognized comic source')
        return this.get(id)
    }

    forPage(locator: string): ComicProvider {
        if (typeof locator !== 'string')
            throw new Error('Unrecognized page source')
        const scheme = /^([a-z][a-z0-9-]*):/i.exec(locator)?.[1]
        const id = scheme
            ? this.pageSchemes.get(scheme.toLowerCase())
            : undefined
        if (!id) throw new Error('Unrecognized page source')
        return this.get(id)
    }

    /**
     * Explicit comic-owned page routing for new Reader/source adapters.
     * Legacy forPage() still accepts raw Pica HTTP(S) locators for existing
     * downloads; callers with a work identity should use this stricter port.
     * Unknown sources and mixed-provider page schemes fail before media I/O.
     */
    forPageForComic(comicId: string, locator: string): ComicProvider {
        const comicOwner = this.forComic(comicId)
        const mediaOwner = this.forPage(locator)
        if (comicOwner.id !== mediaOwner.id)
            throw new Error('Page source does not match comic source')
        return comicOwner
    }

    manifests(): SourceModuleManifest[] {
        return [...this.modules.values()].map((module) =>
            normalizeSourceModuleManifest(module, module.id)
        )
    }

    capabilities() {
        return Object.fromEntries(
            [...this.providers].map(([id, provider]) => [
                id,
                { ...provider.capabilities }
            ])
        ) as Record<ProviderId, ComicProvider['capabilities']>
    }
}
