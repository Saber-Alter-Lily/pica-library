/** Desktop picker only. No local path is ever sent by the browser. */
export function installLocalImport({
    available,
    language,
    request,
    refresh,
    read
}) {
    const host = document.getElementById('local-comic-import')
    if (!host) return
    const text = (zh, en, ja) =>
        language().startsWith('ja') ? ja : language().startsWith('en') ? en : zh
    let busy = false,
        token = null
    const status = host.querySelector('[data-local-status]')
    const buttons = [...host.querySelectorAll('[data-local-kind]')]
    const dialog = document.createElement('dialog')
    dialog.id = 'local-import-preview'
    document.body.append(dialog)
    function update() {
        host.hidden = !available()
        buttons[0].textContent = text(
            '导入漫画文件夹',
            'Import comic folder',
            '漫画フォルダーを取り込む'
        )
        buttons[1].textContent = text(
            '导入 CBZ',
            'Import CBZ',
            'CBZ を取り込む'
        )
        host.querySelector('[data-local-help]').textContent = text(
            '选择一本漫画。确认后复制到书库，原文件不变；子文件夹作为章节，文件名自然排序。支持 JPG/PNG/GIF/WebP，不支持 CBR/PDF。',
            'Choose one comic. Confirm to copy it into your library; originals stay untouched. Subfolders become chapters, naturally ordered. JPG/PNG/GIF/WebP; not CBR/PDF.',
            '漫画を1冊選択。確認後にライブラリへコピーし、原本は変更しません。サブフォルダーは章、ファイル名は自然順。JPG/PNG/GIF/WebP 対応、CBR/PDF 非対応。'
        )
        buttons.forEach((b) => {
            b.disabled = busy
        })
    }
    async function cancel() {
        const old = token
        token = null
        if (dialog.open) dialog.close()
        if (old) await request('/cancel', { token: old }).catch(() => {})
    }
    dialog.addEventListener('cancel', (event) => {
        event.preventDefault()
        if (!busy) void cancel()
    })
    for (const button of buttons)
        button.onclick = async () => {
            if (busy) return
            await cancel()
            busy = true
            update()
            status.textContent = text(
                '选择并检查文件中…',
                'Choose and check files…',
                'ファイルを選択・確認中…'
            )
            try {
                const preview = await request('/preview', {
                    kind: button.dataset.localKind
                })
                if (preview.cancelled) {
                    status.textContent = ''
                    return
                }
                token = preview.token
                dialog.replaceChildren()
                const title = document.createElement('h2')
                title.textContent = preview.title
                const summary = document.createElement('p')
                summary.textContent = `${preview.chapters} ${text('章', 'chapters', '章')} · ${preview.pages} ${text('页', 'pages', 'ページ')} · ${(preview.bytes / 1048576).toFixed(1)} MB`
                const notice = document.createElement('p')
                notice.textContent = preview.existing
                    ? text(
                          `重新导入同一作品。保留收藏、标签和进度；${preview.removedPages} 页将从本次阅读清单移除，原文件不删。`,
                          `Reimport the same comic. Favorites, tags and progress stay; ${preview.removedPages} pages leave its reading inventory, not the originals.`,
                          `同じ漫画を再取り込み。お気に入り・タグ・進捗を保持。${preview.removedPages} ページを読書一覧から除外しますが原本は削除しません。`
                      )
                    : text(
                          '确认后复制到书库，不需要登录或联网。',
                          'Confirm to copy into your library. No login or network required.',
                          '確認後にライブラリへコピーします。ログイン・通信は不要。'
                      )
                const names = document.createElement('pre')
                names.textContent = preview.sampleNames.join('\n')
                const confirm = document.createElement('button')
                confirm.className = 'primary'
                confirm.textContent = text(
                    '确认导入',
                    'Confirm import',
                    '取り込む'
                )
                const back = document.createElement('button')
                back.textContent = text('取消', 'Cancel', 'キャンセル')
                back.onclick = () => {
                    if (!busy) void cancel()
                }
                confirm.onclick = async () => {
                    if (busy || !token) return
                    busy = true
                    update()
                    confirm.disabled = back.disabled = true
                    status.textContent = text(
                        '正在复制并保存…',
                        'Copying and saving…',
                        'コピー・保存中…'
                    )
                    try {
                        const result = await request('/confirm', { token })
                        token = null
                        dialog.close()
                        await refresh()
                        status.replaceChildren(
                            document.createTextNode(
                                text(
                                    `已导入 ${result.pages} 页。`,
                                    `Imported ${result.pages} pages.`,
                                    `${result.pages} ページ取り込み済み。`
                                )
                            )
                        )
                        const open = document.createElement('button')
                        open.textContent = text(
                            '立即阅读',
                            'Read now',
                            '今すぐ読む'
                        )
                        open.onclick = () => read(result.comicId)
                        status.append(open)
                    } catch (error) {
                        token = null
                        dialog.close()
                        status.textContent = error.message
                    } finally {
                        busy = false
                        update()
                    }
                }
                dialog.append(title, summary, notice, names, confirm, back)
                dialog.showModal()
                status.textContent = ''
            } catch (error) {
                status.textContent = error.message
            } finally {
                busy = false
                update()
            }
        }
    document.addEventListener('pica-local-import-refresh', update)
    document.addEventListener('pica-language-change', update)
    update()
}
