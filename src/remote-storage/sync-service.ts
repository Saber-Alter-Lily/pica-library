import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { LibraryDatabase } from '../library/database'
import { LibraryQueryService } from '../services/library-query-service'
import { generationId, remoteLayout } from './layout'
import type {
    RemoteCatalogEntry,
    RemoteComicManifest,
    RemoteEpisodeManifest,
    RemoteLibraryCatalog,
    RemoteLibraryPointer,
    RemotePageManifestEntry,
    RemoteStorageProvider
} from './types'

const imageTypes: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.gif': 'image/gif'
}

interface LocalPage { file: string; manifest: RemotePageManifestEntry }
interface LocalEpisode { manifest: RemoteEpisodeManifest; pages: LocalPage[] }
interface LocalComic {
    entry: RemoteCatalogEntry
    manifest: RemoteComicManifest
    cover?: { file: string; path: string; sha256: string; bytes: number; contentType: string }
    episodes: LocalEpisode[]
}
interface LocalIssue { comicId: string; title: string; reason: string }
interface LocalScan { comics: LocalComic[]; issues: LocalIssue[]; localIds: Set<string>; total: number }

export type RemoteSyncPhase =
    | 'idle'
    | 'scanning'
    | 'uploading'
    | 'publishing'
    | 'complete'
    | 'failed'

export interface RemoteSyncProgress {
    phase: RemoteSyncPhase
    updatedAt: string
    totalComics: number
    completedComics: number
    currentComicIndex: number
    currentComicTitle: string
    currentComicPages: number
    currentComicCompletedPages: number
    totalPages: number
    completedPages: number
    uploadedObjects: number
    uploadedBytes: number
    message?: string
}

export interface RemoteSyncPlan {
    schemaVersion: 1
    mode: 'additive'
    generatedAt: string
    localComicCount: number
    remoteComicCount: number
    uploadComicCount: number
    unchangedComicCount: number
    skippedComicCount: number
    retainedRemoteOnlyCount: number
    uploadPages: number
    uploadBytes: number
    issues: LocalIssue[]
    comics: Array<{
        comicId: string
        title: string
        action: 'upload' | 'update' | 'unchanged' | 'skip'
        pages: number
        bytes: number
        reason?: string
    }>
}

function hashFile(file: string) {
    const data = fs.readFileSync(file)
    return { sha256: createHash('sha256').update(data).digest('hex'), bytes: data.byteLength }
}

async function eachConcurrent<T>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<void>
) {
    if (!items.length) return
    let next = 0
    const width = Math.max(1, Math.min(concurrency, items.length))
    await Promise.all(
        Array.from({ length: width }, async () => {
            while (true) {
                const index = next++
                if (index >= items.length) return
                await worker(items[index], index)
            }
        })
    )
}

export class RemoteLibrarySyncService {
    private readonly query: LibraryQueryService
    private readonly root: string

    constructor(
        private readonly database: LibraryDatabase,
        dataDir: string,
        private readonly provider: RemoteStorageProvider,
        private readonly onProgress?: (progress: RemoteSyncProgress) => void,
        private readonly pageConcurrency = 4
    ) {
        this.query = new LibraryQueryService(database)
        this.root = fs.realpathSync(path.resolve(dataDir))
    }

    private safeFile(file: string) {
        const resolved = path.resolve(file)
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile())
            throw new Error(`本地文件缺失：${path.basename(file)}`)
        const real = fs.realpathSync(resolved)
        const relative = path.relative(this.root, real)
        if (relative.startsWith('..') || path.isAbsolute(relative))
            throw new Error('本地图片不在当前 Library 目录内')
        return real
    }

    private localComic(comicId: string): LocalComic | null {
        const comic = this.database.getComic(comicId)
        if (!comic || comic.downloadedPictures <= 0) return null
        const episodes: LocalEpisode[] = []
        for (const episode of this.database.listReaderEpisodes(comicId)) {
            const pictures = this.database.listDownloadedPictures(episode.id)
            if (!pictures.length) continue
            const pages: LocalPage[] = pictures.map((picture, index) => {
                const file = this.safeFile(picture.localPath)
                const extension = path.extname(file).toLowerCase()
                const contentType = imageTypes[extension]
                if (!contentType) throw new Error('发现不支持的本地图片类型')
                const digest = hashFile(file)
                return {
                    file,
                    manifest: {
                        index,
                        objectPath: remoteLayout.page(comicId, episode.id, index, extension),
                        sha256: digest.sha256,
                        bytes: digest.bytes,
                        contentType
                    }
                }
            })
            episodes.push({
                pages,
                manifest: {
                    schemaVersion: 1,
                    comicId,
                    episodeId: episode.id,
                    title: episode.title,
                    order: episode.order,
                    pageCount: pages.length,
                    pages: pages.map((page) => page.manifest)
                }
            })
        }
        if (!episodes.length) return null
        let cover: LocalComic['cover']
        const coverFile = this.database.downloadedCoverPath(comicId)
        if (coverFile) {
            const file = this.safeFile(coverFile)
            const extension = path.extname(file).toLowerCase()
            const contentType = imageTypes[extension]
            if (contentType) {
                const digest = hashFile(file)
                cover = {
                    file,
                    path: remoteLayout.comicCover(comicId, extension),
                    sha256: digest.sha256,
                    bytes: digest.bytes,
                    contentType
                }
            }
        }
        const pageCount = episodes.reduce((sum, episode) => sum + episode.pages.length, 0)
        const manifest: RemoteComicManifest = {
            schemaVersion: 1,
            comicId,
            title: comic.title,
            author: comic.canonicalAuthor ?? comic.author,
            coverPath: cover?.path,
            coverSha256: cover?.sha256,
            coverBytes: cover?.bytes,
            generatedAt: new Date().toISOString(),
            episodes: episodes.map((episode) => ({
                episodeId: episode.manifest.episodeId,
                title: episode.manifest.title,
                order: episode.manifest.order,
                pageCount: episode.manifest.pageCount,
                manifestPath: remoteLayout.episodeManifest(comicId, episode.manifest.episodeId)
            }))
        }
        return {
            manifest,
            cover,
            episodes,
            entry: {
                comicId,
                title: comic.title,
                author: comic.author,
                canonicalAuthor: comic.canonicalAuthor,
                authorId: comic.authorId,
                tags: comic.tags,
                categories: comic.categories,
                finished: comic.finished,
                isFavorite: comic.isFavorite,
                knownPictures: comic.knownPictures,
                manifestPath: remoteLayout.comicManifest(comicId),
                coverPath: cover?.path,
                episodeCount: episodes.length,
                pageCount,
                updatedAt: comic.updatedAt
            }
        }
    }

    private localLibrary(): LocalScan {
        const summaries = this.query.query({ scope: 'downloaded', limit: 5000, offset: 0 }).items
        const comics: LocalComic[] = []
        const issues: LocalIssue[] = []
        const localIds = new Set<string>()
        for (const summary of summaries) {
            localIds.add(summary.comicId)
            try {
                const value = this.localComic(summary.comicId)
                if (value) comics.push(value)
                else issues.push({ comicId: summary.comicId, title: summary.title, reason: '没有可同步的本地章节文件' })
            } catch (error) {
                issues.push({
                    comicId: summary.comicId,
                    title: summary.title,
                    reason: error instanceof Error ? error.message : String(error)
                })
            }
        }
        return { comics, issues, localIds, total: summaries.length }
    }

    private async remoteCatalog() {
        const pointer = await this.provider.getJson<RemoteLibraryPointer>(remoteLayout.current)
        if (!pointer?.catalogPath) return null
        return await this.provider.getJson<RemoteLibraryCatalog>(pointer.catalogPath)
    }

    private async remoteComic(entry: RemoteCatalogEntry) {
        const manifest = await this.provider.getJson<RemoteComicManifest>(entry.manifestPath)
        if (!manifest) return null
        const episodes = new Map<string, RemoteEpisodeManifest>()
        for (const episode of manifest.episodes) {
            const value = await this.provider.getJson<RemoteEpisodeManifest>(episode.manifestPath)
            if (value) episodes.set(value.episodeId, value)
        }
        return { manifest, episodes }
    }

    private sameComic(local: LocalComic, remote: Awaited<ReturnType<RemoteLibrarySyncService['remoteComic']>>) {
        if (!remote) return false
        if ((local.manifest.coverSha256 ?? '') !== (remote.manifest.coverSha256 ?? '')) return false
        if (local.manifest.episodes.length !== remote.manifest.episodes.length) return false
        for (const episode of local.episodes) {
            const other = remote.episodes.get(episode.manifest.episodeId)
            if (!other || other.pages.length !== episode.manifest.pages.length) return false
            for (let index = 0; index < episode.manifest.pages.length; index++) {
                if (other.pages[index]?.sha256 !== episode.manifest.pages[index].sha256 || other.pages[index]?.objectPath !== episode.manifest.pages[index].objectPath)
                    return false
            }
        }
        return true
    }

    private async publishCatalog(entries: Map<string, RemoteCatalogEntry>) {
        const generation = generationId()
        const catalog: RemoteLibraryCatalog = {
            schemaVersion: 1,
            generation,
            generatedAt: new Date().toISOString(),
            comics: [...entries.values()].sort((a, b) => a.title.localeCompare(b.title))
        }
        const catalogPath = remoteLayout.generationCatalog(generation)
        await this.provider.putJson(catalogPath, catalog)
        const pointer: RemoteLibraryPointer = {
            schemaVersion: 1,
            generation,
            catalogPath,
            updatedAt: new Date().toISOString()
        }
        await this.provider.putJson(remoteLayout.current, pointer)
        return { generation, catalogPath, catalog }
    }

    async plan(): Promise<RemoteSyncPlan> {
        const scan = this.localLibrary()
        const local = scan.comics
        const remoteCatalog = await this.remoteCatalog()
        const remoteById = new Map((remoteCatalog?.comics ?? []).map((comic) => [comic.comicId, comic]))
        const comics: RemoteSyncPlan['comics'] = []
        let uploadPages = 0, uploadBytes = 0, unchangedComicCount = 0
        for (const comic of local) {
            const existing = remoteById.get(comic.entry.comicId)
            const same = existing ? this.sameComic(comic, await this.remoteComic(existing)) : false
            const bytes = comic.episodes.reduce((sum, episode) => sum + episode.pages.reduce((value, page) => value + page.manifest.bytes, 0), 0) + (comic.cover?.bytes ?? 0)
            if (same) unchangedComicCount += 1
            else { uploadPages += comic.entry.pageCount; uploadBytes += bytes }
            comics.push({
                comicId: comic.entry.comicId,
                title: comic.entry.title,
                action: same ? 'unchanged' : existing ? 'update' : 'upload',
                pages: comic.entry.pageCount,
                bytes
            })
        }
        for (const issue of scan.issues) comics.push({
            comicId: issue.comicId,
            title: issue.title,
            action: 'skip',
            pages: 0,
            bytes: 0,
            reason: issue.reason
        })
        return {
            schemaVersion: 1,
            mode: 'additive',
            generatedAt: new Date().toISOString(),
            localComicCount: scan.total,
            remoteComicCount: remoteCatalog?.comics.length ?? 0,
            uploadComicCount: comics.filter((comic) => comic.action === 'upload' || comic.action === 'update').length,
            unchangedComicCount,
            skippedComicCount: scan.issues.length,
            retainedRemoteOnlyCount: (remoteCatalog?.comics ?? []).filter((comic) => !scan.localIds.has(comic.comicId)).length,
            uploadPages,
            uploadBytes,
            issues: scan.issues,
            comics
        }
    }

    async sync() {
        let progress: RemoteSyncProgress = {
            phase: 'scanning',
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
            uploadedBytes: 0,
            message: '正在扫描本地漫画'
        }
        const emit = (patch: Partial<RemoteSyncProgress>) => {
            progress = { ...progress, ...patch, updatedAt: new Date().toISOString() }
            this.onProgress?.({ ...progress })
        }
        emit({})

        try {
            const scan = this.localLibrary()
            const local = scan.comics
            const totalPages = local.reduce((sum, comic) => sum + comic.entry.pageCount, 0)
            emit({
                phase: 'uploading',
                totalComics: local.length,
                totalPages,
                message: local.length ? '准备上传' : '没有可上传漫画'
            })
            const previous = await this.remoteCatalog()
            if (!local.length && !previous)
                throw new Error(`没有完整可同步的漫画；${scan.issues.length} 部存在本地文件问题，请先修复或重新下载`)
            const previousById = new Map((previous?.comics ?? []).map((comic) => [comic.comicId, comic]))
            const entries = new Map(previousById)
            let uploadedObjects = 0, uploadedBytes = 0
            let completedPages = 0
            let completedComics = 0
            let lastPublication: Awaited<ReturnType<RemoteLibrarySyncService['publishCatalog']>> | null = null

            for (let comicIndex = 0; comicIndex < local.length; comicIndex++) {
                const comic = local[comicIndex]
                let currentComicCompletedPages = 0
                emit({
                    phase: 'uploading',
                    currentComicIndex: comicIndex + 1,
                    currentComicTitle: comic.entry.title,
                    currentComicPages: comic.entry.pageCount,
                    currentComicCompletedPages: 0,
                    completedComics,
                    completedPages,
                    uploadedObjects,
                    uploadedBytes,
                    message: `正在上传第 ${comicIndex + 1}/${local.length} 本`
                })

                const previousEntry = previousById.get(comic.entry.comicId)
                const previousComic = previousEntry ? await this.remoteComic(previousEntry) : null
                const same = this.sameComic(comic, previousComic)

                if (!same) {
                    for (const episode of comic.episodes) {
                        const prior = previousComic?.episodes.get(episode.manifest.episodeId)
                        await eachConcurrent(
                            episode.pages,
                            this.pageConcurrency,
                            async (page) => {
                                const priorPage = prior?.pages[page.manifest.index]
                                const alreadyPresent = Boolean(
                                    priorPage?.sha256 === page.manifest.sha256 &&
                                    priorPage.objectPath === page.manifest.objectPath &&
                                    (await this.provider.exists(page.manifest.objectPath))
                                )
                                if (!alreadyPresent) {
                                    const data = fs.readFileSync(page.file)
                                    await this.provider.put(page.manifest.objectPath, data, page.manifest.contentType)
                                    uploadedObjects += 1
                                    uploadedBytes += data.byteLength
                                }
                                currentComicCompletedPages += 1
                                completedPages += 1
                                emit({
                                    currentComicCompletedPages,
                                    completedPages,
                                    uploadedObjects,
                                    uploadedBytes,
                                    message: `正在上传 ${comic.entry.title}`
                                })
                            }
                        )
                        await this.provider.putJson(
                            remoteLayout.episodeManifest(comic.entry.comicId, episode.manifest.episodeId),
                            episode.manifest
                        )
                        uploadedObjects += 1
                        emit({ uploadedObjects })
                    }
                    if (
                        comic.cover &&
                        (comic.cover.sha256 !== previousComic?.manifest.coverSha256 ||
                            !(await this.provider.exists(comic.cover.path)))
                    ) {
                        const data = fs.readFileSync(comic.cover.file)
                        await this.provider.put(comic.cover.path, data, comic.cover.contentType)
                        uploadedObjects += 1
                        uploadedBytes += data.byteLength
                        emit({ uploadedObjects, uploadedBytes })
                    }
                    await this.provider.putJson(remoteLayout.comicManifest(comic.entry.comicId), comic.manifest)
                    uploadedObjects += 1
                    emit({ uploadedObjects })
                } else {
                    currentComicCompletedPages = comic.entry.pageCount
                    completedPages += comic.entry.pageCount
                    emit({
                        currentComicCompletedPages,
                        completedPages,
                        message: `${comic.entry.title} 已是最新`
                    })
                }

                entries.set(comic.entry.comicId, comic.entry)
                completedComics += 1
                emit({
                    completedComics,
                    currentComicCompletedPages: comic.entry.pageCount,
                    completedPages,
                    uploadedObjects,
                    uploadedBytes
                })

                if (!previous && !same) {
                    emit({
                        phase: 'publishing',
                        message: `正在发布已完成的 ${completedComics}/${local.length} 本漫画`
                    })
                    lastPublication = await this.publishCatalog(entries)
                    emit({
                        phase: 'uploading',
                        message: completedComics < local.length ? '继续上传下一本' : '准备完成同步'
                    })
                }
            }

            emit({ phase: 'publishing', message: '正在发布最终云端目录' })
            lastPublication = await this.publishCatalog(entries)
            emit({
                phase: 'complete',
                completedComics: local.length,
                completedPages: totalPages,
                uploadedObjects,
                uploadedBytes,
                message: '同步完成'
            })

            return {
                success: true,
                generation: lastPublication.generation,
                catalogPath: lastPublication.catalogPath,
                comicCount: lastPublication.catalog.comics.length,
                uploadedObjects,
                uploadedBytes,
                skippedComicCount: scan.issues.length,
                issues: scan.issues,
                retainedRemoteOnlyCount: lastPublication.catalog.comics.filter((comic) => !scan.localIds.has(comic.comicId)).length
            }
        } catch (error) {
            emit({
                phase: 'failed',
                message: error instanceof Error ? error.message : String(error)
            })
            throw error
        }
    }
}
