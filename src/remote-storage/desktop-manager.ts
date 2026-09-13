import type { LibraryDatabase } from '../library/database'
import { createHash, randomUUID } from 'node:crypto'
import { removeRemoteCopies, selectedComicIds } from './remove-copies'
import type { CredentialStore } from '../desktop/credentials'
import type { StoredCredentials } from '../desktop/types'
import { LibraryQueryService } from '../services/library-query-service'
import {
    loadRemoteStorageConfig,
    normalizeRemoteStorageConfig,
    saveRemoteStorageConfig
} from './config'
import { createRemoteStorageProvider } from './factory'
import { remoteLayout } from './layout'
import { RemoteLibrarySyncService } from './sync-service'
import type {
    RemoteFavoriteState,
    RemoteReadingEntry,
    RemoteReadingState,
    RemoteStorageProvider,
    RemoteStoragePublicConfig
} from './types'

export class RemoteStorageDesktopManager {
    private publicConfig: RemoteStoragePublicConfig | null
    private credentials: StoredCredentials | null
    private readonly query: LibraryQueryService
    private mutationInFlight = false
    private scopeId = randomUUID()

    private exclusionsKey() {
        return `remote-excluded-v1:${createHash('sha256')
            .update(
                JSON.stringify([
                    this.publicConfig,
                    this.credentials?.remoteStorageUsername ?? ''
                ])
            )
            .digest('hex')}`
    }
    private exclusions() {
        return this.database.getAppState<string[]>(this.exclusionsKey()) ?? []
    }
    private selected(input: Record<string, unknown>) {
        const downloaded = this.query
            .query({ scope: 'downloaded', limit: 5000, offset: 0 })
            .items.map((item) => item.comicId)
        if (input.comicIds !== undefined) {
            const ids = selectedComicIds(input.comicIds)
            if (ids.some((id) => !downloaded.includes(id)))
                throw new Error('所选漫画没有本地下载，已停止上传')
            return ids
        }
        const excluded = new Set(this.exclusions())
        return downloaded.filter((id) => !excluded.has(id))
    }

    async inventory(input: Record<string, unknown>) {
        if (input.remoteStorage)
            throw new Error('请先保存网盘配置，再核验漫画副本状态')
        if (this.mutationInFlight)
            throw new Error('网盘操作进行中，请完成后刷新')
        const scopeId = this.scopeId
        const result = await this.syncService({}).inventory()
        if (scopeId !== this.scopeId)
            throw new Error('网盘配置已变化，请重新刷新')
        const pending = new Set(
            this.database.getAppState<string[]>(
                `${this.exclusionsKey()}:pending`
            ) ?? []
        )
        return {
            ...result,
            scopeId,
            comics: result.comics.map((item) => ({
                ...item,
                excludedFromFullSync: this.exclusions().includes(item.comicId),
                state: pending.has(item.comicId) ? 'delete-pending' : item.state
            }))
        }
    }

    async deleteCopies(input: Record<string, unknown>) {
        if (this.mutationInFlight) throw new Error('已有网盘操作进行中')
        if (input.confirmation !== 'DELETE_REMOTE_ONLY')
            throw new Error('必须明确确认仅删除网盘副本')
        if (
            input.remoteScopeId !== this.scopeId ||
            typeof input.expectedGeneration !== 'string'
        )
            throw new Error('网盘目标未核验或已经变化，请刷新后重新选择')
        const ids = selectedComicIds(input.comicIds)
        if (ids.some((id) => !this.database.getComic(id)))
            throw new Error('所选漫画不在本地书库中')
        this.mutationInFlight = true
        try {
            const { provider } = this.provider({})
            const key = this.exclusionsKey()
            const pendingKey = `${key}:pending`
            const result = await removeRemoteCopies(
                provider,
                ids,
                () => {
                    this.database.setAppState(key, [
                        ...new Set([...this.exclusions(), ...ids])
                    ])
                    this.database.setAppState(pendingKey, [
                        ...new Set([
                            ...(this.database.getAppState<string[]>(
                                pendingKey
                            ) ?? []),
                            ...ids
                        ])
                    ])
                },
                input.expectedGeneration
            )
            this.database.setAppState(
                pendingKey,
                (this.database.getAppState<string[]>(pendingKey) ?? []).filter(
                    (id) => !result.deletedComicIds.includes(id)
                )
            )
            return result
        } finally {
            this.mutationInFlight = false
        }
    }
    private syncProgress: Record<string, unknown> = {
        phase: 'idle',
        updatedAt: new Date().toISOString()
    }

    constructor(
        private readonly configFile: string,
        private readonly credentialStore: CredentialStore,
        credentials: StoredCredentials | null,
        private readonly database: LibraryDatabase,
        private readonly dataDir: string,
        private readonly onCredentialsChanged: (
            value: StoredCredentials
        ) => void
    ) {
        this.credentials = credentials
        this.publicConfig = loadRemoteStorageConfig(configFile)
        this.query = new LibraryQueryService(database)
    }

    status() {
        return this.publicConfig
            ? {
                  configured: true,
                  ...this.publicConfig,
                  credentialsConfigured: Boolean(
                      this.credentials?.remoteStorageUsername ||
                          this.credentials?.remoteStoragePassword
                  ),
                  syncProgress: this.syncProgress
              }
            : {
                  configured: false,
                  kind: 'webdav' as const,
                  syncProgress: this.syncProgress
              }
    }

    private selection(input: Record<string, unknown>) {
        const value =
            typeof input.remoteStorage === 'object' && input.remoteStorage
                ? (input.remoteStorage as Record<string, unknown>)
                : null
        const publicConfig = value
            ? normalizeRemoteStorageConfig(value)
            : this.publicConfig
        if (!publicConfig) throw new Error('Configure remote storage first')
        const suppliedUsername = value?.username
        const suppliedPassword = value?.password
        const username =
            suppliedUsername !== undefined && String(suppliedUsername).trim()
                ? String(suppliedUsername).trim()
                : this.credentials?.remoteStorageUsername
        const password =
            suppliedPassword !== undefined && String(suppliedPassword)
                ? String(suppliedPassword)
                : this.credentials?.remoteStoragePassword
        return {
            publicConfig,
            remoteCredentials: {
                username: username || undefined,
                password: password || undefined
            }
        }
    }

    private provider(input: Record<string, unknown>) {
        const selected = this.selection(input)
        return {
            selected,
            provider: createRemoteStorageProvider(
                selected.publicConfig,
                selected.remoteCredentials
            )
        }
    }

    async test(
        input: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        const { selected, provider } = this.provider(input)
        const result = await provider.test()
        return {
            ...result,
            kind: selected.publicConfig.kind,
            baseUrl: selected.publicConfig.baseUrl,
            root: selected.publicConfig.root
        }
    }

    private syncService(input: Record<string, unknown>) {
        const { provider } = this.provider(input)
        return new RemoteLibrarySyncService(
            this.database,
            this.dataDir,
            provider,
            (progress) => {
                this.syncProgress = progress as unknown as Record<
                    string,
                    unknown
                >
            }
        )
    }

    async plan(
        input: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        await this.test(input)
        return (await this.syncService(input).plan(
            this.selected(input)
        )) as unknown as Record<string, unknown>
    }

    save(input: Record<string, unknown>) {
        if (this.mutationInFlight)
            throw new Error('网盘操作期间不能更改存储配置')
        const selected = this.selection(input)
        const merged: StoredCredentials = {
            account: this.credentials?.account ?? '',
            password: this.credentials?.password ?? '',
            proxyUsername: this.credentials?.proxyUsername,
            proxyPassword: this.credentials?.proxyPassword,
            remoteStorageUsername: selected.remoteCredentials.username,
            remoteStoragePassword: selected.remoteCredentials.password
        }
        saveRemoteStorageConfig(this.configFile, selected.publicConfig)
        this.credentialStore.save(merged)
        this.publicConfig = selected.publicConfig
        this.credentials = merged
        this.scopeId = randomUUID()
        this.onCredentialsChanged(merged)
        return { success: true, remoteStorage: this.status() }
    }

    private portableShelves() {
        return {
            schemaVersion: 1,
            updatedAt: new Date().toISOString(),
            shelves: this.database.listShelves().map((shelf) => ({
                id: shelf.id,
                name: shelf.name,
                createdAt: shelf.createdAt,
                updatedAt: shelf.updatedAt,
                sortOrder: shelf.sortOrder,
                items: this.database.listShelfComics(shelf.id).map((comic) => ({
                    comicId: comic.comicId,
                    title: comic.title,
                    author: comic.author,
                    canonicalAuthor: comic.canonicalAuthor,
                    tags: comic.tags,
                    categories: comic.categories,
                    downloadedPictures: comic.downloadedPictures,
                    knownPictures: comic.knownPictures,
                    updatedAt: comic.updatedAt
                }))
            }))
        }
    }

    private portableFavorites(): RemoteFavoriteState {
        const items = this.query.query({
            scope: 'favorites',
            limit: 5000,
            offset: 0,
            sort: 'latest'
        }).items
        return {
            schemaVersion: 1,
            updatedAt: new Date().toISOString(),
            items: items.map((comic) => ({
                comicId: comic.comicId,
                title: comic.title,
                author: comic.author,
                canonicalAuthor: comic.canonicalAuthor,
                coverPath: `/mobile/v1/covers/${encodeURIComponent(comic.comicId)}`,
                downloadedPictures: comic.downloadedPictures,
                knownPictures: comic.knownPictures,
                updatedAt: comic.updatedAt
            }))
        }
    }

    private readingKey(
        entry: Pick<RemoteReadingEntry, 'comicId' | 'episodeId'>
    ) {
        return `${entry.comicId}\n${entry.episodeId}`
    }

    private portableReading(previous: RemoteReadingState): RemoteReadingState {
        const merged = new Map<string, RemoteReadingEntry>()
        for (const entry of previous.entries ?? []) {
            if (!entry?.comicId || !entry?.episodeId) continue
            merged.set(this.readingKey(entry), entry)
        }
        for (const progress of this.database.readingProgress()) {
            const comic = this.database.getComic(progress.comicId)
            const episode = this.database
                .listReaderEpisodes(progress.comicId)
                .find((item) => item.id === progress.episodeId)
            const local: RemoteReadingEntry = {
                comicId: progress.comicId,
                episodeId: progress.episodeId,
                pageIndex: progress.pageIndex,
                updatedAt: progress.updatedAt,
                deviceId: 'desktop',
                comicTitle: comic?.title,
                author: comic?.canonicalAuthor ?? comic?.author,
                episodeTitle: episode?.title,
                episodeOrder: episode?.order
            }
            const prior = merged.get(this.readingKey(local))
            if (!prior || local.updatedAt >= prior.updatedAt)
                merged.set(this.readingKey(local), local)
        }
        const entries = [...merged.values()].sort((left, right) =>
            right.updatedAt.localeCompare(left.updatedAt)
        )
        return {
            schemaVersion: 1,
            updatedAt: entries[0]?.updatedAt ?? new Date().toISOString(),
            entries
        }
    }

    private async publishPortableReading(provider: RemoteStorageProvider) {
        for (let attempt = 1; attempt <= 4; attempt++) {
            const version = await provider.getJsonVersioned<RemoteReadingState>(
                remoteLayout.readingCurrent
            )
            const previous = version.value ?? {
                schemaVersion: 1 as const,
                updatedAt: '',
                entries: []
            }
            const next = this.portableReading(previous)
            if (
                await provider.putJsonConditional(
                    remoteLayout.readingCurrent,
                    next,
                    version
                )
            )
                return next
        }
        throw new Error(
            'Portable reading state changed concurrently too many times; retry sync'
        )
    }

    private async publishPortableState(provider: RemoteStorageProvider) {
        await provider.ensureDirectory('v1/state')
        await provider.ensureDirectory(remoteLayout.readingRoot)
        await provider.putJson(remoteLayout.shelves, this.portableShelves())
        await provider.putJson(remoteLayout.favorites, this.portableFavorites())
        await this.publishPortableReading(provider)
    }

    async sync(input: Record<string, unknown>) {
        if (this.mutationInFlight) throw new Error('已有网盘操作进行中')
        if (
            input.comicIds !== undefined &&
            (input.remoteStorage || input.remoteScopeId !== this.scopeId)
        )
            throw new Error('网盘目标未核验或已经变化，请刷新后重新选择')
        // Reject empty/invalid explicit selections before any external write.
        if (input.comicIds !== undefined) this.selected(input)
        this.save(input)
        const ids = this.selected(input)
        if (!ids.length) throw new Error('没有选中可上传漫画')
        this.mutationInFlight = true
        try {
            const result = await this.syncSelected(input, ids)
            if (input.comicIds !== undefined) {
                const completed = ids.filter(
                    (id) => !result.issues.some((issue) => issue.comicId === id)
                )
                this.database.setAppState(
                    this.exclusionsKey(),
                    this.exclusions().filter((id) => !completed.includes(id))
                )
                const pendingKey = `${this.exclusionsKey()}:pending`
                this.database.setAppState(
                    pendingKey,
                    (
                        this.database.getAppState<string[]>(pendingKey) ?? []
                    ).filter((id) => !completed.includes(id))
                )
            }
            return result
        } finally {
            this.mutationInFlight = false
        }
    }

    private async syncSelected(input: Record<string, unknown>, ids: string[]) {
        await this.test(input)
        const { provider } = this.provider(input)
        // Portable metadata is small and independent from comic page upload.
        // Reading state uses optimistic concurrency so a Desktop sync cannot
        // silently erase a newer Android progress write.
        await this.publishPortableState(provider)
        const service = new RemoteLibrarySyncService(
            this.database,
            this.dataDir,
            provider,
            (progress) => {
                this.syncProgress = progress as unknown as Record<
                    string,
                    unknown
                >
            }
        )
        return await service.sync(ids)
    }
}
