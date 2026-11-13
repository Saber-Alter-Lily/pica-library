import { copy } from './locale-runtime.js'

export const CHRONICLE_VIEW_STORAGE_KEY = 'pica-chronicle-display-filter-v1'

/** Browser-local display choices; never writes recommendation or library state. */
export function createChronicleView({ request, render, isConnected, onError }) {
    const root = document.querySelector('#chronicle-view-controls')
    const print = document.querySelector('#chronicle-print')
    let options = { hideBlocked: false, hideLess: false }
    try {
        const saved = JSON.parse(
            localStorage.getItem(CHRONICLE_VIEW_STORAGE_KEY) || '{}'
        )
        options = {
            hideBlocked: saved.hideBlocked === true,
            hideLess: saved.hideLess === true
        }
    } catch {
        /* Privacy mode/storage failure must not prevent the default view. */
    }
    let sequence = 0,
        busy = false,
        failed = false,
        metadata = null
    const filtered = () => options.hideBlocked || options.hideLess
    const canPrint = () => !filtered() && !busy && !failed
    function paint() {
        if (!root) return
        const focusId = root.contains(document.activeElement)
            ? document.activeElement.id
            : ''
        const connected = isConnected()
        root.innerHTML = `
            <fieldset><legend>${copy('图鉴显示过滤（默认关闭）', 'Atlas display filters (off by default)', '図鑑表示フィルター（既定はオフ）')}</legend>
                <label><input id="chronicle-hide-blocked" type="checkbox"> ${copy('隐藏已屏蔽的偏好项目', 'Hide blocked preference items', 'ブロック済み嗜好項目を隠す')}</label>
                <label><input id="chronicle-hide-less" type="checkbox"> ${copy('同时隐藏“少推荐”项目（可选）', 'Also hide “recommend less” items (optional)', '「少なく推薦」の項目も隠す（任意）')}</label>
            </fieldset>
            <p id="chronicle-view-note" class="status" role="status" aria-live="polite"></p>`
        for (const [id, key] of [
            ['chronicle-hide-blocked', 'hideBlocked'],
            ['chronicle-hide-less', 'hideLess']
        ]) {
            const input = root.querySelector(`#${id}`)
            input.checked = options[key]
            input.disabled = !connected
            input.addEventListener('change', () => {
                options[key] = input.checked
                try {
                    localStorage.setItem(
                        CHRONICLE_VIEW_STORAGE_KEY,
                        JSON.stringify(options)
                    )
                } catch {
                    /* Ephemeral still works. */
                }
                void load()
            })
        }
        let message = copy(
            '客观收藏分布：出现频次不等于明确喜欢。',
            'Objective collection distribution: frequency is not explicit preference.',
            '客観的な収集分布です。頻度は明示的な好みではありません。'
        )
        if (!connected)
            message += copy(
                ' 显示过滤需要连接 Desktop。',
                ' Display filtering requires Desktop.',
                ' 表示フィルターには Desktop 接続が必要です。'
            )
        else if (failed)
            message = copy(
                '读取失败，未展示旧的过滤结果。请切换选项重试或重新进入图鉴。',
                'Read failed; stale results are hidden. Toggle an option or reopen the atlas to retry.',
                '読み込み失敗。古い結果は非表示です。切り替えまたは再表示で再試行してください。'
            )
        else if (busy)
            message = copy(
                '正在读取同一收藏快照的显示视图……',
                'Loading a display view of the same collection snapshot…',
                '同じ収集スナップショットの表示ビューを読み込み中…'
            )
        else if (metadata?.mode === 'FILTERED_COLLECTION') {
            message = copy(
                `过滤后的收藏视图 · 隐藏 ${metadata.hiddenInterests} 个语义项目、${metadata.hiddenThemes} 个主题、${metadata.hiddenAuthors} 位作者。`,
                `Filtered collection view · ${metadata.hiddenInterests} semantic items, ${metadata.hiddenThemes} themes and ${metadata.hiddenAuthors} authors hidden.`,
                `収集フィルタービュー · 意味項目 ${metadata.hiddenInterests} 件、テーマ ${metadata.hiddenThemes} 件、作者 ${metadata.hiddenAuthors} 件を非表示。`
            )
            message += copy(
                ' 只隐藏已保存的长期偏好对应项目，不推断你真正喜欢什么；原始收藏数、各维度计数和百分比分母不变。不补入原快照以外的项目。关闭过滤后可导出客观结果卡。',
                ' Only items matching saved persistent controls are hidden; this does not infer your interests. Original counts and percentage denominators are unchanged. No new items are backfilled. Turn filters off to export the objective result card.',
                ' 保存済み長期調整に対応する項目だけを隠し、好みを推定しません。元の件数と割合の分母は不変です。項目の補充はしません。客観的カードの出力にはフィルターをオフにしてください。'
            )
            if (metadata.unsupportedControlCount)
                message += copy(
                    ' 分类和画风家族控制不映射为语义标签，未应用到此视图。',
                    ' Category/style-family controls are not mapped to semantic tags in this view.',
                    ' カテゴリ・画風群の調整は意味タグに変換しません。'
                )
        }
        if (metadata && !busy && !failed) {
            message += copy(
                ` 原始快照：${metadata.originalFavoriteCount} 本 · ${metadata.generatedAt}。`,
                ` Original snapshot: ${metadata.originalFavoriteCount} favorites · ${metadata.generatedAt}.`,
                ` 元のスナップショット：${metadata.originalFavoriteCount} 冊 · ${metadata.generatedAt}。`
            )
            if (!metadata.supported)
                message += copy(
                    ' 旧图鉴格式不支持过滤。',
                    ' Legacy atlas format does not support filtering.',
                    ' 旧形式はフィルター非対応です。'
                )
            if (!metadata.registryAvailable)
                message += copy(
                    ' 语义词库不可用，别名过滤降级为原始键匹配。',
                    ' Registry unavailable; alias filtering falls back to exact raw keys.',
                    ' 辞書を利用できず、元キーの完全一致でのみ除外します。'
                )
        }
        root.querySelector('#chronicle-view-note').textContent = message
        if (print) {
            print.disabled = !canPrint()
            print.title = filtered()
                ? copy(
                      '关闭显示过滤后导出客观收藏结果卡。',
                      'Turn display filters off before exporting the objective collection card.',
                      '客観的収集カードの出力にはフィルターをオフにしてください。'
                  )
                : ''
        }
        if (focusId)
            document.getElementById(focusId)?.focus({ preventScroll: true })
    }
    async function load() {
        const ticket = ++sequence
        if (!isConnected()) {
            paint()
            return
        }
        busy = true
        failed = false
        paint()
        try {
            const result = await request(
                `/api/v1/recommendation/profile/view?${new URLSearchParams({ hideBlocked: String(options.hideBlocked), hideLess: String(options.hideLess) })}`
            )
            if (ticket !== sequence) return
            metadata = result.view
            render(result.snapshot, metadata)
            return true
        } catch (error) {
            if (ticket !== sequence) return
            failed = true
            onError(error)
        } finally {
            if (ticket === sequence) {
                busy = false
                paint()
            }
        }
    }
    window.addEventListener('pica-language-change', paint)
    paint()
    return { load, paint, canPrint }
}
