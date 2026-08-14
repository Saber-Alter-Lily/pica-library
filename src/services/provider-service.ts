import type { Pica } from '../sdk'
import type { Comic, Episode, Picture } from '../types'
import { trustedCoverUrl } from '../library/cover-url'
import type { FavoriteRecord } from '../library/types'
import type { LibraryDatabase } from '../library/database'

export interface ProviderCapabilities {
    favoriteMutation: boolean
}

export function providerComicRecord(comic: Comic): FavoriteRecord {
    return {
        comicId: comic._id,
        title: comic.title.trim(),
        author: comic.author ?? '',
        description: comic.description ?? '',
        chineseTeam: comic.chineseTeam ?? '',
        categories: comic.categories ?? [],
        tags: comic.tags ?? [],
        finished: Boolean(comic.finished),
        createdAt: comic.created_at,
        updatedAt: comic.updated_at,
        totalLikes: comic.totalLikes ?? comic.likesCount ?? 0,
        totalViews: comic.totalViews ?? comic.viewsCount ?? 0,
        pagesCount: comic.pagesCount ?? 0,
        epsCount: comic.epsCount ?? 0,
        coverUrl: trustedCoverUrl(
            comic.thumb?.fileServer && comic.thumb.path
                ? `${comic.thumb.fileServer}/static/${comic.thumb.path}`
                : undefined
        )
    }
}

export class ProviderService {
    readonly capabilities: ProviderCapabilities = { favoriteMutation: true }

    constructor(
        private readonly connectProvider: () => Promise<Pica>,
        private readonly database: LibraryDatabase
    ) {}

    private connect() {
        return this.connectProvider()
    }

    async syncFavorites() {
        const provider = await this.connect()
        const { comics } = await provider.favoritesAll('all')
        return this.database.importFavorites(
            comics.map(providerComicRecord),
            'pica:favorites',
            true
        )
    }

    async search(keyword: string) {
        const provider = await this.connect()
        const comics = await provider.searchAll(keyword, provider.Order.loved)
        const records = comics.map(providerComicRecord)
        this.database.importCatalog(records, 'pica:discover')
        return records
    }

    async getComicDetails(comicId: string) {
        const provider = await this.connect()
        const comic = await provider.comicInfo(comicId)
        this.database.importCatalog(
            [providerComicRecord(comic)],
            'pica:details'
        )
        return comic
    }

    async getEpisodes(comicId: string): Promise<Episode[]> {
        return (await this.connect()).episodesAll(comicId)
    }

    async getEpisodePages(
        comicId: string,
        episode: Episode
    ): Promise<Picture[]> {
        return (await this.connect()).picturesAll(comicId, episode)
    }

    async fetchPage(url: string, maxBytes = 20 * 1024 * 1024) {
        return (await this.connect()).fetchImage(url, maxBytes)
    }

    async setFavorite(comicId: string, desired: boolean) {
        const provider = await this.connect()
        const before = await provider.comicInfo(comicId)
        if (Boolean(before.isFavourite) === desired)
            return { changed: false, isFavorite: desired, already: true }
        await provider.fav(comicId)
        const after = await provider.comicInfo(comicId)
        if (Boolean(after.isFavourite) !== desired)
            throw new Error('Pica 收藏状态未能得到远端确认')
        this.database.setFavoriteState(comicId, desired)
        return { changed: true, isFavorite: desired, already: false }
    }

    addFavorite(comicId: string) {
        return this.setFavorite(comicId, true)
    }

    removeFavorite(comicId: string) {
        return this.setFavorite(comicId, false)
    }
}
