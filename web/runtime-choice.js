import { copy as t } from './locale-runtime.js'

/** Explicit update command UI. Installation neither enables a source nor copies/logs in an account. */
export function installRuntimeChoice({
    post,
    confirm,
    isDesktop,
    isUpdateBusy,
    staged,
    apply,
    document = globalThis.document
}) {
    const get = (id) => document.getElementById(id)
    const buttons = [get('runtime-choice-jm'), get('runtime-choice-core')]
    if (buttons.some((button) => !button)) return
    let busy = false
    const label = (composition) => {
        if (
            composition?.formatVersion !== 1 ||
            !Array.isArray(composition.sourceRuntimes) ||
            composition.sourceRuntimes.length > 1 ||
            composition.sourceRuntimes.some((id) => id !== 'jm')
        )
            throw Error('Invalid runtime composition preview')
        return composition.sourceRuntimes.length
            ? t('含 JM 运行组件', 'With JM runtime', 'JM 実行環境あり')
            : t(
                  '核心阅读器（不含 JM 运行组件）',
                  'Core reader (without JM runtime)',
                  'コアリーダー（JM 実行環境なし）'
              )
    }
    const localize = () => {
        get('runtime-choice-title').textContent = t(
            '可选来源运行组件',
            'Optional source runtimes',
            'オプション配信元の実行環境'
        )
        get('runtime-choice-help').textContent = t(
            '仅在需要时添加。此操作会替换整个应用并重启，保留本地数据和账号；不会自动启用来源或登录。日常软件更新保持原组件组合。',
            'Add only when needed. This replaces and restarts the whole application while retaining local data and accounts. It does not enable a source or sign in. Normal updates keep the installed runtime choice.',
            '必要な場合のみ追加します。アプリ全体を置き換えて再起動しますが、ローカルデータとアカウントは保持します。配信元の有効化やログインは行いません。通常の更新では構成を維持します。'
        )
        buttons[0].textContent = t(
            '添加 JM 运行组件',
            'Add JM runtime',
            'JM 実行環境を追加'
        )
        buttons[1].textContent = t(
            '移除 JM 运行组件',
            'Remove JM runtime',
            'JM 実行環境を削除'
        )
    }
    localize()
    document.addEventListener('pica-language-change', localize)
    async function choose(choice) {
        const message = get('runtime-choice-message')
        if (busy || isUpdateBusy()) return
        if (!isDesktop()) {
            message.textContent = t(
                '此操作仅适用于本机 Windows 阅读器。',
                'This action requires the local Windows reader.',
                'この操作にはローカルの Windows リーダーが必要です。'
            )
            return
        }
        busy = true
        const ordinary = [
            'update-check',
            'update-one-click',
            'update-apply',
            'update-file'
        ]
            .map(get)
            .filter(Boolean)
        const previous = ordinary.map((button) => button.disabled)
        for (const button of [...buttons, ...ordinary]) button.disabled = true
        try {
            message.textContent = t(
                '正在检查所选完整应用包…',
                'Checking the selected complete application…',
                '選択した完全版アプリを確認中…'
            )
            const plan = await post('/api/v1/update/runtime-choice/plan', {
                choice
            })
            if (plan.status === 'unchanged') {
                message.textContent = t(
                    '当前已是所选组件组合，无需替换。',
                    'The selected runtime is already installed; no replacement needed.',
                    'すでに選択した構成です。置き換えは不要です。'
                )
                return
            }
            if (
                plan.status !== 'preview' ||
                !/^[a-f0-9-]{36}$/.test(plan.id) ||
                plan.sourceEnablement !== 'unchanged' ||
                plan.accountsAndData !== 'retained' ||
                plan.replacement !== 'complete-application'
            )
                throw Error('Invalid runtime component preview')
            const from = label(plan.from),
                to = label(plan.to)
            const size =
                Number.isSafeInteger(plan.bytes) && plan.bytes > 0
                    ? ` · ${(plan.bytes / 1048576).toFixed(1)} MiB`
                    : ''
            const warning = t(
                `${from} → ${to}\n版本：${plan.version}${size}\n\n将下载并校验完整官方应用包，然后替换程序并重启。本地漫画、数据库、账号和来源启用选择保持不变。添加 JM 会包含 Java/JM 运行环境；安装本身不会启动 Java，后续使用 JM 功能时按已保存权限启动。确认继续？`,
                `${from} → ${to}\nVersion: ${plan.version}${size}\n\nDownload and verify the official full application, then replace and restart it. Local comics, database, accounts and source choices stay unchanged. JM includes Java/JM; installation does not start Java. Later JM actions use your saved source permissions. Continue?`,
                `${from} → ${to}\nバージョン: ${plan.version}${size}\n\n公式の完全版を取得・検証し、アプリを置き換えて再起動します。漫画、DB、アカウント、配信元の選択は保持します。追加時に Java は起動しません。JM 機能の使用時は保存済みの権限に従います。続行しますか？`
            )
            if (
                !(await confirm(
                    warning,
                    t(
                        '确认替换运行组件',
                        'Confirm runtime replacement',
                        '実行環境の置き換えを確認'
                    )
                ))
            ) {
                message.textContent = t(
                    '已取消，未下载或修改组件。',
                    'Cancelled; no runtime downloaded or changed.',
                    'キャンセルしました。実行環境は取得・変更されていません。'
                )
                return
            }
            message.textContent = t(
                '正在下载、校验并准备替换…',
                'Downloading, verifying and preparing replacement…',
                '取得・検証し、置き換えを準備中…'
            )
            const value = await post('/api/v1/update/runtime-choice/prepare', {
                id: plan.id
            })
            if (
                !value.id ||
                value.mode !== 'full-application' ||
                value.targetVersion !== plan.version ||
                value.archiveSha256 !== plan.archiveSha256 ||
                label(value.expectedRuntimeComposition) !== to
            )
                throw Error(
                    'Runtime package does not match the confirmed preview'
                )
            staged(value)
            await apply(value, true)
        } catch (error) {
            message.textContent =
                t(
                    '未完成组件替换：',
                    'Runtime replacement was not completed: ',
                    '実行環境の置き換えは完了していません: '
                ) + (error?.message || String(error))
        } finally {
            busy = false
            buttons.forEach((button) => {
                button.disabled = false
            })
            ordinary.forEach((button, index) => {
                button.disabled = previous[index]
            })
        }
    }
    buttons[0].addEventListener('click', () => void choose('jm'))
    buttons[1].addEventListener('click', () => void choose('core'))
}
