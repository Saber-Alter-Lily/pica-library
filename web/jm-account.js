import { copy as t } from './locale-runtime.js'

const panel = document.querySelector('#settings-jm-account')
const $ = (id) => document.getElementById(id)
let csrf = '',
    previewToken = '',
    busy = false,
    scanning = false
const message = (value) => {
    $('jm-account-message').textContent = value
}
function localize() {
    if (!panel) return
    panel.querySelector('summary strong').textContent = t(
        'JM 账号与收藏',
        'JM account and favorites',
        'JM アカウントとお気に入り'
    )
    for (const node of panel.querySelector('summary').childNodes)
        if (node.nodeType === Node.TEXT_NODE)
            node.textContent = t(
                ' · 可选来源',
                ' · Optional source',
                ' · オプション配信元'
            )
    $('jm-account-state').textContent = t(
        '打开此区域后检查连接状态',
        'Open this section to check the connection',
        'この項目を開くと接続状態を確認します'
    )
    panel.querySelectorAll(':scope > p')[1].textContent = t(
        '先导入收藏，再分批补全作品详情中的标签。未补全的标签属于未知，不代表不喜欢；导入不会创建 Like 或修改云端收藏。',
        'Import favorites, then fill missing tags from work details in batches. Missing tags are unknown, not dislikes. Importing does not create Likes or change remote favorites.',
        'まずお気に入りを取り込み、作品詳細からタグを順次補完します。未取得のタグは不明であり、嫌いを意味しません。Like の作成やクラウド変更は行いません。'
    )
    const labels = [...panel.querySelectorAll('.settings-form label')]
    const titles = [
        t('JM 用户名', 'JM username', 'JM ユーザー名'),
        t('密码', 'Password', 'パスワード'),
        t(
            '使用本机安全凭据存储记住登录',
            'Remember login in this device’s secure credential store',
            'この端末の安全な認証情報ストアにログインを保存'
        )
    ]
    for (let i = 0; i < labels.length; i++) {
        const node = [...labels[i].childNodes].find(
            (child) => child.nodeType === Node.TEXT_NODE
        )
        if (node) node.textContent = titles[i]
    }
    for (const [id, zh, en, ja] of [
        ['jm-login', '登录 JM', 'Sign in to JM', 'JM にログイン'],
        ['jm-preview', '扫描收藏', 'Scan favorites', 'お気に入りを読み込む'],
        [
            'jm-enrich',
            '补全收藏资料 · 每批最多 20 本',
            'Fill favorite metadata · up to 20 per batch',
            'お気に入り情報を補完 · 1 回最大 20 件'
        ],
        ['jm-confirm', '确认导入收藏', 'Confirm import', '取り込みを確認'],
        ['jm-cancel', '取消扫描', 'Cancel scan', '読み込みをキャンセル'],
        [
            'jm-logout',
            '退出本机 JM 登录',
            'Sign out of JM on this device',
            'この端末の JM からログアウト'
        ]
    ])
        $(id).textContent = t(zh, en, ja)
}
localize()
document.addEventListener('pica-language-change', localize)
async function request(action, input) {
    if (!csrf) {
        const status = await fetch('/api/v1/desktop/status').then((response) =>
            response.json()
        )
        csrf = status.csrfToken || ''
    }
    const response = await fetch(
        `/api/v1/desktop/sources/jm/${action}`,
        input === undefined
            ? {}
            : {
                  method: 'POST',
                  headers: {
                      'content-type': 'application/json',
                      'x-pica-csrf': csrf
                  },
                  body: JSON.stringify(input)
              }
    )
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'JM 操作未完成')
    return result
}
function state() {
    for (const id of [
        'jm-login',
        'jm-preview',
        'jm-confirm',
        'jm-logout',
        'jm-enrich'
    ])
        $(id).disabled = busy
    $('jm-cancel').hidden = !scanning
    $('jm-confirm').hidden = !previewToken
}
async function run(task) {
    if (busy) return
    busy = true
    state()
    try {
        await task()
    } catch (error) {
        message(error.message || '操作失败，请重试')
    } finally {
        busy = false
        scanning = false
        state()
    }
}
async function refresh() {
    const result = await request('status')
    $('jm-account-state').textContent = !result.available
        ? t(
              '此包尚未包含 JM 运行组件',
              'JM is not included in this package',
              'このパッケージには JM が含まれていません'
          )
        : result.configured
          ? t(
                `已登录：${result.username}`,
                `Signed in: ${result.username}`,
                `ログイン済み：${result.username}`
            )
          : t(
                '尚未登录 · 可独立配置此来源',
                'Not signed in · Configure this source independently',
                '未ログイン · この配信元は個別に設定できます'
            )
}
panel?.addEventListener('toggle', () => {
    if (panel.open && !busy) void run(refresh)
})
$('jm-login')?.addEventListener(
    'click',
    () =>
        void run(async () => {
            previewToken = ''
            message(t('正在登录 JM…', 'Signing in to JM…', 'JM にログイン中…'))
            try {
                const result = await request('login', {
                    username: $('jm-username').value.trim(),
                    password: $('jm-password').value,
                    remember: $('jm-remember').checked
                })
                message(
                    result.remembered
                        ? t(
                              '登录成功，已由本机安全凭据存储保护。',
                              'Signed in. Login is protected by this device’s credential store.',
                              'ログインしました。この端末の認証情報ストアに安全に保存されます。'
                          )
                        : t(
                              '登录成功，仅本次运行保留会话；关闭后需重新登录。',
                              'Signed in for this session. Sign in again after closing the app.',
                              'このセッションでログインしました。アプリ終了後は再ログインが必要です。'
                          )
                )
                await refresh()
            } finally {
                $('jm-password').value = ''
            }
        })
)
$('jm-preview')?.addEventListener(
    'click',
    () =>
        void run(async () => {
            previewToken = ''
            scanning = true
            state()
            message(
                t(
                    '正在逐页扫描收藏，完成前不会导入…',
                    'Scanning all favorite pages. Nothing is imported until completion…',
                    '全ページのお気に入りを読み込み中です。完了するまで取り込みません…'
                )
            )
            const result = await request('preview', { folderId: 0 })
            previewToken = result.token
            message(
                t(
                    `已完整读取 ${result.count} 本收藏。确认后添加到本地书库；重复导入不会重复计数。`,
                    `Read all ${result.count} favorites. Confirm to add them to your library; repeated imports are deduplicated.`,
                    `${result.count} 件のお気に入りをすべて読み込みました。確認後にライブラリへ追加します。重複は除外されます。`
                )
            )
        })
)
$('jm-confirm')?.addEventListener(
    'click',
    () =>
        void run(async () => {
            if (!previewToken) return
            const result = await request('confirm', { token: previewToken })
            previewToken = ''
            message(
                t(
                    `已导入 ${result.importedFavorites} 本收藏。可到漫画库查看，并按需要更新推荐画像。`,
                    `Imported ${result.importedFavorites} favorites. View them in the library and update your recommendation profile when ready.`,
                    `${result.importedFavorites} 件のお気に入りを取り込みました。ライブラリで確認し、必要に応じておすすめプロフィールを更新してください。`
                )
            )
            window.dispatchEvent(new CustomEvent('pica-library-changed'))
        })
)
$('jm-enrich')?.addEventListener(
    'click',
    () =>
        void run(async () => {
            scanning = true
            state()
            message(
                t(
                    '正在补全作品详情，可取消；已经补全的资料会保留。',
                    'Fetching work details. You can cancel; completed metadata is kept.',
                    '作品詳細を補完中です。キャンセルしても完了済みの情報は保持されます。'
                )
            )
            const result = await request('enrich', {})
            message(
                t(
                    `已补全 ${result.updated} 本，失败 ${result.failed} 本，尚有 ${result.remaining} 本待补全。`,
                    `Updated ${result.updated}; failed ${result.failed}; ${result.remaining} still pending.`,
                    `${result.updated} 件を補完、${result.failed} 件失敗、残り ${result.remaining} 件です。`
                )
            )
        })
)
$('jm-cancel')?.addEventListener('click', async () => {
    try {
        await request('cancel', {})
        previewToken = ''
        message(
            t(
                '已请求取消，等待当前页面请求结束…',
                'Cancellation requested; waiting for the current page request…',
                'キャンセルを要求しました。現在のページ要求の終了を待っています…'
            )
        )
    } catch (error) {
        message(error.message)
    }
})
$('jm-logout')?.addEventListener(
    'click',
    () =>
        void run(async () => {
            await request('logout', {})
            previewToken = ''
            message(
                t(
                    '本机 JM 登录已清除，已导入的本地收藏保留。',
                    'Signed out on this device. Imported local favorites are kept.',
                    'この端末からログアウトしました。取り込み済みのお気に入りは保持されます。'
                )
            )
            await refresh()
        })
)
