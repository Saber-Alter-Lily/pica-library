import { setTimeout as delay } from 'node:timers/promises'
import type { Episode, Picture } from '../types'
import { safeRasterContentType, trustedCoverUrl } from '../library/cover-url'
import type {
    CanonicalTag,
    ComicProvider,
    ProviderComic,
    SearchRequest
} from './types'

const API_URL = 'https://api.e-hentai.org/api.php'
const GALLERY_ORIGIN = 'https://e-hentai.org'
const USER_AGENT = 'Pica-Library/0.3 (+https://github.com/Saber-Alter-Lily/pica-library)'
const SEARCH_MIN_INTERVAL_MS = 3100
const REQUEST_TIMEOUT_MS = 15000
const MAX_GDATA_BATCH = 25
const MAX_GALLERY_INDEX_PAGES = 100

interface EhTorrent {
    hash?: string
    added?: string
    name?: string
    tsize?: string
    fsize?: string
}

interface EhMetadata {
    gid: number
    token?: string
    error?: string
    title?: string
    title_jpn?: string
    category?: string
    thumb?: string
    uploader?: string
    posted?: string
    filecount?: string
    filesize?: number
    expunged?: boolean
    rating?: string
    torrentcount?: string
    torrents?: EhTorrent[]
    tags?: string[]
    parent_gid?: string
    parent_key?: string
    current_gid?: string
    current_key?: string
    first_gid?: string
    first_key?: string
}

interface GalleryRef {
    gid: number
    token: string
}

function htmlDecode(value: string) {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
}

function providerId(gid: number, token: string) {
    return `eh:${gid}:${token}`
}

export function parseEhComicId(comicId: string): GalleryRef {
    const match = /^eh:(\d+):([0-9a-f]{10})$/i.exec(comicId)
    if (!match) throw new Error('Invalid E-H gallery identifier')
    return { gid: Number(match[1]), token: match[2].toLowerCase() }
}

function tagFacet(namespace: string | null): CanonicalTag['facet'] {
    if (namespace === 'artist' || namespace === 'cosplayer') return 'CREATOR'
    if (namespace === 'group') return 'CIRCLE'
    if (namespace === 'parody') return 'FANDOM_IP'
    if (namespace === 'character') return 'CHARACTER'
    if (namespace === 'language') return 'LANGUAGE'
    if (namespace === 'location') return 'LOCATION'
    if (
        namespace === 'female' ||
        namespace === 'male' ||
        namespace === 'mixed' ||
        namespace === 'other' ||
        namespace === 'reclass'
    )
        return 'CONTENT_TRAIT'
    return 'OTHER'
}

export function parseEhTag(raw: string): CanonicalTag {
    const index = raw.indexOf(':')
    const namespace = index > 0 ? raw.slice(0, index).toLowerCase() : null
    const value = (index > 0 ? raw.slice(index + 1) : raw).trim()
    return { raw, namespace, value, facet: tagFacet(namespace) }
}

function unique(values: string[]) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function ehMetadataToComic(value: EhMetadata): ProviderComic {
    if (value.error) throw new Error(`E-H metadata error: ${value.error}`)
    const token = String(value.token ?? '').toLowerCase()
    if (!Number.isSafeInteger(value.gid) || !/^[0-9a-f]{10}$/.test(token))
        throw new Error('E-H returned an invalid gallery identity')
    const canonicalTags = (value.tags ?? []).map(parseEhTag)
    const authors = unique(
        canonicalTags
            .filter((tag) => tag.facet === 'CREATOR' && tag.namespace === 'artist')
            .map((tag) => tag.value)
    )
    const groups = unique(
        canonicalTags
            .filter((tag) => tag.facet === 'CIRCLE')
            .map((tag) => tag.value)
    )
    const posted = Number(value.posted)
    const pageCount = Number(value.filecount)
    const rating = Number(value.rating)
    const title = String(value.title ?? '').trim() || `E-H Gallery ${value.gid}`
    return {
        providerId: 'eh',
        providerRemoteId: `${value.gid}:${token}`,
        comicId: providerId(value.gid, token),
        title,
        alternateTitles: unique([String(value.title_jpn ?? '')]),
        author: authors[0] ?? groups[0] ?? String(value.uploader ?? ''),
        authors,
        circle: groups[0] ?? null,
        description: '',
        chineseTeam: '',
        categories: unique([String(value.category ?? '')]),
        tags: unique(canonicalTags.map((tag) => tag.value)),
        canonicalTags,
        completionStatus: 'UNKNOWN',
        createdAt:
            Number.isFinite(posted) && posted > 0
                ? new Date(posted * 1000).toISOString()
                : undefined,
        totalLikes: undefined,
        totalViews: undefined,
        pagesCount: Number.isFinite(pageCount) ? Math.max(0, pageCount) : 0,
        epsCount: 1,
        coverUrl: trustedCoverUrl(value.thumb),
        rating: Number.isFinite(rating) ? rating : undefined,
        uploader: value.uploader,
        providerMetadata: {
            gid: value.gid,
            token,
            uploader: value.uploader ?? '',
            filesize: Number(value.filesize ?? 0),
            expunged: Boolean(value.expunged),
            torrentcount: Number(value.torrentcount ?? 0),
            torrents: value.torrents ?? [],
            rawTags: value.tags ?? [],
            lineage: {
                parent: value.parent_gid
                    ? { gid: value.parent_gid, key: value.parent_key ?? '' }
                    : null,
                current: value.current_gid
                    ? { gid: value.current_gid, key: value.current_key ?? '' }
                    : null,
                first: value.first_gid
                    ? { gid: value.first_gid, key: value.first_key ?? '' }
                    : null
            }
        }
    }
}

function encodeLocator(url: string) {
    return `eh-page:${Buffer.from(url, 'utf8').toString('base64url')}`
}

function decodeLocator(locator: string) {
    if (!locator.startsWith('eh-page:'))
        throw new Error('Invalid E-H page locator')
    const value = Buffer.from(locator.slice('eh-page:'.length), 'base64url').toString(
        'utf8'
    )
    const url = new URL(value)
    if (
        url.protocol !== 'https:' ||
        url.hostname !== 'e-hentai.org' ||
        !/^\/s\/[0-9a-f]+\/\d+-\d+$/i.test(url.pathname)
    )
        throw new Error('Untrusted E-H page locator')
    return url.toString()
}

export class EhProvider implements ComicProvider {
    readonly id = 'eh' as const
    readonly capabilities = {
        publicBrowse: true,
        search: true,
        metadata: true,
        chapters: true,
        pages: true,
        imageFetch: true,
        remoteFavoritesRead: false,
        remoteFavoritesWrite: false,
        account: false,
        exHentai: false
    } as const

    private lastSearchAt = 0

    private async request(
        url: string,
        init: RequestInit = {},
        maxBytes = 8 * 1024 * 1024
    ) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        try {
            const response = await fetch(url, {
                ...init,
                redirect: 'follow',
                signal: controller.signal,
                headers: {
                    'user-agent': USER_AGENT,
                    accept: '*/*',
                    ...(init.headers ?? {})
                }
            })
            if (!response.ok)
                throw new Error(`E-H request failed with HTTP ${response.status}`)
            const length = Number(response.headers.get('content-length') ?? 0)
            if (Number.isFinite(length) && length > maxBytes)
                throw new Error('E-H response exceeds the configured size limit')
            return response
        } finally {
            clearTimeout(timer)
        }
    }

    private async text(url: string, maxBytes = 8 * 1024 * 1024) {
        const response = await this.request(url, {}, maxBytes)
        const text = await response.text()
        if (Buffer.byteLength(text, 'utf8') > maxBytes)
            throw new Error('E-H response exceeds the configured size limit')
        return text
    }

    private async gdata(refs: GalleryRef[]) {
        const output: EhMetadata[] = []
        for (let offset = 0; offset < refs.length; offset += MAX_GDATA_BATCH) {
            const chunk = refs.slice(offset, offset + MAX_GDATA_BATCH)
            const response = await this.request(
                API_URL,
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', accept: 'application/json' },
                    body: JSON.stringify({
                        method: 'gdata',
                        gidlist: chunk.map((item) => [item.gid, item.token]),
                        namespace: 1
                    })
                },
                4 * 1024 * 1024
            )
            const body = (await response.json()) as { gmetadata?: EhMetadata[] }
            if (!Array.isArray(body.gmetadata))
                throw new Error('E-H metadata response is malformed')
            output.push(...body.gmetadata)
            if (offset + MAX_GDATA_BATCH < refs.length) await delay(250)
        }
        return output
    }

    private async paceSearch() {
        const remaining = SEARCH_MIN_INTERVAL_MS - (Date.now() - this.lastSearchAt)
        if (remaining > 0) await delay(remaining)
        this.lastSearchAt = Date.now()
    }

    async search(input: SearchRequest) {
        await this.paceSearch()
        const terms = [input.keyword?.trim() ?? '', ...(input.tags ?? [])]
            .map((value) => value.trim())
            .filter(Boolean)
        const url = new URL('/', GALLERY_ORIGIN)
        if (terms.length) url.searchParams.set('f_search', terms.join(' '))
        const html = await this.text(url.toString())
        const refs: GalleryRef[] = []
        const seen = new Set<string>()
        const pattern = /(?:https?:\/\/e-hentai\.org)?\/g\/(\d+)\/([0-9a-f]{10})\//gi
        for (const match of html.matchAll(pattern)) {
            const key = `${match[1]}:${match[2].toLowerCase()}`
            if (seen.has(key)) continue
            seen.add(key)
            refs.push({ gid: Number(match[1]), token: match[2].toLowerCase() })
            if (refs.length >= Math.max(1, Math.min(input.limit ?? 25, 100))) break
        }
        if (!refs.length) return []
        const categories = new Set((input.categories ?? []).map((item) => item.toLowerCase()))
        return (await this.gdata(refs))
            .filter((item) => !item.error)
            .map(ehMetadataToComic)
            .filter(
                (comic) =>
                    !categories.size ||
                    comic.categories.some((category) =>
                        categories.has(category.toLowerCase())
                    )
            )
    }

    async details(comicId: string) {
        const ref = parseEhComicId(comicId)
        const values = await this.gdata([ref])
        if (!values[0]) throw new Error('E-H gallery metadata was not returned')
        return ehMetadataToComic(values[0])
    }

    async episodes(comicId: string): Promise<Episode[]> {
        const comic = await this.details(comicId)
        const ref = parseEhComicId(comicId)
        return [
            {
                id: `eh-${ref.gid}`,
                title: comic.title,
                order: 1,
                updated_at: comic.createdAt ?? ''
            }
        ]
    }

    async pages(comicId: string, episode: Episode): Promise<Picture[]> {
        const ref = parseEhComicId(comicId)
        if (episode.id !== `eh-${ref.gid}`)
            throw new Error('E-H synthetic chapter does not match this gallery')
        const comic = await this.details(comicId)
        const expected = Math.max(0, comic.pagesCount ?? 0)
        const pageUrls: string[] = []
        const seen = new Set<string>()
        for (let index = 0; index < MAX_GALLERY_INDEX_PAGES; index++) {
            const url = `${GALLERY_ORIGIN}/g/${ref.gid}/${ref.token}/?p=${index}`
            const html = await this.text(url)
            const pattern = new RegExp(
                `(?:https?:\\/\\/e-hentai\\.org)?\\/s\\/[0-9a-f]+\\/${ref.gid}-\\d+`,
                'gi'
            )
            let added = 0
            for (const match of html.matchAll(pattern)) {
                const absolute = new URL(htmlDecode(match[0]), GALLERY_ORIGIN).toString()
                if (seen.has(absolute)) continue
                seen.add(absolute)
                pageUrls.push(absolute)
                added += 1
            }
            if ((expected > 0 && pageUrls.length >= expected) || added === 0) break
            await delay(100)
        }
        if (expected > 0 && pageUrls.length < expected)
            throw new Error(
                `E-H gallery page list is incomplete (${pageUrls.length}/${expected})`
            )
        return pageUrls.slice(0, expected || pageUrls.length).map((url, index) => {
            const position = index + 1
            const name = `${String(position).padStart(4, '0')}.jpg`
            return {
                id: `eh-${ref.gid}-${position}`,
                name,
                path: url,
                fileServer: GALLERY_ORIGIN,
                url: encodeLocator(url),
                epTitle: episode.title,
                media: {
                    originalName: name,
                    path: url,
                    fileServer: GALLERY_ORIGIN
                }
            }
        })
    }

    async fetchPage(locator: string, maxBytes = 20 * 1024 * 1024) {
        const pageUrl = decodeLocator(locator)
        const html = await this.text(pageUrl)
        const match =
            /<img[^>]+id=["']img["'][^>]+src=["']([^"']+)["']/i.exec(html) ??
            /<img[^>]+src=["']([^"']+)["'][^>]+id=["']img["']/i.exec(html)
        if (!match) throw new Error('E-H image page did not contain a readable image URL')
        const imageUrl = trustedCoverUrl(htmlDecode(match[1]))
        if (!imageUrl) throw new Error('E-H image URL was rejected as untrusted')
        const response = await this.request(
            imageUrl,
            { headers: { referer: pageUrl, accept: 'image/*' } },
            maxBytes
        )
        const contentType = safeRasterContentType(response.headers.get('content-type'))
        if (!contentType) throw new Error('E-H returned an unsupported image type')
        const data = Buffer.from(await response.arrayBuffer())
        if (data.byteLength > maxBytes) throw new Error('E-H image exceeds the size limit')
        return { data, contentType }
    }
}
