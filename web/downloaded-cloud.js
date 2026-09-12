/** Remote-copy controls. No local deletion endpoint is reachable from this module. */
export function createDownloadedCloud({ post, getDesktop, getLanguage }) {
    const root = document.getElementById('downloaded')
    const selected = new Set()
    let inventory = new Map(),
        records = [],
        busy = false,
        checked = false,
        scopeId = null,
        generation = null
    const text = (zh, en) => (getLanguage() === 'en' ? en : zh)
    const panel = document.createElement('article')
    panel.className = 'notice panel downloaded-cloud-panel'
    const actions = document.createElement('div')
    actions.className = 'actions'
    const message = document.createElement('p')
    message.setAttribute('role', 'status')
    const note = document.createElement('p')
    const updateNote = () => {
        note.textContent = text(
            '此处只管理网盘副本。删除网盘不会删除本地下载；删除过的副本不会在默认整库同步中自动上传。',
            'These actions affect cloud copies only. Deleting a cloud copy keeps the local download and excludes it from default full sync.'
        )
    }
    updateNote()
    const buttonLabels = []
    panel.append(note, actions, message)
    root.querySelector('.page-heading')?.after(panel)
    function button(zh, en, handler) {
        const value = document.createElement('button')
        value.type = 'button'
        value.textContent = text(zh, en)
        value.onclick = handler
        actions.append(value)
        buttonLabels.push({ value, zh, en })
        return value
    }
    button('刷新网盘标志', 'Refresh cloud status', () => refresh())
    button('选中未上传', 'Select not uploaded', () => {
        selected.clear()
        for (const record of records)
            if (inventory.get(record.comicId)?.state === 'not-uploaded')
                selected.add(record.comicId)
        badges()
    })
    button('上传选中项', 'Upload selected', () => mutate('sync'))
    button(
        '仅删除网盘副本（保留本地）',
        'Delete cloud copies (keep local)',
        () => mutate('delete-remote')
    )
    const count = document.createElement('span')
    actions.append(count)
    document.addEventListener('pica-language-change', () => {
        updateNote()
        for (const { value, zh, en } of buttonLabels)
            value.textContent = text(zh, en)
        badges()
    })
    const labels = () => ({
        'not-uploaded': text('○ 未上传', '○ Not uploaded'),
        'remote-present': text('☁ 网盘已有副本', '☁ Cloud copy present'),
        'needs-update': text(
            '↥ 网盘副本待补传',
            '↥ Cloud copy needs more pages'
        ),
        'delete-pending': text(
            '⚠ 网盘删除待完成',
            '⚠ Cloud deletion incomplete'
        ),
        unknown: text('？网盘状态未核验', '? Cloud status unverified')
    })
    function badges() {
        root.querySelectorAll('[data-cloud-control]').forEach((node) =>
            node.remove()
        )
        for (const read of root.querySelectorAll('[data-read-comic]')) {
            const id = read.dataset.readComic
            const label = document.createElement('label')
            label.dataset.cloudControl = 'true'
            label.style.display = 'block'
            const checkbox = document.createElement('input')
            checkbox.type = 'checkbox'
            checkbox.checked = selected.has(id)
            checkbox.disabled = busy
            checkbox.setAttribute(
                'aria-label',
                text('选择网盘操作', 'Select for cloud action')
            )
            checkbox.onchange = () => {
                checkbox.checked ? selected.add(id) : selected.delete(id)
                badges()
            }
            const status = inventory.get(id)?.state || 'unknown'
            label.append(
                checkbox,
                document.createTextNode(labels()[status] || labels().unknown)
            )
            read.before(label)
        }
        count.textContent = text(
            `已选 ${selected.size} 本`,
            `${selected.size} selected`
        )
        for (const action of actions.querySelectorAll('button'))
            action.disabled = busy
    }
    async function refresh() {
        if (busy) return
        if (!getDesktop()?.remoteStorage?.configured) {
            message.textContent = text(
                '请先在设置 → 连接与同步配置网盘。',
                'Configure WebDAV in Settings → Connections first.'
            )
            return
        }
        busy = true
        badges()
        message.textContent = text(
            '正在读取网盘目录…',
            'Reading cloud catalog…'
        )
        try {
            const result = await post('/api/v1/desktop/test-connection', {
                remoteStorageAction: 'inventory'
            })
            inventory = new Map(
                result.comics.map((item) => [item.comicId, item])
            )
            checked = true
            scopeId = result.scopeId
            generation = result.generation
            message.textContent = text(
                '网盘状态已核验。“已有副本”表示目录中存在，不代表逐字节校验。',
                'Cloud status checked. “Copy present” means listed in the catalog, not byte-for-byte verification.'
            )
        } catch {
            inventory.clear()
            checked = false
            scopeId = null
            generation = null
            message.textContent = text(
                '网盘状态获取失败，不能判定为未上传。请检查连接后刷新。',
                'Cloud status unavailable; this does not mean not uploaded. Check the connection and refresh.'
            )
        } finally {
            busy = false
            badges()
        }
    }
    async function mutate(action) {
        if (busy || !selected.size) return
        const ids = [...selected]
        if (
            action === 'delete-remote' &&
            (!checked ||
                ids.some(
                    (id) =>
                        ![
                            'remote-present',
                            'needs-update',
                            'delete-pending'
                        ].includes(inventory.get(id)?.state)
                ))
        ) {
            message.textContent = text(
                '请刷新并仅选择已有网盘副本的漫画。',
                'Refresh and select comics with a cloud copy only.'
            )
            return
        }
        const prompt =
            action === 'sync'
                ? text(
                      `上传所选 ${ids.length} 本到网盘？不会上传其他漫画。`,
                      `Upload only these ${ids.length} comics?`
                  )
                : text(
                      `永久删除所选 ${ids.length} 本的网盘副本？本地下载全部保留。网盘文件未必可恢复。`,
                      `Permanently delete ${ids.length} cloud copies? All local downloads stay intact. Remote files may not be recoverable.`
                  )
        if (!window.confirm(prompt)) return
        busy = true
        badges()
        message.textContent = text(
            '操作进行中，请勿重复提交…',
            'Working. Do not submit again…'
        )
        let resultMessage
        try {
            const result = await post('/api/v1/desktop/settings', {
                remoteStorageAction: action,
                comicIds: ids,
                remoteScopeId: scopeId,
                ...(action === 'delete-remote'
                    ? {
                          confirmation: 'DELETE_REMOTE_ONLY',
                          remoteScopeId: scopeId,
                          expectedGeneration: generation
                      }
                    : {})
            })
            selected.clear()
            for (const id of result.pendingComicIds || []) selected.add(id)
            for (const issue of result.issues || []) selected.add(issue.comicId)
            resultMessage =
                action === 'sync' && result.skippedComicCount > 0
                    ? text(
                          `有 ${result.skippedComicCount} 本因本地文件问题未上传，已保留选中；请先修复后重试。`,
                          `${result.skippedComicCount} comics were not uploaded because local files need repair. They remain selected.`
                      )
                    : result.success === false
                      ? text(
                            '网盘目录已移除副本，但部分文件删除待完成；可选中警告项重试。本地文件未删除。',
                            'Some remote files still need cleanup. Retry the warning items. Local files were not deleted.'
                        )
                      : text(
                            '操作完成，本地下载未删除。',
                            'Completed. Local downloads were not deleted.'
                        )
        } catch {
            resultMessage = text(
                '操作未确认，请刷新核对结果；不要重复整库上传或删除。本地下载未删除。',
                'Operation unconfirmed. Refresh to check before retrying. Local downloads were not deleted.'
            )
        } finally {
            busy = false
            await refresh()
            message.textContent = resultMessage
            badges()
        }
    }
    return {
        mount(items) {
            records = items
            for (const id of selected)
                if (!items.some((item) => item.comicId === id))
                    selected.delete(id)
            badges()
            if (!checked && !busy && getDesktop()?.remoteStorage?.configured)
                void refresh()
        }
    }
}
