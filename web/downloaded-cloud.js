/** Remote-copy controls. No local deletion endpoint is reachable from this module. */
export function createDownloadedCloud({ post, getDesktop, getLanguage }) {
    const root = document.getElementById('downloaded')
    const selected = new Set()
    let inventory = new Map(),
        records = [],
        busy = false,
        checked = false,
        scopeId = null,
        generation = null,
        remoteTargetId = ''
    const text = (zh, en) => (getLanguage() === 'en' ? en : zh)
    const panel = document.createElement('article')
    panel.className = 'notice panel downloaded-cloud-panel'
    const actions = document.createElement('div')
    actions.className = 'actions'
    const targetSelect = document.createElement('select')
    targetSelect.setAttribute('aria-label', text('上传目标网盘', 'Remote storage target'))
    const message = document.createElement('p')
    message.setAttribute('role', 'status')
    const note = document.createElement('p')
    const updateNote = () => {
        note.textContent = text(
            '此处只管理所选网盘的副本。删除网盘不会删除本地下载；删除过的副本不会在该网盘默认整库同步中自动上传。',
            'These actions affect copies on the selected remote target only. Deleting a cloud copy keeps the local download and excludes it from that target’s default full sync.'
        )
        targetSelect.setAttribute('aria-label', text('上传目标网盘', 'Remote storage target'))
    }
    updateNote()
    const buttonLabels = []
    actions.append(targetSelect)
    panel.append(note, actions, message)
    root.querySelector('.page-heading')?.after(panel)

    function targets() {
        return getDesktop()?.remoteStorage?.targets || []
    }
    function renderTargets() {
        const list = targets()
        targetSelect.innerHTML = ''
        if (!list.length) {
            const option = document.createElement('option')
            option.value = ''
            option.textContent = text('未配置网盘', 'No remote configured')
            targetSelect.append(option)
            remoteTargetId = ''
            return
        }
        if (list.length > 1) {
            const placeholder = document.createElement('option')
            placeholder.value = ''
            placeholder.textContent = text('选择目标网盘…', 'Choose remote target…')
            targetSelect.append(placeholder)
        }
        for (const target of list) {
            const option = document.createElement('option')
            option.value = target.id
            option.textContent = target.label || target.baseUrl || target.id
            targetSelect.append(option)
        }
        if (list.length === 1) remoteTargetId = list[0].id
        else if (!list.some((target) => target.id === remoteTargetId)) remoteTargetId = ''
        targetSelect.value = remoteTargetId
    }
    function selectedTarget() {
        return targets().find((target) => target.id === remoteTargetId)
    }
    function requireTarget() {
        const target = selectedTarget()
        if (!target) {
            message.textContent = text(
                '请先选择本次操作使用的网盘。',
                'Choose the remote target for this operation first.'
            )
            return null
        }
        return target
    }
    targetSelect.onchange = () => {
        remoteTargetId = targetSelect.value
        inventory.clear()
        checked = false
        scopeId = null
        generation = null
        selected.clear()
        message.textContent = remoteTargetId
            ? text('已切换网盘，请刷新该网盘状态。', 'Remote changed. Refresh its cloud status.')
            : text('请选择目标网盘。', 'Choose a remote target.')
        badges()
    }

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
        if (!requireTarget()) return
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
        renderTargets()
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
            checkbox.disabled = busy || !remoteTargetId
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
        targetSelect.disabled = busy
    }
    async function refresh() {
        if (busy) return
        renderTargets()
        const target = requireTarget()
        if (!target) return
        busy = true
        badges()
        message.textContent = text(
            `正在读取「${target.label}」目录…`,
            `Reading catalog from “${target.label}”…`
        )
        try {
            const result = await post('/api/v1/desktop/test-connection', {
                remoteStorageAction: 'inventory',
                remoteTargetId
            })
            inventory = new Map(
                result.comics.map((item) => [item.comicId, item])
            )
            checked = true
            scopeId = result.scopeId
            generation = result.generation
            message.textContent = text(
                `「${target.label}」状态已核验。“已有副本”表示目录中存在，不代表逐字节校验。`,
                `“${target.label}” checked. “Copy present” means listed in the catalog, not byte-for-byte verification.`
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
        const target = requireTarget()
        if (!target) return
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
        if (action === 'sync' && !checked) {
            message.textContent = text(
                '上传前请先刷新所选网盘状态，确认当前目标。',
                'Refresh the selected remote before uploading so the target is verified.'
            )
            return
        }
        const prompt =
            action === 'sync'
                ? text(
                      `上传所选 ${ids.length} 本到「${target.label}」？不会上传到其他网盘。`,
                      `Upload only these ${ids.length} comics to “${target.label}”? Other remotes are untouched.`
                  )
                : text(
                      `永久删除「${target.label}」中所选 ${ids.length} 本的网盘副本？本地下载全部保留。网盘文件未必可恢复。`,
                      `Permanently delete ${ids.length} copies from “${target.label}”? All local downloads stay intact. Remote files may not be recoverable.`
                  )
        if (!window.confirm(prompt)) return
        busy = true
        badges()
        message.textContent = text(
            `正在操作「${target.label}」，请勿重复提交…`,
            `Working on “${target.label}”. Do not submit again…`
        )
        let resultMessage
        try {
            const result = await post('/api/v1/desktop/settings', {
                remoteStorageAction: action,
                remoteTargetId,
                comicIds: ids,
                remoteScopeId: scopeId,
                ...(action === 'delete-remote'
                    ? {
                          confirmation: 'DELETE_REMOTE_ONLY',
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
                          `有 ${result.skippedComicCount} 本因本地文件问题未上传到「${target.label}」，已保留选中；请先修复后重试。`,
                          `${result.skippedComicCount} comics were not uploaded to “${target.label}” because local files need repair. They remain selected.`
                      )
                    : result.success === false
                      ? text(
                            '网盘目录已移除副本，但部分文件删除待完成；可选中警告项重试。本地文件未删除。',
                            'Some remote files still need cleanup. Retry the warning items. Local files were not deleted.'
                        )
                      : text(
                            `「${target.label}」操作完成，本地下载未删除。`,
                            `Completed on “${target.label}”. Local downloads were not deleted.`
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
    renderTargets()
    return {
        mount(items) {
            records = items
            renderTargets()
            for (const id of selected)
                if (!items.some((item) => item.comicId === id))
                    selected.delete(id)
            badges()
            const remote = getDesktop()?.remoteStorage
            if (
                !checked &&
                !busy &&
                remote?.configured &&
                remoteTargetId
            )
                void refresh()
        }
    }
}
