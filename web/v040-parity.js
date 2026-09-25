import { copy as t, currentLanguage } from './locale-runtime.js'

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]
const rawFetch = window.fetch.bind(window)
const catalog = new Map()
const HISTORY_KEY = 'pica-v040-reading-history-v1'
const EH_SHA_URL = 'https://raw.githubusercontent.com/EhTagTranslation/DatabaseReleases/refs/heads/master/sha'
const EH_DATA_URL = 'https://raw.githubusercontent.com/EhTagTranslation/DatabaseReleases/refs/heads/master/db.text.json'
const nsLabels = new Map([
    ['female',['女性','Female','女性']],['male',['男性','Male','男性']],['mixed',['混合','Mixed','混合']],['language',['语言','Language','言語']],['parody',['原作','Parody / source','原作']],['character',['角色','Character','キャラクター']],['artist',['画师','Artist','作者']],['group',['社团','Group / circle','サークル']],['cosplayer',['Cosplayer','Cosplayer','コスプレイヤー']],['location',['地点','Location','場所']],['other',['其他','Other','その他']],['reclass',['重新分类','Reclass','再分類']]
])
const categoryLabels = new Map([
    ['Doujinshi',['同人志','Doujinshi','同人誌']],['Manga',['漫画','Manga','漫画']],['Artist CG',['画师 CG','Artist CG','Artist CG']],['Game CG',['游戏 CG','Game CG','Game CG']],['Image Set',['图片集','Image Set','画像セット']],['Cosplay',['Cosplay','Cosplay','コスプレ']],['Asian Porn',['亚洲色情','Asian Porn','Asian Porn']],['Non-H',['非 H','Non-H','Non-H']],['Western',['西方作品','Western','Western']],['Misc',['其他','Misc','その他']]
])
function localizedLabel(row, fallback='') { return row ? t(...row) : fallback }
function categoryLabel(raw){ return localizedLabel(categoryLabels.get(raw),raw) }
function namespaceLabel(raw){ return localizedLabel(nsLabels.get(raw),raw) }
const parityState = {
    provider: 'all',
    ehMode: 'latest',
    toplist: '11',
    category: '',
    language: '',
    includeTags: [],
    excludeTags: [],
    minRating: 0,
    pageFrom: 0,
    pageTo: 0,
    translations: new Map(),
    valueTranslations: new Map(),
    translationSha: '',
    translationReady: false
}

function norm(value) {
    return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase()
}
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}
function splitTags(value) {
    return String(value ?? '').split(',').map((v) => v.trim()).filter(Boolean)
}
function parseJsonBody(init) {
    try { return typeof init?.body === 'string' ? JSON.parse(init.body) : null } catch { return null }
}
function cacheRecords(value) {
    const rows = Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : []
    for (const item of rows) if (item?.comicId) catalog.set(item.comicId, item)
}
function historyRows() {
    try {
        const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
        return Array.isArray(value) ? value : []
    } catch { return [] }
}
function saveHistory(rows) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(rows.slice(0, 1000)))
}
function recordHistory(input) {
    const comicId = String(input.comicId || '')
    const episodeId = String(input.episodeId || '')
    if (!comicId || !episodeId) return
    const now = String(input.updatedAt || new Date().toISOString())
    const day = now.slice(0, 10)
    const item = catalog.get(comicId) || {}
    const rows = historyRows()
    const last = rows[0]
    const withinSession = last && !last.legacySnapshot && last.comicId === comicId && last.episodeId === episodeId && last.lastReadAt?.slice(0,10) === day && Math.abs(new Date(now) - new Date(last.lastReadAt)) < 30 * 60 * 1000
    if (withinSession) {
        last.lastReadAt = now
        last.lastPage = Math.max(0, Number(input.pageIndex ?? last.lastPage ?? 0))
        last.title = last.title || item.title || 'Manga'
        last.author = last.author || item.canonicalAuthor || item.author || ''
        saveHistory(rows)
        return
    }
    rows.unshift({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        comicId,
        episodeId,
        title: item.title || input.title || 'Manga',
        author: item.canonicalAuthor || item.author || input.author || '',
        providerId: item.providerId || (comicId.startsWith('eh:') ? 'eh' : 'pica'),
        firstPage: Math.max(0, Number(input.pageIndex || 0)),
        lastPage: Math.max(0, Number(input.pageIndex || 0)),
        startedAt: now,
        lastReadAt: now,
        legacySnapshot: false
    })
    saveHistory(rows)
}

window.fetch = async (input, init = {}) => {
    let nextInit = init
    const url = typeof input === 'string' ? input : input?.url || ''
    const body = parseJsonBody(init)
    if (body && url.includes('/api/v1/library/query')) {
        const provider = $('#v040-library-provider')?.value || 'all'
        if (provider !== 'all') body.providerIds = [provider]
        nextInit = { ...init, body: JSON.stringify(body) }
    }
    if (body && url.endsWith('/api/v1/search')) {
        const provider = $('#search-provider')?.value || 'all'
        if (provider === 'eh' || provider === 'exh') {
            body.ehMode = parityState.ehMode
            body.ehToplist = parityState.toplist
            body.ehLanguage = parityState.language
            body.ehExcludeTags = parityState.excludeTags
            body.ehMinRating = parityState.minRating
            body.ehPageFrom = parityState.pageFrom
            body.ehPageTo = parityState.pageTo
            if (parityState.category) body.categories = [parityState.category]
            if (parityState.includeTags.length) body.tags = [...new Set([...(body.tags || []), ...parityState.includeTags])]
        }
        nextInit = { ...init, body: JSON.stringify(body) }
    }
    if (body && url.includes('/api/v1/online-reader/progress') && (init.method || 'GET').toUpperCase() === 'POST') recordHistory(body)
    if (body && url.includes('/api/v1/recommendation-events') && /^reader_(open|progress|complete)$/.test(String(body.eventType || ''))) {
        recordHistory({ comicId: body.comicId, episodeId: body.metadata?.episodeId || body.episodeId, pageIndex: body.metadata?.pageIndex ?? body.pageIndex, updatedAt: body.occurredAt })
    }
    const response = await rawFetch(input, nextInit)
    if (url.includes('/api/v1/search') || url.includes('/api/v1/library/query')) {
        response.clone().json().then(cacheRecords).catch(() => undefined)
    }
    return response
}

async function libraryQuery(value) {
    const response = await rawFetch('/api/v1/library/query', {
        method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(value)
    })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`)
    cacheRecords(json)
    return json
}

function installLibraryParity() {
    const section = $('#library')
    const toolbar = section?.querySelector('[data-control-scope="library"]')
    if (!section || !toolbar || $('#v040-library-provider')) return
    const provider = document.createElement('select')
    provider.id = 'v040-library-provider'
    provider.innerHTML = `<option value="all">${t('来源：全部','Source: All','配信元：すべて')}</option><option value="pica">${t('来源：Pica','Source: Pica','配信元：Pica')}</option><option value="eh">${t('来源：E-H','Source: E-H','配信元：E-H')}</option>`
    const scope = $('#filter-scope')
    scope?.insertAdjacentElement('afterend', provider)
    provider.onchange = () => $('#apply-filter')?.click()

    const more = document.createElement('details')
    more.className = 'v040-library-more'
    more.innerHTML = `<summary>${t('更多筛选与显示','More filters & display','その他の絞り込みと表示')}</summary><div class="v040-library-more-body"></div>`
    const body = more.querySelector('div')
    const move = ['#filter-author-input','#filter-tag','#filter-tag-mode','#view-grid','#view-list','.grid-size-controls','#cover-toggle']
    for (const selector of move) {
        const node = toolbar.querySelector(selector) || document.querySelector(selector)
        if (!node) continue
        const container = node.closest('label,.control-group') || node
        if (!body.contains(container)) body.append(container)
    }
    toolbar.append(more)
    toolbar.classList.add('v040-library-toolbar')

    const headingActions = section.querySelector('.page-heading .actions')
    if (headingActions && !$('#v040-history-button')) {
        const button = document.createElement('button')
        button.id = 'v040-history-button'
        button.textContent = t('阅读历史','Reading history','閲覧履歴')
        button.onclick = () => openHistory()
        headingActions.prepend(button)
    }
}

async function loadEhTranslations() {
    if (parityState.translationReady) return
    try {
        const [shaResponse, dataResponse] = await Promise.all([rawFetch(EH_SHA_URL), rawFetch(EH_DATA_URL)])
        if (!shaResponse.ok || !dataResponse.ok) throw new Error('translation unavailable')
        parityState.translationSha = (await shaResponse.text()).trim()
        const root = await dataResponse.json()
        const valueMap = new Map()
        for (const group of root.data || []) {
            const ns = norm(group.namespace)
            if (!ns || ns === 'rows') continue
            for (const [raw, row] of Object.entries(group.data || {})) {
                const key = `${ns}:${norm(raw)}`
                const zh = String(row?.name || '').trim()
                if (!zh) continue
                parityState.translations.set(key, zh)
                const rawKey = norm(raw)
                const prior = valueMap.get(rawKey)
                valueMap.set(rawKey, prior && prior !== zh ? null : zh)
            }
        }
        for (const [key, value] of valueMap) if (value) parityState.valueTranslations.set(key, value)
        parityState.translationReady = parityState.translations.size > 1000
        translateVisibleTags()
        installTagSuggestions()
    } catch {
        parityState.translationReady = false
    }
}
function translateValue(raw) {
    if (currentLanguage() !== 'zh-CN') return raw
    return parityState.valueTranslations.get(norm(raw)) || raw
}
function elementsWithin(root, selector) {
    const matches = []
    if (root instanceof Element && root.matches(selector)) matches.push(root)
    if (root?.querySelectorAll) matches.push(...root.querySelectorAll(selector))
    return matches
}
function translateVisibleTags(root = document) {
    for (const tag of elementsWithin(root, '.tag')) {
        const raw = tag.dataset.rawValue || tag.textContent.trim()
        tag.dataset.rawValue = raw
        const translated = translateValue(raw)
        if (translated !== raw) {
            if (tag.textContent !== translated) tag.textContent = translated
            if (tag.title !== raw) tag.title = raw
        }
    }
    for (const node of elementsWithin(root, '[data-eh-category]')) {
        const raw = node.dataset.ehCategory
        const translated = categoryLabel(raw)
        if (node.textContent !== translated) node.textContent = translated
    }
}
function installTagSuggestions() {
    const input = $('#v040-eh-include-tags')
    const list = $('#v040-eh-tag-options')
    if (!input || !list || !parityState.translationReady) return
    input.oninput = () => {
        const q = norm(input.value.split(',').pop())
        if (!q) { list.innerHTML = ''; return }
        let shown = 0
        const html = []
        for (const [canonical, zh] of parityState.translations) {
            if (!canonical.includes(q) && !norm(zh).includes(q)) continue
            const [ns, value] = canonical.split(':',2)
            html.push(currentLanguage()==='zh-CN'
                ? `<option value="${escapeHtml(canonical)}">${escapeHtml(namespaceLabel(ns))} · ${escapeHtml(zh)} · ${escapeHtml(value)}</option>`
                : `<option value="${escapeHtml(canonical)}">${escapeHtml(namespaceLabel(ns))} · ${escapeHtml(value)}</option>`)
            if (++shown >= 40) break
        }
        list.innerHTML = html.join('')
    }
}

function setEhMode(mode, label) {
    parityState.ehMode = mode
    const state = $('#v040-eh-mode-state')
    if (state) state.textContent = label
    $('#search-button')?.click()
}
function ehModeLabels() {
    return {
        latest:t('最新','Latest','最新'),
        popular:t('热门','Popular','人気'),
        favorites:t('我的收藏','My favorites','お気に入り'),
        watched:t('关注','Watched','ウォッチ'),
        toplist:t('排行榜','Toplists','ランキング')
    }
}
function installEhBrowseParity() {
    const toolbar = $('#search')?.querySelector('.toolbar')
    if (!toolbar || $('#v040-eh-tools')) return
    const labels=ehModeLabels()
    const panel = document.createElement('details')
    panel.id = 'v040-eh-tools'
    panel.className = 'v040-eh-tools'
    panel.innerHTML = `<summary>E-H ${t('浏览与筛选','Browse & filters','閲覧と絞り込み')} · <span id="v040-eh-mode-state">${labels[parityState.ehMode] || labels.latest}</span></summary>
      <div class="v040-eh-tools-body">
        <div class="v040-eh-browse-actions">
          <button type="button" data-eh-mode="latest">${labels.latest}</button><button type="button" data-eh-mode="popular">${labels.popular}</button><button type="button" data-eh-mode="favorites">${labels.favorites}</button><button type="button" data-eh-mode="watched">${labels.watched}</button><button type="button" data-eh-mode="toplist">${labels.toplist}</button>
        </div>
        <label>${t('排行榜','Toplist','ランキング')}<select id="v040-eh-toplist"><option value="11">${t('全期','All time','全期間')}</option><option value="12">${t('过去一年','Past year','過去1年')}</option><option value="13">${t('过去一个月','Past month','過去1か月')}</option><option value="15">${t('昨日','Yesterday','昨日')}</option></select></label>
        <label>${t('分类','Category','カテゴリ')}<select id="v040-eh-category"><option value="">${t('全部','All','すべて')}</option>${[...categoryLabels.keys()].map((raw)=>`<option value="${escapeHtml(raw)}">${escapeHtml(categoryLabel(raw))}</option>`).join('')}</select></label>
        <label>${t('语言','Language','言語')}<select id="v040-eh-language"><option value="">${t('不限','Any','指定なし')}</option><option value="chinese">${t('中文','Chinese','中国語')}</option><option value="japanese">${t('日文','Japanese','日本語')}</option><option value="english">${t('英文','English','英語')}</option></select></label>
        <label>${t('包含标签','Include tags','含めるタグ')}<input id="v040-eh-include-tags" list="v040-eh-tag-options" placeholder="${t('中文或 canonical tag，逗号分隔','Canonical tags, comma-separated','canonical tag をカンマ区切りで入力')}"><datalist id="v040-eh-tag-options"></datalist></label>
        <label>${t('排除标签','Exclude tags','除外タグ')}<input id="v040-eh-exclude-tags" placeholder="${t('canonical tag，逗号分隔','Canonical tags, comma-separated','canonical tag をカンマ区切りで入力')}"></label>
        <label>${t('最低评分','Minimum rating','最低評価')}<input id="v040-eh-rating" type="number" min="0" max="5" step="0.5" value="0"></label>
        <label>${t('页数','Pages','ページ数')}<input id="v040-eh-pages-from" type="number" min="0" placeholder="${t('最少','Min','最小')}"> — <input id="v040-eh-pages-to" type="number" min="0" placeholder="${t('最多','Max','最大')}"></label>
        <button id="v040-eh-apply" type="button" class="primary">${t('应用 E-H 筛选','Apply E-H filters','E-H 絞り込みを適用')}</button>
      </div>`
    toolbar.append(panel)
    const provider = $('#search-provider')
    const refreshVisibility = () => { panel.hidden = !['eh','exh'].includes(provider?.value || '') }
    provider?.addEventListener('change', refreshVisibility)
    refreshVisibility()
    panel.querySelectorAll('[data-eh-mode]').forEach((button) => button.onclick = () => setEhMode(button.dataset.ehMode, labels[button.dataset.ehMode]))
    $('#v040-eh-toplist').value=parityState.toplist
    $('#v040-eh-toplist').onchange = (e) => { parityState.toplist = e.target.value; parityState.ehMode = 'toplist' }
    $('#v040-eh-category').value=parityState.category
    $('#v040-eh-language').value=parityState.language
    $('#v040-eh-include-tags').value=parityState.includeTags.join(', ')
    $('#v040-eh-exclude-tags').value=parityState.excludeTags.join(', ')
    $('#v040-eh-rating').value=String(parityState.minRating || 0)
    $('#v040-eh-pages-from').value=parityState.pageFrom ? String(parityState.pageFrom) : ''
    $('#v040-eh-pages-to').value=parityState.pageTo ? String(parityState.pageTo) : ''
    $('#v040-eh-apply').onclick = () => {
        parityState.category = $('#v040-eh-category').value
        parityState.language = $('#v040-eh-language').value
        parityState.includeTags = splitTags($('#v040-eh-include-tags').value)
        parityState.excludeTags = splitTags($('#v040-eh-exclude-tags').value)
        parityState.minRating = Math.max(0, Number($('#v040-eh-rating').value || 0))
        parityState.pageFrom = Math.max(0, Number($('#v040-eh-pages-from').value || 0))
        parityState.pageTo = Math.max(0, Number($('#v040-eh-pages-to').value || 0))
        $('#search-button')?.click()
    }
    void loadEhTranslations()
}
function ensureDialog(id, title) {
    let dialog = document.getElementById(id)
    if (dialog) return dialog
    dialog = document.createElement('dialog')
    dialog.id = id
    dialog.className = 'v040-dialog'
    dialog.innerHTML = `<form method="dialog" class="v040-dialog-shell"><div class="v040-dialog-head"><h2>${escapeHtml(title)}</h2><button value="cancel">${t('关闭','Close','閉じる')}</button></div><div class="v040-dialog-content"></div></form>`
    document.body.append(dialog)
    return dialog
}
async function showAuthorDirectory(name) {
    const dialog = ensureDialog('v040-author-dialog',t('作者目录','Author directory','作者一覧'))
    const content = dialog.querySelector('.v040-dialog-content')
    content.innerHTML = `<p>${t('正在整理作者身份…','Organizing author identities…','作者情報を整理中…')}</p>`
    dialog.showModal()
    try {
        const result = await libraryQuery({scope:'catalog',text:name,limit:5000,offset:0})
        const authors = result.facets?.authors || []
        if (!authors.length) {
            content.innerHTML = `<p>${t('没有找到可核验的作者身份。','No verifiable author identity was found.','確認可能な作者情報が見つかりませんでした。')}</p><p class="status">${t('当前显示名：','Current display name: ','現在の表示名：')}${escapeHtml(name)}</p>`
            return
        }
        content.innerHTML = `<p class="status">${t('先选择归一作者，再进入作品列表。相似名称不会直接静默合并。','Choose a normalized author before opening the works list. Similar names are never silently merged.','正規化された作者を選んでから作品一覧へ進みます。似た名前を自動で統合することはありません。')}</p><div class="v040-author-list">${authors.map((a)=>`<button type="button" data-author-id="${escapeHtml(a.value)}"><strong>${escapeHtml(a.label)}</strong><span>${t(`${Number(a.count)} 部作品`,`${Number(a.count)} works`,`${Number(a.count)} 作品`)}</span></button>`).join('')}</div>`
        content.querySelectorAll('[data-author-id]').forEach((button)=>button.onclick=()=>showAuthorWorks(dialog,button.dataset.authorId,button.querySelector('strong').textContent))
    } catch (error) { content.innerHTML = `<p class="status">${escapeHtml(error.message)}</p>` }
}
async function showAuthorWorks(dialog, authorId, name) {
    const content = dialog.querySelector('.v040-dialog-content')
    const render = async (note = '') => {
        const result = await libraryQuery({scope:'catalog',authorIds:[authorId],limit:5000,offset:0,sort:'latest'})
        content.innerHTML = `<button type="button" id="v040-author-back">← ${t('作者目录','Author directory','作者一覧')}</button><h3>${escapeHtml(name)}</h3><p class="status" id="v040-author-refresh-state">${t(`${result.total} 部作品`,`${result.total} works`,`${result.total} 作品`)} · ${note || t('正在联网补全 Pica / E-H 作者作品…','Fetching more Pica / E-H works online…','Pica / E-H の作者作品をオンラインで補完中…')}</p><div class="v040-author-works">${(result.items||[]).map((item)=>`<button type="button" data-work-id="${escapeHtml(item.comicId)}" data-work-title="${escapeHtml(item.title)}" data-work-provider="${escapeHtml(item.providerId||'')}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.providerId==='eh'?'E-H':'Pica')}</span></button>`).join('')}</div>`
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
    content.innerHTML = `<p>${t('正在读取作品…','Loading works…','作品を読み込み中…')}</p>`
    try {
        await render()
        const response = await rawFetch(`/api/v1/authors/${encodeURIComponent(authorId)}/refresh`, {
            method:'POST', headers:{'content-type':'application/json'}, body:'{}'
        })
        const refresh = await response.json()
        if (!response.ok) throw new Error(refresh.error || `HTTP ${response.status}`)
        const sources = Object.entries(refresh.sources || {})
            .map(([source,value])=>`${source.toUpperCase()}: ${Number(value?.count||0)}${value?.error?t('（失败）',' (failed)','（失敗）'):''}`)
            .join(' · ')
        await render(t(`在线补全完成${sources ? ` · ${sources}` : ''}`,`Online enrichment complete${sources ? ` · ${sources}` : ''}`,`オンライン補完完了${sources ? ` · ${sources}` : ''}`))
    } catch (error) {
        const state = $('#v040-author-refresh-state')
        if (state) state.textContent = t(`已显示本地作品 · 在线补全失败：${error.message}`,`Showing local works · online enrichment failed: ${error.message}`,`ローカル作品を表示中 · オンライン補完に失敗：${error.message}`)
        else content.innerHTML = `<p class="status">${escapeHtml(error.message)}</p>`
    }
}
function enhanceDetailAuthor() {
    const root = $('#recommend-detail-content')
    if (!root || root.dataset.v040Author === '1') return
    const strong = root.querySelector('p strong')
    const dialog = $('#recommend-detail') || root.closest('dialog')
    const comicId = dialog?.dataset?.comicId || ''
    const item = catalog.get(comicId)
    const name = item?.canonicalAuthor || item?.author || strong?.textContent?.trim()
    if (!strong || !name) return
    const button = document.createElement('button')
    button.type='button'; button.className='v040-author-link'; button.textContent=name; button.title=t('查看作者目录','View author directory','作者一覧を見る')
    button.onclick=()=>showAuthorDirectory(name)
    strong.replaceWith(button)
    root.dataset.v040Author='1'
}

function dayOf(value) { try { return new Date(value).toLocaleDateString('sv-SE') } catch { return '' } }
function historyFiltered(range, exact) {
    const rows=historyRows().sort((a,b)=>String(b.lastReadAt).localeCompare(String(a.lastReadAt)))
    if(exact) return rows.filter(r=>dayOf(r.lastReadAt)===exact)
    if(range==='all') return rows
    const days=range==='today'?1:range==='7'?7:30
    const cutoff=Date.now()-(days-1)*86400000
    return rows.filter(r=>new Date(r.lastReadAt).getTime()>=new Date(new Date(cutoff).toDateString()).getTime())
}
function openHistory() {
    const dialog=ensureDialog('v040-history-dialog',t('阅读历史','Reading history','閲覧履歴'))
    const content=dialog.querySelector('.v040-dialog-content')
    content.innerHTML=`<div class="v040-history-filters"><button data-range="today">${t('今天','Today','今日')}</button><button data-range="7">${t('7天','7 days','7日')}</button><button data-range="30">${t('30天','30 days','30日')}</button><button data-range="all">${t('全部','All','すべて')}</button><input id="v040-history-date" type="date"></div><div id="v040-history-list"></div>`
    let range='7',exact=''
    const render=()=>{
        const rows=historyFiltered(range,exact),target=$('#v040-history-list')
        if(!rows.length){target.innerHTML=`<p class="status">${t('这个时间段还没有阅读记录。','No reading history in this period.','この期間の閲覧履歴はありません。')}</p>`;return}
        let current='';const out=[]
        for(const row of rows){const day=dayOf(row.lastReadAt);if(day!==current){current=day;out.push(`<h3>${escapeHtml(day)}</h3>`)}out.push(`<article class="v040-history-item"><div><strong>${escapeHtml(row.title||t('漫画','Manga','漫画'))}</strong><p>${escapeHtml(row.author||'')} · ${t(`第 ${Number(row.lastPage||0)+1} 页`,`Page ${Number(row.lastPage||0)+1}`,`${Number(row.lastPage||0)+1} ページ`)} · ${escapeHtml(row.providerId==='eh'?'E-H':'Pica')}</p></div><button type="button" data-history-resume="${escapeHtml(row.id)}">${t('继续阅读','Continue reading','続きを読む')}</button></article>`)}
        target.innerHTML=out.join('')
        target.querySelectorAll('[data-history-resume]').forEach(b=>b.onclick=()=>resumeHistory(rows.find(r=>r.id===b.dataset.historyResume)))
    }
    content.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{range=b.dataset.range;exact='';$('#v040-history-date').value='';render()})
    $('#v040-history-date').onchange=e=>{exact=e.target.value;render()}
    render();dialog.showModal()
}
async function resumeHistory(row) {
    if(!row) return
    const reader=ensureDialog('v040-history-reader',t('继续阅读','Continue reading','続きを読む'))
    const content=reader.querySelector('.v040-dialog-content')
    content.innerHTML=`<p>${t('正在恢复阅读位置…','Restoring reading position…','閲覧位置を復元中…')}</p>`;reader.showModal()
    try{
        const root='/api/v1/online-reader'
        const chapters=await rawFetch(`${root}/comics/${encodeURIComponent(row.comicId)}/chapters`).then(r=>{if(!r.ok)throw new Error(t('在线来源暂不可读','Online source is temporarily unavailable','オンライン配信元を一時的に読めません'));return r.json()})
        const chapter=chapters.find(c=>c.id===row.episodeId)||chapters[0]
        if(!chapter)throw new Error(t('没有可读章节','No readable chapters','読めるチャプターがありません'))
        const data=await rawFetch(`${root}/comics/${encodeURIComponent(row.comicId)}/chapters/${encodeURIComponent(chapter.id)}`).then(r=>{if(!r.ok)throw new Error(t('章节暂不可读','Chapter is temporarily unavailable','チャプターを一時的に読めません'));return r.json()})
        let index=Math.max(0,Math.min(Number(row.lastPage||0),Math.max(0,(data.pages||[]).length-1)))
        const render=()=>{const page=data.pages[index];content.innerHTML=`<div class="v040-history-reader-meta"><strong>${escapeHtml(row.title)}</strong><span>${index+1} / ${data.pages.length}</span></div><div class="v040-history-page">${page?`<img src="${escapeHtml(page.url)}" alt="">`:`<p>${t('没有页面','No page','ページがありません')}</p>`}</div><div class="v040-history-reader-actions"><button type="button" id="v040-history-prev">${t('上一页','Previous page','前のページ')}</button><button type="button" id="v040-history-next">${t('下一页','Next page','次のページ')}</button></div>`;$('#v040-history-prev').onclick=()=>{if(index>0){index--;render()}};$('#v040-history-next').onclick=()=>{if(index<data.pages.length-1){index++;render()}};recordHistory({comicId:row.comicId,episodeId:chapter.id,pageIndex:index,title:row.title,author:row.author})}
        render()
    }catch(error){content.innerHTML=`<p class="status">${escapeHtml(error.message)}。${t('可返回漫画详情重新选择来源。','Return to comic details to choose another source.','作品詳細へ戻って別の配信元を選択できます。')}</p>`}
}

function observeUi() {
    let queued = false
    let detailDirty = false
    const pendingRoots = new Set()
    const schedule = () => {
        if (queued) return
        queued = true
        requestAnimationFrame(() => {
            queued = false
            const roots = [...pendingRoots]
            pendingRoots.clear()
            for (const root of roots) translateVisibleTags(root)
            if (detailDirty) {
                detailDirty = false
                enhanceDetailAuthor()
            }
        })
    }
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            const target =
                mutation.target instanceof Element
                    ? mutation.target
                    : mutation.target.parentElement
            if (
                target &&
                (target.id === 'recommend-detail-content' ||
                    target.closest?.('#recommend-detail-content'))
            )
                detailDirty = true
            for (const node of mutation.addedNodes) {
                const root =
                    node instanceof Element ? node : node.parentElement
                if (!root) continue
                pendingRoots.add(root)
                if (
                    root.id === 'recommend-detail-content' ||
                    root.closest?.('#recommend-detail-content') ||
                    root.querySelector?.('#recommend-detail-content')
                )
                    detailDirty = true
            }
        }
        if (pendingRoots.size || detailDirty) schedule()
    })
    observer.observe(document.body, { childList: true, subtree: true })
}
function installCss() {
    if(document.querySelector('link[href="./v040-parity.css"]'))return
    const link=document.createElement('link');link.rel='stylesheet';link.href='./v040-parity.css';document.head.append(link)
}
function boot() {
    installCss();installLibraryParity();installEhBrowseParity();observeUi();void loadEhTranslations()
}
document.addEventListener('pica-language-change',()=>{
    $('#v040-eh-tools')?.remove()
    $('#v040-library-provider')?.remove()
    $('#library .v040-library-more')?.remove()
    $('#v040-history-button')?.remove()
    installLibraryParity()
    installEhBrowseParity()
    translateVisibleTags()
})
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot()
