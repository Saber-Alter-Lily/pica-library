import { copy as t } from './locale-runtime.js'

const base = '/api/v1/desktop/recommendation-v5/tag-profile/'
const MAX_BYTES = 1024 * 1024
async function request(action, input) {
    const status = await fetch('/api/v1/desktop/status'),
        desktop = await status.json()
    if (!status.ok || !desktop.csrfToken)
        throw new Error(
            t(
                '请在本机 Desktop 中使用标签文件交换。',
                'Use tag-profile exchange on the local Desktop host.',
                'タグ設定ファイル交換はローカル Desktop で使用してください。'
            )
        )
    const response = await fetch(base + action, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-pica-csrf': desktop.csrfToken
        },
        body: JSON.stringify(input)
    })
    if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(
            (response.status === 409
                ? t(
                      '标签方案已变化或导出/预览已失效。文件和草稿未覆盖；请重新导出或预览。',
                      'Tag scheme changed or export/preview expired. No overwrite; export or preview again.',
                      'タグ設定変更または期限切れです。上書きしていません。再エクスポート・プレビューしてください。'
                  ) + ' '
                : '') + (data.error || `HTTP ${response.status}`)
        )
    }
    return response
}
function dialog(title) {
    const modal = document.createElement('dialog')
    modal.className = 'v5-private-dialog'
    const heading = document.createElement('h3')
    heading.textContent = title
    modal.appendChild(heading)
    modal.addEventListener('close', () => modal.remove(), { once: true })
    document.body.appendChild(modal)
    modal.showModal()
    return modal
}
function paragraph(parent, text) {
    const node = document.createElement('p')
    node.textContent = text
    parent.appendChild(node)
    return node
}
function button(parent, label, action, attribute) {
    const node = document.createElement('button')
    node.type = 'button'
    node.textContent = label
    if (attribute) node.setAttribute(attribute, '')
    node.onclick = action
    parent.appendChild(node)
    return node
}
const confirm = (text) =>
    window.picaConfirmAction
        ? window.picaConfirmAction(text)
        : Promise.resolve(window.confirm(text))
function resultMessage(data, undo = false) {
    let message = undo
        ? t(
              '已撤销上次导入的标签配置，其他用户状态未回滚。',
              'Last imported tag configuration undone; other user state was not rolled back.',
              '前回のタグ設定インポートを取り消しました。他の状態は巻き戻しません。'
          )
        : t('导入已保存。', 'Import saved.', 'インポートを保存しました。')
    if (data.recommendationRefresh?.started === true)
        message += t(
            ' 已请求重建；成功前保留旧批次。',
            ' Regeneration requested; old batches remain until success.',
            ' 再生成を要求しました。成功まで旧バッチを保持します。'
        )
    else if (data.recommendationRefresh?.started === false)
        message += t(
            ' 但重建未启动，旧批次保留，请稍后重试。',
            ' Regeneration did not start; old batches remain. Retry later.',
            ' 再生成を開始できません。旧バッチを保持しています。後で再試行してください。'
        )
    else
        message += t(
            ' 现有推荐批次未重算。',
            ' Existing recommendation batches were not regenerated.',
            ' 既存のおすすめバッチは再生成していません。'
        )
    return message
}

export function attachTagProfileExchange(parent, hooks) {
    const section = document.createElement('details')
    section.setAttribute('data-tag-exchange', '')
    section.innerHTML = `<summary>${t('标签方案 · 导出给 AI / 导入结果', 'Tag profiles · export for AI / import results', 'タグ設定 · AI 用エクスポート / 結果インポート')}</summary>`
    const content = document.createElement('div')
    section.appendChild(content)
    parent.appendChild(section)
    paragraph(
        content,
        t(
            '文件会表达你的标签偏好和私人标签名称。默认不含收藏统计、作品列表、账号凭据或阅读记录；软件不会自动上传给 AI。手机通过现有配对同步接收确认后的方案。',
            'Files reveal tag preferences and private-label names. Favorite counts, work lists, credentials and reading history are excluded by default. Nothing is uploaded to AI automatically. Phones receive confirmed schemes through existing paired sync.',
            'タグの好み・個人タグ名を含みます。既定ではお気に入り統計・作品一覧・認証情報・読書履歴は含まず、AI へ自動送信しません。確認した設定は既存のペア同期でスマホへ反映します。'
        )
    )
    const message = paragraph(content, '')
    message.setAttribute('role', 'status')
    const ready = () => {
        if (!hooks.hasDraft()) return true
        message.textContent = t(
            '请先保存或撤销本页草稿，再交换文件；不会静默丢弃草稿。',
            'Save or undo this page’s draft before exchanging files. Drafts are never silently discarded.',
            'ファイル交換前に下書きを保存または破棄してください。自動で破棄しません。'
        )
        return false
    }
    button(
        content,
        t('导出供 AI 调整', 'Export for AI editing', 'AI 編集用にエクスポート'),
        () => {
            if (!ready()) return
            const modal = dialog(
                t(
                    '导出标签方案',
                    'Export tag profile',
                    'タグ設定をエクスポート'
                )
            )
            paragraph(
                modal,
                t(
                    '包含当前参与方案和私人标签名称，不是匿名文件。请自行决定是否交给外部 AI。下面两项默认关闭。',
                    'Includes current participation and private-label names: this is not anonymous. Decide whether to share with external AI. Both options below default to off.',
                    '参加設定と個人タグ名を含むため匿名ではありません。外部 AI への共有はご自身で判断してください。以下は既定でオフです。'
                )
            )
            const option = (label, attr) => {
                const row = document.createElement('label'),
                    input = document.createElement('input')
                row.style.cssText =
                    'display:flex;align-items:flex-start;gap:8px;margin:12px 0'
                input.type = 'checkbox'
                input.setAttribute(attr, '')
                row.append(input, document.createTextNode(' ' + label))
                modal.appendChild(row)
                return input
            }
            const counts = option(
                t(
                    '附带各标签的收藏涉及数量（会透露兴趣统计）',
                    'Include favorite-work counts (reveals interest statistics)',
                    'タグ別お気に入り作品数を含める（嗜好統計）'
                ),
                'data-tag-export-counts'
            )
            const works = option(
                t(
                    '附带本地作品列表和手工绑定（会透露书名与作品 ID）',
                    'Include local work list and manual bindings (reveals titles/IDs)',
                    'ローカル作品一覧・手動対応を含める（作品名・ID）'
                ),
                'data-tag-export-works'
            )
            const error = paragraph(modal, '')
            error.setAttribute('role', 'alert')
            button(modal, t('取消', 'Cancel', 'キャンセル'), () =>
                modal.close()
            )
            const download = button(
                modal,
                t('确认导出 ZIP', 'Export ZIP', 'ZIP をエクスポート'),
                async () => {
                    download.disabled = true
                    error.textContent = ''
                    try {
                        const response = await request('export', {
                                includeFavoriteCounts: counts.checked,
                                includeManualBindings: works.checked
                            }),
                            blob = await response.blob()
                        if (
                            !response.headers
                                .get('content-type')
                                ?.includes('application/zip') ||
                            blob.size > 16 * MAX_BYTES
                        )
                            throw new Error('Invalid export response')
                        const url = URL.createObjectURL(blob),
                            anchor = document.createElement('a')
                        anchor.href = url
                        anchor.download =
                            response.headers
                                .get('content-disposition')
                                ?.match(/filename="([A-Za-z0-9._-]+)"/)?.[1] ||
                            'Pica-Tag-Profile.zip'
                        anchor.click()
                        setTimeout(() => URL.revokeObjectURL(url), 1000)
                        modal.close()
                        message.textContent = t(
                            '已导出。交给 AI 后，请导回它填写的 JSON，而不是原 ZIP。',
                            'Exported. Import the JSON edited by AI, not the original ZIP.',
                            'エクスポート済み。元 ZIP ではなく、AI が編集した JSON をインポートしてください。'
                        )
                    } catch (e) {
                        error.textContent = String(e.message || e)
                    } finally {
                        download.disabled = false
                    }
                },
                'data-tag-export-confirm'
            )
        },
        'data-tag-file-export'
    )
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.hidden = true
    input.setAttribute('data-tag-import-file', '')
    content.appendChild(input)
    button(
        content,
        t(
            '导入 AI 返回的 JSON',
            'Import AI result JSON',
            'AI 結果 JSON をインポート'
        ),
        () => {
            if (ready()) {
                input.value = ''
                input.click()
            }
        },
        'data-tag-file-import'
    )
    input.onchange = async () => {
        if (!ready() || !input.files?.[0]) return
        const file = input.files[0]
        if (
            file.size > MAX_BYTES ||
            !file.name.toLowerCase().endsWith('.json')
        ) {
            message.textContent = t(
                '仅接受不超过 1 MiB 的 JSON 文件；不解包 ZIP，不执行脚本。',
                'Only JSON files up to 1 MiB; ZIPs and scripts are not executed.',
                '1 MiB 以下の JSON のみ。ZIP 展開・スクリプト実行はしません。'
            )
            return
        }
        const modal = dialog(
            t(
                '导入预览 · 尚未应用',
                'Import preview · not applied',
                'インポート確認 · 未適用'
            )
        )
        const summary = paragraph(
                modal,
                t('正在完整校验…', 'Validating all changes…', '全変更を検証中…')
            ),
            error = paragraph(modal, '')
        error.setAttribute('role', 'alert')
        const details = document.createElement('div')
        details.setAttribute('data-tag-import-details', '')
        details.style.cssText =
            'overflow-wrap:anywhere;max-height:45vh;overflow:auto'
        modal.appendChild(details)
        let preview = null,
            page = 0
        const previous = button(modal, t('上一页', 'Previous', '前へ'), () => {
            page--
            render()
        })
        const progress = document.createElement('span')
        modal.appendChild(progress)
        const next = button(modal, t('下一页', 'Next', '次へ'), () => {
            page++
            render()
        })
        function render() {
            if (!preview) return
            const pages = Math.max(1, Math.ceil(preview.details.length / 50))
            page = Math.max(0, Math.min(page, pages - 1))
            details.replaceChildren()
            const active = (value) =>
                value
                    ? t('参与', 'enabled', '参加')
                    : t('不参与', 'disabled', '不参加')
            for (const change of preview.details.slice(
                page * 50,
                (page + 1) * 50
            )) {
                const row = document.createElement('article')
                row.style.cssText =
                    'padding:8px 0;border-bottom:1px solid var(--a83-line,#ddd)'
                if (change.type === 'MODE')
                    paragraph(
                        row,
                        t(
                            '参与模式：',
                            'Participation mode: ',
                            '参加モード：'
                        ) +
                            change.before +
                            ' → ' +
                            change.after
                    )
                else if (change.type === 'PARTICIPATION')
                    paragraph(
                        row,
                        (hooks.labelOf?.(change.id) || change.id) +
                            '：' +
                            active(change.before) +
                            ' → ' +
                            active(change.after)
                    )
                else
                    paragraph(
                        row,
                        (change.before
                            ? change.after
                                ? t(
                                      '修改私人标签：',
                                      'Edit private label: ',
                                      '個人タグ編集：'
                                  )
                                : t(
                                      '删除私人标签：',
                                      'Delete private label: ',
                                      '個人タグ削除：'
                                  )
                            : t(
                                  '新增私人标签：',
                                  'New private label: ',
                                  '個人タグ追加：'
                              )) +
                            (change.after?.name ||
                                change.before?.name ||
                                change.id)
                    )
                const raw = document.createElement('details'),
                    title = document.createElement('summary'),
                    json = document.createElement('pre')
                title.textContent = t(
                    '展开核对原始 ID 与具体变更',
                    'Inspect exact IDs and changes',
                    '正確な ID・変更を確認'
                )
                json.textContent = JSON.stringify(change, null, 2)
                json.style.cssText =
                    'white-space:pre-wrap;overflow-wrap:anywhere'
                raw.append(title, json)
                row.appendChild(raw)
                details.appendChild(row)
            }
            progress.textContent = `${page + 1} / ${pages}`
            previous.disabled = page === 0
            next.disabled = page + 1 >= pages
        }
        const regenerateLabel = document.createElement('label'),
            regenerate = document.createElement('input')
        regenerateLabel.style.cssText =
            'display:flex;align-items:flex-start;gap:8px;margin:12px 0'
        regenerate.type = 'checkbox'
        regenerate.setAttribute('data-tag-import-regenerate', '')
        regenerateLabel.append(
            regenerate,
            document.createTextNode(
                t(
                    ' 保存后明确请求重新生成推荐',
                    ' Explicitly regenerate recommendations after save',
                    ' 保存後におすすめ再生成を要求する'
                )
            )
        )
        modal.appendChild(regenerateLabel)
        button(
            modal,
            t('取消，不应用', 'Cancel without applying', '適用せずキャンセル'),
            () => modal.close()
        )
        const apply = button(
            modal,
            t(
                '确认应用全部变更',
                'Apply all confirmed changes',
                '全変更を確認して適用'
            ),
            async () => {
                if (!preview || !ready()) return
                apply.disabled = true
                try {
                    const data = await (
                        await request('apply', {
                            previewId: preview.previewId,
                            apply: regenerate.checked
                        })
                    ).json()
                    modal.close()
                    await hooks.onCommitted(resultMessage(data), data.revision)
                } catch (e) {
                    error.textContent = String(e.message || e)
                    apply.disabled = false
                }
            },
            'data-tag-import-confirm'
        )
        apply.disabled = true
        previous.disabled = true
        next.disabled = true
        try {
            preview = await (
                await request('preview', { text: await file.text() })
            ).json()
            summary.textContent =
                t(
                    '这是完整校验后的结果。取消不会修改设置；任何无效规则都会阻止整次导入。',
                    'All rules have been validated. Cancel leaves settings unchanged; any invalid rule prevents the entire import.',
                    '全ルールを検証しました。キャンセルでは設定を変更せず、無効ルールがあれば全体を拒否します。'
                ) +
                ' ' +
                t('标签开关变化', 'Participation changes', '参加設定変更') +
                ` ${preview.summary.participation || 0} · ` +
                t('私人标签变化', 'Private-label changes', '個人タグ変更') +
                ` ${preview.summary.privateLabels || 0}`
            if (preview.explanations?.length) {
                const reasons = document.createElement('details'),
                    title = document.createElement('summary'),
                    text = document.createElement('pre')
                title.textContent = t(
                    'AI 提供的理由（未经独立核实）',
                    'AI explanations (not independently verified)',
                    'AI の説明（未検証）'
                )
                text.textContent = preview.explanations
                    .map((item) => item.reason)
                    .join('\n')
                text.style.cssText =
                    'white-space:pre-wrap;overflow-wrap:anywhere'
                reasons.append(title, text)
                modal.insertBefore(reasons, details)
            }
            render()
            apply.disabled = !preview.changed
            if (!preview.changed)
                summary.textContent += t(
                    ' 没有实际变更。',
                    ' No actual changes.',
                    ' 実際の変更はありません。'
                )
        } catch (e) {
            summary.textContent = t(
                '校验失败，未应用任何变更。',
                'Validation failed; nothing applied.',
                '検証失敗。何も適用していません。'
            )
            error.textContent = String(e.message || e)
        }
    }
    const undo = button(
        content,
        t(
            '撤销上次文件导入',
            'Undo last file import',
            '前回のファイル取込を取り消す'
        ),
        async () => {
            if (
                !ready() ||
                !(await confirm(
                    t(
                        '只恢复上次导入前的标签配置，不回滚收藏、阅读、下载或其他偏好。若标签方案已有后续修改，将拒绝覆盖。继续？',
                        'Restore only the tag configuration before the last import. Favorites, reading, downloads and other preferences are not rolled back. Newer tag-scheme edits prevent undo. Continue?',
                        '前回取込前のタグ設定のみ復元します。お気に入り・読書・ダウンロード・他の好みは戻しません。後のタグ変更がある場合は拒否します。続行しますか？'
                    )
                ))
            )
                return
            undo.disabled = true
            try {
                const data = await (
                    await request('undo', { apply: false })
                ).json()
                await hooks.onCommitted(
                    resultMessage(data, true),
                    data.revision
                )
            } catch (e) {
                message.textContent = String(e.message || e)
                undo.disabled = false
            }
        },
        'data-tag-file-undo'
    )
    undo.disabled = !hooks.canUndo
}
