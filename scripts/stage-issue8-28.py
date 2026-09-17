from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, got {count}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'src/storage/sqlite/migrations.ts',
    """    {
        version: 10,
        name: 'recommendation_v4_visual_style',
        up: `
            CREATE TABLE IF NOT EXISTS visual_embeddings (
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                model_id TEXT NOT NULL,
                model_version TEXT NOT NULL,
                sampling_policy_version TEXT NOT NULL,
                embedding_kind TEXT NOT NULL CHECK (embedding_kind IN ('body','cover')),
                vector_json TEXT NOT NULL,
                dimension INTEGER NOT NULL,
                source_kind TEXT NOT NULL CHECK (source_kind IN ('LOCAL_PAGES','REMOTE_PAGES','COVER_ONLY')),
                sample_count INTEGER NOT NULL DEFAULT 1,
                confidence REAL NOT NULL DEFAULT 0,
                generated_at TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                PRIMARY KEY (comic_id, model_id, model_version, sampling_policy_version, embedding_kind)
            );
            CREATE INDEX IF NOT EXISTS idx_visual_embeddings_model
                ON visual_embeddings(model_id, model_version, embedding_kind, generated_at);
            CREATE INDEX IF NOT EXISTS idx_visual_embeddings_comic
                ON visual_embeddings(comic_id, embedding_kind);
        `
    }
]""",
    """    {
        version: 10,
        name: 'recommendation_v4_visual_style',
        up: `
            CREATE TABLE IF NOT EXISTS visual_embeddings (
                comic_id TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
                model_id TEXT NOT NULL,
                model_version TEXT NOT NULL,
                sampling_policy_version TEXT NOT NULL,
                embedding_kind TEXT NOT NULL CHECK (embedding_kind IN ('body','cover')),
                vector_json TEXT NOT NULL,
                dimension INTEGER NOT NULL,
                source_kind TEXT NOT NULL CHECK (source_kind IN ('LOCAL_PAGES','REMOTE_PAGES','COVER_ONLY')),
                sample_count INTEGER NOT NULL DEFAULT 1,
                confidence REAL NOT NULL DEFAULT 0,
                generated_at TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                PRIMARY KEY (comic_id, model_id, model_version, sampling_policy_version, embedding_kind)
            );
            CREATE INDEX IF NOT EXISTS idx_visual_embeddings_model
                ON visual_embeddings(model_id, model_version, embedding_kind, generated_at);
            CREATE INDEX IF NOT EXISTS idx_visual_embeddings_comic
                ON visual_embeddings(comic_id, embedding_kind);
        `
    },
    {
        version: 11,
        name: 'download_queue_scale_indexes',
        up: `
            CREATE INDEX IF NOT EXISTS idx_download_jobs_status_runner_priority_created
                ON download_jobs(status, runner, priority DESC, created_at);
            CREATE INDEX IF NOT EXISTS idx_download_jobs_status_created
                ON download_jobs(status, created_at DESC);
        `
    }
]""",
)

old_jobs = """    listDownloadJobs(status?: DownloadStatus): DownloadJob[] {
        const rows = status
            ? (this.db
                  .prepare(
                      `${downloadJobSelect} WHERE j.status = ?
                       ORDER BY j.priority DESC, j.created_at`
                  )
                  .all(status) as SqlRow[])
            : (this.db
                  .prepare(
                      `${downloadJobSelect}
                       ORDER BY j.created_at DESC`
                  )
                  .all() as SqlRow[])
        return rows.map(downloadJob)
    }

    nextDownloadJobs(limit: number, runner?: DownloadJob['runner']) {"""
new_jobs = """    listDownloadJobs(status?: DownloadStatus): DownloadJob[] {
        const rows = status
            ? (this.db
                  .prepare(
                      `${downloadJobSelect} WHERE j.status = ?
                       ORDER BY j.priority DESC, j.created_at`
                  )
                  .all(status) as SqlRow[])
            : (this.db
                  .prepare(
                      `${downloadJobSelect}
                       ORDER BY j.created_at DESC`
                  )
                  .all() as SqlRow[])
        return rows.map(downloadJob)
    }

    downloadJobSummary() {
        const rows = this.db
            .prepare(
                `SELECT status, COUNT(*) AS count
                 FROM download_jobs GROUP BY status`
            )
            .all() as SqlRow[]
        const counts: Partial<Record<DownloadStatus, number>> = {}
        for (const row of rows)
            counts[String(row.status) as DownloadStatus] = numberValue(row.count)
        const total = rows.reduce((sum, row) => sum + numberValue(row.count), 0)
        const finished = (counts.COMPLETED ?? 0) + (counts.CANCELLED ?? 0)
        return { total, active: total - finished, finished, counts }
    }

    listDownloadJobsPage(input: {
        view?: 'active' | 'finished' | 'all'
        limit?: number
        offset?: number
        runner?: DownloadJob['runner']
    } = {}) {
        const view: 'active' | 'finished' | 'all' =
            input.view === 'finished' || input.view === 'all' ? input.view : 'active'
        const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)))
        const offset = Math.max(0, Math.floor(input.offset ?? 0))
        const clauses: string[] = []
        const params: Array<string | number> = []
        if (view === 'active')
            clauses.push("j.status NOT IN ('COMPLETED','CANCELLED')")
        else if (view === 'finished')
            clauses.push("j.status IN ('COMPLETED','CANCELLED')")
        if (input.runner) {
            clauses.push('j.runner = ?')
            params.push(input.runner)
        }
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
        const order = view === 'finished'
            ? 'ORDER BY COALESCE(j.finished_at, j.created_at) DESC'
            : `ORDER BY CASE j.status
                   WHEN 'RUNNING' THEN 0 WHEN 'PREPARING' THEN 1
                   WHEN 'RETRY_WAIT' THEN 2 WHEN 'QUEUED' THEN 3
                   WHEN 'PAUSED' THEN 4 WHEN 'FAILED' THEN 5 ELSE 6 END,
                   j.priority DESC, j.created_at DESC`
        const rows = this.db
            .prepare(`${downloadJobSelect} ${where} ${order} LIMIT ? OFFSET ?`)
            .all(...params, limit, offset) as SqlRow[]
        const count = this.db
            .prepare(`SELECT COUNT(*) AS count FROM download_jobs j ${where}`)
            .get(...params) as SqlRow
        return { items: rows.map(downloadJob), total: numberValue(count.count), limit, offset, view }
    }

    hasActiveDownloadJobs(runner?: DownloadJob['runner']) {
        const row = runner
            ? (this.db.prepare(
                  `SELECT 1 AS found FROM download_jobs
                   WHERE runner = ? AND status IN ('QUEUED','PREPARING','RUNNING','RETRY_WAIT')
                   LIMIT 1`
              ).get(runner) as SqlRow | undefined)
            : (this.db.prepare(
                  `SELECT 1 AS found FROM download_jobs
                   WHERE status IN ('QUEUED','PREPARING','RUNNING','RETRY_WAIT') LIMIT 1`
              ).get() as SqlRow | undefined)
        return Boolean(row)
    }

    nextDownloadJobs(limit: number, runner?: DownloadJob['runner']) {"""
replace_once('src/library/database.ts', old_jobs, new_jobs)

replace_once(
    'src/library/service.ts',
    """    hasActiveLocalDownloads() {
        const active = new Set(['QUEUED', 'PREPARING', 'RUNNING', 'RETRY_WAIT'])
        return this.database
            .listDownloadJobs()
            .some((job) => job.runner === 'LOCAL' && active.has(job.status))
    }""",
    """    hasActiveLocalDownloads() {
        return this.database.hasActiveDownloadJobs('LOCAL')
    }""",
)
replace_once(
    'src/library/service.ts',
    """            const stored = this.database
                .listComics({ limit: 5000 })
                .find((item) => item.comicId === comicId)""",
    """            const stored = this.database.getComic(comicId)""",
)

provider_anchor = """    providerService() {
        return new ProviderService(
            () => this.connect(),
            this.database,
            this.ehProvider
        )
    }

    setEhSession(session?: EhSession | null) {"""
provider_new = """    providerService() {
        return new ProviderService(
            () => this.connect(),
            this.database,
            this.ehProvider
        )
    }

    async refreshAuthorWorks(authorId: string) {
        const author = this.database.listAuthors().find((item) => item.id === authorId)
        if (!author) throw new Error('作者身份不存在或已经变化')
        const catalog = this.database.listComics({ limit: 10000 })
        const knownWorks = catalog.filter((comic) => comic.authorId === authorId)
        const identityKeys = new Set(
            [author.canonicalName, ...author.aliases].map(normalizeAuthorKey).filter(Boolean)
        )
        const picaQuery =
            knownWorks.find((comic) =>
                comic.providerId === 'pica' && identityKeys.has(normalizeAuthorKey(comic.author))
            )?.author || author.canonicalName
        const ehQueryName =
            knownWorks.find((comic) =>
                comic.providerId === 'eh' && identityKeys.has(normalizeAuthorKey(comic.author))
            )?.author || author.canonicalName
        const provider = this.providerService()
        const sources: Record<string, { count: number; error?: string }> = {}
        const run = async (source: 'pica' | 'eh' | 'exh', keyword: string) => {
            try {
                const records = await provider.search({ keyword, limit: 100 }, [source], 'discover')
                sources[source] = { count: records.length }
            } catch (error) {
                sources[source] = { count: 0, error: error instanceof Error ? error.message : String(error) }
            }
        }
        if (picaQuery.trim()) await run('pica', picaQuery.trim())
        const cleanEh = ehQueryName.replaceAll('"', '').trim()
        if (cleanEh) await run('eh', `artist:"${cleanEh}"`)
        if (cleanEh && this.ehProvider.hasSession()) {
            const capability = await this.probeExHentai().catch(() => 'NETWORK_ERROR')
            if (capability === 'AVAILABLE') await run('exh', `artist:"${cleanEh}"`)
            else sources.exh = { count: 0, error: capability }
        }
        const refreshedWorks = this.database
            .listComics({ limit: 10000 })
            .filter((comic) => comic.authorId === authorId)
        return {
            authorId,
            canonicalName: author.canonicalName,
            knownBefore: knownWorks.length,
            knownAfter: refreshedWorks.length,
            sources
        }
    }

    setEhSession(session?: EhSession | null) {"""
replace_once('src/library/service.ts', provider_anchor, provider_new)

replace_once(
    'src/library/server.ts',
    """            if (
                url.pathname === '/api/v1/authors' &&
                request.method === 'GET'
            ) {
                return json(response, 200, options.database.listAuthors())
            }
            if (
                url.pathname === '/api/v1/authors/merge' &&""",
    """            if (
                url.pathname === '/api/v1/authors' &&
                request.method === 'GET'
            ) {
                return json(response, 200, options.database.listAuthors())
            }
            const authorRefresh = url.pathname.match(
                /^\\/api\\/v1\\/authors\\/([^/]+)\\/refresh$/
            )
            if (authorRefresh && request.method === 'POST')
                return json(
                    response,
                    200,
                    await options.service.refreshAuthorWorks(decodeURIComponent(authorRefresh[1]))
                )
            if (
                url.pathname === '/api/v1/authors/merge' &&""",
)
replace_once(
    'src/library/server.ts',
    """            if (
                url.pathname === '/api/v1/downloads' &&
                request.method === 'GET'
            ) {
                return json(response, 200, options.database.listDownloadJobs())
            }
            if (
                url.pathname === '/api/v1/downloads/run' &&""",
    """            if (
                url.pathname === '/api/v1/downloads/summary' &&
                request.method === 'GET'
            )
                return json(response, 200, options.database.downloadJobSummary())
            if (
                url.pathname === '/api/v1/downloads/page' &&
                request.method === 'GET'
            ) {
                const rawView = String(url.searchParams.get('view') ?? 'active')
                const view = rawView === 'finished' || rawView === 'all' ? rawView : 'active'
                return json(
                    response,
                    200,
                    options.database.listDownloadJobsPage({
                        view,
                        limit: Number(url.searchParams.get('limit') ?? 100),
                        offset: Number(url.searchParams.get('offset') ?? 0),
                        runner: url.searchParams.get('runner') === 'GITHUB'
                            ? 'GITHUB'
                            : url.searchParams.get('runner') === 'LOCAL'
                              ? 'LOCAL'
                              : undefined
                    })
                )
            }
            if (
                url.pathname === '/api/v1/downloads' &&
                request.method === 'GET'
            ) {
                return json(response, 200, options.database.listDownloadJobs())
            }
            if (
                url.pathname === '/api/v1/downloads/run' &&""",
)

old_author = """async function showAuthorWorks(dialog, authorId, name) {
    const content = dialog.querySelector('.v040-dialog-content')
    content.innerHTML = '<p>正在读取作品…</p>'
    try {
        const result = await libraryQuery({scope:'catalog',authorIds:[authorId],limit:5000,offset:0,sort:'latest'})
        content.innerHTML = `<button type="button" id="v040-author-back">← 作者目录</button><h3>${escapeHtml(name)}</h3><p class="status">${result.total} 部作品 · 默认合并 Pica 与 E-H。</p><div class="v040-author-works">${(result.items||[]).map((item)=>`<button type="button" data-work-id="${escapeHtml(item.comicId)}" data-work-title="${escapeHtml(item.title)}" data-work-provider="${escapeHtml(item.providerId||'')}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.providerId==='eh'?'E-H':'Pica')}</span></button>`).join('')}</div>`
        $('#v040-author-back').onclick = () => showAuthorDirectory(name)
        content.querySelectorAll('[data-work-id]').forEach((button)=>button.onclick=()=>{
            dialog.close();
            document.querySelector('nav button[data-view="library"]')?.click()
            const filter=$('#filter-text'); if(filter) filter.value=button.dataset.workTitle
            const provider=$('#v040-library-provider'); if(provider) provider.value=button.dataset.workProvider==='eh'?'eh':'pica'
            $('#apply-filter')?.click()
        })
    } catch (error) { content.innerHTML = `<p class="status">${escapeHtml(error.message)}</p>` }
}"""
new_author = """async function showAuthorWorks(dialog, authorId, name) {
    const content = dialog.querySelector('.v040-dialog-content')
    const render = async (note = '') => {
        const result = await libraryQuery({scope:'catalog',authorIds:[authorId],limit:5000,offset:0,sort:'latest'})
        content.innerHTML = `<button type="button" id="v040-author-back">← 作者目录</button><h3>${escapeHtml(name)}</h3><p class="status" id="v040-author-refresh-state">${result.total} 部作品 · ${note || '正在联网补全 Pica / E-H 作者作品…'}</p><div class="v040-author-works">${(result.items||[]).map((item)=>`<button type="button" data-work-id="${escapeHtml(item.comicId)}" data-work-title="${escapeHtml(item.title)}" data-work-provider="${escapeHtml(item.providerId||'')}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.providerId==='eh'?'E-H':'Pica')}</span></button>`).join('')}</div>`
        $('#v040-author-back').onclick = () => showAuthorDirectory(name)
        content.querySelectorAll('[data-work-id]').forEach((button)=>button.onclick=()=>{
            dialog.close();
            document.querySelector('nav button[data-view="library"]')?.click()
            const filter=$('#filter-text'); if(filter) filter.value=button.dataset.workTitle
            const provider=$('#v040-library-provider'); if(provider) provider.value=button.dataset.workProvider==='eh'?'eh':'pica'
            $('#apply-filter')?.click()
        })
        return result
    }
    content.innerHTML = '<p>正在读取作品…</p>'
    try {
        await render()
        const response = await rawFetch(`/api/v1/authors/${encodeURIComponent(authorId)}/refresh`, {
            method:'POST', headers:{'content-type':'application/json'}, body:'{}'
        })
        const refresh = await response.json()
        if (!response.ok) throw new Error(refresh.error || `HTTP ${response.status}`)
        const sources = Object.entries(refresh.sources || {})
            .map(([source,value])=>`${source.toUpperCase()}: ${Number(value?.count||0)}${value?.error?'（失败）':''}`)
            .join(' · ')
        await render(`在线补全完成${sources ? ` · ${sources}` : ''}`)
    } catch (error) {
        const state = $('#v040-author-refresh-state')
        if (state) state.textContent = `已显示本地作品 · 在线补全失败：${error.message}`
        else content.innerHTML = `<p class="status">${escapeHtml(error.message)}</p>`
    }
}"""
replace_once('web/v040-parity.js', old_author, new_author)

app = Path('web/app.js')
text = app.read_text(encoding='utf-8')
start = text.index('async function loadJobs() {')
end = text.index('\nfunction formatBytes(bytes) {', start)
new_load_jobs = r'''async function loadJobs() {
    if (downloadPollBusy) return
    downloadPollBusy = true
    try {
        if (state.mode === 'lite') {
            $('#job-list').innerHTML = state.queue.map((job) =>
                `<article class="list-item"><div class="grow"><strong>${escapeHtml(job.comicId)}</strong><p>${escapeHtml(job.source || 'library')} · ${t('message.litePlan')}</p></div></article>`
            ).join('') || `<article class="notice">${t('message.emptyPlan')}</article>`
            return
        }
        const showFinished = localStorage.getItem('pica-show-finished-downloads') === 'true'
        const visibleLimit = Math.max(100, Number(state.downloadVisibleLimit || 100))
        const [summary, page] = await Promise.all([
            api('/api/v1/downloads/summary'),
            api(`/api/v1/downloads/page?view=${showFinished ? 'all' : 'active'}&limit=${visibleLimit}&offset=0`)
        ])
        const jobs = Array.isArray(page.items) ? page.items : []
        const counts = summary.counts || {}
        $('#download-summary').innerHTML = [
            [t('downloads.inProgress'), Number(counts.RUNNING || 0) + Number(counts.PREPARING || 0)],
            [t('downloads.waiting'), Number(counts.QUEUED || 0) + Number(counts.RETRY_WAIT || 0)],
            [t('downloads.paused'), Number(counts.PAUSED || 0)],
            [t('downloads.failed'), Number(counts.FAILED || 0)],
            [t('downloads.completed'), Number(counts.COMPLETED || 0)]
        ].map(([label, count]) =>
            `<div class="metric"><span>${label}</span><strong>${count}</strong></div>`
        ).join('')
        const cards = jobs.map((job) => {
            const percent = job.progressTotal ? Math.round((job.progressCompleted / job.progressTotal) * 100) : 0
            const title = job.comicTitle || t('downloads.placeholderTitle')
            const chapter = job.chapterTitle || t('downloads.placeholderChapter')
            const speed = job.bytesPerSecond ? `${formatBytes(job.bytesPerSecond)}/s` : '—'
            const eta = job.bytesPerSecond && job.expectedBytes > job.bytes
                ? `${Math.ceil((job.expectedBytes - job.bytes) / job.bytesPerSecond)}s` : '—'
            return `<article class="list-item download-job-card" data-job-status="${job.status}">
                <div class="grow"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(chapter)} · ${escapeHtml(t(`status.${job.status}`))}</p><p>${t('message.pictures', { count: `${job.progressCompleted} / ${job.progressTotal || '—'}` })} · ${percent}% · ${formatBytes(job.bytes)}${job.expectedBytes ? ` / ${formatBytes(job.expectedBytes)}` : ''}</p><div class="progress"><span style="width:${percent}%"></span></div><p>${speed} · ${t('message.elapsed', { value: formatElapsed(job.startedAt) })} · ETA ${eta} · ${t('message.retryCount', { count: job.retryCount })}${job.error ? ` · ${escapeHtml(localizeError(language, job.error))}` : ''}</p></div>
                <div class="actions">${['QUEUED', 'PREPARING', 'RUNNING'].includes(job.status) ? `<button data-job-action="pause" data-job-id="${job.id}">${t('action.pause')}</button>` : ''}${job.status === 'PAUSED' ? `<button data-job-action="resume" data-job-id="${job.id}">${t('action.resume')}</button>` : ''}${job.status === 'FAILED' ? `<button data-job-action="retry" data-job-id="${job.id}">${t('action.retry')}</button>` : ''}${!['COMPLETED', 'CANCELLED'].includes(job.status) ? `<button data-job-action="cancel" data-job-id="${job.id}">${t('action.cancel')}</button>` : ''}</div>
            </article>`
        }).join('')
        $('#job-list').innerHTML = cards || `<article class="notice">${t('message.emptyQueue')}</article>`
        if (Number(page.total || 0) > jobs.length) {
            $('#job-list').insertAdjacentHTML('beforeend', `<button type="button" id="download-load-more">加载更多（${jobs.length} / ${Number(page.total || 0)}）</button>`)
            $('#download-load-more').onclick = () => {
                state.downloadVisibleLimit = visibleLimit + 100
                void loadJobs()
            }
        }
        if (Number(summary.active || 0) > 0) {
            if (!downloadPoll && activeView === 'downloads')
                downloadPoll = setInterval(() => void loadJobs(), 1000)
        } else if (downloadPoll) {
            clearInterval(downloadPoll)
            downloadPoll = null
        }
    } finally {
        downloadPollBusy = false
    }
}
'''
app.write_text(text[:start] + new_load_jobs + text[end:], encoding='utf-8')

replace_once(
    'web/alpha8-7-desktop-hub.js',
    """            if (url.origin !== location.origin || url.pathname !== '/api/v1/downloads' || method !== 'GET' || !response.ok)
                return response
            const jobs = await response.clone().json()
            if (!Array.isArray(jobs)) return response
            lastFinishedCount = jobs.filter((job) => terminalForTaskPage(String(job?.status || ''))).length
            queueMicrotask(updateFinishedControl)
            if (showFinished) return response""",
    """            if (url.origin !== location.origin || method !== 'GET' || !response.ok)
                return response
            if (url.pathname === '/api/v1/downloads/summary') {
                const summary = await response.clone().json()
                lastFinishedCount = Number(summary?.finished || 0)
                queueMicrotask(updateFinishedControl)
                return response
            }
            if (url.pathname !== '/api/v1/downloads') return response
            const jobs = await response.clone().json()
            if (!Array.isArray(jobs)) return response
            lastFinishedCount = jobs.filter((job) => terminalForTaskPage(String(job?.status || ''))).length
            queueMicrotask(updateFinishedControl)
            if (showFinished) return response""",
)

Path('test/unit/download-large-queue.test.ts').write_text(r'''import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryDatabase } from '../../src/library/database'

const directories: string[] = []
afterEach(() => {
    for (const directory of directories.splice(0))
        fs.rmSync(directory, { recursive: true, force: true })
})

function record(index: number) {
    return {
        comicId: `stress-${index}`,
        title: `Stress ${index}`,
        author: `Author ${index % 20}`,
        categories: [], tags: [], finished: false
    }
}

describe('large download queue data access', () => {
    it('summarizes 1500 jobs while returning only a bounded active page', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-queue-stress-'))
        directories.push(directory)
        const database = new LibraryDatabase(path.join(directory, 'library.db'))
        database.importCatalog(Array.from({ length: 1500 }, (_, i) => record(i)))
        const jobs = Array.from({ length: 1500 }, (_, i) =>
            database.createDownloadJob({ comicId: `stress-${i}`, runner: 'LOCAL' })
        )
        for (const job of jobs) database.transitionDownloadJob(job.id, 'QUEUED')
        for (const job of jobs.slice(0, 350)) {
            database.transitionDownloadJob(job.id, 'PREPARING')
            database.transitionDownloadJob(job.id, 'RUNNING')
            database.transitionDownloadJob(job.id, 'COMPLETED')
        }
        const summary = database.downloadJobSummary()
        const page = database.listDownloadJobsPage({ view: 'active', limit: 100 })
        expect(summary.total).toBe(1500)
        expect(summary.finished).toBe(350)
        expect(summary.active).toBe(1150)
        expect(page.total).toBe(1150)
        expect(page.items).toHaveLength(100)
        expect(database.hasActiveDownloadJobs('LOCAL')).toBe(true)
        expect(page.items.every((job) => job.status !== 'COMPLETED')).toBe(true)
        database.close()
    }, 30000)
})
''', encoding='utf-8')

Path('test/unit/issue8-28-contract.test.ts').write_text(r'''import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('issue 8 and 28 regression contracts', () => {
    it('uses bounded download summary/page endpoints in the Web UI', () => {
        const app = fs.readFileSync('web/app.js', 'utf8')
        expect(app).toContain("api('/api/v1/downloads/summary')")
        expect(app).toContain('/api/v1/downloads/page?view=')
        expect(app).toContain('downloadVisibleLimit')
        const server = fs.readFileSync('src/library/server.ts', 'utf8')
        expect(server).toContain("url.pathname === '/api/v1/downloads/summary'")
        expect(server).toContain("url.pathname === '/api/v1/downloads/page'")
    })

    it('refreshes Web author works from provider sources without manual typing', () => {
        const web = fs.readFileSync('web/v040-parity.js', 'utf8')
        expect(web).toContain('/api/v1/authors/${encodeURIComponent(authorId)}/refresh')
        expect(web).toContain('正在联网补全 Pica / E-H 作者作品')
        const service = fs.readFileSync('src/library/service.ts', 'utf8')
        expect(service).toContain('async refreshAuthorWorks(authorId: string)')
        expect(service).toContain("await run('pica', picaQuery.trim())")
        expect(service).toContain("await run('eh', `artist:\"${cleanEh}\"`)")
        expect(service).toContain("await run('exh', `artist:\"${cleanEh}\"`)")
    })
})
''', encoding='utf-8')
