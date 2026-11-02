import { copy as t } from './locale-runtime.js'
import { isSignedReaderComicId } from './signed-reader-route.js'

const $ = (id) => document.getElementById(id)
let revision = null,
    csrf = '',
    busy = false
function localize() {
    for (const [id, zh, en, ja] of [
        [
            'source-choices-title',
            '外部漫画来源 · 可选',
            'External comic sources · optional',
            '外部漫画配信元 · オプション'
        ],
        [
            'source-choices-help',
            '本软件不附带内容。关闭来源会停止对应联网请求，保留本地下载、收藏和账号；E-H / ExH 使用同一个开关。',
            'No content is bundled. Disabling a source stops its network requests, not local reading or stored accounts and favorites. E-H / ExH share one switch.',
            'コンテンツは付属しません。配信元を無効にすると通信が停止します。ローカル読書、保存済みアカウント、お気に入りは保持されます。E-H / ExH は共通設定です。'
        ],
        [
            'source-choices-legend',
            '允许此电脑连接哪些来源',
            'Sources this computer may connect to',
            'このパソコンで接続を許可する配信元'
        ],
        [
            'source-choices-save',
            '保存来源选择',
            'Save source choices',
            '配信元の選択を保存'
        ],
        [
            'source-choices-refresh',
            '读取当前选择',
            'Read current choices',
            '現在の選択を読み込む'
        ]
    ])
        $(id).textContent = t(zh, en, ja)
}
async function readChoices() {
    if (busy) return
    busy = true
    $('source-choices-refresh').disabled = true
    $('source-choices-options').disabled = true
    try {
        const response = await fetch('/api/v1/desktop/status')
        const status = await response.json()
        const policy = status.externalSources
        if (
            !response.ok ||
            !status.configured ||
            !policy ||
            policy.schemaVersion !== 1 ||
            !Array.isArray(policy.enabled)
        )
            throw new Error(
                t(
                    '请先配置本地书库；远程网页不能修改电脑来源。',
                    'Configure the local library first. Remote Web cannot change Desktop sources.',
                    'まずローカルライブラリを設定してください。リモート Web では変更できません。'
                )
            )
        csrf = status.csrfToken || ''
        if (!csrf)
            throw new Error(
                t(
                    '此页面没有本机设置权限',
                    'This page cannot edit local settings',
                    'このページではローカル設定を編集できません'
                )
            )
        revision = policy.revision
        for (const input of $('source-choices-form').querySelectorAll(
            'input[name="source"]'
        ))
            input.checked = policy.enabled.includes(input.value)
        $('source-choices-options').disabled = false
        $('source-choices-state').textContent =
            status.sourcePolicyOrigin === 'legacy-compatible'
                ? t(
                      '已保留旧版本来源状态。更改后点击保存；不会删除任何数据。',
                      'Previous-version choices are preserved. Save changes explicitly; no data is deleted.',
                      '旧バージョンの状態を保持しています。変更後に保存してください。データは削除されません。'
                  )
                : t(
                      '已读取。勾选只改变草稿，保存后生效。',
                      'Loaded. Checkbox changes take effect only after saving.',
                      '読み込み済み。変更は保存後に反映されます。'
                  )
    } catch (error) {
        revision = null
        $('source-choices-state').textContent = error.message
    } finally {
        busy = false
        $('source-choices-refresh').disabled = false
    }
}
$('source-choices-refresh').onclick = readChoices
$('source-choices-form').onsubmit = async (event) => {
    event.preventDefault()
    if (busy || revision === null) return
    busy = true
    const enabled = [
        ...$('source-choices-form').querySelectorAll(
            'input[name="source"]:checked'
        )
    ].map((input) => input.value)
    $('source-choices-options').disabled = true
    $('source-choices-refresh').disabled = true
    try {
        const response = await fetch('/api/v1/desktop/settings', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-pica-csrf': csrf
            },
            body: JSON.stringify({
                sourceAction: 'save',
                enabled,
                expectedRevision: revision
            })
        })
        const result = await response.json()
        if (!response.ok)
            throw new Error(
                result.error ||
                    t(
                        '保存失败，请读取当前选择后重试',
                        'Save failed; reload current choices before retrying',
                        '保存できません。現在の選択を再読込してください'
                    )
            )
        revision = result.externalSources.revision
        $('source-choices-state').textContent = t(
            '已保存。已关闭来源的联网请求已停止，本地阅读和数据保持不变。',
            'Saved. Disabled sources cannot connect. Local reading and data are unchanged.',
            '保存しました。無効な配信元の通信は停止し、ローカル読書とデータは保持されます。'
        )
        document.dispatchEvent(
            new CustomEvent('pica-source-choices-changed', {
                detail: result.externalSources
            })
        )
    } catch (error) {
        revision = null
        $('source-choices-state').textContent =
            `${error.message} · ${t('请读取当前选择后重试', 'Read current choices before retrying', '現在の選択を再読込してください')}`
    } finally {
        busy = false
        $('source-choices-options').disabled = revision === null
        $('source-choices-refresh').disabled = false
    }
}
localize()
document.addEventListener('pica-language-change', localize)
// Explicit load only: opening a normal page never probes a provider or starts a worker.

/**
 * Optional trusted signed-source UI. The normal release has no signed worker
 * controller, so the panel remains hidden and does not probe a provider.
 * This reuses the existing authenticated Desktop command API; it does NOT
 * install scripts or accept a worker path / publisher key from the browser.
 */
const signedPanel = $('signed-source-manager')
let signedCsrf = '', signedBusy = false, signedRows = [], signedCanInstall = false
const signedSessions = new Map()
const signedQueries = new Map()
const signedResults = new Map()
const signedText = (tag, value) => {
    const element = document.createElement(tag)
    if (value !== undefined) element.textContent = value
    return element
}
function signedLabels() {
    for (const [id, zh, en, ja] of [
        ['summary', '已验证的独立来源组件（实验）', 'Verified source components (experimental)', '検証済み配信元コンポーネント（実験）'],
        ['help', '只允许应用预置公钥验证过的来源。支持主动选择本地签名 ZIP；不提供来源商店、脚本 URL 或自动安装。安装后仍需手动启用。', 'Only sources verified against the app-pinned publisher key are accepted. You may select a local signed ZIP; there is no marketplace, script URL or auto-install. Enabling is separate.', 'アプリが固定した公開鍵で検証できるソースのみ受け入れます。ローカル署名ZIPを選択できますが、配信元ストア・スクリプトURL・自動インストールはありません。有効化は別操作です。'],
        ['refresh', '查看已安装的签名来源', 'Show installed signed sources', 'インストール済み署名ソースを表示'],
        ['install', '选择本地已签名来源 ZIP', 'Install local signed source ZIP', 'ローカル署名ソースZIPを選択']
    ]) $('signed-source-' + id).textContent = t(zh, en, ja)
}
async function signedCommand(input) {
    const response = await fetch('/api/v1/desktop/signed-reader', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-pica-csrf': signedCsrf },
        body: JSON.stringify(input),
        cache: 'no-store'
    })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error ||
        t('来源操作失败，请刷新版本状态。', 'Source operation failed; refresh the versions.', 'ソース操作に失敗しました。バージョンを再読み込みしてください。'))
    return value
}
function signedInventory(value) {
    if (value?.schemaVersion !== 1 ||
        typeof value.installAvailable !== 'boolean' ||
        !Array.isArray(value.sources) || value.sources.length > 64 ||
        value.sources.some(source =>
            !/^[a-z][a-z0-9-]{2,31}$/.test(source.sourceId) ||
            !Number.isSafeInteger(source.revision) ||
            !Array.isArray(source.versions) || source.versions.length > 100 ||
            source.versions.some(version => !/^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/.test(version)) ||
            !(source.activeVersion === null || source.versions.includes(source.activeVersion)) ||
            typeof source.connected !== 'boolean'))
        throw new Error('Invalid signed source inventory')
    signedRows = value.sources
    signedCanInstall = value.installAvailable
    for (const [id] of signedSessions)
        if (!signedRows.some(row => row.sourceId === id && row.connected)) {
            signedSessions.delete(id)
            signedResults.delete(id)
        }
}
function signedRender() {
    const root = $('signed-source-list')
    root.replaceChildren()
    if (!signedRows.length) root.append(signedText('p', t(
        '尚无已安装的可信来源组件。此处不会从网络自动寻找或下载来源。',
        'No trusted source component is installed. Nothing is discovered or downloaded automatically.',
        '信頼済みソースはまだありません。ネットから自動で検索・取得しません。'
    )))
    for (const row of signedRows) {
        const item = signedText('section')
        item.className = 'panel'
        item.append(signedText('h4', row.sourceId))
        item.append(signedText('p',
            (row.activeVersion
                ? t('已启用', 'Enabled', '有効') + ': ' + row.activeVersion
                : t('已停用', 'Disabled', '無効')) + ' · ' +
            (row.connected
                ? t('已连接', 'Connected', '接続中')
                : t('未连接', 'Disconnected', '未接続'))))
        if (!row.versions.length) {
            item.append(signedText('p', t('没有已安装版本', 'No installed versions', 'インストール済みバージョンなし')))
            root.append(item)
            continue
        }
        const label = signedText('label', t('选择已安装版本', 'Choose installed version', 'インストール済みバージョンを選択'))
        const select = signedText('select')
        select.setAttribute('aria-label', label.textContent + ' · ' + row.sourceId)
        for (const version of row.versions) {
            const option = signedText('option', version)
            option.value = version
            select.append(option)
        }
        select.value = row.activeVersion || row.versions[row.versions.length - 1]
        label.append(select)
        item.append(label)
        const actions = signedText('div')
        actions.className = 'actions'
        const action = (caption, input, shouldConfirm = false) => {
            const button = signedText('button', caption)
            button.type = 'button'
            button.onclick = () => {
                if (shouldConfirm && !window.confirm(t(
                    '确认删除此已验证版本？漫画与阅读记录不会被删除。',
                    'Remove this verified version? Books and reading history will remain.',
                    'この検証済みバージョンを削除しますか？漫画と読書履歴は保持されます。'
                ))) return
                void signedOperate(input())
            }
            actions.append(button)
            return button
        }
        const activate = action(t('启用／切换版本', 'Enable / switch version', '有効化／バージョン切替'), () => ({
            operation: row.activeVersion &&
                select.value.localeCompare(row.activeVersion, 'en', { numeric: true }) < 0
                ? 'rollback' : 'activate',
            sourceId: row.sourceId, version: select.value,
            expectedRevision: row.revision
        }))
        if (row.activeVersion) action(t('停用来源', 'Disable source', 'ソースを無効化'), () => ({
            operation: 'disable', sourceId: row.sourceId,
            expectedRevision: row.revision
        }))
        if (row.activeVersion && !row.connected)
            action(t('连接已启用来源', 'Connect enabled source', '有効なソースに接続'), () => ({
                operation: 'connect', sourceId: row.sourceId
            }))
        if (row.connected && signedSessions.has(row.sourceId))
            action(t('断开本次连接', 'Disconnect this session', '今回の接続を解除'), () => ({
                operation: 'disconnect', sessionId: signedSessions.get(row.sourceId)
            }))
        const remove = action(t('卸载所选旧版本', 'Uninstall selected inactive version', '選択した非稼働版を削除'), () => ({
            operation: 'uninstall', sourceId: row.sourceId,
            version: select.value, expectedRevision: row.revision, consent: true
        }), true)
        const update = () => {
            select.disabled = signedBusy
            activate.disabled = signedBusy || select.value === row.activeVersion
            remove.disabled = signedBusy || select.value === row.activeVersion
            for (const button of actions.querySelectorAll('button'))
                if (button !== activate && button !== remove) button.disabled = signedBusy
        }
        select.addEventListener('change', update)
        update()
        item.append(actions)
        // Search is explicitly submitted by the user after activating and
        // connecting a verified component. This UI never lists a catalogue
        // on load, connects in the background or stores source credentials.
        const sessionId = signedSessions.get(row.sourceId)
        if (row.connected && sessionId) {
            const form = signedText('form')
            form.className = 'actions'
            const input = signedText('input')
            input.type = 'search'
            input.maxLength = 120
            input.required = true
            input.value = signedQueries.get(row.sourceId) || ''
            input.placeholder = t('搜索此来源的作品', 'Search this source', 'このソースで検索')
            input.setAttribute('aria-label', input.placeholder + ' · ' + row.sourceId)
            input.oninput = () => signedQueries.set(row.sourceId, input.value)
            const submit = signedText('button', t('搜索作品', 'Search books', '作品を検索'))
            submit.type = 'submit'
            submit.disabled = signedBusy
            form.append(input, submit)
            form.onsubmit = event => {
                event.preventDefault()
                if (!signedBusy) void signedSearch(row.sourceId, sessionId, input.value)
            }
            item.append(form)
            if (signedResults.has(row.sourceId)) {
                const results = signedText('div')
                results.className = 'list'
                const items = signedResults.get(row.sourceId)
                if (!items.length) results.append(signedText('p', t(
                    '没有匹配作品。可调整关键词重试。',
                    'No matching books. Try a different query.',
                    '一致する作品はありません。検索語を変えてください。'
                )))
                for (const hit of items) {
                    const open = signedText('button', hit.title)
                    open.type = 'button'
                    open.setAttribute('aria-label', t('阅读：', 'Read: ', '読む：') + hit.title)
                    open.disabled = signedBusy
                    open.onclick = () => {
                        if (signedBusy || signedPanel.hidden ||
                            signedSessions.get(row.sourceId) !== sessionId) return
                        document.dispatchEvent(new CustomEvent('pica-open-signed-reader', {
                            detail: { comicId: hit.comicId, title: hit.title,
                                sessionId, csrfToken: signedCsrf }
                        }))
                    }
                    results.append(open)
                }
                item.append(results)
            }
        }
        root.append(item)
    }
    $('signed-source-refresh').disabled = signedBusy
    $('signed-source-install').hidden = !signedCanInstall
    $('signed-source-install').disabled = signedBusy
}
async function signedSearch(sourceId, sessionId, rawQuery) {
    if (signedBusy || signedPanel.hidden ||
        signedSessions.get(sourceId) !== sessionId) return
    const query = String(rawQuery || '').trim()
    if (query.length < 2 || query.length > 120) {
        $('signed-source-status').textContent = t(
            '搜索词必须是 2–120 个字符。',
            'Enter a search term of 2–120 characters.',
            '検索語は2～120文字にしてください。'
        )
        return
    }
    signedQueries.set(sourceId, query)
    signedResults.delete(sourceId)
    signedBusy = true
    signedRender()
    try {
        const result = await signedCommand({ operation: 'search', sessionId, query })
        if (signedSessions.get(sourceId) !== sessionId ||
            result.sourceId !== sourceId || result.sessionId !== sessionId ||
            result.query !== query || !Array.isArray(result.items) ||
            result.items.length > 25 || result.items.some(hit =>
                typeof hit.title !== 'string' || !hit.title.trim() ||
                hit.title.length > 256 || !isSignedReaderComicId(hit.comicId)))
            throw new Error('Invalid trusted source search results')
        signedResults.set(sourceId, result.items)
        $('signed-source-status').textContent = t(
            '搜索完成。仅点击作品才会交给原阅读器。',
            'Search complete. Select a book to open the existing Reader.',
            '検索完了。作品の選択後に既存のリーダーを開きます。'
        )
    } catch {
        signedResults.delete(sourceId)
        $('signed-source-status').textContent = t(
            '搜索失败或来源已经断开；没有修改个人书库。',
            'Search failed or the source was disconnected. Local library unchanged.',
            '検索できないか接続が切れました。ローカル書庫は変更されていません。'
        )
    } finally {
        signedBusy = false
        signedRender()
    }
}
async function signedOperate(input) {
    if (signedBusy || !signedCsrf || signedPanel.hidden) return
    signedBusy = true
    signedRender()
    try {
        const result = await signedCommand(input)
        if (input.operation === 'connect' && typeof result.sessionId === 'string') {
            signedSessions.set(input.sourceId, result.sessionId)
            signedResults.delete(input.sourceId)
        }
        if (['disable', 'activate', 'rollback', 'uninstall', 'disconnect'].includes(input.operation)) {
            if (input.sourceId) {
                signedSessions.delete(input.sourceId)
                signedResults.delete(input.sourceId)
            }
            if (input.operation === 'disconnect') {
                for (const [id, sessionId] of signedSessions)
                    if (sessionId === input.sessionId) {
                        signedSessions.delete(id)
                        signedResults.delete(id)
                    }
            }
        }
        signedInventory(await signedCommand({ operation: 'inventory' }))
        $('signed-source-status').textContent = result?.cancelled === true
            ? t(
                '已取消本地签名来源选择；没有安装或启用任何组件。',
                'Local signed source selection cancelled. Nothing installed or enabled.',
                'ローカル署名ソースの選択をキャンセルしました。導入・有効化は行われていません。'
            ) : t(
                '操作已完成；没有修改本地漫画与阅读记录。',
                'Action completed. Local books and reading history were unchanged.',
                '操作完了。ローカル漫画と読書履歴は変更されていません。'
            )
        document.dispatchEvent(new Event('pica-signed-reading-scope-changed'))
    } catch (error) {
        $('signed-source-status').textContent = t(
            '未能确认操作结果。请重新读取状态后再操作。',
            'Could not verify the result. Refresh status before trying again.',
            '操作結果を確認できません。再操作する前に状態を読み直してください。'
        ) + ' ' + error.message
    } finally {
        signedBusy = false
        signedRender()
    }
}
async function signedRefresh() {
    if (signedBusy || signedPanel.hidden) return
    signedBusy = true
    signedRender()
    try {
        const response = await fetch('/api/v1/desktop/status', { cache: 'no-store' })
        const status = await response.json()
        if (!response.ok || !status.configured ||
            status.signedSourceManagement?.available !== true ||
            !status.csrfToken)
            throw new Error('Trusted source control is unavailable')
        signedCsrf = status.csrfToken
        signedInventory(await signedCommand({ operation: 'inventory' }))
        $('signed-source-status').textContent = t(
            '已读取本机签名组件。只有主动连接才会启动来源进程。',
            'Local signed components loaded. Source processes start only when you connect.',
            '署名コンポーネントを読み込みました。明示的に接続するまでプロセスは起動しません。'
        )
    } catch (error) {
        signedRows = []
        signedCanInstall = false
        signedCsrf = ''
        $('signed-source-status').textContent = t(
            '无法读取可信来源组件。', 'Unable to load trusted source components.', '信頼済みソースを読み込めません。'
        ) + ' ' + error.message
    } finally {
        signedBusy = false
        signedRender()
    }
}
if (signedPanel) {
    $('signed-source-refresh').onclick = () => void signedRefresh()
    $('signed-source-install').onclick = () => {
        if (signedBusy || !signedCanInstall) return
        if (!window.confirm(t(
            '仅接受由本应用可信发布者签名的本地 ZIP。确认打开系统文件选择器？安装后不会自动运行。',
            'Only local ZIPs signed by the app-trusted publisher are accepted. Open the native file picker? Installation will not run the source.',
            'アプリが信頼する発行元の署名付きローカルZIPのみ受け入れます。ファイル選択を開きますか？導入後も自動実行しません。'
        ))) return
        void signedOperate({ operation: 'install', consent: true })
    }
    signedPanel.addEventListener('toggle', () => {
        if (signedPanel.open && !signedPanel.hidden) void signedRefresh()
    })
    document.addEventListener('pica-language-change', () => {
        signedLabels()
        signedRender()
    })
    signedLabels()
}
// No source discovery, worker activation or network access on page load.
