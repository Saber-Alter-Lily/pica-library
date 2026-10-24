import { copy as t } from './locale-runtime.js'
import { attachTagProfileExchange } from './tag-profile-exchange.js'

const state = { base: null, draft: null, data: null, loading: false, saving: false, page: 0, query: '', provider: '', facet: '', message: '' }
const clone = value => JSON.parse(JSON.stringify(value))
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const dirty = () => state.draft && JSON.stringify(state.base?.tagPolicy) !== JSON.stringify(state.draft)
const ask = message => window.picaConfirmAction ? window.picaConfirmAction(message) : Promise.resolve(window.confirm(message))
const enabled = id => state.draft.mode === 'ALL' ? !state.draft.disabled.includes(id) : state.draft.selected.includes(id)
function toggle(id, checked) {
    const field = state.draft.mode === 'ALL' ? 'disabled' : 'selected'
    const add = state.draft.mode === 'ALL' ? !checked : checked
    state.draft[field] = [...new Set([...state.draft[field].filter(value => value !== id), ...(add ? [id] : [])])].sort()
}
function category(facet) {
    if (facet === 'PRIVATE') return t('私人标签', 'Private labels', '個人タグ')
    if (facet.startsWith('EH_')) return t('E-H 原始命名空间', 'E-H raw namespace', 'E-H の名前空間') + ' · ' + facet.slice(3).toLowerCase()
    const groups = {
        FANDOM_IP: ['作品 / IP', 'Work / IP', '作品 / IP'], FANDOM_CHARACTER: ['角色', 'Characters', 'キャラクター'],
        GENRE_THEME: ['题材', 'Themes', 'テーマ'], STORY_TROPE: ['剧情与设定', 'Story and setting', 'ストーリー・設定'],
        VISUAL_STYLE: ['平台标注画风', 'Provider style annotation', 'サイトの画風表記'],
        FORMAT: ['形式', 'Format', '形式'], AUDIENCE_ORIENTATION: ['受众', 'Audience', '対象']
    }
    if (groups[facet]) return t(...groups[facet])
    if (/BODY|APPEARANCE|OUTFIT/.test(facet)) return t('外观与身体', 'Appearance and body', '外見・身体')
    if (/ROLE|IDENTITY|RELATION|SPECIES/.test(facet)) return t('人物与关系', 'People and relationships', '人物・関係')
    if (/BEHAVIOR|CONTENT|FETISH|CONTROL/.test(facet)) return t('行为与情境', 'Behavior and situations', '行動・状況')
    return t('其他 / 未分类', 'Other / unclassified', 'その他・未分類')
}
async function fetchData() {
    if (state.loading) return
    state.loading = true; state.message = t('正在读取本地标签目录…', 'Loading local tag directory…', 'ローカルタグを読み込み中…'); render()
    try {
        const response = await fetch('/api/v1/recommendation-v5/tag-policy'), data = await response.json()
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
        state.base = clone(data); state.data = data; state.draft = clone(data.tagPolicy); state.message = ''
    } catch (error) { state.message = String(error.message || error) }
    finally { state.loading = false; render() }
}
function allRows() {
    const rows = state.data.rows.filter(row => row.provider !== 'private')
    return [...rows, ...state.draft.privateTags.map(tag => ({ identity: 'private|' + tag.id, provider: 'private', key: '@private/' + tag.id, label: tag.name, facet: 'PRIVATE', supportCount: state.data.rows.find(row => row.identity === 'private|' + tag.id)?.supportCount ?? null }))]
        .sort((a, b) => a.facet.localeCompare(b.facet) || (b.supportCount || 0) - (a.supportCount || 0) || a.identity.localeCompare(b.identity))
}
function render() {
    const root = document.querySelector('#v5-tag-body'); if (!root) return
    if (!state.data || !state.draft) {
        root.innerHTML = `<p role="status">${esc(state.message)}</p><button type="button" data-tag-retry>${t('读取标签目录', 'Load tag directory', 'タグを読み込む')}</button>`
        root.querySelector('[data-tag-retry]').onclick = fetchData; return
    }
    const rows = allRows(), filtered = rows.filter(row => (!state.provider || row.provider === state.provider) && (!state.facet || row.facet === state.facet) && (!state.query || (row.label + ' ' + row.key).toLowerCase().includes(state.query.toLowerCase())))
    const pages = Math.max(1, Math.ceil(filtered.length / 100)); state.page = Math.min(state.page, pages - 1)
    const visible = filtered.slice(state.page * 100, (state.page + 1) * 100), count = rows.filter(row => enabled(row.identity)).length
    root.innerHTML = `
        <p>${t('默认全开。关闭标签只停用推荐信号，不隐藏作品；作者、分类和屏蔽规则独立。', 'All tags participate by default. Disabling a tag removes its taste signal, not works; author, category and block rules remain independent.', '既定は全タグ参加。無効化は嗜好信号を止めるだけで作品は隠しません。作者・カテゴリ・ブロックは独立です。')}</p>
        <p>${t('目录来自本地已观测资料，不冒充全站完整标签。各类按收藏涉及作品数排序，数量不等于喜好强度。', 'Directory uses locally observed metadata, not a complete provider-wide list. Each group sorts by favorite-work coverage, not liking strength.', '端末で観測した資料のタグです。サイト全体の一覧ではありません。分類内はお気に入り作品数順で、好みの強さではありません。')}</p>
        <p><strong>${state.draft.mode === 'ALL' ? t('全部参与（可排除个别）', 'All participate (with exceptions)', '全て参加（個別除外可）') : t('仅选中参与；新标签默认不参与', 'Selected only; newly discovered tags stay off', '選択したタグのみ・新規タグは既定で不参加')}</strong> · ${count} / ${rows.length}</p>
        <div class="actions"><button type="button" data-tag-all>${t('全开', 'Enable all', '全て有効')}</button><button type="button" data-tag-none>${t('全关', 'Disable all', '全て無効')}</button><button type="button" data-tag-manual>${t('新建手工标签', 'New manual label', '手動タグを作成')}</button><button type="button" data-tag-mapped>${t('新建映射标签', 'New mapped label', '対応付けタグを作成')}</button></div>
        <div class="v5-search-row"><label>${t('查找', 'Find', '検索')} <input data-tag-query value="${esc(state.query)}" maxlength="160"></label><button type="button" data-tag-find>${t('查找', 'Find', '検索')}</button>
        <label>${t('来源', 'Provider', 'ソース')} <select data-tag-provider><option value="">${t('全部来源', 'All providers', '全ソース')}</option>${['pica', 'eh', 'jm', 'local', 'private'].map(p => `<option ${p === state.provider ? 'selected' : ''} value="${p}">${p === 'private' ? t('私人', 'Private', '個人') : p === 'local' ? t('本地', 'Local', 'ローカル') : p.toUpperCase()}</option>`).join('')}</select></label>
        <label>${t('分类', 'Group', '分類')} <select data-tag-facet><option value="">${t('全部分类', 'All groups', '全分類')}</option>${[...new Set(rows.map(row => row.facet))].sort().map(facet => `<option ${facet === state.facet ? 'selected' : ''} value="${esc(facet)}">${esc(category(facet))}</option>`).join('')}</select></label></div>
        <div data-tag-rows>${visible.map(row => `<div class="v5-tag-row"><label><input type="checkbox" data-tag-id="${esc(row.identity)}" ${enabled(row.identity) ? 'checked' : ''}> ${esc(row.label)}</label><small>${esc(category(row.facet))} · ${esc(row.provider.toUpperCase())} · ${t('收藏涉及', 'Favorite coverage', 'お気に入り作品数')} ${row.supportCount === null ? t('保存后统计', 'count after save', '保存後に集計') : row.supportCount}</small>${row.provider === 'private' ? `<button type="button" data-tag-edit="${esc(row.identity.slice(8))}">${t('编辑', 'Edit', '編集')}</button><button type="button" data-tag-delete="${esc(row.identity.slice(8))}">${t('删除标签', 'Delete label', 'タグ削除')}</button>` : ''}</div>`).join('') || `<p>${t('没有匹配的本地标签。不会自动把输入创建为标签。', 'No matching local tags. Search text is never added automatically.', '一致するローカルタグはありません。検索語は自動作成されません。')}</p>`}</div>
        <div class="actions"><button type="button" data-tag-prev ${state.page === 0 ? 'disabled' : ''}>${t('上一页', 'Previous', '前へ')}</button><span>${state.page + 1} / ${pages} · ${filtered.length}</span><button type="button" data-tag-next ${state.page + 1 >= pages ? 'disabled' : ''}>${t('下一页', 'Next', '次へ')}</button></div>
        <p>${t('私人标签是你的标注，不是平台事实或自动画风分类。手工绑定只识别选中的作品；映射按任一原始标签匹配，独立于原始标签的参与开关。Visual 模式和向量不受本页修改。', 'Private labels are your annotations, not provider facts or automatic style classes. Manual bindings recognize only selected works. Mappings match ANY chosen raw tag, independently of its participation switch. Visual mode and embeddings are unchanged.', '個人タグはユーザーの注釈で、サイトの事実や画風の自動分類ではありません。手動は選択作品のみ、対応付けは元タグのいずれかで一致します。元タグの参加設定とは独立です。Visual モード・ベクトルは変更しません。')}</p>
        <p role="status" aria-live="polite">${esc(state.message || (dirty() ? t('尚未保存', 'Unsaved changes', '未保存') : t('已保存的标签方案', 'Saved tag scheme', '保存済み設定')))}</p>
        <div class="actions"><button type="button" data-tag-undo ${!dirty() || state.saving ? 'disabled' : ''}>${t('撤销修改', 'Undo changes', '変更を破棄')}</button><button type="button" data-tag-save ${!dirty() || state.saving ? 'disabled' : ''}>${t('保存方案', 'Save scheme', '設定を保存')}</button><button type="button" data-tag-apply ${state.saving ? 'disabled' : ''}>${t('保存并重新生成推荐', 'Save and regenerate recommendations', '保存しておすすめを再生成')}</button><button type="button" data-tag-reload>${t('重新读取（放弃草稿）', 'Reload (discard draft)', '再読込（下書き破棄）')}</button></div>`
    root.querySelector('[data-tag-all]').onclick = () => { state.draft.mode = 'ALL'; state.draft.disabled = []; state.message = ''; render() }
    root.querySelector('[data-tag-none]').onclick = () => { state.draft.mode = 'SELECTED'; state.draft.selected = []; state.message = ''; render() }
    root.querySelector('[data-tag-find]').onclick = () => { state.query = root.querySelector('[data-tag-query]').value.trim(); state.page = 0; render() }
    root.querySelector('[data-tag-query]').onkeydown = event => { if (event.key === 'Enter') root.querySelector('[data-tag-find]').click() }
    root.querySelector('[data-tag-provider]').onchange = event => { state.provider = event.target.value; state.page = 0; render() }
    root.querySelector('[data-tag-facet]').onchange = event => { state.facet = event.target.value; state.page = 0; render() }
    root.querySelectorAll('[data-tag-id]').forEach(input => input.onchange = () => { const id = input.dataset.tagId, focused = document.activeElement === input; toggle(id, input.checked); state.message = ''; render(); if (focused) root.querySelector(`[data-tag-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }) })
    root.querySelector('[data-tag-prev]').onclick = () => { state.page--; render() }
    root.querySelector('[data-tag-next]').onclick = () => { state.page++; render() }
    root.querySelector('[data-tag-undo]').onclick = () => { state.draft = clone(state.base.tagPolicy); state.message = ''; render() }
    root.querySelector('[data-tag-save]').onclick = () => save(false)
    root.querySelector('[data-tag-apply]').onclick = () => save(true)
    root.querySelector('[data-tag-reload]').onclick = async () => { if (!dirty() || await ask(t('放弃尚未保存的标签修改？', 'Discard unsaved tag changes?', '未保存のタグ変更を破棄しますか？'))) void fetchData() }
    root.querySelector('[data-tag-manual]').onclick = () => editPrivate(null, 'MANUAL')
    root.querySelector('[data-tag-mapped]').onclick = () => editPrivate(null, 'MAPPED')
    root.querySelectorAll('[data-tag-edit]').forEach(button => button.onclick = () => editPrivate(state.draft.privateTags.find(tag => tag.id === button.dataset.tagEdit)))
    root.querySelectorAll('[data-tag-delete]').forEach(button => button.onclick = async () => { if (await ask(t('只删除私人标签，不删除作品、下载或平台标签；依赖该标签的匹配也会停止。继续？', 'Delete only this private label, not works, downloads or provider tags. Matches relying on it will stop. Continue?', '個人タグのみ削除し、作品・ダウンロード・元タグは残します。このタグによる一致も停止します。続行しますか？'))) { state.draft.privateTags = state.draft.privateTags.filter(tag => tag.id !== button.dataset.tagDelete); toggle('private|' + button.dataset.tagDelete, false); render() } })
    root.querySelectorAll('button,input,select').forEach(control => { if (state.saving) control.disabled = true })
    attachTagProfileExchange(root, {
        hasDraft: () => dirty() || state.saving,
        canUndo: state.data.tagExchange?.canUndo === true,
        labelOf: id => { const row = state.data.rows.find(row => row.identity === id); return row ? `${row.label} · ${row.provider}` : id },
        onCommitted: async (message, revision) => {
            await fetchData()
            state.message = state.base?.revision === revision ? message : message + ' ' + t('界面未刷新到新版本，请重新读取。', 'View did not refresh to the new revision; reload.', '表示を更新できませんでした。再読込してください。')
            document.dispatchEvent(new CustomEvent('pica-tag-policy-saved')); render()
        }
    })
}
async function save(apply) {
    if (state.saving) return
    state.saving = true; state.message = t('正在保存…', 'Saving…', '保存中…'); render()
    try {
        const response = await fetch('/api/v1/recommendation-v5/tag-policy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tagPolicy: state.draft, baseRevision: state.base.revision, apply }) }), data = await response.json()
        if (!response.ok) throw new Error(response.status === 409 ? t('另一端或窗口已经修改方案。草稿已保留，请重新读取后再调整。', 'Another device or window changed the scheme. Draft retained; reload before saving.', '別の端末・画面で変更されています。下書きは保持しました。再読込してください。') : data.error || `HTTP ${response.status}`)
        state.base = clone(data); state.data = data; state.draft = clone(data.tagPolicy)
        state.message = apply ? t('方案已保存；已请求重建。旧批次保留至重建成功，请在推荐页查看进度。', 'Scheme saved; regeneration requested. Previous batches remain until success. Check progress on Recommendations.', '設定を保存し再生成を要求しました。成功までは旧バッチを保持します。おすすめ画面で進捗を確認してください。') : t('已保存。现有批次不会被冒充为新规则结果；需要时点“保存并重新生成推荐”。', 'Saved. Existing batches are not new-rule results; regenerate when ready.', '保存済み。既存バッチは新設定の結果ではありません。必要に応じて再生成してください。')
        if (apply && data.recommendationRefresh?.started === false) state.message = t('方案已保存，但重建未能启动；旧批次仍保留，可稍后重试。', 'Scheme saved, but regeneration could not start. Previous batches remain; retry later.', '設定は保存しましたが再生成を開始できませんでした。旧バッチを保持しています。後で再試行してください。') + ' ' + String(data.recommendationRefresh.error || '')
        document.dispatchEvent(new CustomEvent('pica-tag-policy-saved'))
    } catch (error) { state.message = String(error.message || error) }
    finally { state.saving = false; render() }
}
function editPrivate(existing, kind = existing?.kind) {
    const dialog = document.createElement('dialog'); dialog.className = 'v5-private-dialog'
    const selected = new Set(existing?.[kind === 'MANUAL' ? 'comicIds' : 'mappings'] || [])
    dialog.innerHTML = `<h3>${kind === 'MANUAL' ? t('手工绑定私人标签', 'Manually bind a private label', '個人タグを手動で付ける') : t('原始标签 → 私人标签（任一匹配）', 'Raw tags → private label (ANY match)', '元タグ → 個人タグ（いずれか一致）')}</h3><label>${t('名称', 'Name', '名前')} <input data-private-name maxlength="80" value="${esc(existing?.name || '')}"></label><p>${t('此处修改先进入草稿，主面板保存后生效。', 'Changes here are staged until saved in the main panel.', 'ここでの変更は下書きです。メイン画面で保存すると反映されます。')}</p><label>${t('查找绑定项', 'Find bindings', '対象を検索')} <input data-private-query maxlength="160"></label><button type="button" data-private-find>${t('查找', 'Find', '検索')}</button><div data-private-bindings></div><p data-private-count></p><div class="actions"><button type="button" data-private-prev>${t('上一页', 'Previous', '前へ')}</button><button type="button" data-private-next>${t('下一页', 'Next', '次へ')}</button><button type="button" data-private-cancel>${t('取消', 'Cancel', 'キャンセル')}</button><button type="button" data-private-commit>${t('暂存并启用', 'Stage and enable', '仮保存して有効にする')}</button></div><p role="alert" data-private-error></p>`
    let page = 0
    const items = kind === 'MANUAL' ? state.data.comics.map(c => ({ id: c.comicId, label: `${c.title} · ${c.author} · ${c.providerId || 'pica'}` })) : state.data.rows.filter(row => row.provider !== 'private').map(row => ({ id: row.identity, label: `${row.label} · ${row.provider}` }))
    function bindings() {
        const q = dialog.querySelector('[data-private-query]').value.toLowerCase().trim(), filtered = items.filter(row => row.label.toLowerCase().includes(q) || row.id.toLowerCase().includes(q)), pages = Math.max(1, Math.ceil(filtered.length / 50)); page = Math.min(page, pages - 1)
        dialog.querySelector('[data-private-bindings]').innerHTML = filtered.slice(page * 50, (page + 1) * 50).map(row => `<label class="v5-tag-row"><input type="checkbox" data-binding="${esc(row.id)}" ${selected.has(row.id) ? 'checked' : ''}> ${esc(row.label)}</label>`).join('')
        dialog.querySelector('[data-private-count]').textContent = `${selected.size} ${t('项已选', 'selected', '件選択')} · ${page + 1}/${pages}`
        dialog.querySelector('[data-private-prev]').disabled = page === 0; dialog.querySelector('[data-private-next]').disabled = page + 1 >= pages
        dialog.querySelectorAll('[data-binding]').forEach(input => input.onchange = () => { if (input.checked) selected.add(input.dataset.binding); else selected.delete(input.dataset.binding); bindings() })
    }
    dialog.querySelector('[data-private-find]').onclick = () => { page = 0; bindings() }
    dialog.querySelector('[data-private-query]').onkeydown = event => { if (event.key === 'Enter') dialog.querySelector('[data-private-find]').click() }
    dialog.querySelector('[data-private-prev]').onclick = () => { page--; bindings() }; dialog.querySelector('[data-private-next]').onclick = () => { page++; bindings() }
    dialog.querySelector('[data-private-cancel]').onclick = () => dialog.close()
    dialog.querySelector('[data-private-commit]').onclick = () => {
        const name = dialog.querySelector('[data-private-name]').value.normalize('NFKC').trim()
        if (!name || selected.size > 4096 || (!existing && state.draft.privateTags.length >= 100)) { dialog.querySelector('[data-private-error]').textContent = t('请填写名称。最多 100 个私人标签、4096 个绑定。', 'Name required. Maximum 100 private labels and 4096 bindings.', '名前は必須です。個人タグは100個、対応付けは4096件までです。'); return }
        const id = existing?.id || 'pt_' + crypto.randomUUID().replaceAll('-', '')
        state.draft.privateTags = [...state.draft.privateTags.filter(tag => tag.id !== id), { id, name, kind, comicIds: kind === 'MANUAL' ? [...selected] : [], mappings: kind === 'MAPPED' ? [...selected] : [] }].sort((a, b) => a.id.localeCompare(b.id))
        toggle('private|' + id, true); state.message = ''; dialog.close(); render()
    }
    dialog.addEventListener('close', () => dialog.remove(), { once: true }); document.body.appendChild(dialog); bindings(); dialog.showModal(); dialog.querySelector('[data-private-name]').focus()
}
export function attachTagParticipation(panel) {
    if (panel.querySelector('#v5-tag-section')) return
    if (!document.querySelector('#v5-tag-style')) { const style = document.createElement('style'); style.id = 'v5-tag-style'; style.textContent = '.v5-tag-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:9px;border-bottom:1px solid var(--a83-line,#ddd)}.v5-tag-row label{flex:1;min-width:140px}.v5-tag-row small{opacity:.75}.v5-private-dialog{max-width:800px;width:90%;max-height:85vh;overflow:auto;background:var(--a83-surface,#fff);color:var(--a83-text,#222);border:1px solid var(--a83-line,#ddd);border-radius:14px}.v5-private-dialog::backdrop{background:#0008}'; document.head.appendChild(style) }
    const details = document.createElement('details'); details.id = 'v5-tag-section'; details.innerHTML = `<summary>${t('用于推荐的标签与私人标签', 'Recommendation tag scope and private labels', 'おすすめに使うタグ・個人タグ')}</summary><div id="v5-tag-body"></div>`
    details.addEventListener('toggle', () => { if (details.open) { if (state.data) render(); else void fetchData() } })
    panel.querySelector('#v5-tuning-section')?.insertAdjacentElement('beforebegin', details)
}
window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = '' } })
