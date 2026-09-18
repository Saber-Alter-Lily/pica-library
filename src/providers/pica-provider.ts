import type { Pica } from '../sdk'
import type { Comic } from '../types'
import { trustedCoverUrl } from '../library/cover-url'
import type {
    CanonicalTag,
    ComicProvider,
    ProviderComic,
    SearchRequest
} from './types'

function picaTag(raw: string): CanonicalTag {
    return {
        raw,
        namespace: null,
        value: raw,
        facet: 'OTHER'
    }
}

export function picaComic(comic: Comic): ProviderComic {
    return {
        providerId: 'pica',
        providerRemoteId: comic._id,
        comicId: comic._id,
        title: comic.title.trim(),
        alternateTitles: [],
        author: comic.author ?? '',
        authors: comic.author ? [comic.author] : [],
        circle: null,
        description: comic.description ?? '',
        chineseTeam: comic.chineseTeam ?? '',
        categories: comic.categories ?? [],
        tags: comic.tags ?? [],
        canonicalTags: (comic.tags ?? []).map(picaTag),
        completionStatus: comic.finished ? 'FINISHED' : 'ONGOING',
        createdAt: comic.created_at || undefined,
        updatedAt: comic.updated_at || undefined,
        totalLikes: comic.totalLikes ?? comic.likesCount ?? 0,
        totalViews: comic.totalViews ?? comic.viewsCount ?? 0,
        pagesCount: comic.pagesCount ?? 0,
        epsCount: comic.epsCount ?? 0,
        coverUrl: trustedCoverUrl(
            comic.thumb?.fileServer && comic.thumb.path
                ? `${comic.thumb.fileServer}/static/${comic.thumb.path}`
                : undefined
        ),
        providerMetadata: {
            allowDownload: comic.allowDownload,
            allowComment: comic.allowComment,
            totalComments: comic.totalComments ?? comic.commentsCount,
            isFavourite: comic.isFavourite,
            isLiked: comic.isLiked
        }
    }
}

export class PicaProvider implements ComicProvider {
    readonly id = 'pica' as const
    readonly capabilities = {
        publicBrowse: false,
        search: true,
        metadata: true,
        chapters: true,
        pages: true,
        imageFetch: true,
        remoteFavoritesRead: true,
        remoteFavoritesWrite: true,
        account: true,
        exHentai: false
    } as const

    constructor(private readonly connect: () => Promise<Pica>) {}

    async search(input: SearchRequest) {
        const pica = await this.connect()
        const keyword = input.keyword?.trim() ?? ''
        const page =
            Number.isInteger(input.page) && Number(input.page) > 0
                ? Number(input.page)
                : null
        const comics = page
            ? keyword
                ? (
                      await pica.search(
                          keyword,
                          page,
                          pica.Order.loved,
                          input.categories ?? []
                      )
                  ).docs
                : (
                      await pica.comicsPage(
                          input.categories?.[0] ?? '',
                          input.tags?.[0] ?? '',
                          pica.Order.loved,
                          page
                      )
                  ).docs
            : keyword
              ? await pica.searchAll(
                    keyword,
                    pica.Order.loved,
                    input.categories ?? []
                )
              : await pica.comicsAll(
                    input.categories?.[0] ?? '',
                    input.tags?.[0] ?? '',
                    pica.Order.loved
                )
        return comics.slice(0, input.limit ?? 100).map(picaComic)
    }

    async details(comicId: string) {
        return picaComic(await (await this.connect()).comicInfo(comicId))
    }

    async episodes(comicId: string) {
        return (await this.connect()).episodesAll(comicId)
    }

    async pages(comicId: string, episode: import('../types').Episode) {
        return (await this.connect()).picturesAll(comicId, episode)
    }

    async fetchPage(locator: string, maxBytes = 20 * 1024 * 1024) {
        return (await this.connect()).fetchImage(locator, maxBytes)
    }
}
