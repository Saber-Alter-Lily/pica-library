import { createHash, randomUUID } from 'node:crypto'
import type { LibraryDatabase } from '../library/database'
import {
    providerComicToRecord,
    type AccountComicProvider,
    type ProviderAccountIdentity,
    type ProviderComic
} from './types'

/** Complete read-only scan -> short-lived preview -> explicit additive commit. */
export class ProviderFavoritesImport {
    private preview?: {
        token: string
        accountId: string
        providerId: string
        expires: number
        records: ProviderComic[]
        folderId: number
    }
    private generation = 0

    clear() {
        this.preview = undefined
        this.generation++
    }

    async scan(
        provider: AccountComicProvider,
        folderId = 0,
        checkpoint?: () => Promise<void>
    ) {
        this.clear()
        const generation = this.generation
        const identity = await provider.accountStatus()
        if (!identity.configured || !identity.accountId)
            throw new Error('来源账号未登录')
        const records = new Map<string, ProviderComic>()
        let total = -1,
            pages = -1
        for (let page = 1; ; page++) {
            await checkpoint?.()
            if (generation !== this.generation)
                throw new Error('收藏扫描已取消')
            const result = await provider.favoritesPage(page, folderId)
            if (
                result.accountId !== identity.accountId ||
                result.page !== page ||
                result.folderId !== folderId
            )
                throw new Error('收藏扫描期间账号或分页发生变化，请重新扫描')
            if (page === 1) {
                total = result.total
                pages = result.pages
            }
            if (
                !Number.isInteger(total) ||
                !Number.isInteger(pages) ||
                total < 0 ||
                total > 10_000 ||
                pages < 0 ||
                pages > 500 ||
                result.total !== total ||
                result.pages !== pages
            )
                throw new Error(
                    '收藏数量变化或超过本轮扫描范围，请重新扫描或选择较小收藏夹'
                )
            if (
                !Array.isArray(result.items) ||
                (total > 0 && result.items.length === 0)
            )
                throw new Error('收藏分页不完整，尚未导入任何数据')
            for (const comic of result.items) {
                if (
                    comic.providerId !== provider.id ||
                    !comic.comicId.startsWith(provider.id + ':')
                )
                    throw new Error('收藏来源标识不一致')
                records.set(comic.comicId, comic)
            }
            if (page >= Math.max(1, pages)) break
        }
        if (records.size !== total)
            throw new Error('收藏分页存在缺漏或重复，尚未导入任何数据')
        const after = await provider.accountStatus()
        if (generation !== this.generation) throw new Error('收藏扫描已取消')
        if (!after.configured || after.accountId !== identity.accountId)
            throw new Error('来源账号已变化，请重新扫描')
        const token = randomUUID()
        this.preview = {
            token,
            accountId: identity.accountId,
            providerId: provider.id,
            expires: Date.now() + 15 * 60_000,
            records: [...records.values()],
            folderId
        }
        return {
            token,
            providerId: provider.id,
            count: records.size,
            pagesRead: Math.max(1, pages),
            folderId,
            sample: [...records.values()]
                .slice(0, 5)
                .map((comic) => ({
                    comicId: comic.comicId,
                    title: comic.title
                })),
            expiresInSeconds: 900,
            behavior: 'ADDITIVE_COLLECTION_IMPORT',
            explicitLikesCreated: 0
        }
    }

    confirm(
        token: string,
        account: ProviderAccountIdentity,
        database: LibraryDatabase
    ) {
        const preview = this.preview
        if (
            !preview ||
            preview.token !== token ||
            Date.now() > preview.expires ||
            !account.configured ||
            account.accountId !== preview.accountId
        )
            throw new Error('收藏预览已失效，请重新扫描')
        if (preview.providerId !== 'jm')
            throw new Error('此候选版本仅支持 JM 收藏导入')
        const accountScope = createHash('sha256')
            .update(preview.accountId)
            .digest('hex')
            .slice(0, 16)
        const records = preview.records.map((comic) => {
            const record = providerComicToRecord(comic),
                existing = database.getComic(comic.comicId)
            if (
                !existing ||
                existing.providerMetadata?.metadataCompleteness !== 'DETAIL' ||
                comic.providerMetadata.metadataCompleteness !== 'SUMMARY'
            )
                return record
            return {
                ...existing,
                ...record,
                author: record.author || existing.author,
                description: record.description || existing.description,
                tags: record.tags.length ? record.tags : existing.tags,
                categories: record.categories.length
                    ? record.categories
                    : existing.categories,
                pagesCount: existing.pagesCount,
                epsCount: existing.epsCount,
                coverUrl: record.coverUrl || existing.coverUrl,
                providerMetadata: {
                    ...existing.providerMetadata,
                    ...record.providerMetadata,
                    metadataCompleteness: 'DETAIL'
                }
            }
        })
        const result = database.importFavorites(
            records,
            `jm:favorites:${accountScope}:folder:${preview.folderId}`,
            false,
            true,
            'jm-favorite'
        )
        this.clear()
        return {
            ...result,
            importedFavorites: preview.records.length,
            explicitLikesCreated: 0,
            remoteMutations: 0
        }
    }
}
