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
    $('jm-runtime-hint').textContent = t(
        '若当前包不含 JM 运行环境，可在“软件更新 → 可选来源运行组件”明确添加；本地阅读不需要 Java。',
        'If this package has no JM runtime, explicitly add it under Software update → Optional source runtimes. Local reading needs no Java.',
        'JM 実行環境がない場合は「ソフトウェア更新 → オプション配信元の実行環境」で明示的に追加できます。ローカルの読書に Java は不要です。'
    )
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
        '仅显示本机状态 · 不会自动连接 JM',
        'Local status only · No automatic JM connection',
        '端末内の状態のみ · JM へ自動接続しません'
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
        ['jm-connect', '连接 / 恢复登录', 'Connect / restore sign-in', '接続 / ログインを復元'],
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
        'jm-connect',
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
    $('jm-account-state').textContent = result.enabled === false
        ? t('来源已关闭 · 账号和本地下载保留', 'Source disabled · Account and local downloads retained', '配信元は無効 · アカウントとローカル保存は保持')
        : !result.available
        ? t(
              '此应用包未包含有效的 JM 运行组件；普通本地阅读不受影响',
              'This application has no valid JM runtime; local reading remains available',
              '有効な JM 実行環境は含まれていません。ローカルの読書は引き続き利用できます'
          )
        : result.configured
          ? t(
                `本次已登录：${result.username || ''} · 本地缓存状态，未重新验证连接`,
                `Signed in this session: ${result.username || ''} · Cached locally; connection not rechecked`,
                `今回ログイン済み：${result.username || ''} · 端末内の記録です。接続は未確認`
            )
          : result.remembered
            ? t(
                  '已保存登录 · 点击“连接 / 恢复登录”后验证；仅打开设置不会启动来源进程',
                  'Sign-in saved · Connect / restore sign-in to verify; opening settings starts no source process',
                  'ログイン保存済み · 接続 / ログインを復元で確認します。設定を開くだけでは配信元のプロセスを起動しません'
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
document.addEventListener('pica-source-choices-changed', () => { if (panel?.open && !busy) void run(refresh) })
$('jm-connect')?.addEventListener('click', () => void run(async () => {
    message(t('正在连接 JM 并验证保存的登录…', 'Connecting to JM and verifying saved sign-in…', 'JM に接続し、保存したログインを確認中…'))
    const result = await request('connect', {})
    message(result.configured
        ? t('JM 连接验证成功。', 'JM connection verified.', 'JM の接続を確認しました。')
        : t('已连接来源进程，尚未登录；如需账号功能请明确登录。', 'Source process connected; not signed in. Sign in explicitly for account features.', '配信元のプロセスに接続しましたが未ログインです。アカウント機能にはログインしてください。'))
    await refresh()
}))
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
