import { copy as t } from './locale-runtime.js'

const $ = id => document.getElementById('saved-host-' + id)
const panel = $('panel')
let registry = null, active = null, generation = 0
const labels = [
    ['summary', '我的外部宿主配置（实验）', 'My external host settings (experimental)', '外部ホスト設定（実験）'],
    ['boundary', '这是本地阅读器，不经营漫画内容平台。外部宿主由你自行选择和管理，不提供默认内容目录、源仓库或托管服务。此配置仅授权检查；读取用户宿主书库需另行授权短期会话，尚不支持导入。', 'This is a local reader, not a content platform. You choose and manage external hosts; no default catalogue, repository or hosted content service is provided. These settings authorize inspection only. Reading your hosted library requires a separate short-lived session; import is unsupported.', '本アプリはローカルリーダーであり配信プラットフォームではありません。外部ホストは利用者が選択・管理し、既定カタログ・リポジトリ・コンテンツサービスは提供しません。この設定は確認専用です。ホスト上のライブラリを読むには別の短期セッション許可が必要で、取り込みは未対応です。'],
    ['privacy', '只在本机保存名称、地址和检查权限，不保存账号密码、不上传或同步。保存后默认停用；允许检查也不会自动连接。停用或移除只影响该连接，不删除漫画或阅读数据。', 'Only the name, endpoint and inspection permission are saved locally. Credentials are not saved, uploaded or synced. Saved hosts start disabled; enabling inspection never connects automatically. Disabling/removing affects only this connection, not comics or reading data.', '名称・接続先・確認権限のみローカル保存します。認証情報は保存・アップロード・同期しません。保存直後は無効で、有効化しても自動接続しません。無効化・削除は接続設定のみを対象とし、漫画や閲覧データは削除しません。'],
    ['refresh', '查看 / 刷新我的配置', 'View / refresh my settings', '自分の設定を表示・更新'],
    ['label-label', '自定义名称', 'Your label', '自分で付ける名称'],
    ['endpoint-label', '你自行运行的 Suwayomi 2.4 宿主地址', 'Your existing Suwayomi 2.4 host endpoint', '自分で実行済みの Suwayomi 2.4 ホスト'],
    ['auth-label', '宿主认证方式', 'Host authentication', 'ホスト認証'],
    ['anonymous', '匿名', 'Anonymous', '匿名'],
    ['basic', 'Basic（每次检查单独输入）', 'Basic (enter separately per inspection)', 'Basic（確認のたびに入力）'],
    ['lan-label', '允许该明确的局域网 IP 使用 HTTP；不能携带 Basic 密码', 'Allow this explicit LAN IP to use HTTP, without Basic passwords', '指定した LAN IP の HTTP を許可（Basic パスワード不可）'],
    ['consent-label', '我选择并管理该宿主，仅保存本机检查配置，不授权其他能力', 'I choose and manage this host and save local inspection settings only, not other capabilities', '自分で選択・管理するホストのローカル確認設定のみ保存し、他の機能は許可しません'],
    ['save', '保存配置（默认停用）', 'Save settings (disabled by default)', '設定を保存（初期状態は無効）'],
    ['cancel', '取消当前请求', 'Cancel current request', '現在のリクエストを取り消す']
]
const errors = {
    INVALID_SOURCE_HOST: ['配置或参数无效。', 'Invalid settings or options.', '設定または引数が不正です。'],
    SOURCE_HOST_CONSENT_REQUIRED: ['请明确确认本次范围。', 'Confirm the scope explicitly.', '今回の範囲を明示的に確認してください。'],
    SOURCE_HOST_INSECURE: ['远程请使用 HTTPS；LAN HTTP 不发送 Basic 密码。', 'Use HTTPS remotely; LAN HTTP cannot carry Basic passwords.', 'リモート接続は HTTPS を使用し、LAN HTTP に Basic パスワードは送信しません。'],
    SOURCE_HOST_STORAGE: ['本机配置不可读或无法保存；不会重置文件或影响本地阅读。', 'Local settings cannot be read or saved. The file is not reset; local reading is unaffected.', 'ローカル設定の読み取り・保存ができません。ファイルを初期化せず、ローカル読書には影響しません。'],
    SOURCE_HOST_DUPLICATE: ['该地址已保存；请使用已有配置。', 'This endpoint is already saved. Use the existing entry.', 'この接続先は保存済みです。既存の設定を使用してください。'],
    SOURCE_HOST_STALE: ['配置已在其他页面更改，请手动刷新后再操作。', 'Settings changed in another page. Refresh before continuing.', '別の画面で設定が変更されました。更新してから再操作してください。'],
    SOURCE_HOST_DISABLED: ['此连接已停用。', 'This connection is disabled.', 'この接続は無効です。'],
    SOURCE_HOST_AUTH_REQUIRED: ['宿主要求独立的 Basic 凭据；不会复用其他平台账号。', 'The host requires its own Basic credentials. Other platform accounts are not reused.', 'ホスト専用の Basic 認証情報が必要です。他サービスのアカウントは再利用しません。'],
    SOURCE_HOST_BUSY: ['另一个检查尚未结束。', 'Another inspection is still active.', '別の確認が実行中です。'],
    SOURCE_HOST_CANCELLED: ['请求已取消。保存操作可能已经完成，请手动刷新确认。', 'Request cancelled. A save may already have completed; refresh to confirm.', 'リクエストを取り消しました。保存が完了している可能性があるため、更新して確認してください。'],
    SOURCE_HOST_UNSUPPORTED: ['宿主协议不受支持。', 'Unsupported host protocol.', '未対応のホストプロトコルです。'],
    SOURCE_HOST_PROTOCOL: ['宿主响应不完整或格式无效。', 'Incomplete or invalid host response.', 'ホスト応答が不完全または不正です。'],
    SOURCE_HOST_REDIRECT: ['已拒绝重定向，不转发凭据。', 'Redirect refused; credentials are not forwarded.', 'リダイレクトを拒否し、認証情報を転送しません。'],
    SOURCE_HOST_TOO_LARGE: ['响应超过限制，已停止。', 'Response limit exceeded; stopped.', '応答が上限を超えたため停止しました。'],
    SOURCE_HOST_TIMEOUT: ['请求超时，未自动重试。', 'Request timed out; no automatic retry.', 'タイムアウトしました。自動再試行は行いません。'],
    SOURCE_HOST_UNAVAILABLE: ['本机 Desktop 或宿主不可用；请核对配置。', 'Local Desktop or host unavailable. Check the settings.', 'ローカル Desktop またはホストが利用できません。設定を確認してください。']
}
function text(tag, value) { const node = document.createElement(tag); node.textContent = value; return node }
function button(value, action) { const node = text('button', value); node.type = 'button'; node.disabled = Boolean(active); node.onclick = action; return node }
function controls() {
    $('fields').disabled = Boolean(active)
    $('save').disabled = Boolean(active) || !$('consent').checked
    $('refresh').disabled = Boolean(active)
    $('cancel').disabled = !active
}
function clearSecrets() { for (const node of $('list').querySelectorAll('input[data-host-secret]')) node.value = '' }
function clear() { generation++; active?.abort(); clearSecrets(); registry = null; $('list').replaceChildren(); $('state').textContent = ''; controls() }
function valid(value) {
    return value?.schemaVersion === 1 && value.scope === 'inspect-only' && value.credentials === 'per-request-not-stored' && ['available', 'unavailable'].includes(value.storage) && value.capabilities?.sourceInspection === true && value.capabilities.reader === false && value.capabilities.libraryImport === false && value.capabilities.extensionInstall === false && Array.isArray(value.hosts) && value.hosts.length <= 16 && value.hosts.every(host => typeof host.id === 'string' && typeof host.endpoint === 'string' && typeof host.label === 'string' && typeof host.enabled === 'boolean' && ['none', 'basic'].includes(host.authMode) && Number.isSafeInteger(host.revision))
}
async function request(path, input, inspect = false) {
    if (active || !panel.open) return
    const controller = new AbortController(), ticket = ++generation
    let timedOut = false
    const deadline = setTimeout(() => { timedOut = true; controller.abort() }, 16000)
    active = controller; controls(); render()
    $('state').textContent = t('正在处理…', 'Working…', '処理中…')
    try {
        const statusResponse = await fetch('/api/v1/desktop/status', { signal: controller.signal, cache: 'no-store' }), status = await statusResponse.json()
        if (!statusResponse.ok || !status.configured || status.startupReady === false || !status.csrfToken || !status.sourceHostConnections?.available) throw { code: 'SOURCE_HOST_UNAVAILABLE' }
        if (ticket !== generation || !panel.open || controller.signal.aborted) return
        const response = await fetch('/api/v1/desktop/source-hosts/' + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-pica-csrf': status.csrfToken }, body: JSON.stringify(input), cache: 'no-store', signal: controller.signal })
        const value = await response.json()
        if (!response.ok) throw { code: value.code }
        if (ticket !== generation || !panel.open) return
        if (inspect) {
            if (value?.capabilities?.reader !== false || value?.persisted !== false || !Array.isArray(value.page?.sources) || value.page.sources.length > 25) throw { code: 'SOURCE_HOST_PROTOCOL' }
            $('state').textContent = t(`只读检查完成：本页 ${value.page.sources.length} 个来源，宿主报告共 ${value.page.total} 个。没有安装、导入或打开内容。`, `Read-only inspection completed: ${value.page.sources.length} sources on this page, ${value.page.total} reported by the host. Nothing was installed, imported or opened.`, `読み取り確認完了：このページ ${value.page.sources.length} 件、ホスト報告の総数 ${value.page.total} 件。インストール・取り込み・作品表示は行っていません。`)
        } else {
            if (!valid(value)) throw { code: 'SOURCE_HOST_PROTOCOL' }
            registry = value
            $('state').textContent = value.storage === 'unavailable' ? t(...errors.SOURCE_HOST_STORAGE) : t('本机配置已更新；未连接外部宿主。', 'Local settings updated; no external host was contacted.', 'ローカル設定を更新しました。外部ホストへ接続していません。')
            $('consent').checked = false
        }
    } catch (error) {
        if (ticket === generation) $('state').textContent = t(...(timedOut ? errors.SOURCE_HOST_TIMEOUT : error?.name === 'AbortError' ? errors.SOURCE_HOST_CANCELLED : errors[error?.code] || errors.SOURCE_HOST_UNAVAILABLE))
    } finally { clearTimeout(deadline); clearSecrets(); if (active === controller) { active = null; controls(); render() } }
}
function render() {
    const root = $('list'); clearSecrets(); root.replaceChildren()
    if (!registry) return
    if (!registry.hosts.length) { root.append(text('p', t('没有已保存宿主；本地阅读不需要它。', 'No saved hosts. Local reading does not require one.', '保存済みホストはありません。ローカル読書には不要です。'))); return }
    for (const host of registry.hosts) {
        const card = document.createElement('section'); card.className = 'panel'; card.style.overflowWrap = 'anywhere'
        card.append(text('h3', host.label), text('bdi', host.endpoint), text('p', host.enabled ? t('允许手动检查 · 无自动连接', 'Manual inspection allowed · no automatic connection', '手動確認を許可・自動接続なし') : t('已停用', 'Disabled', '無効')))
        card.append(button(host.enabled ? t('停用', 'Disable', '無効化') : t('允许手动检查', 'Allow manual inspection', '手動確認を許可'), () => void request('connections', { action: 'set-enabled', id: host.id, expectedRevision: host.revision, enabled: !host.enabled, consent: true })))
        const remove = button(t('移除连接配置', 'Remove connection settings', '接続設定を削除'), () => { remove.hidden = true; confirm.hidden = false })
        const confirm = document.createElement('div'); confirm.hidden = true
        confirm.append(text('p', t('仅移除此连接，不会删除本地或宿主上的漫画、账号或阅读数据。确认？', 'Remove only this connection, not local or hosted comics, accounts or reading data. Confirm?', 'この接続設定のみ削除し、ローカル・ホスト上の漫画・アカウント・閲覧データは削除しません。確認しますか？')), button(t('确认移除', 'Confirm removal', '削除を確認'), () => void request('connections', { action: 'remove', id: host.id, expectedRevision: host.revision, consent: true })), button(t('取消', 'Cancel', '取消'), () => { remove.hidden = false; confirm.hidden = true }))
        card.append(remove, confirm)
        const library = button(t('另行授权读取宿主书库', 'Authorize hosted-library reading separately', 'ホスト書庫の読書を別途許可'), () => document.dispatchEvent(new CustomEvent('pica-host-library-config', { detail: { ...host } })))
        library.dataset.hostLibrary = host.id
        library.disabled ||= !host.enabled
        card.append(library)
        let username, password
        if (host.enabled && host.authMode === 'basic') {
            username = document.createElement('input'); password = document.createElement('input'); password.type = 'password'
            username.maxLength = 256; password.maxLength = 4096; username.autocomplete = 'off'; password.autocomplete = 'new-password'
            for (const [node, caption] of [[username, t('本次宿主用户名', 'Host username for this request', '今回のホストユーザー名')], [password, t('本次宿主密码（不保存）', 'Host password for this request (not saved)', '今回のホストパスワード（保存しません）')]]) { const label = document.createElement('label'); label.append(text('span', caption), node); node.dataset.hostSecret = '1'; node.disabled = Boolean(active); card.append(label) }
        }
        const inspect = button(t('检查一页来源', 'Inspect one source page', '配信元一覧の1ページを確認'), () => {
            const auth = host.authMode === 'basic' ? { mode: 'basic', username: username.value, password: password.value } : { mode: 'none' }
            clearSecrets()
            void request('inspect-saved', { id: host.id, expectedRevision: host.revision, consent: true, offset: 0, auth }, true)
        })
        inspect.disabled ||= !host.enabled
        card.append(inspect); root.append(card)
    }
}
function localize() { for (const [id, ...values] of labels) $(id).textContent = t(...values); render(); controls() }
if (panel) {
    $('form').addEventListener('submit', event => {
        event.preventDefault()
        if (!$('form').reportValidity()) return
        void request('connections', { action: 'save', kind: 'suwayomi', label: $('label').value.trim(), endpoint: $('endpoint').value.trim(), authMode: $('auth').value, allowInsecureLan: $('lan').checked, scope: 'inspect-only', consent: $('consent').checked })
    })
    $('refresh').onclick = () => void request('connections', { action: 'list' })
    $('consent').onchange = controls
    for (const id of ['label', 'endpoint', 'auth', 'lan']) for (const event of ['input', 'change']) $(id).addEventListener(event, () => { $('consent').checked = false; controls() })
    $('cancel').onclick = () => active?.abort()
    panel.addEventListener('toggle', () => { if (!panel.open) clear() })
    window.addEventListener('pagehide', clear)
    document.addEventListener('pica-language-change', localize)
    localize()
}
