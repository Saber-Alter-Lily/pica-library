import { copy as t } from './locale-runtime.js'

const terminal = (status) =>
    ['COMPLETED', 'CANCELLED', 'FAILED'].includes(status)
const node = (tag, value) => {
    const element = document.createElement(tag)
    if (value !== undefined) element.textContent = value
    return element
}

/** A DOM-only projection shared by the Host panel and Downloads. No transport or task state. */
export function renderHostedLocalDownloadJobs({
    target,
    value,
    idPrefix,
    canAct,
    onCancel,
    onRead
}) {
    if (
        !value ||
        value.sessionBound !== true ||
        !Array.isArray(value.jobs) ||
        value.jobs.length > 50 ||
        value.jobs.some(
            (job) =>
                !job ||
                !/^[a-f0-9-]{36}$/.test(job.id || '') ||
                ![
                    'QUEUED',
                    'PREPARING',
                    'RUNNING',
                    'COMPLETED',
                    'FAILED',
                    'CANCELLED'
                ].includes(job.status) ||
                !Number.isSafeInteger(job.progressCompleted) ||
                !Number.isSafeInteger(job.progressTotal) ||
                job.progressCompleted < 0 ||
                job.progressTotal < 0 ||
                job.progressCompleted > job.progressTotal ||
                job.progressTotal > 2000 ||
                typeof job.cancelRequested !== 'boolean' ||
                ['comicTitle', 'chapterTitle'].some(
                    (key) =>
                        job[key] != null &&
                        (typeof job[key] !== 'string' || job[key].length > 500)
                ) ||
                (job.status === 'COMPLETED' &&
                    (!/^local:[a-f0-9]{64}$/.test(job.localComicId || '') ||
                        !job.progressTotal ||
                        job.progressCompleted !== job.progressTotal))
        ) ||
        new Set(value.jobs.map((job) => job.id)).size !== value.jobs.length
    )
        throw Error('SOURCE_HOST_PROTOCOL')
    const captions = {
        QUEUED: t('排队中', 'Queued', '待機中'),
        PREPARING: t('准备中', 'Preparing', '準備中'),
        RUNNING: t('保存中', 'Saving', '保存中'),
        COMPLETED: t(
            '已完整保存，可离线阅读',
            'Saved completely; ready offline',
            '保存完了・オフライン読書可能'
        ),
        FAILED: t(
            '保存失败；旧副本保留，可重新确认保存',
            'Save failed; old copies retained. Confirm another save to retry.',
            '保存失敗・以前のコピーは保持。再確認して再試行できます。'
        ),
        CANCELLED: t(
            '已取消；已保存副本未删除',
            'Cancelled; saved copies were not deleted',
            '中止・保存済みコピーは削除していません'
        )
    }
    const rows = []
    for (const job of value.jobs) {
        const row = node('article')
        row.className = 'list-item host-download-job-card'
        row.dataset.hostJobId = job.id
        row.dataset.hostJobStatus = job.status
        const caption =
            job.status === 'RUNNING' && job.phase === 'waiting-resources'
                ? t(
                      '等待其他读写任务释放资源',
                      'Waiting for other disk tasks to release resources',
                      '他の読み書き処理の完了待ち'
                  )
                : captions[job.status]
        row.append(
            node(
                'p',
                (job.comicTitle || '') +
                    ' · ' +
                    (job.chapterTitle || '') +
                    ' — ' +
                    caption
            )
        )
        row.append(
            node(
                'p',
                t('已读取页面：', 'Pages fetched: ', '取得済みページ: ') +
                    job.progressCompleted +
                    '/' +
                    job.progressTotal +
                    (job.cancelRequested && !terminal(job.status)
                        ? t(
                              ' · 正在取消，等待清理',
                              ' · Cancelling; waiting for cleanup',
                              ' · 中止・後処理中'
                          )
                        : '')
            )
        )
        if (!terminal(job.status)) {
            const cancel = node(
                'button',
                t('取消此任务', 'Cancel this job', 'この処理を中止')
            )
            cancel.type = 'button'
            cancel.id = idPrefix + 'cancel-' + job.id
            cancel.disabled = job.cancelRequested
            cancel.onclick = async () => {
                if (cancel.disabled || !canAct()) return
                cancel.disabled = true
                try {
                    await onCancel(job.id)
                } catch {
                    if (canAct())
                        row.append(
                            node(
                                'p',
                                t(
                                    '暂时无法取消。请刷新任务状态后重试；已保存副本不会删除。',
                                    'Cancellation unavailable. Refresh the task before retrying; saved copies are not deleted.',
                                    '中止できません。状態を更新して再試行してください。保存済みコピーは削除しません。'
                                )
                            )
                        )
                } finally {
                    if (canAct()) cancel.disabled = job.cancelRequested
                }
            }
            row.append(cancel)
        }
        if (job.status === 'COMPLETED') {
            if (job.cancelRequested)
                row.append(
                    node(
                        'p',
                        t(
                            '取消到达前已完整保存；已保存副本不会自动删除。',
                            'The complete save was accepted before cancellation; the saved copy is not deleted.',
                            '中止前に保存が完了したため、保存済みコピーは削除しません。'
                        )
                    )
                )
            if (job.previousGenerationRetained)
                row.append(
                    node(
                        'p',
                        t(
                            '新副本已可用；旧临时副本暂未清理。',
                            'The new copy is available; an old temporary copy could not yet be removed.',
                            '新しいコピーは利用可能ですが、古い一時コピーをまだ削除できていません。'
                        )
                    )
                )
            const read = node(
                'button',
                t('本地阅读', 'Read locally', 'ローカルで読む')
            )
            read.type = 'button'
            read.id = idPrefix + 'read-' + job.id
            read.onclick = async () => {
                if (read.disabled || !canAct()) return
                read.disabled = true
                try {
                    await onRead(job.localComicId)
                } catch {
                    if (canAct())
                        row.append(
                            node(
                                'p',
                                t(
                                    '无法打开本地副本，请从本地书库重试。',
                                    'Cannot open the local copy; retry from your local library.',
                                    'ローカルコピーを開けません。ローカル書庫から再試行してください。'
                                )
                            )
                        )
                } finally {
                    if (canAct()) read.disabled = false
                }
            }
            row.append(read)
        }
        rows.push(row)
    }
    target.replaceChildren(...rows)
    return {
        pending: value.jobs.some((job) => !terminal(job.status)),
        count: value.jobs.length
    }
}
