import axios, { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios'
import headers from './data/headers.json'
import { createHash, createHmac } from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'
import { normalizeName, debug, redactSensitive } from './utils'
import {
    requireTrustedCoverUrl,
    safeRasterContentType
} from './library/cover-url'
import {
    Comic,
    Episode,
    DInfo,
    PagePicture,
    PageSearch,
    PageEpisode,
    PageFavorites,
    ExpectedPage
} from './types'

const PICA_SECRET_KEY =
    process.env.PICA_SECRET_KEY ||
    '~d}$Q7$eIni=V)9\\RK/P.RM4;9[7|@/CA}b~OW!3?EV`:<>M7pddUBL5n|0/*Cn'

export class Pica {
    Order = {
        default: 'ua', // 默认
        latest: 'dd', // 新到旧
        oldest: 'da', // 旧到新
        loved: 'ld', // 最多爱心
        point: 'vd' // 最多指名
    }
    api // 分页默认为每页 40 条
    private readonly media
    token: string | undefined
    maxRetry = 3
    retryMap = new Map<string, number>() // <url, retryCount>

    constructor(
        options: { apiAdapter?: AxiosAdapter; mediaAdapter?: AxiosAdapter } = {}
    ) {
        const httpProxy = process.env.PICA_PROXY
            ? new URL(process.env.PICA_PROXY as string)
            : false
        this.api = axios.create({
            baseURL: 'https://picaapi.picacomic.com/',
            // baseURL: 'https://api.manhuapica.com/',
            proxy: httpProxy
                ? {
                      protocol: httpProxy.protocol,
                      host: httpProxy.hostname,
                      port: Number(httpProxy.port)
                  }
                : false,
            adapter: options.apiAdapter
        })
        this.media = axios.create({
            proxy: httpProxy
                ? {
                      protocol: httpProxy.protocol,
                      host: httpProxy.hostname,
                      port: Number(httpProxy.port)
                  }
                : false,
            adapter: options.mediaAdapter
        })
        this.api.interceptors.request.use((config) => {
            const method = config.method
            const url = config.url?.replace(/^\/|\/$/g, '') // url 首尾不能有 "/"
            const timestamp = String(Date.now()).slice(0, -3)
            const raw =
                url + timestamp + headers.nonce + method + headers['api-key']
            const hmac = createHmac('sha256', PICA_SECRET_KEY)
            hmac.update(raw.toLowerCase())
            headers.signature = hmac.digest('hex')
            headers.time = timestamp
            config.headers.set(headers)
            if (this.token) {
                config.headers.setAuthorization(this.token)
            }
            return config
        })
        this.api.interceptors.response.use(
            (res) => {
                // 响应成功，从重试表中删除 url
                const url = res.config.url
                url && this.retryMap.delete(url)

                const result = res.data

                const responseType = res.config.responseType
                if (responseType === 'arraybuffer') {
                    return res
                }

                debug('\n%s %O', url, redactSensitive(result))

                if (result.code != 200) {
                    throw new Error('请求失败')
                }
                return result.data
            },
            (error: AxiosError) => {
                const { config, message, response } = error

                // 哔咔禁止访问的资源
                if (response?.status === 400) {
                    return Promise.reject(response?.status)
                }

                const url = config?.url || ''

                const retryCount = this.retryMap.get(url) || 0
                if (config && retryCount > 0) {
                    this.retryMap.set(url, retryCount - 1)
                    return this.api.request(config)
                } else {
                    this.retryMap.delete(url)
                }

                debug(
                    '\nerror %s %s %O',
                    url,
                    message,
                    redactSensitive(response?.data)
                )
                return Promise.reject(message)
            }
        )
    }

    async login(account: string, password: string) {
        debug('\nlogin requested for configured account')

        const res = await this.request<string>('post', 'auth/sign-in', {
            email: account,
            password: password
        }).catch((err) => {
            debug('\n登录异常 %s', err)
            throw new Error('登录失败，请检查账号/密码/网络环境')
        })

        if (!res.token) {
            throw new Error('PICA_SECRET_KEY 错误')
        }
        this.token = res.token
    }

    comics(block: string, tag: string, order: string, page = 1) {
        const params = new URLSearchParams()
        if (block) params.set('c', block)
        if (tag) params.set('t', tag)
        if (order) params.set('s', order)
        if (page > 0) params.set('page', String(page))
        const url = `comics?${params}`
        return this.request('get', url)
    }

    async comicsPage(
        block = '',
        tag = '',
        order = this.Order.default,
        page = 1
    ) {
        const res = await this.comics(block, tag, order, page)
        return res.comics as PageSearch
    }

    async comicsAll(block = '', tag = '', order = this.Order.default) {
        const first = await this.comicsPage(block, tag, order, 1)
        const comics = [...first.docs]
        for (let page = 2; page <= first.pages; page++) {
            const next = await this.comicsPage(block, tag, order, page)
            comics.push(...next.docs)
        }
        return comics
    }

    /**
     * 排行榜
     */
    async leaderboard() {
        const params = new URLSearchParams({
            tt: 'H24', // H24, D7, D30 (天/周/月)
            ct: 'VC'
        })
        const url = `comics/leaderboard?${params}`
        const res = await this.request('get', url)
        return res.comics as Comic[]
    }

    /**
     * 漫画详细信息
     */
    async comicInfo(bookId: string) {
        const url = `comics/${bookId}`
        const res = await this.request<Comic>('get', url)
        return res.comic
    }

    /**
     * 获取漫画分页章节
     */
    async episodes(bookId: string, page = 1) {
        const url = `comics/${bookId}/eps?page=${page}`
        const res = await this.request<PageEpisode>('get', url)
        return res.eps
    }

    /**
     * 获取漫画全部章节
     */
    async episodesAll(bookId: string) {
        const firstPage = await this.episodes(bookId)
        const pages = firstPage.pages // 总页数
        const total = firstPage.total // 总章节数
        const episodes = firstPage.docs
        for (let i = 2; i <= pages; i++) {
            const res = await this.episodes(bookId, i)
            episodes.push(...res.docs)
        }

        if (episodes.length !== total) {
            throw new Error(`章节数错误，应为${total}，实际${episodes.length}`)
        }
        return episodes.sort((a, b) => a.order - b.order)
    }

    /**
     * 获取章节下图片
     */
    async pictures(bookId: string, orderId: string | number, page = 1) {
        const url = `comics/${bookId}/order/${orderId}/pages?page=${page}`
        const res = await this.request<PagePicture>('get', url)
        res.pages.docs = res.pages.docs.map((doc) => {
            const fileServer =
                process.env.PICA_FILE_SERVER || doc.media.fileServer
            return {
                ...doc,
                ...doc.media,
                name: doc.media.originalName,
                url: `${fileServer}/static/${doc.media.path}`
            }
        })
        return res.pages
    }

    /**
     * 获取章节下全部图片
     */
    async picturesAll(bookId: string, ep: Episode) {
        const first = await this.pictures(bookId, ep.order)
        const pages = first.pages
        const pictures = first.docs
        for (let i = 2; i <= pages; i++) {
            const res = await this.pictures(bookId, ep.order, i)
            pictures.push(...res.docs)
        }
        const len = String(pictures.length).length
        pictures.forEach((pic, i) => {
            pic.epTitle = ep.title
            pic.name = String(i + 1).padStart(len, '0') + path.extname(pic.name)
        })
        return pictures
    }

    async download(url: string, info: DInfo): Promise<void> {
        const res = await this.mediaRequest(url)

        const dir = path.resolve(
            process.cwd(),
            'comics',
            normalizeName(info.title),
            normalizeName(info.epTitle)
        )
        await fs.mkdir(dir, { recursive: true })
        const file = path.resolve(dir, info.picName)
        return fs.writeFile(file, res.data)
    }

    async downloadToFile(url: string, file: string) {
        let response
        try {
            response = await this.mediaRequest(url)
        } catch (error) {
            if (
                process.env.PICA_ALLOW_INSECURE_HTTP === 'true' &&
                url.startsWith('https://')
            ) {
                response = await this.mediaRequest(
                    `http://${url.slice('https://'.length)}`
                )
            } else {
                throw error
            }
        }
        const data = Buffer.from(response.data)
        await fs.mkdir(path.dirname(file), { recursive: true })
        const partial = `${file}.part`
        await fs.writeFile(partial, data)
        await fs.rename(partial, file)
        return {
            bytes: data.byteLength,
            sha256: createHash('sha256').update(data).digest('hex')
        }
    }

    async fetchImage(
        target: string,
        maxBytes = 5 * 1024 * 1024
    ): Promise<{ data: Buffer; contentType: string }> {
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
            throw new Error('Image size limit must be a positive integer')
        }
        const response = await this.mediaRequest(target, 0, maxBytes, true)
        const data = Buffer.from(response.data)
        if (data.byteLength > maxBytes) {
            throw new Error('Provider image exceeds the configured size limit')
        }
        const contentType = safeRasterContentType(
            response.headers['content-type']
        )
        if (!contentType)
            throw new Error(
                'Provider cover response is not a safe raster image'
            )
        return { data, contentType }
    }

    private async mediaRequest(
        target: string,
        redirects = 0,
        maxBytes?: number,
        trustedCover = false
    ): Promise<AxiosResponse<Buffer>> {
        const url = new URL(
            trustedCover ? requireTrustedCoverUrl(target) : target
        )
        const insecureAllowed = process.env.PICA_ALLOW_INSECURE_HTTP === 'true'
        if (
            url.protocol !== 'https:' &&
            !(insecureAllowed && url.protocol === 'http:')
        ) {
            throw new Error(
                'Media downloads require HTTPS unless PICA_ALLOW_INSECURE_HTTP=true'
            )
        }
        if (redirects > 5) throw new Error('Too many media redirects')
        const response = await this.media.get<Buffer>(url.toString(), {
            responseType: 'arraybuffer',
            maxContentLength: maxBytes,
            maxBodyLength: maxBytes,
            maxRedirects: 0,
            headers: { Accept: 'image/*,application/octet-stream' },
            validateStatus: (status) =>
                (status >= 200 && status < 304) ||
                (status >= 300 && status < 400)
        })
        const location = response.headers.location
        if (location) {
            return this.mediaRequest(
                trustedCover
                    ? requireTrustedCoverUrl(new URL(location, url).toString())
                    : new URL(location, url).toString(),
                redirects + 1,
                maxBytes,
                trustedCover
            )
        }
        return response
    }

    async search(
        keyword: string,
        page = 1,
        sort = this.Order.loved,
        categories: string[] = []
    ) {
        const url = `comics/advanced-search?page=${page}`
        const data = { keyword, sort, categories }
        const res = await this.request<PageSearch>('post', url, data)
        return res.comics
    }

    async searchAll(
        keyword: string,
        sort = this.Order.loved,
        categories: string[] = []
    ) {
        const comics: Comic[] = []
        if (keyword) {
            const first = await this.search(keyword, 1, sort, categories)
            const pages = first.pages
            comics.push(...first.docs)
            for (let page = 2; page <= pages; page++) {
                const res = await this.search(keyword, page, sort, categories)
                comics.push(...res.docs)
            }
        }
        return comics
    }

    categories() {
        const url = 'categories'
        return this.request('get', url)
    }

    async keywords() {
        const res = await this.request<string[]>('get', 'keywords')
        return res.keywords
    }

    async related(bookId: string) {
        const res = await this.request<Comic[]>(
            'get',
            `comics/${bookId}/recommendation`
        )
        return res.comics
    }

    /**
     * 收藏/取消收藏
     */
    fav(bookId: string) {
        const url = `comics/${bookId}/favourite`
        return this.request('post', url)
    }

    /**
     * 获取收藏夹的内容
     */
    async favorites(page = 1, sort = this.Order.latest) {
        const url = `users/favourite?page=${page}&s=${sort}`
        const res = await this.request<PageFavorites>('get', url)
        return res.comics
    }

    async favoritesAll(
        page: ExpectedPage = 'all',
        onPage?: (progress: {
            page: number
            pages: number
            fetched: number
            total?: number
        }) => void
    ) {
        const pageNum = Number(page)
        if (page && Number.isInteger(pageNum)) {
            const res = await this.favorites(pageNum)
            onPage?.({
                page: res.page,
                pages: res.pages,
                fetched: res.docs.length,
                total: res.total
            })
            return { comics: res.docs, pages: res.pages }
        }

        const comics: Comic[] = []
        const first = await this.favorites()
        const pages = first.pages
        comics.push(...first.docs)
        onPage?.({
            page: first.page,
            pages,
            fetched: comics.length,
            total: first.total
        })
        for (let page = 2; page <= pages; page++) {
            const res = await this.favorites(page)
            comics.push(...res.docs)
            onPage?.({
                page: res.page,
                pages,
                fetched: comics.length,
                total: res.total
            })
        }
        return { comics, pages }
    }

    /**
     * 打卡
     */
    punchIn() {
        const url = 'users/punch-in'
        return this.request('post', url)
    }

    request<T>(
        method: string,
        url: string,
        data?: object
    ): Promise<Record<string, T>> {
        if (/^[a-z][a-z\d+.-]*:\/\//i.test(url))
            throw new Error(
                'Pica API requests require a trusted relative endpoint'
            )
        return this.api.request({
            url,
            method,
            headers,
            data
        })
    }
}
