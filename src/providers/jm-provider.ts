import { createHash } from 'node:crypto'
import type { Episode, Picture } from '../types'
import type {
    AccountComicProvider,
    ProviderAccountIdentity,
    ProviderComic,
    ProviderFavoritesPage,
    SearchRequest
} from './types'
import { JmWorkerTransport, type JmTransport } from './jm-worker'
import { HttpMediaClient } from '../media/http-media-client'

export class JmProvider implements AccountComicProvider {
    readonly id = 'jm' as const
    get capabilities() {
        const ready = this.available
        return {
            publicBrowse: ready,
            search: ready,
            metadata: ready,
            chapters: ready,
            pages: ready,
            imageFetch: ready,
            remoteFavoritesRead: ready,
            remoteFavoritesWrite: false,
            account: ready,
            exHentai: false
        }
    }
    private identity: ProviderAccountIdentity = { configured: false }
    private remembered?: { username: string; password: string }
    private restoreAttempted = false

    constructor(
        readonly transport: JmTransport = new JmWorkerTransport(),
        private readonly coverClient = () => new HttpMediaClient({ proxyUrl: process.env.PICA_PROXY || false })
    ) {}
    get available() {
        return this.transport.available
    }
    setRememberedCredentials(username?: string, password?: string) {
        this.remembered =
            username && password ? { username, password } : undefined
        this.restoreAttempted = false
    }
    cachePartitionKey() {
        return createHash('sha256')
            .update(
                `${this.identity.accountId ?? 'anonymous'}\n${this.transport.sessionKey?.() ?? ''}`
            )
            .digest('hex')
    }
    async accountStatus() {
        if (!this.available) return { configured: false }
        if (
            this.remembered &&
            !this.restoreAttempted &&
            !this.identity.configured
        ) {
            this.restoreAttempted = true
            return this.login(
                this.remembered.username,
                this.remembered.password
            )
        }
        return (this.identity =
            await this.transport.request<ProviderAccountIdentity>('status'))
    }
    async login(username: string, password: string) {
        this.identity = { configured: false }
        return (this.identity =
            await this.transport.request<ProviderAccountIdentity>('login', {
                username,
                password
            }))
    }
    async clearAccount() {
        this.identity = { configured: false }
        this.remembered = undefined
        if (this.available) await this.transport.request('logout')
    }
    favoritesPage(page: number, folderId = 0) {
        return this.transport.request<ProviderFavoritesPage>('favorites', {
            page,
            folderId
        })
    }
    private async restoreRememberedAccount() {
        if (
            this.remembered &&
            !this.restoreAttempted &&
            !this.identity.configured
        )
            await this.accountStatus()
    }
    async search(input: SearchRequest) {
        await this.restoreRememberedAccount()
        const result = await this.transport.request<{ items: ProviderComic[] }>(
            'search',
            {
                keyword: input.keyword || input.tags?.join(' ') || '',
                page: input.page ?? 1
            }
        )
        return result.items.slice(0, Math.min(100, input.limit ?? 100))
    }
    async details(comicId: string) {
        await this.restoreRememberedAccount()
        return this.transport.request<ProviderComic>('details', { comicId })
    }
    async episodes(comicId: string) {
        await this.restoreRememberedAccount()
        return this.transport.request<Episode[]>('episodes', { comicId })
    }
    async pages(_comicId: string, episode: Episode) {
        await this.restoreRememberedAccount()
        return this.transport.request<Picture[]>('pages', {
            episodeId: episode.id
        })
    }
    async fetchPage(locator: string, maxBytes = 20 * 1024 * 1024) {
        if (!/^jm-page:[1-9]\d{0,14}:[1-9]\d{0,5}$/.test(locator))
            throw new Error('无效的 JM 页面标识')
        const result = await this.transport.request<{
            base64: string
            contentType: string
        }>('image', { locator, maxBytes })
        const data = Buffer.from(result.base64, 'base64')
        if (!data.length || data.length > maxBytes)
            throw new Error('JM 图片为空或超出大小限制')
        return { data, contentType: result.contentType }
    }
    close() {
        this.transport.close()
    }

    async fetchCover(locator: string, maxBytes = 20 * 1024 * 1024) {
        // Covers are public HTTPS images. No Pica/JM account, cookies, or JVM operation is needed.
        // Read current proxy settings when requested; do not retain a stale configured proxy.
        return this.coverClient().fetchImage(locator, maxBytes)
    }
}
