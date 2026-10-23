import { copy as t } from './locale-runtime.js'

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
