import type { LibraryDatabase } from '../library/database'
import type { CredentialStore } from '../desktop/credentials'
import type { StoredCredentials } from '../desktop/types'
import {
    loadRemoteStorageConfig,
    normalizeRemoteStorageConfig,
    saveRemoteStorageConfig
} from './config'
import { createRemoteStorageProvider } from './factory'
import { RemoteLibrarySyncService } from './sync-service'
import type { RemoteStoragePublicConfig } from './types'

export class RemoteStorageDesktopManager {
    private publicConfig: RemoteStoragePublicConfig | null
    private credentials: StoredCredentials | null
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

    async sync(input: Record<string, unknown>) {
        this.save(input)
        await this.test(input)
        const { provider } = this.provider(input)
        // Shelf classification is portable metadata. Publish it independently of
        // page upload progress so Android can import the web bookshelf even when
        // a long first comic sync is still running.
        await provider.putJson('v1/state/shelves.json', this.portableShelves())
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
