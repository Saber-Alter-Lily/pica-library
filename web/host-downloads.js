import { copy as t } from './locale-runtime.js'
import { renderHostedLocalDownloadJobs } from './host-download-view.js'

/** View-only adapter over the SAME session jobs. Never enqueues, starts a host or persists a queue. */
export function installHostedDownloadProjection({
    target,
    boundaryNote,
    canQuery,
    isVisible,
    hostSession,
    query,
    cancel,
    openReader
}) {
    if (!target) return { refresh: async () => {}, dispose() {} }
    const node = (tag, value) => {
        const element = document.createElement(tag)
        if (value !== undefined) element.textContent = value
        return element
    }
    const heading = node('h3'),
        help = node('p'),
        refresh = node('button'),
        status = node('p'),
        list = node('div')
    heading.id = 'host-downloads-heading'
    refresh.id = 'host-downloads-refresh'
    refresh.type = 'button'
    status.id = 'host-downloads-status'
    list.id = 'host-downloads-list'
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    list.className = 'list'
    target.setAttribute('aria-labelledby', heading.id)
    target.hidden = true
    target.append(heading, help, refresh, status, list)
    let generation = 0,
        ownership = 0,
        active = null,
        timer = null,
        disposed = false,
        suspended = false
    const scopeId = () => hostSession()?.sessionId ?? null
    const ready = () => !disposed && !suspended && canQuery() && isVisible()
    function labels() {
        heading.textContent = t(
            '我的 Host 会话下载',
            'My Host-session downloads',
            '自分のホストセッションの保存'
        )
        help.textContent = t(
            '这里只显示当前已授权会话中手动确认的章节，不连接新来源或添加任务。与上方持久化队列分开计数：Host 任务确认后自行开始，结束会话/退出会取消未完成任务；完整副本留在本地书库，重启不会自动联网续传。',
            'Only chapters manually confirmed in the current authorized session. No new source connection or job is added. Counts are separate from the persistent queue above: Host jobs start on confirmation; ending the session/app cancels unfinished work. Complete copies stay in the local library; restart never resumes network work.',
            '現在許可したセッションで手動確認した章のみ表示し、新しい配信元への接続・処理追加はしません。上の永続キューとは別集計です。確認後に保存を開始し、セッション・アプリ終了で未完了処理を中止します。完全なコピーはローカル書庫に残り、再起動後に自動接続しません。'
        )
        refresh.textContent = t(
            '刷新 Host 任务',
            'Refresh Host jobs',
            'ホストの処理状況を更新'
        )
        if (boundaryNote)
            boundaryNote.dataset.infoTip = t(
                '原有本地/GitHub任务使用持久化队列。自选Host任务仅当前授权会话有效，确认后开始；上方“运行队列”不控制它们，重启不会自动恢复未完成Host任务。',
                'Existing local/GitHub jobs use a persistent queue. User-selected Host jobs belong to the current authorized session and start on confirmation; Run queue above does not control them. Restart does not resume unfinished Host jobs.',
                '既存のローカル・GitHub処理は永続キューを使います。選択したホストの処理は現在許可したセッション内で確認後に開始し、上の「キューを実行」では制御しません。再起動後に未完了のホスト処理を自動再開しません。'
            )
    }
    function invalidate(clear = false) {
        generation++
        ownership++
        active?.abort()
        active = null
        clearTimeout(timer)
        timer = null
        for (const button of list.querySelectorAll('button'))
            button.disabled = true
        if (clear) list.replaceChildren()
    }
    async function load() {
        if (disposed) return
        invalidate()
        labels()
        if (!ready()) {
            target.hidden = !canQuery()
            if (!canQuery()) list.replaceChildren()
            return
        }
        target.hidden = false
        const scope = scopeId()
        if (!scope) {
            list.replaceChildren()
            refresh.disabled = true
            status.textContent = t(
                '当前没有可查询的 Host 保存会话。本地内容不受影响；需自行建立会话并确认保存章节后才会出现任务。',
                'No authorized Host-save session is available. Local content is unaffected; explicitly start a session and confirm a chapter save to create jobs.',
                '参照できるホスト保存セッションがありません。ローカル内容には影響しません。自分でセッションを開始し、章の保存を確認すると処理を表示します。'
            )
            return
        }
        const ticket = generation,
            controller = new AbortController()
        active = controller
        refresh.disabled = true
        const timeout = setTimeout(() => controller.abort(), 10000)
        status.textContent = t(
            '正在读取本机保存任务状态…',
            'Reading local save-job status…',
            '本機の保存状況を読み取り中…'
        )
        try {
            const value = await query(scope, controller.signal)
            if (
                controller.signal.aborted ||
                ticket !== generation ||
                !ready() ||
                scopeId() !== scope
            )
                return
            const owner = ++ownership,
                canAct = () =>
                    owner === ownership && ready() && scopeId() === scope
            const result = renderHostedLocalDownloadJobs({
                target: list,
                value,
                idPrefix: 'host-task-',
                canAct,
                onCancel: async (id) => {
                    const mutation = new AbortController()
                    clearTimeout(timer)
                    timer = null
                    active = mutation
                    const deadline = setTimeout(() => mutation.abort(), 10000)
                    try {
                        await cancel(scope, id, mutation.signal)
                    } finally {
                        clearTimeout(deadline)
                        if (active === mutation) active = null
                    }
                    if (canAct()) await load()
                },
                onRead: (comic) => openReader(comic, false)
            })
            status.textContent = result.count
                ? t(
                      '当前会话任务：',
                      'Jobs in this session: ',
                      'このセッションの処理: '
                  ) + result.count
                : t(
                      '本次会话尚未确认保存章节；没有启动任何下载。',
                      'No chapter save has been confirmed in this session; no downloads were started.',
                      'このセッションで章の保存はまだ確認されておらず、保存処理は開始していません。'
                  )
            if (result.pending) timer = setTimeout(() => void load(), 1000)
        } catch {
            if (ticket === generation && ready()) {
                list.replaceChildren()
                status.textContent = t(
                    '暂时无法读取 Host 任务。未启动或重试任何下载，请手动刷新；已保存副本未删除。',
                    'Host jobs are temporarily unavailable. No download was started or retried. Refresh manually; saved copies were not deleted.',
                    'ホストの処理状況を取得できません。保存の開始・再試行は行っていません。手動更新してください。保存済みコピーは削除していません。'
                )
            }
        } finally {
            clearTimeout(timeout)
            if (ticket === generation) {
                active = null
                refresh.disabled = false
            }
        }
    }
    refresh.onclick = () => void load()
    const scopeChanged = () => {
        invalidate(true)
        if (ready()) void load()
    }
    const viewChanged = () => {
        if (ready()) void load()
        else invalidate()
    }
    const pagehide = () => {
        suspended = true
        invalidate(true)
    }
    const pageshow = () => {
        suspended = false
        if (ready()) void load()
    }
    document.addEventListener('pica-hosted-reading-scope-changed', scopeChanged)
    document.addEventListener('pica-hosted-downloads-changed', viewChanged)
    document.addEventListener('pica-hosted-download-panel-changed', viewChanged)
    document.addEventListener('pica-language-change', viewChanged)
    document.addEventListener('visibilitychange', viewChanged)
    window.addEventListener('pagehide', pagehide)
    window.addEventListener('pageshow', pageshow)
    return {
        refresh: load,
        dispose() {
            disposed = true
            invalidate(true)
            document.removeEventListener(
                'pica-hosted-reading-scope-changed',
                scopeChanged
            )
            document.removeEventListener(
                'pica-hosted-downloads-changed',
                viewChanged
            )
            document.removeEventListener(
                'pica-hosted-download-panel-changed',
                viewChanged
            )
            document.removeEventListener('pica-language-change', viewChanged)
            document.removeEventListener('visibilitychange', viewChanged)
            window.removeEventListener('pagehide', pagehide)
            window.removeEventListener('pageshow', pageshow)
            target.replaceChildren()
            target.hidden = true
        }
    }
}
