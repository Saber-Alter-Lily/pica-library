import type { LibraryDatabase } from '../library/database'
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
        private readonly onCredentialsChanged: (value: StoredCredentials) => void
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

    async test(input: Record<string, unknown>): Promise<Record<string, unknown>> {
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
                this.syncProgress = progress as unknown as Record<string, unknown>
            }
        )
    }

    async plan(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        await this.test(input)
        return (await this.syncService(input).plan()) as unknown as Record<
            string,
            unknown
        >
    }

    save(input: Record<string, unknown>) {
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
                // Keep the Desktop cover route as a stable cache key on Android.
                // When Desktop is offline, already-prefetched covers still resolve
                // locally; cloud cover availability remains a separate source fact.
                coverPath: `/mobile/v1/covers/${encodeURIComponent(comic.comicId)}`,
                downloadedPictures: comic.downloadedPictures,
                knownPictures: comic.knownPictures,
                updatedAt: comic.updatedAt
            }))
        }
    }

    private readingKey(entry: Pick<RemoteReadingEntry, 'comicId' | 'episodeId'>) {
        return `${entry.comicId}\n${entry.episodeId}`
    }

    private async portableReading(
        provider: RemoteStorageProvider
    ): Promise<RemoteReadingState> {
        const previous =
            (await provider.getJson<RemoteReadingState>(
                remoteLayout.readingCurrent
            )) ?? {
                schemaVersion: 1 as const,
                updatedAt: '',
                entries: []
            }
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

    private async publishPortableState(provider: RemoteStorageProvider) {
        await provider.ensureDirectory('v1/state')
        await provider.ensureDirectory(remoteLayout.readingRoot)
        await provider.putJson(remoteLayout.shelves, this.portableShelves())
        await provider.putJson(remoteLayout.favorites, this.portableFavorites())
        await provider.putJson(
            remoteLayout.readingCurrent,
            await this.portableReading(provider)
        )
    }

    async sync(input: Record<string, unknown>) {
        this.save(input)
        await this.test(input)
        const { provider } = this.provider(input)
        // Portable user-state metadata is small and independent from comic page
        // upload. Publish it first so shelves/favorites/progress stay usable even
        // when a long first comic sync is still running.
        await this.publishPortableState(provider)
        const service = new RemoteLibrarySyncService(
            this.database,
            this.dataDir,
            provider,
            (progress) => {
                this.syncProgress = progress as unknown as Record<string, unknown>
            }
        )
        return await service.sync()
    }
}
