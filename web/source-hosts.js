import { copy as t } from './locale-runtime.js'

const $ = id => document.getElementById(id)
const panel = $('source-host-panel')
let active = null, busy = false, generation = 0, session = null, result = null, state = 'IDLE'
const messages = {
    IDLE: ['不会自动连接；请先确认地址和请求范围。', 'No automatic connection. Confirm the endpoint and request scope first.', '自動接続は行いません。接続先とリクエスト範囲を確認してください。'],
    WORKING: ['正在检查宿主与一页来源…', 'Checking the host and one source page…', 'ホストと配信元一覧の1ページを確認中…'],
    SUCCESS: ['本次只读检查成功。不代表阅读、导入或扩展可信验证已完成。', 'This read-only check succeeded. Reader/import support and extension trust are not established.', '今回の読み取り確認は成功しました。読書・取り込み対応や拡張の信頼性確認の完了ではありません。'],
    LOCAL_DESKTOP_REQUIRED: ['此功能只允许已配置的本机 Desktop 页面使用。', 'This requires the configured local Desktop UI.', '設定済みのローカル Desktop 画面からのみ利用できます。'],
    INVALID_SOURCE_HOST: ['地址或参数不受支持；请使用不含账号、查询参数或片段的宿主地址。', 'Unsupported endpoint or options. Do not put credentials, query parameters or fragments in the URL.', '接続先または設定が未対応です。URL に認証情報・クエリ・フラグメントを含めないでください。'],
    SOURCE_HOST_CONSENT_REQUIRED: ['请明确确认本次连接范围。', 'Explicitly approve this connection scope.', '今回の接続範囲を明示的に承認してください。'],
    SOURCE_HOST_INSECURE: ['远程连接请使用 HTTPS。HTTP 仅限回环，或明确同意的局域网 IP；局域网 HTTP 不发送 Basic 密码。', 'Use HTTPS remotely. HTTP is limited to loopback or explicitly approved LAN IPs; LAN HTTP cannot carry Basic passwords.', 'リモート接続は HTTPS を使用してください。HTTP はループバックか承認済み LAN IP に限定し、LAN HTTP へ Basic パスワードは送信しません。'],
    SOURCE_HOST_AUTH_REQUIRED: ['宿主要求认证或拒绝了账号。这里只支持匿名/BASIC_AUTH，不复用 SIMPLE_LOGIN/UI_LOGIN 网页会话。', 'The host requires authentication or rejected it. Only anonymous/BASIC_AUTH is supported, not SIMPLE_LOGIN/UI_LOGIN browser sessions.', 'ホストが認証を要求または拒否しました。匿名/BASIC_AUTH のみ対応し、SIMPLE_LOGIN/UI_LOGIN のブラウザーセッションは再利用しません。'],
    SOURCE_HOST_UNSUPPORTED: ['宿主版本或协议不受支持；目前只检查 Suwayomi 2.4 的固定只读接口。', 'Unsupported host version or protocol. This checks only fixed Suwayomi 2.4 read-only queries.', 'ホストのバージョンまたはプロトコルが未対応です。Suwayomi 2.4 の固定読み取りクエリのみ確認します。'],
    SOURCE_HOST_PROTOCOL: ['宿主响应不完整或格式不符；没有应用任何来源或书库更改。', 'The host returned incomplete or invalid data. No sources or library records were changed.', 'ホストの応答が不完全または不正です。配信元やライブラリは変更していません。'],
    SOURCE_HOST_REDIRECT: ['宿主要求重定向，已停止；请核对最终地址后重新确认，不会转发凭据。', 'Redirect refused. Confirm the final endpoint explicitly; credentials were not forwarded.', 'リダイレクトを拒否しました。最終接続先を確認し直してください。認証情報は転送していません。'],
    SOURCE_HOST_TOO_LARGE: ['响应超过限制，已停止，不会继续扫描。', 'Response limit exceeded. Stopped without scanning further.', '応答サイズが上限を超えたため停止しました。追加スキャンはしません。'],
    SOURCE_HOST_UNAVAILABLE: ['宿主不可用，请检查地址、网络和认证方式；不会自动重试。', 'Host unavailable. Check the endpoint, network and authentication. No automatic retry.', 'ホストに接続できません。接続先・ネットワーク・認証方式を確認してください。自動再試行はしません。'],
    SOURCE_HOST_BUSY: ['另一项检查尚未结束；请完成或取消后重试。', 'Another inspection is active. Finish or cancel it before retrying.', '別の確認が実行中です。完了または取消後に再試行してください。'],
    SOURCE_HOST_CANCELLED: ['已取消检查，没有保存宿主或来源。', 'Inspection cancelled. No host or sources were saved.', '確認を取り消しました。ホストや配信元は保存していません。'],
    SOURCE_HOST_TIMEOUT: ['检查超时，已停止；请核对宿主状态后再试。', 'Inspection timed out and stopped. Check the host before retrying.', '確認がタイムアウトして停止しました。ホストを確認してから再試行してください。']
}
const labels = [
    ['summary', '外部宿主诊断（实验）', 'External host diagnostics (experimental)', '外部ホスト診断（実験）'],
    ['help', '连接你已自行运行的 Suwayomi 2.4 宿主，只检查版本和已安装来源。不会下载、安装或启动宿主/扩展；本软件内阅读和导入尚未接通。', 'Connect an existing Suwayomi 2.4 host to inspect its version and installed sources only. No host/extensions are downloaded, installed or started. Reader and library import are not connected yet.', '自分で実行済みの Suwayomi 2.4 ホストのバージョンと配信元のみ確認します。ホストや拡張を取得・インストール・起動せず、本アプリ内の読書・取り込みは未接続です。'],
    ['privacy', '仅使用你在这里输入的宿主凭据，临时保留在当前面板；关闭即停止使用，不保存或同步。不会使用或转发 Pica、E-H、JM、GitHub 或网盘凭据。', 'Only host credentials entered here are used temporarily in this panel. Closing clears the session; nothing is saved or synced. Pica/E-H/JM/GitHub/WebDAV credentials are never used or forwarded.', 'ここに入力したホスト認証情報のみ、このパネルで一時的に使用します。閉じるとセッションを破棄し、保存・同期しません。Pica/E-H/JM/GitHub/WebDAV の認証情報は使用・転送しません。'],
    ['endpoint-label', '宿主地址', 'Host endpoint', 'ホストの接続先'],
    ['auth-label', '宿主认证', 'Host authentication', 'ホスト認証'],
    ['auth-none', '匿名', 'Anonymous', '匿名'],
    ['auth-basic', 'Basic 账号', 'Basic account', 'Basic アカウント'],
    ['username-label', '宿主用户名（非 Pica 账号）', 'Host username (not your Pica account)', 'ホストのユーザー名（Pica とは別）'],
    ['password-label', '宿主密码', 'Host password', 'ホストのパスワード'],
    ['lan-label', '仅本次允许明确输入的局域网 IP 使用 HTTP（不能携带 Basic 密码）', 'Allow this explicit LAN IP to use HTTP for this request only (no Basic password)', '今回のみ明示した LAN IP の HTTP 接続を許可（Basic パスワード不可）'],
    ['consent-label', '我确认该宿主及请求范围，允许本次只读连接', 'I confirm this host and scope and allow this read-only connection', 'ホストと範囲を確認し、今回の読み取り接続を許可します'],
    ['submit', '检查宿主与来源', 'Inspect host and sources', 'ホストと配信元を確認'],
    ['cancel', '取消检查', 'Cancel inspection', '確認を取り消す'],
    ['previous', '上一页', 'Previous page', '前のページ'],
    ['next', '下一页', 'Next page', '次のページ']
]
function safeCode(code) { return typeof code === 'string' && Object.hasOwn(messages, code) ? code : 'SOURCE_HOST_UNAVAILABLE' }
function buttons() {
    $('source-host-fields').disabled = busy
    const basic = $('source-host-auth').value === 'basic'
    $('source-host-username').disabled = busy || !basic
    $('source-host-password').disabled = busy || !basic
    $('source-host-username').required = basic
    $('source-host-password').required = basic
    $('source-host-submit').disabled = busy || !$('source-host-consent').checked
    $('source-host-cancel').disabled = !busy
    $('source-host-previous').disabled = busy || !session || !result || result.page.offset <= 0
    $('source-host-next').disabled = busy || !session || !result || !result.page.hasNext || result.page.offset + result.page.size > 5000
    $('source-host-state').textContent = t(...messages[safeCode(state)])
}
function output() {
    const root = $('source-host-results'); root.replaceChildren(); root.hidden = !result
    if (!result) return
    const heading = document.createElement('p'); heading.textContent = `${result.server.name} · ${result.server.version}`; root.append(heading)
    const count = document.createElement('p'); count.textContent = `${t('本页', 'This page', 'このページ')}: ${result.page.sources.length} · ${t('宿主报告总数', 'Host-reported total', 'ホスト側の総件数')}: ${result.page.total}`; root.append(count)
    const table = document.createElement('table'), head = table.createTHead().insertRow(), body = table.createTBody()
    for (const label of [t('来源', 'Source', '配信元'), t('语言', 'Language', '言語'), t('来源 ID', 'Source ID', '配信元 ID'), t('支持最新列表', 'Latest-list support', '新着一覧に対応')]) { const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; head.append(cell) }
    for (const item of result.page.sources) {
        const row = body.insertRow()
        for (const value of [item.name, item.language, item.id, item.supportsLatest ? t('是', 'Yes', 'はい') : t('否', 'No', 'いいえ')]) { const cell = row.insertCell(), text = document.createElement('bdi'); text.textContent = value; cell.style.overflowWrap = 'anywhere'; cell.append(text) }
    }
    root.append(table)
}
function localize() { for (const [id, zh, en, ja] of labels) $('source-host-' + id).textContent = t(zh, en, ja); buttons(); output() }
function clear(clearCredentials = false) {
    generation++; active?.abort(); session = null; result = null; state = busy ? 'SOURCE_HOST_CANCELLED' : 'IDLE'
    if (clearCredentials) { $('source-host-password').value = ''; $('source-host-username').value = ''; $('source-host-consent').checked = false }
    output(); buttons()
}
function draft() {
    const basic = $('source-host-auth').value === 'basic'
    return { kind: 'suwayomi', endpoint: $('source-host-endpoint').value.trim(), consent: $('source-host-consent').checked, allowInsecureLan: $('source-host-lan').checked, auth: basic ? { mode: 'basic', username: $('source-host-username').value, password: $('source-host-password').value } : { mode: 'none' } }
}
function validResult(value) {
    return value?.kind === 'suwayomi' && value.protocolVersion === 1 && value.persisted === false && value.capabilities?.sourceInspection === true && value.capabilities.reader === false && value.capabilities.libraryImport === false && value.capabilities.extensionInstall === false && typeof value.server?.name === 'string' && typeof value.server.version === 'string' && Array.isArray(value.page?.sources) && value.page.sources.length <= 25 && value.page.sources.every(item => typeof item.id === 'string' && typeof item.name === 'string' && typeof item.language === 'string' && typeof item.supportsLatest === 'boolean') && Number.isInteger(value.page.offset) && value.page.offset >= 0 && value.page.offset <= 5000 && value.page.size === 25 && typeof value.page.hasNext === 'boolean' && typeof value.page.hasPrevious === 'boolean' && Number.isSafeInteger(value.page.total)
}
async function inspect(offset, reuse = false) {
    if (busy || !panel.open) return
    if (!reuse && !$('source-host-form').reportValidity()) return
    const input = reuse ? session : draft()
    if (!input) return
    const controller = new AbortController(), ticket = ++generation
    let timedOut = false
    const deadline = setTimeout(() => { timedOut = true; controller.abort() }, 16000)
    active = controller; busy = true; result = null; state = 'WORKING'; output(); buttons()
    $('source-host-password').value = ''
    try {
        const statusResponse = await fetch('/api/v1/desktop/status', { signal: controller.signal, cache: 'no-store' }), status = await statusResponse.json()
        if (!statusResponse.ok || !status.configured || status.startupReady === false || !status.csrfToken || !status.sourceHostInspection?.available) throw { code: 'LOCAL_DESKTOP_REQUIRED' }
        if (ticket !== generation || !panel.open || controller.signal.aborted) return
        const response = await fetch('/api/v1/desktop/source-hosts/inspect', { method: 'POST', headers: { 'content-type': 'application/json', 'x-pica-csrf': status.csrfToken }, body: JSON.stringify({ ...input, offset }), signal: controller.signal, cache: 'no-store' })
        const value = await response.json()
        if (!response.ok) throw { code: safeCode(value.code) }
        if (!validResult(value)) throw { code: 'SOURCE_HOST_PROTOCOL' }
        if (ticket !== generation || !panel.open) return
        result = value; session = input; state = 'SUCCESS'; output()
    } catch (error) {
        if (ticket !== generation) return
        result = null; session = null; state = timedOut ? 'SOURCE_HOST_TIMEOUT' : error?.name === 'AbortError' ? 'SOURCE_HOST_CANCELLED' : safeCode(error?.code); output()
    } finally { clearTimeout(deadline); if (active === controller) { active = null; busy = false; buttons() } }
}
if (panel) {
    $('source-host-form').addEventListener('submit', event => { event.preventDefault(); void inspect(0) })
    $('source-host-cancel').addEventListener('click', () => clear())
    $('source-host-previous').addEventListener('click', () => { if (result) void inspect(result.page.offset - 25, true) })
    $('source-host-next').addEventListener('click', () => { if (result) void inspect(result.page.offset + 25, true) })
    for (const id of ['endpoint', 'auth', 'username', 'password', 'lan']) for (const event of ['input', 'change']) $('source-host-' + id).addEventListener(event, () => { clear(); if (id === 'auth' && $('source-host-auth').value === 'none') { $('source-host-username').value = ''; $('source-host-password').value = '' } $('source-host-consent').checked = false; buttons() })
    $('source-host-consent').addEventListener('change', () => { if (!$('source-host-consent').checked) clear(); buttons() })
    panel.addEventListener('toggle', () => { if (!panel.open) clear(true) })
    window.addEventListener('pagehide', () => clear(true))
    document.addEventListener('pica-language-change', localize)
    localize()
}
