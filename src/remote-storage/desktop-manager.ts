import type { LibraryDatabase } from '../library/database'
import type { CredentialStore } from '../desktop/credentials'
import type { StoredCredentials } from '../desktop/types'
import {
    loadRemoteStorageConfig,
    normalizeRemoteStorageConfig,
    saveRemoteStorageConfig
} from './config'
import { createRemoteStorageProvider } from './factory'
import {
    RemoteLibrarySyncService,
    type RemoteSyncProgress
} from './sync-service'
import type { RemoteStoragePublicConfig } from './types'

export class RemoteStorageDesktopManager {
    private publicConfig: RemoteStoragePublicConfig | null
    private credentials: StoredCredentials | null
    private activeSync: Promise<unknown> | null = null
    private syncProgress: RemoteSyncProgress = {
        phase: 'idle',
        updatedAt: new Date().toISOString(),
        totalComics: 0,
        completedComics: 0,
        currentComicIndex: 0,
        currentComicTitle: '',
        currentComicPages: 0,
        currentComicCompletedPages: 0,
        totalPages: 0,
        completedPages: 0,
        uploadedObjects: 0,
        uploadedBytes: 0
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
        const syncProgress = { ...this.syncProgress }
        return this.publicConfig
            ? {
                  configured: true,
                  ...this.publicConfig,
                  credentialsConfigured: Boolean(
                      this.credentials?.remoteStorageUsername ||
                          this.credentials?.remoteStoragePassword
                  ),
                  syncProgress
              }
            : {
                  configured: false,
                  kind: 'webdav' as const,
                  syncProgress
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

    private syncService(
        input: Record<string, unknown>,
        onProgress?: (progress: RemoteSyncProgress) => void
    ) {
        const { provider } = this.provider(input)
        return new RemoteLibrarySyncService(
            this.database,
            this.dataDir,
            provider,
            onProgress,
            4
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

    async sync(input: Record<string, unknown>) {
        if (this.activeSync) throw new Error('远程同步已经在进行中')
        this.save(input)
        await this.test(input)
        const task = this.syncService(input, (progress) => {
            this.syncProgress = progress
        }).sync()
        this.activeSync = task
        try {
            return await task
        } finally {
            this.activeSync = null
        }
    }
}
