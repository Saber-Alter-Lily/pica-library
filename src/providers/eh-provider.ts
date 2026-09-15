import { setTimeout as delay } from 'node:timers/promises'
import type { Episode, Picture } from '../types'
import { safeRasterContentType, trustedCoverUrl } from '../library/cover-url'
import type {
    CanonicalTag,
    ComicProvider,
    EhSurface,
    ProviderComic,
    SearchRequest
} from './types'

const API_URL = 'https://api.e-hentai.org/api.php'
const GALLERY_ORIGIN = 'https://e-hentai.org'
const EXH_ORIGIN = 'https://exhentai.org'
const USER_AGENT = 'Pica-Library/0.3 (+https://github.com/Saber-Alter-Lily/pica-library)'
const SEARCH_MIN_INTERVAL_MS = 3100
const REQUEST_TIMEOUT_MS = 15000
const MAX_GDATA_BATCH = 25
const MAX_GALLERY_INDEX_PAGES = 100
const MAX_FAVORITE_PAGES = 2500

export interface EhSession {
    memberId: string
    passHash: string
    igneous?: string
    cfClearance?: string
}

export type ExHentaiCapability =
    | 'AVAILABLE'
    | 'UNAVAILABLE'
    | 'NETWORK_ERROR'

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

function safeCookieValue(value: unknown, label: string, required = false) {
    const text = String(value ?? '').trim()
    if (!text) {
        if (required) throw new Error(`E-H ${label} is required`)
        return ''
    }
    if (text.length > 512 || /[;\r\n]/.test(text))
        throw new Error(`E-H ${label} is invalid`)
    return text
}

export function normalizeEhSession(session: EhSession): EhSession {
    return {
        memberId: safeCookieValue(session.memberId, 'member cookie', true),
        passHash: safeCookieValue(session.passHash, 'pass cookie', true),
        igneous: safeCookieValue(session.igneous, 'igneous cookie') || undefined,
        cfClearance:
            safeCookieValue(session.cfClearance, 'Cloudflare cookie') || undefined
    }
}

export function ehMetadataToComic(value: EhMetadata, surface: EhSurface = 'eh'): ProviderComic {
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
            preferredSurface: surface,
            knownSurfaces: [surface],
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
        !['e-hentai.org', 'exhentai.org'].includes(url.hostname) ||
        !/^\/s\/[0-9a-f]+\/\d+-\d+$/i.test(url.pathname)
    )
        throw new Error('Untrusted E-H page locator')
    return url.toString()
}

function galleryRefs(html: string) {
    const output: GalleryRef[] = []
    const seen = new Set<string>()
    const pattern = /(?:https?:\/\/(?:e-hentai\.org|exhentai\.org))?\/g\/(\d+)\/([0-9a-f]{10})\//gi
    for (const match of html.matchAll(pattern)) {
        const key = `${match[1]}:${match[2].toLowerCase()}`
        if (seen.has(key)) continue
        seen.add(key)
        output.push({ gid: Number(match[1]), token: match[2].toLowerCase() })
    }
    return output
}

function nextFavoriteToken(html: string, used: Set<string>) {
    const pattern = /href=["']([^"']*favorites\.php\?[^"']*(?:&amp;|&)next=(\d+)[^"']*)["']/gi
    for (const match of html.matchAll(pattern)) {
        const token = match[2]
        if (!used.has(token)) return token
    }
    return null
}

function accountRejected(response: Response, html: string) {
    if (response.status === 401 || response.status === 403) return true
    let finalUrl: URL | null = null
    try {
        finalUrl = new URL(response.url)
    } catch {
        // Ignore malformed diagnostic URLs from test doubles.
    }
    if (finalUrl?.hostname === 'forums.e-hentai.org') return true
    return /(?:act=Login|you are not logged in|valid user session is required|please log in)/i.test(
        html
    )
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
        remoteFavoritesRead: true,
        remoteFavoritesWrite: true,
        account: true,
        exHentai: true
    } as const

    private lastSearchAt = 0
    private searchGate: Promise<void> = Promise.resolve()
    private session: EhSession | null = null

    constructor(
        session?: EhSession | null,
        private readonly fetchImpl: typeof fetch = fetch
    ) {
        if (session) this.session = normalizeEhSession(session)
    }

    setSession(session?: EhSession | null) {
        this.session = session ? normalizeEhSession(session) : null
    }

    hasSession() {
        return Boolean(this.session)
    }

    private cookieHeader() {
        if (!this.session) throw new Error('E-H account session is not configured')
        const pairs = [
            `ipb_member_id=${this.session.memberId}`,
            `ipb_pass_hash=${this.session.passHash}`,
            'nw=1'
        ]
        if (this.session.igneous) pairs.push(`igneous=${this.session.igneous}`)
        if (this.session.cfClearance)
            pairs.push(`cf_clearance=${this.session.cfClearance}`)
        return pairs.join('; ')
    }

    private async request(
        url: string,
        init: RequestInit = {},
        maxBytes = 8 * 1024 * 1024,
        options: {
            authenticated?: boolean
            allowHttpErrors?: boolean
            redirect?: RequestRedirect
        } = {}
    ) {
        const target = new URL(url)
        if (target.protocol !== 'https:') throw new Error('E-H requires HTTPS')
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        try {
            const headers = new Headers(init.headers)
            headers.set('user-agent', USER_AGENT)
            if (!headers.has('accept')) headers.set('accept', '*/*')
            if (options.authenticated) {
                if (
                    target.hostname !== 'e-hentai.org' &&
                    target.hostname !== 'exhentai.org'
                )
                    throw new Error('E-H session cookies cannot be sent to this host')
                headers.set('cookie', this.cookieHeader())
            }
            const response = await this.fetchImpl(url, {
                ...init,
                redirect: options.redirect ?? 'follow',
                signal: controller.signal,
                headers
            })
            if (!response.ok && !options.allowHttpErrors)
                throw new Error(`E-H request failed with HTTP ${response.status}`)
            const length = Number(response.headers.get('content-length') ?? 0)
            if (Number.isFinite(length) && length > maxBytes)
                throw new Error('E-H response exceeds the configured size limit')
            return response
        } finally {
            clearTimeout(timer)
        }
    }

    private async responseText(response: Response, maxBytes: number) {
        const text = await response.text()
        if (Buffer.byteLength(text, 'utf8') > maxBytes)
            throw new Error('E-H response exceeds the configured size limit')
        return text
    }

    private async text(url: string, maxBytes = 8 * 1024 * 1024) {
        return this.responseText(await this.request(url, {}, maxBytes), maxBytes)
    }

    private async authenticatedText(url: string, maxBytes = 8 * 1024 * 1024) {
        const response = await this.request(
            url,
            {},
            maxBytes,
            { authenticated: true, allowHttpErrors: true }
        )
        const text = await this.responseText(response, maxBytes)
        if (accountRejected(response, text))
            throw new Error('E-H account session is not valid')
        if (!response.ok)
            throw new Error(`E-H account request failed with HTTP ${response.status}`)
        return text
    }

    private async gdata(refs: GalleryRef[], surface: EhSurface = 'eh') {
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
            output.push(...body.gmetadata.map((item) => ({ ...item, __surface: surface } as EhMetadata & { __surface: EhSurface })))
            if (offset + MAX_GDATA_BATCH < refs.length) await delay(250)
        }
        return output
    }

    private paceSearch() {
        const run = this.searchGate.then(async () => {
            const remaining =
                SEARCH_MIN_INTERVAL_MS - (Date.now() - this.lastSearchAt)
            if (remaining > 0) await delay(remaining)
            this.lastSearchAt = Date.now()
        })
        this.searchGate = run.catch(() => undefined)
        return run
    }

    async search(input: SearchRequest) {
        const surface: EhSurface = input.surface ?? 'eh'
        const mode = input.ehMode ?? 'latest'
        if (surface === 'exh') {
            if (!this.session) throw new Error('E-H account session is required for ExH')
            const capability = await this.probeExHentai()
            if (capability !== 'AVAILABLE')
                throw new Error(capability === 'NETWORK_ERROR' ? 'ExH availability check failed because of a network error' : 'This E-H account does not currently have ExH access')
        }
        const exactTerm = (raw: string) => {
            const value = raw.trim()
            const colon = value.indexOf(':')
            if (colon <= 0 || /[\"']/u.test(value)) return value
            const namespace = value.slice(0, colon).trim()
            const tag = value.slice(colon + 1).trim().replace(/\"/g, '')
            return namespace && tag ? `${namespace}:"${tag}$"` : value
        }
        const matchesFilters = (comic: ProviderComic) => {
            const categories = new Set((input.categories ?? []).map((item) => item.toLowerCase()))
            if (categories.size && !comic.categories.some((category) => categories.has(category.toLowerCase()))) return false
            if (Number(input.ehMinRating ?? 0) > 0 && Number(comic.rating ?? 0) < Number(input.ehMinRating)) return false
            if (Number(input.ehPageFrom ?? 0) > 0 && Number(comic.pagesCount ?? 0) < Number(input.ehPageFrom)) return false
            if (Number(input.ehPageTo ?? 0) > 0 && Number(comic.pagesCount ?? 0) > Number(input.ehPageTo)) return false
            const tags = new Set(comic.canonicalTags.map((tag) => tag.raw.toLowerCase()))
            const language = String(input.ehLanguage ?? '').trim().toLowerCase()
            if (language && !tags.has(`language:${language}`)) return false
            for (const raw of input.ehExcludeTags ?? []) if (tags.has(raw.trim().toLowerCase())) return false
            return true
        }
        if (mode === 'favorites') {
            const favorites = await this.favoritesAll()
            return favorites.filter(matchesFilters).slice(0, Math.max(1, Math.min(input.limit ?? 100, 100)))
        }
        await this.paceSearch()
        const origin = surface === 'exh' ? EXH_ORIGIN : GALLERY_ORIGIN
        const url = new URL('/', origin)
        const terms = [input.keyword?.trim() ?? '', ...(input.tags ?? []).map(exactTerm)]
            .map((value) => value.trim()).filter(Boolean)
        const language = String(input.ehLanguage ?? '').trim()
        if (language) terms.push(`language:"${language}$"`)
        for (const tag of input.ehExcludeTags ?? []) terms.push('-' + exactTerm(tag))
        if (mode === 'popular') url.pathname = '/popular'
        else if (mode === 'watched') {
            if (!this.session) throw new Error('E-H account session is required for Watched')
            url.pathname = '/watched'
        } else if (mode === 'toplist') {
            url.pathname = '/toplist.php'
            const toplist = ['11','12','13','15'].includes(String(input.ehToplist ?? '11')) ? String(input.ehToplist ?? '11') : '11'
            url.searchParams.set('tl', toplist)
        } else if (terms.length) url.searchParams.set('f_search', terms.join(' '))
        const authenticated = surface === 'exh' || mode === 'watched'
        const html = authenticated ? await this.authenticatedText(url.toString()) : await this.text(url.toString())
        const refs = galleryRefs(html).slice(0, Math.max(1, Math.min(input.limit ?? 25, 100)))
        if (!refs.length) return []
        return (await this.gdata(refs, surface))
            .filter((item) => !item.error)
            .map((item) => ehMetadataToComic(item, surface))
            .filter(matchesFilters)
    }

    async verifyAccount() {
        const html = await this.authenticatedText(
            `${GALLERY_ORIGIN}/favorites.php?favcat=all`,
            4 * 1024 * 1024
        )
        return { authenticated: true, visibleFavorites: galleryRefs(html).length }
    }

    async favoritesAll() {
        if (!this.session) throw new Error('E-H account session is not configured')
        const refs = new Map<string, GalleryRef>()
        const usedNext = new Set<string>()
        let next: string | null = null
        for (let page = 0; page < MAX_FAVORITE_PAGES; page++) {
            const url = new URL('/favorites.php', GALLERY_ORIGIN)
            url.searchParams.set('favcat', 'all')
            if (next) url.searchParams.set('next', next)
            const html = await this.authenticatedText(url.toString(), 8 * 1024 * 1024)
            for (const ref of galleryRefs(html))
                refs.set(`${ref.gid}:${ref.token}`, ref)
            const token = nextFavoriteToken(html, usedNext)
            if (!token) break
            usedNext.add(token)
            next = token
        }
        const metadata = await this.gdata([...refs.values()])
        return metadata.filter((item) => !item.error).map((item) => ehMetadataToComic(item, 'eh'))
    }

    async setRemoteFavorite(
        comicId: string,
        desired: boolean,
        category = 0,
        note = ''
    ) {
        if (!this.session) throw new Error('E-H account session is not configured')
        if (!Number.isInteger(category) || category < 0 || category > 9)
            throw new Error('E-H favorite category must be between 0 and 9')
        if (Buffer.byteLength(note, 'utf8') > 200)
            throw new Error('E-H favorite note exceeds 200 bytes')
        const ref = parseEhComicId(comicId)
        const url = new URL('/gallerypopups.php', GALLERY_ORIGIN)
        url.searchParams.set('gid', String(ref.gid))
        url.searchParams.set('t', ref.token)
        url.searchParams.set('act', 'addfav')
        const form = new URLSearchParams({
            favcat: desired ? String(category) : 'favdel',
            favnote: note,
            apply: 'Apply Changes',
            update: '1'
        })
        const response = await this.request(
            url.toString(),
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    accept: 'text/html,*/*;q=0.8'
                },
                body: form.toString()
            },
            4 * 1024 * 1024,
            { authenticated: true, allowHttpErrors: true }
        )
        const html = await this.responseText(response, 4 * 1024 * 1024)
        if (accountRejected(response, html))
            throw new Error('E-H account session is not valid')
        if (!response.ok)
            throw new Error(`E-H favorite request failed with HTTP ${response.status}`)
        const successText = desired
            ? /(?:added|updated|saved)[^<]{0,80}favorite/i.test(html)
            : /(?:removed|deleted)[^<]{0,80}favorite/i.test(html)
        if (!successText) {
            const verify = await this.authenticatedText(url.toString(), 4 * 1024 * 1024)
            const removalControl = /value=["']favdel["']/i.test(verify)
            if (removalControl !== desired)
                throw new Error('E-H favorite state could not be confirmed')
        }
        return { changed: true, isFavorite: desired, category, note }
    }

    async probeExHentai(): Promise<ExHentaiCapability> {
        if (!this.session) return 'UNAVAILABLE'
        try {
            const response = await this.request(
                `${EXH_ORIGIN}/uconfig.php`,
                { headers: { accept: 'text/html,*/*;q=0.8' } },
                4 * 1024 * 1024,
                { authenticated: true, allowHttpErrors: true }
            )
            if (response.status === 401 || response.status === 403)
                return 'UNAVAILABLE'
            const html = await this.responseText(response, 4 * 1024 * 1024)
            if (
                !response.ok ||
                accountRejected(response, html) ||
                /sad\s*panda/i.test(html)
            )
                return 'UNAVAILABLE'
            return 'AVAILABLE'
        } catch (error) {
            if (
                error instanceof Error &&
                /session is not configured|session is not valid/i.test(error.message)
            )
                return 'UNAVAILABLE'
            return 'NETWORK_ERROR'
        }
    }

    async detailsOnSurface(comicId: string, surface: EhSurface = 'eh') {
        const ref = parseEhComicId(comicId)
        const values = await this.gdata([ref], surface)
        if (!values[0]) throw new Error('E-H gallery metadata was not returned')
        return ehMetadataToComic(values[0], surface)
    }

    async details(comicId: string) {
        return this.detailsOnSurface(comicId, 'eh')
    }

    async episodesOnSurface(comicId: string, surface: EhSurface = 'eh'): Promise<Episode[]> {
        const comic = await this.detailsOnSurface(comicId, surface)
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

    async episodes(comicId: string): Promise<Episode[]> {
        return this.episodesOnSurface(comicId, 'eh')
    }

    async pagesOnSurface(comicId: string, episode: Episode, surface: EhSurface = 'eh'): Promise<Picture[]> {
        const ref = parseEhComicId(comicId)
        if (episode.id !== `eh-${ref.gid}`)
            throw new Error('E-H synthetic chapter does not match this gallery')
        const comic = await this.detailsOnSurface(comicId, surface)
        const expected = Math.max(0, comic.pagesCount ?? 0)
        const origin = surface === 'exh' ? EXH_ORIGIN : GALLERY_ORIGIN
        const pageUrls: string[] = []
        const seen = new Set<string>()
        for (let index = 0; index < MAX_GALLERY_INDEX_PAGES; index++) {
            const url = `${origin}/g/${ref.gid}/${ref.token}/?p=${index}`
            const html = surface === 'exh'
                ? await this.authenticatedText(url)
                : await this.text(url)
            const pattern = new RegExp(
                `(?:https?:\\/\\/(?:e-hentai\\.org|exhentai\\.org))?\\/s\\/[0-9a-f]+\\/${ref.gid}-\\d+`,
                'gi'
            )
            let added = 0
            for (const match of html.matchAll(pattern)) {
                const absolute = new URL(htmlDecode(match[0]), origin).toString()
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

    async pages(comicId: string, episode: Episode): Promise<Picture[]> {
        return this.pagesOnSurface(comicId, episode, 'eh')
    }

    async fetchCover(locator: string, maxBytes = 20 * 1024 * 1024) {
        const coverUrl = trustedCoverUrl(locator)
        if (!coverUrl) throw new Error('E-H cover URL was rejected as untrusted')
        const response = await this.request(
            coverUrl,
            { headers: { referer: `${GALLERY_ORIGIN}/`, accept: 'image/*' } },
            maxBytes
        )
        const contentType = safeRasterContentType(response.headers.get('content-type'))
        if (!contentType) throw new Error('E-H returned an unsupported cover type')
        const data = Buffer.from(await response.arrayBuffer())
        if (data.byteLength > maxBytes) throw new Error('E-H cover exceeds the size limit')
        return { data, contentType }
    }

    async fetchPage(locator: string, maxBytes = 20 * 1024 * 1024) {
        const pageUrl = decodeLocator(locator)
        const html = new URL(pageUrl).hostname === 'exhentai.org'
            ? await this.authenticatedText(pageUrl)
            : await this.text(pageUrl)
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
