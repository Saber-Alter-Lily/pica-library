import { generationId, remoteLayout } from './layout'
import type {
    RemoteLibraryCatalog,
    RemoteLibraryPointer,
    RemoteStorageProvider
} from './types'

export function selectedComicIds(value: unknown): string[] {
    if (
        !Array.isArray(value) ||
        !value.length ||
        value.length > 5000 ||
        value.some(
            (id) => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)
        )
    )
        throw new Error('请明确选择漫画，空选择不会执行整库操作')
    return [...new Set(value)]
}

/** Publish the removal first. Never touch local files; never delete a user root. */
export async function removeRemoteCopies(
    provider: RemoteStorageProvider,
    comicIds: string[],
    onUnpublished: () => void,
    expectedGeneration?: string
) {
    const ids = selectedComicIds(comicIds)
    if (!provider.deleteComic) throw new Error('此网盘不支持安全删除漫画副本')
    if (!provider.withExclusiveLibraryWrite)
        throw new Error('此网盘不能锁定云端目录，已停止删除；本地文件未修改')
    return provider.withExclusiveLibraryWrite(() =>
        removeLocked(provider, ids, onUnpublished, expectedGeneration)
    )
}

async function removeLocked(
    provider: RemoteStorageProvider,
    ids: string[],
    onUnpublished: () => void,
    expectedGeneration?: string
) {
    const version = await provider.getJsonVersioned<RemoteLibraryPointer>(
        remoteLayout.current
    )
    if (!version.value) throw new Error('网盘当前目录不存在，已停止删除')
    if (
        expectedGeneration !== undefined &&
        version.value.generation !== expectedGeneration
    )
        throw new Error(
            '网盘目录已变化，请刷新状态后重新选择；本次没有删除文件'
        )
    const previous = await provider.getJson<RemoteLibraryCatalog>(
        version.value.catalogPath
    )
    if (
        !previous ||
        previous.schemaVersion !== 1 ||
        !Array.isArray(previous.comics)
    )
        throw new Error('网盘目录不可验证，已停止删除')
    const generation = generationId()
    const catalogPath = remoteLayout.generationCatalog(generation)
    await provider.putJson(catalogPath, {
        ...previous,
        generation,
        generatedAt: new Date().toISOString(),
        comics: previous.comics.filter((entry) => !ids.includes(entry.comicId))
    })
    const pointer: RemoteLibraryPointer = {
        schemaVersion: 1,
        generation,
        catalogPath,
        updatedAt: new Date().toISOString()
    }
    if (
        !(await provider.putJsonConditional(
            remoteLayout.current,
            pointer,
            version
        ))
    )
        throw new Error(
            '网盘目录已被其他设备更新，本次没有删除任何文件，请刷新后重试'
        )
    onUnpublished()
    const deletedComicIds: string[] = []
    const pendingComicIds: string[] = []
    for (const id of ids) {
        try {
            await provider.deleteComic!(id)
            deletedComicIds.push(id)
        } catch {
            pendingComicIds.push(id)
        }
    }
    return {
        success: pendingComicIds.length === 0,
        deletedComicIds,
        pendingComicIds,
        localFilesDeleted: false
    }
}
