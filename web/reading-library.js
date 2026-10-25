import { copy as t } from './locale-runtime.js'

/** Shared Library entry point. Only same-app read projections; no source activation or storage. */
export function installReadingLibrary({ target, canQuery, isVisible, query, hostSession, openReader, openHosted }) {
    if (!target) return { refresh: async () => {}, dispose() {} }
    let generation = 0, ownership = 0, active = null, disposed = false, offset = 0, total = 0
    const pageSize = 12
    const node = (tag, value) => { const element = document.createElement(tag); if (value !== undefined) element.textContent = value; return element }
    const heading = node('h3'), help = node('p'), controls = node('div'), text = node('input'), source = node('select'), refresh = node('button'), status = node('p'), list = node('div'), pager = node('div'), previous = node('button'), next = node('button'), count = node('span')
    controls.className = 'actions'; list.className = 'comic-grid'; status.className = 'status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite')
    text.maxLength = 200; refresh.type = 'button'; target.hidden = true
    heading.id = 'reading-library-heading'; target.setAttribute('aria-labelledby', heading.id)
    pager.className = 'actions'; previous.type = next.type = 'button'; previous.disabled = next.disabled = true
    target.append(heading, help, controls, status, list, pager); controls.append(text, source, refresh); pager.append(previous, count, next)
    function labels() {
        heading.textContent = t('继续阅读与已选作品', 'Continue reading and selected books', '読書の続き・選択済み作品')
        help.textContent = t('汇总已保存的阅读记录和本次授权 Host 中明确选过的作品；不会扫描、连接或导入整个来源。', 'Saved reading records and explicitly selected books in this authorized host session only. This does not scan, connect or import a source catalogue.', '保存済み読書記録と今回許可したホストの選択済み作品のみ。配信元の走査・接続・カタログ取込は行いません。')
        text.placeholder = t('查找已读／已选作品', 'Find read / selected books', '読書済み・選択済み作品を検索')
        text.setAttribute('aria-label', text.placeholder)
        source.setAttribute('aria-label', t('阅读记录来源', 'Reading record source', '読書記録の配信元'))
        refresh.textContent = t('刷新阅读记录', 'Refresh reading records', '読書記録を更新')
        previous.textContent = t('上一页', 'Previous', '前へ'); next.textContent = t('下一页', 'Next', '次へ')
    }
    const scopeId = () => hostSession()?.sessionId ?? null
    function invalidate() { generation++; active?.abort(); active = null }
    function ready() { return !disposed && canQuery() && isVisible() }
    function render(value, scope) {
        const owner = ownership
        if (!value || !Array.isArray(value.items) || value.items.length > pageSize || !Array.isArray(value.sources) || value.sources.length > 510 || typeof value.complete !== 'boolean' || !Number.isSafeInteger(value.total) || value.total < 0 || value.total > 2500) throw Error('Invalid reading projection')
        total = value.total
        const selected = source.value
        source.replaceChildren()
        const all = node('option', t('全部可见来源', 'All visible sources', '表示可能な全配信元')); all.value = ''; source.append(all)
        for (const item of value.sources) { const option = node('option', item.label + ' · ' + item.count); option.value = item.key; source.append(option) }
        source.value = [...source.options].some(option => option.value === selected) ? selected : ''
        list.replaceChildren()
        if (!value.items.length) list.append(node('p', t('暂无匹配的阅读记录。可以先打开本地漫画，或在自己的 Host 中明确选择一本作品。', 'No matching reading records. Open a local comic, or explicitly select a book from your own host.', '一致する読書記録がありません。ローカル漫画を開くか、自分のホストで作品を選択してください。')))
        for (const item of value.items) {
            if (!item || typeof item.comicId !== 'string' || !Array.isArray(item.routes) || item.routes.length > 3) throw Error('Invalid reading projection')
            const card = node('article'); card.className = 'panel'
            card.append(node('strong', item.title ?? t('本地元数据暂缺', 'Local metadata unavailable', 'ローカルメタデータがありません')), node('p', item.source.label))
            for (const route of item.routes) {
                if (!['local', 'online', 'hosted'].includes(route.channel)) throw Error('Invalid reading route')
                const caption = route.channel === 'local' ? t('本地阅读', 'Read locally', 'ローカルで読む') : route.channel === 'online' ? t('在线阅读', 'Read online', 'オンラインで読む') : t('从自己的 Host 阅读', 'Read from your host', '自分のホストで読む')
                const button = node('button', caption + (route.progress ? t(' · 第 ', ' · Page ', ' · ページ ') + (route.progress.pageIndex + 1) : '')); button.type = 'button'; button.disabled = !route.available
                button.onclick = async () => {
                    if (owner !== ownership || !ready() || route.channel === 'hosted' && scopeId() !== scope) return
                    button.disabled = true
                    try {
                        if (route.channel === 'hosted') await openHosted(item.comicId, scope)
                        else await openReader(item.comicId, route.channel === 'online')
                    } catch {
                        if (owner === ownership && ready()) status.textContent = t('无法继续。来源可能已停用或会话已结束；本地记录未删除。', 'Cannot continue. The source may be disabled or the session ended; local records were not deleted.', '続行できません。配信元が無効かセッションが終了しています。ローカル記録は削除していません。')
                    } finally { if (owner === ownership) button.disabled = !route.available }
                }
                card.append(button)
            }
            list.append(card)
        }
        status.textContent = value.complete ? t('仅查询已保存记录；没有启动来源或重算推荐。', 'Saved records only; no source startup or recommendation recompute.', '保存済み記録のみ。配信元起動・おすすめ再計算は行いません。') : t('部分来源记录暂不可读取；本地结果仍保留。', 'Some source records are unavailable; local results are retained.', '一部配信元の記録を読めません。ローカル結果は保持しています。')
        count.textContent = total ? `${Math.min(offset + 1, total)}–${Math.min(offset + value.items.length, total)} / ${total}` : '0 / 0'
    }
    async function load() {
        invalidate(); labels()
        if (!ready()) { target.hidden = !canQuery(); return }
        target.hidden = false
        const controller = new AbortController(), ticket = generation, scope = scopeId(); active = controller
        refresh.disabled = previous.disabled = next.disabled = true
        const timeout = setTimeout(() => controller.abort(), 10000)
        status.textContent = t('正在读取保存的阅读记录…', 'Reading saved reading records…', '保存済み読書記録を読み取り中…')
        try {
            const value = await query({ query: { text: text.value, sourceKey: source.value, limit: pageSize, offset }, ...(scope ? { hostSessionId: scope } : {}) }, controller.signal)
            if (controller.signal.aborted || ticket !== generation || !ready() || scopeId() !== scope) return
            render(value, scope)
        } catch {
            if (ticket === generation && ready()) status.textContent = t('暂时无法读取记录；未修改任何数据，请稍后刷新。', 'Reading records are temporarily unavailable. No data changed; refresh later.', '記録を読み取れませんでした。データは変更していません。後で更新してください。')
        } finally { clearTimeout(timeout); if (ticket === generation) { active = null; refresh.disabled = false; previous.disabled = offset <= 0; next.disabled = offset + pageSize >= total } }
    }
    refresh.onclick = () => void load(); source.onchange = () => { offset = 0; void load() }; text.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); offset = 0; void load() } }
    previous.onclick = () => { offset = Math.max(0, offset - pageSize); void load() }; next.onclick = () => { if (offset + pageSize < total) { offset += pageSize; void load() } }
    function clearRecords() { list.replaceChildren(); source.replaceChildren(); count.textContent = ''; total = offset = 0; previous.disabled = next.disabled = true }
    const scopeChanged = () => { ownership++; invalidate(); clearRecords(); if (ready()) void load() }
    const pagehide = () => { ownership++; invalidate(); clearRecords() }
    document.addEventListener('pica-hosted-reading-scope-changed', scopeChanged); window.addEventListener('pagehide', pagehide)
    return { refresh: load, dispose() { disposed = true; ownership++; invalidate(); document.removeEventListener('pica-hosted-reading-scope-changed', scopeChanged); window.removeEventListener('pagehide', pagehide); target.replaceChildren() } }
}
