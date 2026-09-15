const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]
const rawFetch = window.fetch.bind(window)
const catalog = new Map()
const HISTORY_KEY = 'pica-v040-reading-history-v1'
const EH_SHA_URL = 'https://raw.githubusercontent.com/EhTagTranslation/DatabaseReleases/refs/heads/master/sha'
const EH_DATA_URL = 'https://raw.githubusercontent.com/EhTagTranslation/DatabaseReleases/refs/heads/master/db.text.json'
const nsZh = new Map([
    ['female','女性'],['male','男性'],['mixed','混合'],['language','语言'],['parody','原作'],['character','角色'],['artist','画师'],['group','社团'],['cosplayer','Cosplayer'],['location','地点'],['other','其他'],['reclass','重新分类']
])
const categoryZh = new Map([
    ['Doujinshi','同人志'],['Manga','漫画'],['Artist CG','画师 CG'],['Game CG','游戏 CG'],['Image Set','图片集'],['Cosplay','Cosplay'],['Asian Porn','亚洲色情'],['Non-H','非 H'],['Western','西方作品'],['Misc','其他']
])
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
        last.title = last.title || item.title || '漫画'
        last.author = last.author || item.canonicalAuthor || item.author || ''
        saveHistory(rows)
        return
    }
    rows.unshift({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        comicId,
        episodeId,
        title: item.title || input.title || '漫画',
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
    provider.innerHTML = '<option value="all">来源：全部</option><option value="pica">来源：Pica</option><option value="eh">来源：E-H</option>'
    const scope = $('#filter-scope')
    scope?.insertAdjacentElement('afterend', provider)
    provider.onchange = () => $('#apply-filter')?.click()

    const more = document.createElement('details')
    more.className = 'v040-library-more'
    more.innerHTML = '<summary>更多筛选与显示</summary><div class="v040-library-more-body"></div>'
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
        button.textContent = '阅读历史'
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
    return parityState.valueTranslations.get(norm(raw)) || raw
}
function translateVisibleTags() {
    for (const tag of $$('.tag')) {
        const raw = tag.dataset.rawValue || tag.textContent.trim()
        tag.dataset.rawValue = raw
        const translated = translateValue(raw)
        if (translated !== raw) { tag.textContent = translated; tag.title = raw }
    }
    for (const node of $$('[data-eh-category]')) {
        const raw = node.dataset.ehCategory
        node.textContent = categoryZh.get(raw) || raw
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
            html.push(`<option value="${escapeHtml(canonical)}">${escapeHtml(nsZh.get(ns) || ns)} · ${escapeHtml(zh)} · ${escapeHtml(value)}</option>`)
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
function installEhBrowseParity() {
    const toolbar = $('#search')?.querySelector('.toolbar')
    if (!toolbar || $('#v040-eh-tools')) return
    const panel = document.createElement('details')
    panel.id = 'v040-eh-tools'
    panel.className = 'v040-eh-tools'
    panel.innerHTML = `<summary>E-H 浏览与筛选 · <span id="v040-eh-mode-state">最新</span></summary>
      <div class="v040-eh-tools-body">
        <div class="v040-eh-browse-actions">
          <button type="button" data-eh-mode="latest">最新</button><button type="button" data-eh-mode="popular">热门</button><button type="button" data-eh-mode="favorites">我的收藏</button><button type="button" data-eh-mode="watched">关注</button><button type="button" data-eh-mode="toplist">排行榜</button>
        </div>
        <label>排行榜<select id="v040-eh-toplist"><option value="11">全期</option><option value="12">过去一年</option><option value="13">过去一个月</option><option value="15">昨日</option></select></label>
        <label>分类<select id="v040-eh-category"><option value="">全部</option>${[...categoryZh].map(([raw,zh])=>`<option value="${escapeHtml(raw)}">${escapeHtml(zh)}</option>`).join('')}</select></label>
        <label>语言<select id="v040-eh-language"><option value="">不限</option><option value="chinese">中文</option><option value="japanese">日文</option><option value="english">英文</option></select></label>
        <label>包含标签<input id="v040-eh-include-tags" list="v040-eh-tag-options" placeholder="中文或 canonical tag，逗号分隔"><datalist id="v040-eh-tag-options"></datalist></label>
        <label>排除标签<input id="v040-eh-exclude-tags" placeholder="canonical tag，逗号分隔"></label>
        <label>最低评分<input id="v040-eh-rating" type="number" min="0" max="5" step="0.5" value="0"></label>
        <label>页数<input id="v040-eh-pages-from" type="number" min="0" placeholder="最少"> — <input id="v040-eh-pages-to" type="number" min="0" placeholder="最多"></label>
        <button id="v040-eh-apply" type="button" class="primary">应用 E-H 筛选</button>
      </div>`
    toolbar.append(panel)
    const provider = $('#search-provider')
    const refreshVisibility = () => { panel.hidden = !['eh','exh'].includes(provider?.value || '') }
    provider?.addEventListener('change', refreshVisibility)
    refreshVisibility()
    const labels = {latest:'最新',popular:'热门',favorites:'我的收藏',watched:'关注',toplist:'排行榜'}
    panel.querySelectorAll('[data-eh-mode]').forEach((button) => button.onclick = () => setEhMode(button.dataset.ehMode, labels[button.dataset.ehMode]))
    $('#v040-eh-toplist').onchange = (e) => { parityState.toplist = e.target.value; parityState.ehMode = 'toplist' }
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
    dialog.innerHTML = `<form method="dialog" class="v040-dialog-shell"><div class="v040-dialog-head"><h2>${escapeHtml(title)}</h2><button value="cancel">关闭</button></div><div class="v040-dialog-content"></div></form>`
    document.body.append(dialog)
    return dialog
}
async function showAuthorDirectory(name) {
    const dialog = ensureDialog('v040-author-dialog','作者目录')
    const content = dialog.querySelector('.v040-dialog-content')
    content.innerHTML = '<p>正在整理作者身份…</p>'
    dialog.showModal()
    try {
        const result = await libraryQuery({scope:'catalog',text:name,limit:5000,offset:0})
        const authors = result.facets?.authors || []
        if (!authors.length) {
            content.innerHTML = `<p>没有找到可核验的作者身份。</p><p class="status">当前显示名：${escapeHtml(name)}</p>`
            return
        }
        content.innerHTML = `<p class="status">先选择归一作者，再进入作品列表。相似名称不会直接静默合并。</p><div class="v040-author-list">${authors.map((a)=>`<button type="button" data-author-id="${escapeHtml(a.value)}"><strong>${escapeHtml(a.label)}</strong><span>${Number(a.count)} 部作品</span></button>`).join('')}</div>`
        content.querySelectorAll('[data-author-id]').forEach((button)=>button.onclick=()=>showAuthorWorks(dialog,button.dataset.authorId,button.querySelector('strong').textContent))
    } catch (error) { content.innerHTML = `<p class="status">${escapeHtml(error.message)}</p>` }
}
async function showAuthorWorks(dialog, authorId, name) {
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
    button.type='button'; button.className='v040-author-link'; button.textContent=name; button.title='查看作者目录'
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
    const dialog=ensureDialog('v040-history-dialog','阅读历史')
    const content=dialog.querySelector('.v040-dialog-content')
    content.innerHTML=`<div class="v040-history-filters"><button data-range="today">今天</button><button data-range="7">7天</button><button data-range="30">30天</button><button data-range="all">全部</button><input id="v040-history-date" type="date"></div><div id="v040-history-list"></div>`
    let range='7',exact=''
    const render=()=>{
        const rows=historyFiltered(range,exact),target=$('#v040-history-list')
        if(!rows.length){target.innerHTML='<p class="status">这个时间段还没有阅读记录。</p>';return}
        let current='';const out=[]
        for(const row of rows){const day=dayOf(row.lastReadAt);if(day!==current){current=day;out.push(`<h3>${escapeHtml(day)}</h3>`)}out.push(`<article class="v040-history-item"><div><strong>${escapeHtml(row.title||'漫画')}</strong><p>${escapeHtml(row.author||'')} · 第 ${Number(row.lastPage||0)+1} 页 · ${escapeHtml(row.providerId==='eh'?'E-H':'Pica')}</p></div><button type="button" data-history-resume="${escapeHtml(row.id)}">继续阅读</button></article>`)}
        target.innerHTML=out.join('')
        target.querySelectorAll('[data-history-resume]').forEach(b=>b.onclick=()=>resumeHistory(rows.find(r=>r.id===b.dataset.historyResume)))
    }
    content.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{range=b.dataset.range;exact='';$('#v040-history-date').value='';render()})
    $('#v040-history-date').onchange=e=>{exact=e.target.value;render()}
    render();dialog.showModal()
}
async function resumeHistory(row) {
    if(!row) return
    const reader=ensureDialog('v040-history-reader','继续阅读')
    const content=reader.querySelector('.v040-dialog-content')
    content.innerHTML='<p>正在恢复阅读位置…</p>';reader.showModal()
    try{
        const root='/api/v1/online-reader'
        const chapters=await rawFetch(`${root}/comics/${encodeURIComponent(row.comicId)}/chapters`).then(r=>{if(!r.ok)throw new Error('在线来源暂不可读');return r.json()})
        const chapter=chapters.find(c=>c.id===row.episodeId)||chapters[0]
        if(!chapter)throw new Error('没有可读章节')
        const data=await rawFetch(`${root}/comics/${encodeURIComponent(row.comicId)}/chapters/${encodeURIComponent(chapter.id)}`).then(r=>{if(!r.ok)throw new Error('章节暂不可读');return r.json()})
        let index=Math.max(0,Math.min(Number(row.lastPage||0),Math.max(0,(data.pages||[]).length-1)))
        const render=()=>{const page=data.pages[index];content.innerHTML=`<div class="v040-history-reader-meta"><strong>${escapeHtml(row.title)}</strong><span>${index+1} / ${data.pages.length}</span></div><div class="v040-history-page">${page?`<img src="${escapeHtml(page.url)}" alt="">`:'<p>没有页面</p>'}</div><div class="v040-history-reader-actions"><button type="button" id="v040-history-prev">上一页</button><button type="button" id="v040-history-next">下一页</button></div>`;$('#v040-history-prev').onclick=()=>{if(index>0){index--;render()}};$('#v040-history-next').onclick=()=>{if(index<data.pages.length-1){index++;render()}};recordHistory({comicId:row.comicId,episodeId:chapter.id,pageIndex:index,title:row.title,author:row.author})}
        render()
    }catch(error){content.innerHTML=`<p class="status">${escapeHtml(error.message)}。可返回漫画详情重新选择来源。</p>`}
}

function observeUi() {
    const observer=new MutationObserver(()=>{translateVisibleTags();enhanceDetailAuthor()})
    observer.observe(document.body,{childList:true,subtree:true})
}
function installCss() {
    if(document.querySelector('link[href="./v040-parity.css"]'))return
    const link=document.createElement('link');link.rel='stylesheet';link.href='./v040-parity.css';document.head.append(link)
}
function boot() {
    installCss();installLibraryParity();installEhBrowseParity();observeUi();void loadEhTranslations()
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot()
