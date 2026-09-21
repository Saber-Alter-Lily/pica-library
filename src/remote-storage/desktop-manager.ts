import type { LibraryDatabase } from '../library/database'
import { createHash, randomUUID } from 'node:crypto'
import { removeRemoteCopies, selectedComicIds } from './remove-copies'
import type { CredentialStore } from '../desktop/credentials'
import type { StoredCredentials } from '../desktop/types'
import { LibraryQueryService } from '../services/library-query-service'
import {
    loadRemoteStorageRegistry,
    normalizeRemoteStorageConfig,
    REMOTE_STORAGE_PRESETS,
    saveRemoteStorageRegistry
} from './config'
import { createRemoteStorageProvider } from './factory'
import { remoteLayout } from './layout'
import { RemoteLibrarySyncService } from './sync-service'
import type {
    RemoteFavoriteState,
    RemoteReadingEntry,
    RemoteReadingState,
    RemoteStorageCredentials,
    RemoteStorageProvider,
    RemoteStorageRegistry,
    RemoteStorageTarget
} from './types'

interface SelectedRemoteTarget {
    targetId: string
    label: string
    publicConfig: RemoteStorageTarget['config']
    remoteCredentials: RemoteStorageCredentials
    saved: boolean
}

class RemoteSyncCancelledError extends Error {
    constructor() {
        super('Remote sync was cancelled')
        this.name = 'RemoteSyncCancelledError'
    }
}

export class RemoteStorageDesktopManager {
    private registry: RemoteStorageRegistry
    private credentials: StoredCredentials | null
    private readonly query: LibraryQueryService
    private mutationInFlight = false
    private syncTaskState:
        | 'idle'
        | 'running'
        | 'pausing'
        | 'paused'
        | 'cancelling'
        | 'complete'
        | 'failed'
        | 'cancelled' = 'idle'
    private syncPauseRequested = false
    private syncCancelRequested = false
    private readonly syncResumeWaiters = new Set<() => void>()
    private readonly scopeIds = new Map<string, string>()
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
        this.registry = loadRemoteStorageRegistry(configFile)
        this.query = new LibraryQueryService(database)
        for (const target of this.registry.targets)
            this.scopeIds.set(target.id, randomUUID())
    }

    private scopeId(targetId: string) {
        let value = this.scopeIds.get(targetId)
        if (!value) {
            value = randomUUID()
            this.scopeIds.set(targetId, value)
        }
        return value
    }

    private targetCredentials(targetId: string): RemoteStorageCredentials {
        const mapped = this.credentials?.remoteStorageCredentials?.[targetId]
        if (mapped) return { ...mapped }
        if (targetId === 'legacy-default')
            return {
                username: this.credentials?.remoteStorageUsername,
                password: this.credentials?.remoteStoragePassword
            }
        return {}
    }

    private target(input: Record<string, unknown>) {
        const requested = String(input.remoteTargetId ?? '').trim()
        if (requested) {
            const target = this.registry.targets.find((item) => item.id === requested)
            if (!target) throw new Error('所选网盘配置不存在，请刷新后重试')
            return target
        }
        if (!this.registry.targets.length) throw new Error('请先配置远程存储')
        if (this.registry.targets.length > 1)
            throw new Error('已配置多个网盘，请先选择目标网盘')
        return this.registry.targets[0]
    }

    private selection(input: Record<string, unknown>): SelectedRemoteTarget {
        const value =
            typeof input.remoteStorage === 'object' && input.remoteStorage
                ? (input.remoteStorage as Record<string, unknown>)
                : null
        if (!value) {
            const target = this.target(input)
            return {
                targetId: target.id,
                label: target.label,
                publicConfig: target.config,
                remoteCredentials: this.targetCredentials(target.id),
                saved: true
            }
        }

        const publicConfig = normalizeRemoteStorageConfig(value)
        const requestedId = String(
            input.remoteTargetId ?? value.id ?? value.targetId ?? ''
        ).trim()
        const createNew = input.createNewTarget === true
        let existing = requestedId
            ? this.registry.targets.find((item) => item.id === requestedId)
            : undefined
        if (requestedId && !existing)
            throw new Error('所选网盘配置不存在，请刷新后重试')
        if (!requestedId && !createNew) {
            if (this.registry.targets.length === 1)
                existing = this.registry.targets[0]
            else if (this.registry.targets.length > 1)
                throw new Error('已配置多个网盘，请先选择要编辑的网盘')
        }
        const stored = existing ? this.targetCredentials(existing.id) : {}
        const suppliedUsername = value.username
        const suppliedPassword = value.password
        const username =
            suppliedUsername !== undefined && String(suppliedUsername).trim()
                ? String(suppliedUsername).trim()
                : stored.username
        const password =
            suppliedPassword !== undefined && String(suppliedPassword)
                ? String(suppliedPassword)
                : stored.password
        const presetLabel =
            REMOTE_STORAGE_PRESETS.find(
                (preset) => preset.vendor === publicConfig.vendor
            )?.label ?? 'WebDAV'
        const label = String(value.label ?? existing?.label ?? presetLabel).trim()
        if (!label || label.length > 80) throw new Error('网盘名称无效')
        return {
            targetId: existing?.id ?? requestedId,
            label,
            publicConfig,
            remoteCredentials: {
                username: username || undefined,
                password: password || undefined
            },
            saved: Boolean(existing)
        }
    }

    private providerFrom(selected: SelectedRemoteTarget) {
        return createRemoteStorageProvider(
            selected.publicConfig,
            selected.remoteCredentials
        )
    }

    private provider(input: Record<string, unknown>) {
        const selected = this.selection(input)
        return { selected, provider: this.providerFrom(selected) }
    }

    private exclusionsKey(selected: SelectedRemoteTarget) {
        return `remote-excluded-v2:${createHash('sha256')
            .update(
                JSON.stringify([
                    selected.targetId,
                    selected.publicConfig,
                    selected.remoteCredentials.username ?? ''
                ])
            )
            .digest('hex')}`
    }

    private exclusions(selected: SelectedRemoteTarget) {
        return (
            this.database.getAppState<string[]>(this.exclusionsKey(selected)) ?? []
        )
    }

    private selectedComics(
        input: Record<string, unknown>,
        selectedTarget: SelectedRemoteTarget
    ) {
        const downloaded = this.query
            .query({ scope: 'downloaded', limit: 5000, offset: 0 })
            .items.map((item) => item.comicId)
        if (input.comicIds !== undefined) {
            const ids = selectedComicIds(input.comicIds)
            if (ids.some((id) => !downloaded.includes(id)))
                throw new Error('所选漫画没有本地下载，已停止上传')
            return ids
        }
        const excluded = new Set(this.exclusions(selectedTarget))
        return downloaded.filter((id) => !excluded.has(id))
    }

    status() {
        const targets = this.registry.targets.map((target) => {
            const stored = this.targetCredentials(target.id)
            return {
                id: target.id,
                label: target.label,
                ...target.config,
                credentialsConfigured: Boolean(stored.username || stored.password)
            }
        })
        const common = {
            configured: targets.length > 0,
            targets,
            presets: REMOTE_STORAGE_PRESETS,
            syncProgress: {
                ...this.syncProgress,
                state: this.syncTaskState,
                canPause:
                    this.syncTaskState === 'running' ||
                    this.syncTaskState === 'pausing',
                canResume: this.syncTaskState === 'paused',
                canCancel: [
                    'running',
                    'pausing',
                    'paused',
                    'cancelling'
                ].includes(this.syncTaskState)
            }
        }
        return targets.length === 1 ? { ...common, ...targets[0] } : common
    }

    async test(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        const { selected, provider } = this.provider(input)
        const result = await provider.test()
        return {
            ...result,
            targetId: selected.targetId || null,
            label: selected.label,
            kind: selected.publicConfig.kind,
            vendor: selected.publicConfig.vendor,
            baseUrl: selected.publicConfig.baseUrl,
            root: selected.publicConfig.root
        }
    }

    syncControl(action: 'pause' | 'resume' | 'cancel') {
        if (action === 'pause') {
            if (this.syncTaskState === 'running') {
                this.syncPauseRequested = true
                this.syncTaskState = 'pausing'
                this.syncProgress = {
                    ...this.syncProgress,
                    phase: 'pausing',
                    message:
                        '已请求暂停；当前正在上传的页面完成后会暂停',
                    updatedAt: new Date().toISOString()
                }
            }
            return this.status().syncProgress
        }
        if (action === 'resume') {
            this.syncPauseRequested = false
            for (const resolve of this.syncResumeWaiters) resolve()
            this.syncResumeWaiters.clear()
            if (
                this.syncTaskState === 'paused' ||
                this.syncTaskState === 'pausing'
            ) {
                this.syncTaskState = 'running'
                this.syncProgress = {
                    ...this.syncProgress,
                    phase: 'uploading',
                    message: '正在继续同步',
                    updatedAt: new Date().toISOString()
                }
            }
            return this.status().syncProgress
        }
        this.syncCancelRequested = true
        this.syncPauseRequested = false
        for (const resolve of this.syncResumeWaiters) resolve()
        this.syncResumeWaiters.clear()
        if (
            this.syncTaskState === 'running' ||
            this.syncTaskState === 'pausing' ||
            this.syncTaskState === 'paused'
        ) {
            this.syncTaskState = 'cancelling'
            this.syncProgress = {
                ...this.syncProgress,
                phase: 'cancelling',
                message:
                    '正在取消；当前正在上传的页面完成后停止',
                updatedAt: new Date().toISOString()
            }
        }
        return this.status().syncProgress
    }

    private async syncCheckpoint() {
        if (this.syncCancelRequested) throw new RemoteSyncCancelledError()
        if (!this.syncPauseRequested) return
        this.syncTaskState = 'paused'
        this.syncProgress = {
            ...this.syncProgress,
            phase: 'paused',
            message: '同步已暂停',
            updatedAt: new Date().toISOString()
        }
        await new Promise<void>((resolve) => this.syncResumeWaiters.add(resolve))
        if (this.syncCancelRequested) throw new RemoteSyncCancelledError()
        this.syncTaskState = 'running'
    }

    private finishSyncControl() {
        this.syncPauseRequested = false
        this.syncCancelRequested = false
        for (const resolve of this.syncResumeWaiters) resolve()
        this.syncResumeWaiters.clear()
    }

    private syncService(
        selected: SelectedRemoteTarget,
        provider = this.providerFrom(selected)
    ) {
        return new RemoteLibrarySyncService(
            this.database,
            this.dataDir,
            provider,
            (progress) => {
                this.syncProgress = {
                    ...(progress as unknown as Record<string, unknown>),
                    targetId: selected.targetId,
                    targetLabel: selected.label
                }
            },
            4,
            { checkpoint: () => this.syncCheckpoint() }
        )
    }

    async plan(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        const selected = this.selection(input)
        await this.providerFrom(selected).test()
        return (await this.syncService(selected).plan(
            this.selectedComics(input, selected)
        )) as unknown as Record<string, unknown>
    }

    save(input: Record<string, unknown>) {
        if (this.mutationInFlight)
            throw new Error('网盘操作期间不能更改存储配置')
        if (!input.remoteStorage || typeof input.remoteStorage !== 'object')
            throw new Error('缺少网盘配置')
        const selected = this.selection(input)
        const targetId = selected.targetId || randomUUID()
        if (!/^[a-zA-Z0-9_-]{1,96}$/.test(targetId))
            throw new Error('网盘配置 ID 无效')
        const target: RemoteStorageTarget = {
            id: targetId,
            label: selected.label,
            config: selected.publicConfig
        }
        const existingIndex = this.registry.targets.findIndex(
            (item) => item.id === targetId
        )
        const targets = [...this.registry.targets]
        if (existingIndex >= 0) targets[existingIndex] = target
        else targets.push(target)
        this.registry = { schemaVersion: 2, targets }
        saveRemoteStorageRegistry(this.configFile, this.registry)

        const remoteStorageCredentials = {
            ...(this.credentials?.remoteStorageCredentials ?? {}),
            [targetId]: {
                username: selected.remoteCredentials.username,
                password: selected.remoteCredentials.password
            }
        }
        const merged: StoredCredentials = {
            account: this.credentials?.account ?? '',
            password: this.credentials?.password ?? '',
            proxyUsername: this.credentials?.proxyUsername,
            proxyPassword: this.credentials?.proxyPassword,
            remoteStorageUsername: this.credentials?.remoteStorageUsername,
            remoteStoragePassword: this.credentials?.remoteStoragePassword,
            remoteStorageCredentials
        }
        this.credentialStore.save(merged)
        this.credentials = merged
        this.scopeIds.set(targetId, randomUUID())
        this.onCredentialsChanged(merged)
        return {
            success: true,
            targetId,
            remoteStorage: this.status()
        }
    }

    removeTarget(input: Record<string, unknown>) {
        if (this.mutationInFlight)
            throw new Error('网盘操作期间不能更改存储配置')
        const target = this.target(input)
        this.registry = {
            schemaVersion: 2,
            targets: this.registry.targets.filter((item) => item.id !== target.id)
        }
        saveRemoteStorageRegistry(this.configFile, this.registry)
        const credentialsMap = {
            ...(this.credentials?.remoteStorageCredentials ?? {})
        }
        delete credentialsMap[target.id]
        const merged: StoredCredentials = {
            account: this.credentials?.account ?? '',
            password: this.credentials?.password ?? '',
            proxyUsername: this.credentials?.proxyUsername,
            proxyPassword: this.credentials?.proxyPassword,
            remoteStorageUsername:
                target.id === 'legacy-default'
                    ? undefined
                    : this.credentials?.remoteStorageUsername,
            remoteStoragePassword:
                target.id === 'legacy-default'
                    ? undefined
                    : this.credentials?.remoteStoragePassword,
            remoteStorageCredentials: credentialsMap
        }
        this.credentialStore.save(merged)
        this.credentials = merged
        this.scopeIds.delete(target.id)
        this.onCredentialsChanged(merged)
        return { success: true, remoteStorage: this.status() }
    }

    async inventory(input: Record<string, unknown>) {
        if (input.remoteStorage)
            throw new Error('请先保存网盘配置，再核验漫画副本状态')
        if (this.mutationInFlight)
            throw new Error('网盘操作进行中，请完成后刷新')
        const selected = this.selection(input)
        const scopeId = this.scopeId(selected.targetId)
        const result = await this.syncService(selected).inventory()
        if (scopeId !== this.scopeId(selected.targetId))
            throw new Error('网盘配置已变化，请重新刷新')
        const key = this.exclusionsKey(selected)
        const pending = new Set(
            this.database.getAppState<string[]>(`${key}:pending`) ?? []
        )
        const excluded = this.exclusions(selected)
        return {
            ...result,
            targetId: selected.targetId,
            targetLabel: selected.label,
            scopeId,
            comics: result.comics.map((item) => ({
                ...item,
                excludedFromFullSync: excluded.includes(item.comicId),
                state: pending.has(item.comicId)
                    ? 'delete-pending'
                    : item.state
            }))
        }
    }

    async deleteCopies(input: Record<string, unknown>) {
        if (this.mutationInFlight) throw new Error('已有网盘操作进行中')
        if (input.confirmation !== 'DELETE_REMOTE_ONLY')
            throw new Error('必须明确确认仅删除网盘副本')
        const selected = this.selection(input)
        if (
            input.remoteScopeId !== this.scopeId(selected.targetId) ||
            typeof input.expectedGeneration !== 'string'
        )
            throw new Error('网盘目标未核验或已经变化，请刷新后重新选择')
        const ids = selectedComicIds(input.comicIds)
        if (ids.some((id) => !this.database.getComic(id)))
            throw new Error('所选漫画不在本地书库中')
        this.mutationInFlight = true
        try {
            const provider = this.providerFrom(selected)
            const key = this.exclusionsKey(selected)
            const pendingKey = `${key}:pending`
            const result = await removeRemoteCopies(
                provider,
                ids,
                () => {
                    this.database.setAppState(key, [
                        ...new Set([...this.exclusions(selected), ...ids])
                    ])
                    this.database.setAppState(pendingKey, [
                        ...new Set([
                            ...(this.database.getAppState<string[]>(pendingKey) ?? []),
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
            return { ...result, targetId: selected.targetId }
        } finally {
            this.mutationInFlight = false
        }
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

    private readingKey(entry: Pick<RemoteReadingEntry, 'comicId' | 'episodeId'>) {
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
        if (input.remoteStorage)
            throw new Error('上传只能选择已保存的网盘配置，请先保存设置')
        const selected = this.selection(input)
        if (
            input.comicIds !== undefined &&
            input.remoteScopeId !== this.scopeId(selected.targetId)
        )
            throw new Error('网盘目标未核验或已经变化，请刷新后重新选择')
        const ids = this.selectedComics(input, selected)
        if (!ids.length) throw new Error('没有选中可上传漫画')
        this.mutationInFlight = true
        this.syncTaskState = 'running'
        this.syncPauseRequested = false
        this.syncCancelRequested = false
        this.syncResumeWaiters.clear()
        try {
            const result = await this.syncSelected(selected, ids)
            if (input.comicIds !== undefined) {
                const completed = ids.filter(
                    (id) => !result.issues.some((issue) => issue.comicId === id)
                )
                const key = this.exclusionsKey(selected)
                this.database.setAppState(
                    key,
                    this.exclusions(selected).filter((id) => !completed.includes(id))
                )
                const pendingKey = `${key}:pending`
                this.database.setAppState(
                    pendingKey,
                    (this.database.getAppState<string[]>(pendingKey) ?? []).filter(
                        (id) => !completed.includes(id)
                    )
                )
            }
            this.syncTaskState = 'complete'
            return { ...result, targetId: selected.targetId }
        } catch (error) {
            this.syncTaskState =
                error instanceof RemoteSyncCancelledError
                    ? 'cancelled'
                    : 'failed'
            throw error
        } finally {
            this.finishSyncControl()
            this.mutationInFlight = false
        }
    }

    private async syncSelected(selected: SelectedRemoteTarget, ids: string[]) {
        const provider = this.providerFrom(selected)
        await provider.test()
        await this.publishPortableState(provider)
        const service = this.syncService(selected, provider)
        return await service.sync(ids)
    }
}
