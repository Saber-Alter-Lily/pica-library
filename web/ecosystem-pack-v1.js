import { copy as text } from './locale-runtime.js'

const $ = (selector) => document.querySelector(selector)

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}

function render(items) {
    const list = $('#ecosystem-packs-list')
    const summary = $('#ecosystem-packs-summary')
    const message = $('#ecosystem-packs-message')
    if (!list || !summary || !message) return

    const packs = Array.isArray(items) ? items : []
    summary.textContent = packs.length
        ? text(`${packs.length} 个 · 只读`, `${packs.length} · read-only`, `${packs.length} 件 · 読み取り専用`)
        : text('未安装 · 只读', 'none installed · read-only', '未インストール · 読み取り専用')

    if (!packs.length) {
        list.innerHTML = ''
        message.textContent = text(
            '当前没有本地生态包。普通推荐功能不依赖生态包，可继续正常使用。',
            'No local ecosystem Packs are installed. Normal recommendations do not depend on Packs.',
            'ローカルのエコシステムパックはインストールされていません。通常のおすすめ機能はパックなしでも利用できます。'
        )
        return
    }

    message.textContent = text(
        '这里只显示完整性和兼容性；当前没有启用或应用入口。',
        'This view only reports integrity and compatibility. Activation is not available.',
        'ここでは完全性と互換性のみを表示します。現在、有効化や適用の操作はありません。'
    )
    list.innerHTML = packs
        .map((item) => {
            const integrity =
                item.integrity === 'VALID'
                    ? text('完整', 'valid', '正常')
                    : text('损坏/无效', 'invalid', '破損 / 無効')
            const compatibility = item.compatible
                ? text('兼容', 'compatible', '互換')
                : text('不兼容', 'incompatible', '非互換')
            const error = item.error
                ? `<p class="status">${escapeHtml(item.error)}</p>`
                : ''
            return `<article class="list-item">
                <div class="grow">
                    <strong>${escapeHtml(item.packId)}</strong>
                    <p class="status">${escapeHtml(item.generation)} · ${escapeHtml(item.packType || text('未知类型', 'unknown type', '不明な種類'))}</p>
                    <p class="status">${integrity} · ${compatibility} · ${escapeHtml(item.trust || 'LOCAL_UNSIGNED')} · ${Number(item.fileCount || 0)} ${text('个文件', 'files', 'ファイル')}</p>
                    ${error}
                </div>
            </article>`
        })
        .join('')
}

async function refresh() {
    const button = $('#ecosystem-packs-refresh')
    const message = $('#ecosystem-packs-message')
    if (!button || !message) return
    button.disabled = true
    message.textContent = text('正在检查…', 'Checking…', '確認中…')
    try {
        const response = await fetch('/api/v1/desktop/ecosystem/packs', {
            cache: 'no-store'
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        render(await response.json())
    } catch (error) {
        $('#ecosystem-packs-list').innerHTML = ''
        $('#ecosystem-packs-summary').textContent = text('不可用', 'unavailable', '利用不可')
        message.textContent = text(
            `无法读取生态包状态：${error.message || error}`,
            `Could not read Pack status: ${error.message || error}`,
            `パックの状態を読み込めませんでした：${error.message || error}`
        )
    } finally {
        button.disabled = false
    }
}

function localize() {
    const title = $('#ecosystem-packs-title')
    const refreshButton = $('#ecosystem-packs-refresh')
    const openButton = $('#ecosystem-packs-open')
    if (title) title.textContent = text('推荐生态包状态', 'Recommendation ecosystem Packs', 'おすすめエコシステムパック')
    if (refreshButton) refreshButton.textContent = text('重新检查', 'Refresh', '再確認')
    if (openButton) openButton.textContent = text('打开本地目录', 'Open local folder', 'ローカルフォルダーを開く')
}

$('#ecosystem-packs-refresh')?.addEventListener('click', () => void refresh())
$('#ecosystem-packs-open')?.addEventListener('click', async () => {
    const message = $('#ecosystem-packs-message')
    try {
        const response = await fetch('/api/v1/desktop/open-directory', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kind: 'packs' })
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
    } catch (error) {
        if (message)
            message.textContent = text(
                `无法打开目录：${error.message || error}`,
                `Could not open the folder: ${error.message || error}`,
                `フォルダーを開けませんでした：${error.message || error}`
            )
    }
})

document.addEventListener('pica-language-change', () => localize())
localize()
void refresh()
