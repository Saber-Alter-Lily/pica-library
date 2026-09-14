import fs from 'node:fs'

function read(file) { return fs.readFileSync(file, 'utf8') }
function write(file, value) { fs.writeFileSync(file, value) }
function replaceOnce(text, search, replacement, label) {
  const index = text.indexOf(search)
  if (index < 0) throw new Error(`patch anchor missing: ${label}`)
  if (text.indexOf(search, index + search.length) >= 0) throw new Error(`patch anchor duplicated: ${label}`)
  return text.slice(0, index) + replacement + text.slice(index + search.length)
}
function replaceRegex(text, regex, replacement, label) {
  const matches = [...text.matchAll(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g'))]
  if (matches.length !== 1) throw new Error(`patch regex ${label} matched ${matches.length}`)
  return text.replace(regex, replacement)
}

// E-H provider: serialize search pacing and add safe cover fetch.
{
  const file = 'src/providers/eh-provider.ts'
  let text = read(file)
  text = replaceOnce(text,
    '    private lastSearchAt = 0\n',
    '    private lastSearchAt = 0\n    private searchGate: Promise<void> = Promise.resolve()\n',
    'eh search gate field')
  text = replaceOnce(text,
`    private async paceSearch() {
        const remaining = SEARCH_MIN_INTERVAL_MS - (Date.now() - this.lastSearchAt)
        if (remaining > 0) await delay(remaining)
        this.lastSearchAt = Date.now()
    }
`,
`    private paceSearch() {
        const run = this.searchGate.then(async () => {
            const remaining =
                SEARCH_MIN_INTERVAL_MS - (Date.now() - this.lastSearchAt)
            if (remaining > 0) await delay(remaining)
            this.lastSearchAt = Date.now()
        })
        this.searchGate = run.catch(() => undefined)
        return run
    }
`, 'eh serialized pacing')
  text = replaceOnce(text,
`    async fetchPage(locator: string, maxBytes = 20 * 1024 * 1024) {
`,
`    async fetchCover(locator: string, maxBytes = 20 * 1024 * 1024) {
        const coverUrl = trustedCoverUrl(locator)
        if (!coverUrl) throw new Error('E-H cover URL was rejected as untrusted')
        const response = await this.request(
            coverUrl,
            { headers: { referer: \`${GALLERY_ORIGIN}/\`, accept: 'image/*' } },
            maxBytes
        )
        const contentType = safeRasterContentType(response.headers.get('content-type'))
        if (!contentType) throw new Error('E-H returned an unsupported cover type')
        const data = Buffer.from(await response.arrayBuffer())
        if (data.byteLength > maxBytes) throw new Error('E-H cover exceeds the size limit')
        return { data, contentType }
    }

    async fetchPage(locator: string, maxBytes = 20 * 1024 * 1024) {
`, 'eh fetchCover')
  write(file, text)
}

// Provider metadata persistence is additive and preserves legacy IDs.
{
  const file = 'src/storage/sqlite/migrations.ts'
  let text = read(file)
  text = replaceOnce(text,
`    }
]

export const latestMigrationVersion`,
`    },
    {
        version: 9,
        name: 'provider_identity_metadata',
        up: \`
            CREATE TABLE IF NOT EXISTS comic_provider_metadata (
                comic_id TEXT PRIMARY KEY REFERENCES comics(id) ON DELETE CASCADE,
                provider_id TEXT NOT NULL,
                provider_remote_id TEXT NOT NULL,
                alternate_titles_json TEXT NOT NULL DEFAULT '[]',
                completion_status TEXT NOT NULL DEFAULT 'UNKNOWN',
                rating REAL,
                provider_metadata_json TEXT NOT NULL DEFAULT '{}',
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_comic_provider_identity
                ON comic_provider_metadata(provider_id, provider_remote_id);
            INSERT OR IGNORE INTO comic_provider_metadata(
                comic_id, provider_id, provider_remote_id,
                alternate_titles_json, completion_status,
                provider_metadata_json, first_seen_at, last_seen_at
            )
            SELECT id, 'pica', id, '[]',
                   CASE WHEN finished = 1 THEN 'FINISHED' ELSE 'ONGOING' END,
                   '{}', first_seen_at, last_seen_at
            FROM comics;
        \`
    }
]

export const latestMigrationVersion`, 'migration 9')
  write(file, text)
}

{
  const file = 'src/library/database.ts'
  let text = read(file)
  text = replaceOnce(text,
`function numberValue(value: unknown): number {
    const number = Number(value)
    return Number.isFinite(number) ? number : 0
}
`,
`function numberValue(value: unknown): number {
    const number = Number(value)
    return Number.isFinite(number) ? number : 0
}

function jsonObject(value: unknown): Record<string, unknown> {
    try {
        const parsed = JSON.parse(String(value ?? '{}'))
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {}
    } catch {
        return {}
    }
}
`, 'jsonObject helper')
  text = replaceOnce(text,
`    if (source === 'pica:recommendations') return 'recommendation'
`,
`    if (source === 'pica:recommendations') return 'recommendation'
    if (source === 'eh:discover') return 'E-H search'
    if (source.startsWith('eh:')) return 'E-H provider'
`, 'E-H provenance')
  text = replaceOnce(text,
`        const linkUpsert = this.db.prepare(\`
`,
`        const providerMetaUpsert = this.db.prepare(\`
            INSERT INTO comic_provider_metadata(
                comic_id, provider_id, provider_remote_id,
                alternate_titles_json, completion_status, rating,
                provider_metadata_json, first_seen_at, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(comic_id) DO UPDATE SET
                provider_id = excluded.provider_id,
                provider_remote_id = excluded.provider_remote_id,
                alternate_titles_json = excluded.alternate_titles_json,
                completion_status = excluded.completion_status,
                rating = excluded.rating,
                provider_metadata_json = excluded.provider_metadata_json,
                last_seen_at = excluded.last_seen_at
        \`)
        const linkUpsert = this.db.prepare(\`
`, 'provider meta statement')
  text = replaceOnce(text,
`                if (authorId) {
`,
`                const providerId =
                    record.providerId ??
                    (record.comicId.startsWith('eh:') ? 'eh' : 'pica')
                const providerRemoteId =
                    record.providerRemoteId ??
                    (providerId === 'eh'
                        ? record.comicId.slice(3)
                        : record.comicId)
                providerMetaUpsert.run(
                    record.comicId,
                    providerId,
                    providerRemoteId,
                    JSON.stringify(record.alternateTitles ?? []),
                    record.completionStatus ??
                        (record.finished ? 'FINISHED' : 'ONGOING'),
                    record.rating ?? null,
                    JSON.stringify(record.providerMetadata ?? {}),
                    now,
                    now
                )
                if (authorId) {
`, 'provider meta write')
  text = replaceOnce(text,
`                 FROM comics c
                 LEFT JOIN authors a ON a.id = c.canonical_author_id\`
`,
`                 FROM comics c
                 LEFT JOIN authors a ON a.id = c.canonical_author_id
                 LEFT JOIN comic_provider_metadata pm ON pm.comic_id = c.id\`
`, 'provider meta list join')
  text = replaceOnce(text,
`                    comicId: String(row.id),
                    title: String(row.title),
`,
`                    comicId: String(row.id),
                    providerId: row.provider_id
                        ? (String(row.provider_id) as 'pica' | 'eh')
                        : String(row.id).startsWith('eh:')
                          ? 'eh'
                          : 'pica',
                    providerRemoteId: row.provider_remote_id
                        ? String(row.provider_remote_id)
                        : String(row.id).startsWith('eh:')
                          ? String(row.id).slice(3)
                          : String(row.id),
                    alternateTitles: jsonArray(row.alternate_titles_json),
                    completionStatus: row.completion_status
                        ? (String(row.completion_status) as
                              | 'FINISHED'
                              | 'ONGOING'
                              | 'UNKNOWN')
                        : Boolean(row.finished)
                          ? 'FINISHED'
                          : 'ONGOING',
                    rating:
                        row.rating === null || row.rating === undefined
                            ? undefined
                            : numberValue(row.rating),
                    providerMetadata: jsonObject(row.provider_metadata_json),
                    title: String(row.title),
`, 'provider meta read')
  text = replaceOnce(text,
`            distinctProviderRawIds: count(
                'SELECT COUNT(DISTINCT id) AS count FROM comics'
            ),
`,
`            distinctProviderRawIds: count(
                'SELECT COUNT(DISTINCT provider_id || char(31) || provider_remote_id) AS count FROM comic_provider_metadata'
            ),
`, 'provider distinct identity')
  text = replaceOnce(text,
`    favoriteIds() {
`,
`    setLocalFavoriteState(comicId: string, isFavorite: boolean) {
        const result = this.db
            .prepare(
                'UPDATE comics SET is_favorite = ?, last_seen_at = ? WHERE id = ?'
            )
            .run(isFavorite ? 1 : 0, new Date().toISOString(), comicId)
        if (result.changes !== 1) throw new Error(\`Comic not found: \${comicId}\`)
        const now = new Date().toISOString()
        if (isFavorite)
            this.db
                .prepare(
                    \`INSERT INTO library_membership(comic_id, reason, created_at, updated_at)
                     VALUES (?, 'local-favorite', ?, ?)
                     ON CONFLICT(comic_id, reason) DO UPDATE SET updated_at = excluded.updated_at\`
                )
                .run(comicId, now, now)
        else
            this.db
                .prepare(
                    "DELETE FROM library_membership WHERE comic_id = ? AND reason = 'local-favorite'"
                )
                .run(comicId)
        return this.getComic(comicId)
    }

    favoriteIds() {
`, 'local provider favorite')
  write(file, text)
}

// E-H favorite mutation is local-only until authenticated cloud favorites are explicitly implemented.
{
  const file = 'src/services/provider-service.ts'
  let text = read(file)
  text = replaceOnce(text,
`        if (comicId.startsWith('eh:'))
            throw new Error(
                'E-H 云收藏尚未启用；当前版本只提供公共浏览、阅读和本地书库能力'
            )
`,
`        if (comicId.startsWith('eh:')) {
            const before = this.database.getComic(comicId)
            if (!before) throw new Error('E-H 漫画尚未加入本地目录')
            if (before.isFavorite === desired)
                return { changed: false, isFavorite: desired, already: true, remote: false }
            this.database.setLocalFavoriteState(comicId, desired)
            return { changed: true, isFavorite: desired, already: false, remote: false }
        }
`, 'E-H local favorite')
  write(file, text)
}

// Desktop service dispatches public discovery, covers, updates and downloads through ProviderService.
{
  const file = 'src/library/service.ts'
  let text = read(file)
  text = replaceOnce(text,
`import { Pica } from '../sdk'
`,
`import { Pica } from '../sdk'
import type { ProviderId } from '../providers/types'
`, 'ProviderId import')
  text = replaceOnce(text,
`    sort?: SortMode
    limit?: number
`,
`    sort?: SortMode
    limit?: number
    providers?: ProviderId[]
`, 'DiscoverQuery providers')
  text = replaceOnce(text,
`        const pica = await this.connect()
        const image = await pica.fetchImage(comic.coverUrl)
`,
`        const providerService = new ProviderService(
            () => this.connect(),
            this.database
        )
        const image = await providerService.fetchCover(comicId, comic.coverUrl)
`, 'provider cover')
  text = replaceRegex(text,
/    async discover\(query: DiscoverQuery\) \{[\s\S]*?\n    \}\n\n    async recommendations\(/,
`    async discover(query: DiscoverQuery) {
        const providerService = new ProviderService(
            () => this.connect(),
            this.database
        )
        const tags = (query.tags ?? []).map(normalizeAuthorKey)
        const categories = (query.categories ?? []).map(normalizeAuthorKey)
        let records = await providerService.search(
            {
                keyword: query.keyword?.trim(),
                tags: query.tags,
                categories: query.categories,
                limit: Math.min(query.limit ?? 100, 1000)
            },
            query.providers?.length ? query.providers : ['pica', 'eh']
        )
        records = records.filter((comic) => {
            const comicTags = comic.tags.map(normalizeAuthorKey)
            const comicCategories = comic.categories.map(normalizeAuthorKey)
            return (
                tags.every((tag) => comicTags.includes(tag)) &&
                categories.every((category) =>
                    comicCategories.includes(category)
                )
            )
        })
        if (query.sort === 'title') {
            records.sort((a, b) => a.title.localeCompare(b.title))
        } else if (query.sort === 'latest') {
            records.sort((a, b) =>
                String(b.updatedAt ?? b.createdAt ?? '').localeCompare(
                    String(a.updatedAt ?? a.createdAt ?? '')
                )
            )
        } else if (query.sort === 'views') {
            records.sort(
                (a, b) => (b.totalViews ?? 0) - (a.totalViews ?? 0)
            )
        } else if (query.sort === 'recommended') {
            records.sort((a, b) => {
                const score = (comic: FavoriteRecord) =>
                    Math.log10(1 + (comic.totalLikes ?? 0)) * 3 +
                    Math.log10(1 + (comic.totalViews ?? 0)) +
                    (comic.rating ?? 0) +
                    tags.filter((tag) =>
                        comic.tags.map(normalizeAuthorKey).includes(tag)
                    ).length * 5
                return score(b) - score(a)
            })
        } else {
            records.sort((a, b) => {
                if (a.providerId === 'eh' && b.providerId === 'eh')
                    return (b.rating ?? 0) - (a.rating ?? 0)
                return (b.totalLikes ?? 0) - (a.totalLikes ?? 0)
            })
        }
        return records.slice(0, Math.min(query.limit ?? 100, 1000))
    }

    async recommendations(`,
'discover method')
  text = replaceRegex(text,
/    async checkUpdates\(comicIds\?: string\[\]\) \{[\s\S]*?\n    \}\n\n    enqueueDownload\(/,
`    async checkUpdates(comicIds?: string[]) {
        const providerService = new ProviderService(
            () => this.connect(),
            this.database
        )
        const ids = comicIds?.length
            ? comicIds
            : this.database
                  .listComics({ limit: 5000 })
                  .filter((comic) => comic.downloadedPictures > 0)
                  .map((comic) => comic.comicId)
        const findings = []
        for (const comicId of ids) {
            findings.push(
                await checkComicUpdates(
                    this.database,
                    {
                        episodes: async (id) =>
                            (await providerService.getEpisodes(id)).map(
                                (episode) => ({
                                    id: episode.id || episode._id || '',
                                    order: episode.order,
                                    title: episode.title,
                                    updatedAt: episode.updated_at
                                })
                            ).filter((episode) => episode.id)
                    },
                    comicId
                )
            )
        }
        return findings
    }

    enqueueDownload(`,
'check updates method')
  const start = text.indexOf('    private async downloadComicNow(')
  const end = text.indexOf('\n}\n\nexport function parseEpisodeSelection', start)
  if (start < 0 || end < 0) throw new Error('downloadComicNow anchors missing')
  const downloadMethod = `    private async downloadComicNow(
        comicId: string,
        options: {
            episodeOrders?: number[]
            mediaGate: MediaRequestGate
            onProgress?: (progress: DownloadProgress) => void
            shouldStop?: () => boolean
        }
    ): Promise<DownloadResult> {
        const providerService = new ProviderService(
            () => this.connect(),
            this.database
        )
        const comic = await providerService.getComicDetails(comicId)
        if (
            comic.providerId === 'pica' &&
            comic.providerMetadata.allowDownload === false
        )
            throw new Error('The site reports that this comic is not downloadable')
        const observedEpisodes = await providerService.getEpisodes(comicId)
        for (const episode of observedEpisodes) {
            const episodeId = episode.id || episode._id
            if (!episodeId)
                throw new Error('Episode response did not include an id')
            this.database.upsertEpisode({
                id: episodeId,
                comicId,
                title: episode.title,
                order: episode.order,
                updatedAt: episode.updated_at
            })
        }
        let episodes = observedEpisodes
        if (options.episodeOrders?.length) {
            const allowed = new Set(options.episodeOrders)
            episodes = episodes.filter((episode) => allowed.has(episode.order))
        }
        const result: DownloadResult = {
            comicId,
            title: comic.title.trim(),
            episodes: episodes.length,
            pictures: 0,
            downloaded: 0,
            skipped: 0,
            completed: 0,
            bytes: 0
        }
        const work: Array<{
            picture: Picture
            pictureId: string
            episodeId: string
            episodeTitle: string
            file: string
        }> = []
        for (const episode of episodes) {
            const episodeId = episode.id || episode._id
            if (!episodeId)
                throw new Error('Episode response did not include an id')
            const pictures = await providerService.getEpisodePages(comicId, episode)
            const stored = this.database.getComic(comicId)
            const episodeDir = renderLibraryPath(
                path.join(this.dataDir, 'library'),
                process.env.PICA_LIBRARY_PATH_TEMPLATE ?? defaultLibraryTemplate,
                {
                    author:
                        stored?.canonicalAuthor ?? comic.author ?? 'Unknown author',
                    title: comic.title,
                    comic_id: comicId,
                    chapter_order: String(episode.order).padStart(4, '0'),
                    chapter: episode.title || episodeId
                }
            )
            pictures.forEach((picture, index) => {
                const pictureId =
                    picture.id ||
                    String((picture as Picture & { _id?: string })._id ?? '')
                if (!pictureId)
                    throw new Error('Picture response did not include an id')
                this.database.upsertPicture({
                    id: pictureId,
                    comicId,
                    episodeId,
                    position: index + 1,
                    originalName: picture.media.originalName,
                    mediaPath: picture.media.path,
                    fileServer: picture.media.fileServer
                })
                work.push({
                    picture,
                    pictureId,
                    episodeId,
                    episodeTitle: episode.title,
                    file: path.join(
                        episodeDir,
                        safePathSegment(picture.name, \`\${index + 1}.jpg\`)
                    )
                })
            })
        }
        const validExisting = new Map<string, string>()
        for (const item of work) {
            const previous = this.database.pictureDownloadState(item.pictureId)
            const existing =
                previous?.status === 'completed' &&
                previous.localPath &&
                fs.existsSync(previous.localPath)
                    ? previous.localPath
                    : fs.existsSync(item.file)
                      ? item.file
                      : null
            if (existing && fs.statSync(existing).size > 0)
                validExisting.set(item.pictureId, existing)
        }
        let completed = validExisting.size
        const completedPictureIds = new Set(validExisting.keys())
        let cumulativeBytes = [...validExisting.keys()].reduce(
            (total, pictureId) =>
                total + (this.database.pictureDownloadState(pictureId)?.byteSize ?? 0),
            0
        )
        result.skipped = completed
        result.pictures = work.length
        let attemptFailed = false
        const settled = await Promise.allSettled(
            work.map(async (item) => {
                if (options.shouldStop?.()) return
                const existing = validExisting.get(item.pictureId)
                if (existing) {
                    const data = fs.readFileSync(existing)
                    this.database.markPictureDownloaded(
                        item.pictureId,
                        existing,
                        data.byteLength,
                        createHash('sha256').update(data).digest('hex')
                    )
                    return
                }
                await options.mediaGate.run(async () => {
                    if (attemptFailed || options.shouldStop?.()) return
                    try {
                        const image = await providerService.fetchPage(
                            item.picture.url,
                            64 * 1024 * 1024
                        )
                        const extension =
                            image.contentType === 'image/png'
                                ? '.png'
                                : image.contentType === 'image/webp'
                                  ? '.webp'
                                  : image.contentType === 'image/gif'
                                    ? '.gif'
                                    : image.contentType === 'image/avif'
                                      ? '.avif'
                                      : '.jpg'
                        const target =
                            comic.providerId === 'eh'
                                ? item.file.replace(/\.[^.]+$/, extension)
                                : item.file
                        await fs.promises.mkdir(path.dirname(target), {
                            recursive: true
                        })
                        const partial = \`\${target}.part\`
                        await fs.promises.writeFile(partial, image.data)
                        await fs.promises.rename(partial, target)
                        const sha256 = createHash('sha256')
                            .update(image.data)
                            .digest('hex')
                        this.database.markPictureDownloaded(
                            item.pictureId,
                            target,
                            image.data.byteLength,
                            sha256
                        )
                        result.downloaded += 1
                        completedPictureIds.add(item.pictureId)
                        cumulativeBytes += image.data.byteLength
                        completed += 1
                        options.onProgress?.({
                            comicId,
                            comicTitle: comic.title,
                            episodeId: item.episodeId,
                            episodeTitle: item.episodeTitle,
                            completed,
                            total: work.length,
                            bytes: cumulativeBytes,
                            file: target
                        })
                    } catch (error) {
                        attemptFailed = true
                        throw error
                    }
                })
            })
        )
        result.completed = completedPictureIds.size
        result.bytes = [...completedPictureIds].reduce(
            (total, pictureId) =>
                total + (this.database.pictureDownloadState(pictureId)?.byteSize ?? 0),
            0
        )
        const failure = settled.find(
            (item): item is PromiseRejectedResult => item.status === 'rejected'
        )
        if (failure) throw failure.reason
        return result
    }
`
  text = text.slice(0, start) + downloadMethod + text.slice(end)
  write(file, text)
}

// Online reader accepts provider-scoped E-H IDs without weakening legacy validation.
{
  const file = 'src/services/online-reader-service.ts'
  let text = read(file)
  text = replaceOnce(text,
`        if (!/^[A-Za-z0-9_-]{1,128}$/.test(value))
            throw new Error(\`Invalid \${label}\`)
`,
`        if (
            !/^[A-Za-z0-9_-]{1,128}$/.test(value) &&
            !/^eh:\\d+:[0-9a-f]{10}$/i.test(value)
        )
            throw new Error(\`Invalid \${label}\`)
`, 'online reader E-H id')
  write(file, text)
}

// API exposes provider capabilities and source selection.
{
  const file = 'src/library/server.ts'
  let text = read(file)
  text = replaceOnce(text,
`                return json(
                    response,
                    200,
                    appCapabilities(
                        providerService.capabilities.favoriteMutation
                    )
                )
`,
`                return json(response, 200, {
                    ...appCapabilities(
                        providerService.capabilities.favoriteMutation
                    ),
                    providers: providerService.providerStatus()
                })
`, 'provider capabilities API')
  text = replaceOnce(text,
`                        limit: Number(input.limit ?? 100)
`,
`                        limit: Number(input.limit ?? 100),
                        providers: stringList(input.providers).filter(
                            (value): value is 'pica' | 'eh' =>
                                value === 'pica' || value === 'eh'
                        )
`, 'search providers API')
  write(file, text)
}

// Desktop search UI can select all/Pica/E-H and labels provider-specific popularity.
{
  const file = 'web/index.html'
  let text = read(file)
  text = replaceOnce(text,
`                            <h2>站内搜索</h2>
                            <p>按关键词和标签查找并排序。</p>
`,
`                            <h2>在线发现</h2>
                            <p>Pica 与 E-H 共用本地书库；E-H 公共搜索无需额外账号。</p>
`, 'search heading')
  text = replaceOnce(text,
`                        <input id="search-tags" placeholder="标签，逗号分隔" />
                        <select id="search-sort">
`,
`                        <input id="search-tags" placeholder="标签，逗号分隔" />
                        <select id="search-provider">
                            <option value="all">Pica + E-H</option>
                            <option value="pica">仅 Pica</option>
                            <option value="eh">仅 E-H</option>
                        </select>
                        <select id="search-sort">
`, 'search provider selector')
  write(file, text)
}

{
  const file = 'web/app.js'
  let text = read(file)
  text = replaceOnce(text,
`        const records = await post('/api/v1/search', {
            keyword: $('#search-keyword').value,
            tags: splitList($('#search-tags').value),
            sort: $('#search-sort').value,
            limit: 100
        })
`,
`        const providerChoice = $('#search-provider').value
        const records = await post('/api/v1/search', {
            keyword: $('#search-keyword').value,
            tags: splitList($('#search-tags').value),
            providers:
                providerChoice === 'pica'
                    ? ['pica']
                    : providerChoice === 'eh'
                      ? ['eh']
                      : ['pica', 'eh'],
            sort: $('#search-sort').value,
            limit: 100
        })
`, 'web search providers')
  text = replaceOnce(text,
`            const comic = item.comic || item
            return \`<article class="result"`,
`            const comic = item.comic || item
            const providerId =
                comic.providerId ||
                (String(comic.comicId || '').startsWith('eh:') ? 'eh' : 'pica')
            const providerLabel = providerId === 'eh' ? 'E-H' : 'Pica'
            const popularity =
                providerId === 'eh'
                    ? \`E-H · \${Number.isFinite(Number(comic.rating)) ? '★ ' + Number(comic.rating).toFixed(2) : '公开元数据'}\`
                    : t('message.popularity', {
                          likes: Number(comic.totalLikes || 0).toLocaleString(),
                          views: Number(comic.totalViews || 0).toLocaleString()
                      })
            return \`<article class="result"`, 'provider render variables')
  text = replaceOnce(text,
`                ${recommendation ? '' : \`<p>${t('message.popularity', { likes: Number(comic.totalLikes || 0).toLocaleString(), views: Number(comic.totalViews || 0).toLocaleString() })}</p>\`}
                <div class="detail-actions"><button data-result-detail="${escapeHtml(comic.comicId)}" data-result-context="${context}">${t('result.details')}</button><button data-result-download="${escapeHtml(comic.comicId)}">${t('action.download')}</button>${state.mode === 'connected' && state.capabilities?.features?.providerFavoriteMutation ? \`<button data-result-favorite="${escapeHtml(comic.comicId)}">${t('result.favorite')}</button>\` : ''}</div>
`,
`                <p class="comic-meta">${escapeHtml(providerLabel)}${recommendation ? '' : \` · ${escapeHtml(popularity)}\`}</p>
                <div class="detail-actions"><button data-result-detail="${escapeHtml(comic.comicId)}" data-result-context="${context}">${t('result.details')}</button><button data-result-download="${escapeHtml(comic.comicId)}">${t('action.download')}</button>${state.mode === 'connected' && state.capabilities?.features?.providerFavoriteMutation ? \`<button data-result-favorite="${escapeHtml(comic.comicId)}">${providerId === 'eh' ? '本地收藏' : t('result.favorite')}</button>\` : ''}</div>
`, 'provider result card')
  write(file, text)
}

console.log('EH_DESKTOP_V1_PATCH=APPLIED')
