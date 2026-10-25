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
import { SourceDisabledError, type SourceAccess } from '../sources/source-policy'

export interface JmAccountSnapshot extends ProviderAccountIdentity {
    enabled: boolean
    remembered: boolean
    verification: 'CACHED' | 'NOT_CHECKED'
}

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
    private sourceAccess?: SourceAccess
    setSourceAccess(access: SourceAccess) { this.sourceAccess = access }
    private async request<T>(op: string, payload?: Record<string, unknown>): Promise<T> {
        const lease = this.sourceAccess?.('jm')
        const abort = () => this.transport.close()
        lease?.signal.addEventListener('abort', abort, {once:true})
        try {
            const value = await this.transport.request<T>(op, payload)
            lease?.check()
            return value
        } catch (error) { lease?.check(); throw error }
        finally { lease?.signal.removeEventListener('abort', abort) }
    }

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
    /** Passive local evidence only: never restore credentials or request a worker. */
    accountSnapshot(): JmAccountSnapshot {
        let enabled = true
        try { this.sourceAccess?.('jm') } catch (error) {
            if (!(error instanceof SourceDisabledError)) throw error
            enabled = false
        }
        return {
            configured: Boolean(this.identity.configured),
            ...(typeof this.identity.accountId === 'string' ? {accountId: this.identity.accountId} : {}),
            ...(typeof this.identity.username === 'string' ? {username: this.identity.username} : {}),
            enabled,
            remembered: Boolean(this.remembered),
            verification: this.identity.configured ? 'CACHED' : 'NOT_CHECKED'
        }
    }
    /** The user explicitly requested a connection, including retrying remembered login. */
    connectAccount() {
        this.sourceAccess?.('jm')
        if (!this.available) throw new Error('此包尚未包含 JM 运行组件')
        if (!this.identity.configured) this.restoreAttempted = false
        return this.accountStatus()
    }
    async accountStatus() {
        try { this.sourceAccess?.('jm') } catch (error) {
            if (!(error instanceof SourceDisabledError)) throw error
            return {configured: Boolean(this.remembered || this.identity.configured), enabled: false}
        }
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
            await this.request<ProviderAccountIdentity>('status'))
    }
    async login(username: string, password: string) {
        this.identity = { configured: false }
        return (this.identity =
            await this.request<ProviderAccountIdentity>('login', {
                username,
                password
            }))
    }
    async clearAccount() {
        this.identity = { configured: false }
        this.remembered = undefined
        try { this.sourceAccess?.('jm') } catch (error) {
            if (!(error instanceof SourceDisabledError)) throw error
            this.transport.close()
            return
        }
        if (this.available) await this.request('logout')
    }
    favoritesPage(page: number, folderId = 0) {
        return this.request<ProviderFavoritesPage>('favorites', {
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
        const result = await this.request<{ items: ProviderComic[] }>(
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
        return this.request<ProviderComic>('details', { comicId })
    }
    async episodes(comicId: string) {
        await this.restoreRememberedAccount()
        return this.request<Episode[]>('episodes', { comicId })
    }
    async pages(_comicId: string, episode: Episode) {
        await this.restoreRememberedAccount()
        return this.request<Picture[]>('pages', {
            episodeId: episode.id
        })
    }
    async fetchPage(locator: string, maxBytes = 20 * 1024 * 1024) {
        if (!/^jm-page:[1-9]\d{0,14}:[1-9]\d{0,5}$/.test(locator))
            throw new Error('无效的 JM 页面标识')
        const result = await this.request<{
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
        this.identity = {configured:false}
        this.restoreAttempted = false
    }

    async fetchCover(locator: string, maxBytes = 20 * 1024 * 1024) {
        // Covers are public HTTPS images. No Pica/JM account, cookies, or JVM operation is needed.
        // Read current proxy settings when requested; do not retain a stale configured proxy.
        const lease = this.sourceAccess?.('jm')
        const value = await this.coverClient().fetchImage(locator, maxBytes, lease?.signal)
        lease?.check()
        return value
    }
}
