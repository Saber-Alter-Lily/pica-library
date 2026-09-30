import { copy as t, currentLanguage } from './locale-runtime.js'

const TOUR_VERSION = 2
const STATE_KEY = 'pica-onboarding-state-v1'
const SESSION_DISMISSED_KEY = 'pica-onboarding-session-dismissed-v1'
let activeDriver = null
let promptScheduled = false
let welcomeCheckTimer = null
let welcomeReadinessObserver = null

function readState() {
    try {
        const value = JSON.parse(localStorage.getItem(STATE_KEY) || '{}')
        return {
            completedVersion: Number(value.completedVersion || 0),
            dismissedVersion: Number(value.dismissedVersion || 0),
            autoShow: value.autoShow !== false
        }
    } catch {
        return { completedVersion: 0, dismissedVersion: 0, autoShow: true }
    }
}
function writeState(next) {
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...readState(), ...next }))
    renderSettingsPanel()
    if (!shouldPrompt()) stopWelcomeReadinessWatch()
}
function shouldPrompt() {
    const state = readState()
    return (
        state.autoShow &&
        Math.max(state.completedVersion, state.dismissedVersion) < TOUR_VERSION &&
        sessionStorage.getItem(SESSION_DISMISSED_KEY) !== String(TOUR_VERSION)
    )
}
function appReadyForTour() {
    const disclaimer = document.querySelector('#pica-disclaimer-gate')
    if (disclaimer && !disclaimer.hidden && getComputedStyle(disclaimer).display !== 'none') return false
    const setup = document.querySelector('#setup')
    if (setup?.classList.contains('active')) return false
    return Boolean(document.querySelector('.app-nav, #home'))
}
function openSettingsPanel(id = 'general') {
    document.querySelector('nav [data-view="maintenance"]')?.click()
    const tab = document.querySelector(`#a87-${id}-tab`)
    tab?.click()
}
const TOUR_TARGETS = [
    ['nav [data-view="library"]', 'library-nav'],
    ['#sync-button', 'library-sync'],
    ['#filter-text', 'library-filter'],
    ['nav [data-view="shelves"]', 'shelves-nav'],
    ['#shelf-create', 'shelf-create'],
    ['nav [data-view="discover"]', 'discover-nav'],
    ['#recommend-button', 'recommend-run'],
    ['nav [data-view="maintenance"]', 'settings-nav'],
    ['#a87-recommendations-tab', 'recommend-settings-tab'],
    [
        '#settings-recommendation-v5, #settings-recommendation-v4',
        'recommend-settings'
    ],
    ['#visual-rerank-mode', 'visual-mode'],
    ['#visual-strength', 'visual-strength'],
    ['#a87-connections-tab', 'connections-tab'],
    ['#a83-connections', 'connection-status'],
    ['#settings-eh-account', 'eh-account'],
    ['#settings-mobile-bridge', 'mobile-bridge'],
    ['#a87-language-panel', 'language-panel'],
    ['#software-updates', 'software-panel']
]

function targetWithin(root, selector) {
    if (root instanceof Element && root.matches(selector)) return root
    return root?.querySelector?.(selector) || null
}

function markTourTargets(root = document) {
    for (const [selector, name] of TOUR_TARGETS)
        targetWithin(root, selector)?.setAttribute('data-tour', name)
}

function welcomeCopy() {
    return {
        title: t('欢迎使用新版 Pica Library','Welcome to the new Pica Library','新しい Pica Library へようこそ'),
        body: t(
            '花几分钟完成一次真实使用流程：同步收藏、建立书架、生成和调整推荐、检查连接与画风设置。引导可以随时跳过；之后也可以在“设置 → 帮助与新手引导”重新查看。',
            'Spend a few minutes walking through a real workflow: sync favorites, create shelves, generate and tune recommendations, then check connections and visual-style settings. You can skip at any time and replay it later from Settings → Help & Onboarding.',
            '数分で実際の利用手順を確認します：お気に入り同期、本棚作成、おすすめ生成・調整、接続状態と画風設定。いつでもスキップでき、後から「設定 → ヘルプと初回ガイド」で再表示できます。'
        ),
        start: t('开始引导','Start tour','ガイドを開始'),
        later: t('稍后再看','Later','後で見る'),
        never: t('不再自动提示','Do not show automatically again','今後は自動表示しない')
    }
}

function ensureWelcomeDialog() {
    let dialog = document.querySelector('#pica-onboarding-welcome')
    if (!dialog) {
        dialog = document.createElement('dialog')
        dialog.id = 'pica-onboarding-welcome'
        dialog.addEventListener('cancel', (event) => {
            event.preventDefault()
            dismissWelcome(false)
        })
        document.body.appendChild(dialog)
    }
    const copy = welcomeCopy()
    dialog.innerHTML = `<div class="pica-onboarding-welcome-shell">
        <h2>${copy.title}</h2>
        <p>${copy.body}</p>
        <label class="pica-onboarding-checkbox"><input id="pica-onboarding-never" type="checkbox"><span>${copy.never}</span></label>
        <div class="pica-onboarding-welcome-actions">
            <button id="pica-onboarding-later" type="button">${copy.later}</button>
            <button id="pica-onboarding-start" type="button" class="primary">${copy.start}</button>
        </div>
    </div>`
    dialog.querySelector('#pica-onboarding-later').onclick = () =>
        dismissWelcome(dialog.querySelector('#pica-onboarding-never').checked)
    dialog.querySelector('#pica-onboarding-start').onclick = () => {
        const never = dialog.querySelector('#pica-onboarding-never').checked
        if (never) writeState({ autoShow: false })
        dialog.close()
        startTour({ replay: false })
    }
    return dialog
}

function dismissWelcome(neverAgain) {
    const dialog = document.querySelector('#pica-onboarding-welcome')
    if (neverAgain) writeState({ autoShow: false, dismissedVersion: TOUR_VERSION })
    else sessionStorage.setItem(SESSION_DISMISSED_KEY, String(TOUR_VERSION))
    if (dialog?.open) dialog.close()
}

function promptWelcomeIfNeeded() {
    if (!shouldPrompt() || !appReadyForTour()) return false
    const dialog = ensureWelcomeDialog()
    if (!dialog.open) dialog.showModal()
    return true
}
function stopWelcomeReadinessWatch() {
    if (welcomeCheckTimer) window.clearTimeout(welcomeCheckTimer)
    welcomeCheckTimer = null
    welcomeReadinessObserver?.disconnect()
    welcomeReadinessObserver = null
    document.removeEventListener(
        'visibilitychange',
        onWelcomeVisibilityChange
    )
}

function runWelcomeReadinessCheck() {
    if (!shouldPrompt()) {
        stopWelcomeReadinessWatch()
        return
    }
    if (promptWelcomeIfNeeded()) stopWelcomeReadinessWatch()
}

function queueWelcomeReadinessCheck(delay = 0) {
    if (!shouldPrompt()) {
        stopWelcomeReadinessWatch()
        return
    }
    if (welcomeCheckTimer) window.clearTimeout(welcomeCheckTimer)
    welcomeCheckTimer = window.setTimeout(() => {
        welcomeCheckTimer = null
        runWelcomeReadinessCheck()
    }, delay)
}

function onWelcomeVisibilityChange() {
    if (document.visibilityState === 'visible')
        queueWelcomeReadinessCheck()
}

function scheduleWelcome() {
    if (promptScheduled) return
    promptScheduled = true

    const setup = document.querySelector('#setup')
    if (setup) {
        welcomeReadinessObserver = new MutationObserver(() =>
            queueWelcomeReadinessCheck()
        )
        welcomeReadinessObserver.observe(setup, {
            attributes: true,
            attributeFilter: ['class', 'hidden', 'style']
        })
    }

    document.addEventListener(
        'visibilitychange',
        onWelcomeVisibilityChange
    )
    queueWelcomeReadinessCheck(650)
}

function stepText() {
    return {
        libraryTitle: t('统一书库','Unified library','統合ライブラリ'),
        libraryBody: t('Pica、E-H、本地下载和远程副本都在这里统一整理。点击“下一步”会真正打开书库。','Organize Pica, E-H, local downloads and remote copies in one library. Next opens the library itself.','Pica、E-H、ローカルダウンロード、リモートコピーを1つのライブラリで整理します。「次へ」で実際にライブラリを開きます。'),
        syncTitle: t('先同步收藏','Sync favorites first','まずお気に入りを同期'),
        syncBody: t('普通“更新收藏”先核对总数和最近变化，能确认时只做增量同步；只有数量/顺序无法安全对上或需要定期校验时才回退完整扫描。同步过程中可以看到页数、进度，并可暂停或取消。','Normal Sync Favorites checks counts and recent changes first and uses an incremental reconciliation when safe. It falls back to a full scan only when count/order cannot be reconciled safely or a periodic audit is due. Progress is visible and the task can be paused or cancelled.','通常の「お気に入りを同期」は件数と最近の変更を先に確認し、安全に判断できる場合は差分同期します。件数や順序を安全に照合できない場合、または定期監査時のみ全件確認へ切り替わります。進捗を確認でき、一時停止やキャンセルも可能です。'),
        filterTitle: t('搜索与筛选','Search & filters','検索と絞り込み'),
        filterBody: t('可以按标题、作者、标签、来源、存储位置等缩小范围。','Narrow the library by title, author, tags, provider, storage location and more.','タイトル、作者、タグ、配信元、保存場所などで絞り込めます。'),
        shelvesTitle: t('建立书架','Create shelves','本棚を作成'),
        shelvesBody: t('书架用于你自己的分类，不会改变原网站收藏。下一步会进入书架页。','Shelves are your own organization layer and do not change provider favorites. Next opens Shelves.','本棚は自分用の整理機能で、配信元のお気に入り状態は変更しません。「次へ」で本棚を開きます。'),
        shelfCreateTitle: t('新建与管理书架','Create and manage shelves','本棚を作成・管理'),
        shelfCreateBody: t('可以建立多个书架，把书库、搜索或推荐中的作品批量加入；之后也能重命名、移出或删除书架。','Create multiple shelves and batch-add works from Library, Search or Recommendations; shelves can later be renamed, edited or deleted.','複数の本棚を作成し、ライブラリ・検索・おすすめから作品をまとめて追加できます。後から名前変更、作品の移動、本棚の削除もできます。'),
        discoverTitle: t('推荐与在线发现','Recommendations & discovery','おすすめとオンライン発見'),
        discoverBody: t('推荐与在线搜索共用同一套书库身份。下一步会打开推荐页。','Recommendations and online search share the same library identities. Next opens discovery.','おすすめとオンライン検索は同じライブラリIDを共有します。「次へ」で発見ページを開きます。'),
        recommendTitle: t('专属推荐','Personal recommendations','パーソナルおすすめ'),
        recommendBody: t('推荐结合长期收藏、最近行为、显式偏好和本次想看。一个推荐周期会提前生成多批结果，每批通常 12 本；切换批次不会重新读取全部收藏。喜欢/不喜欢会写入行为证据，人工调整则用于更明确地改变长期或本次偏好。','Recommendations combine long-term favorites, recent behavior, explicit preferences and current-session intent. A cycle prepares multiple batches, typically 12 works each; switching batches does not reread the whole favorite library. Like/dislike records behavioral evidence, while manual tuning expresses stronger durable or session-specific intent.','おすすめは長期のお気に入り、最近の行動、明示的な嗜好、今回見たいものを組み合わせます。1サイクルで複数バッチ（通常12作品ずつ）を準備し、バッチ切替でお気に入り全体を再読込しません。好き/苦手は行動証拠として記録され、手動調整は長期または今回の嗜好を明示します。'),
        settingsTitle: t('设置中心','Settings hub','設定センター'),
        settingsBody: t('语言、推荐、连接、外观、存储和更新都集中在这里。','Language, recommendations, connections, appearance, storage and updates live here.','言語、おすすめ、接続、外観、保存先、更新をここで管理します。'),
        recSettingsTitle: t('推荐与画风','Recommendations & visual style','おすすめと画風'),
        recSettingsBody: t('这里可以查看推荐画像和实际构成，用 0–10 档调整作者/标签等偏好，设置屏蔽或“本次想看”，并管理与手机之间的推荐同步。','Inspect the recommendation profile and serving composition here, tune author/tag preferences on a 0–10 scale, block targets or set current-session intent, and manage recommendation sync with Android.','おすすめプロフィールと実際の構成を確認し、作者・タグなどを0–10で調整、ブロックや「今回見たい」を設定し、Androidとのおすすめ同期を管理できます。'),
        connectionsTitle: t('连接与同步','Connections & sync','接続と同期'),
        connectionsBody: t('这里管理 Android 配对、跨端同步和 WebDAV。下一步会打开连接设置。','Manage Android pairing, cross-device sync and WebDAV here. Next opens connection settings.','Android ペアリング、端末間同期、WebDAV を管理します。「次へ」で接続設定を開きます。'),
        visualModeTitle: t('画风接入模式','Visual-style mode','画風連携モード'),
        visualModeBody: t('OFF 表示完全不影响常规推荐；SHADOW 只分析不改变排序；LIVE 才会把电脑端预计算的画风相似度加入最终排序。','OFF leaves normal ranking untouched; SHADOW analyzes without changing ranking; LIVE adds Desktop-precomputed visual affinity to final ranking.','OFF は通常順位に影響せず、SHADOW は分析のみ、LIVE で Desktop 側の画風類似度を最終順位に反映します。'),
        visualStrengthTitle: t('画风影响强度','Visual influence strength','画風の影響強度'),
        visualStrengthBody: t('强度只调节画风在总分中的权重，不会替代作者、标签、最近行为和本次 Session。建议先用标准强度，再根据结果调整。','Strength changes only the visual contribution to the total score; it does not replace author, tag, recent-behavior or session signals. Start with Standard and adjust after observing results.','強度は総合スコア内の画風寄与だけを調整し、作者・タグ・最近の行動・Session を置き換えません。まず標準から試すのがおすすめです。'),
        connectionStatusTitle: t('先看连接状态','Check connection state','接続状態を確認'),
        connectionStatusBody: t('Pica、E-H/ExH、WebDAV 和手机局域网分别显示“已配置”和当前可用性。某个模块失败不会再把整套应用误判成 Browser Lite。','Pica, E-H/ExH, WebDAV and Phone LAN show configuration and current reachability separately. A failure in one optional module no longer downgrades the whole app to Browser Lite.','Pica、E-H/ExH、WebDAV、スマートフォンLANは設定状態と現在の利用可否を個別表示します。任意機能の失敗でアプリ全体が Browser Lite に誤降格することはありません。'),
        ehTitle: t('E-H 登录方式','E-H login modes','E-H ログイン方法'),
        ehBody: t('推荐的“网页登录并自动回传”会打开独立官方登录窗口，检测到会话后自动验证、保存并更新这里的状态；手动官网登录只是普通链接，不会自动回传登录结果。','Recommended managed web login opens an isolated official login window, captures the session after login, verifies and saves it, then updates status here. The manual official-site link is just a normal browser link and cannot return login state automatically.','推奨の管理Webログインは独立した公式ログイン画面を開き、ログイン後にセッションを検出・検証・保存して状態を更新します。手動リンクは通常のブラウザリンクなのでログイン結果を自動反映できません。'),
        mobileTitle: t('手机直接读取电脑内容','Read Desktop content on your phone','スマートフォンからPCの内容を読む'),
        mobileBody: t('同一局域网配对后，手机可以直接读取电脑已经下载的漫画，不必重复下载。','After LAN pairing, Android can read comics already downloaded on Desktop without downloading another copy.','同じLANでペアリングすると、Desktopでダウンロード済みの作品をスマートフォンから直接読めます。'),
        languageTitle: t('语言与地区','Language & Region','言語と地域'),
        languageBody: t('界面可以随时切换简体中文、日本語和 English，修改会立即保存。','Switch between Simplified Chinese, 日本語 and English at any time; changes are saved immediately.','简体中文・日本語・English をいつでも切り替えられ、変更はすぐに保存されます。'),
        updateTitle: t('软件更新','Software update','ソフトウェア更新'),
        updateBody: t('正式版本可以从这里检查更新。以后想重新看本引导，可回到“设置 → 帮助与新手引导”。','Check formal releases here. You can replay this tour later from Settings → Help & Onboarding.','正式版の更新をここで確認できます。このガイドは後から「設定 → ヘルプと初回ガイド」で再表示できます。'),
        doneTitle: t('已经准备好了','You are ready','準備完了'),
        doneBody: t('主要功能已经介绍完毕。以后随时可以从设置重新打开本引导。','That covers the main features. You can replay this tour from Settings at any time.','主な機能の説明は以上です。設定からいつでもこのガイドを再表示できます。')
    }
}

function visibleTarget(selector) {
    const element = typeof selector === 'string'
        ? document.querySelector(selector)
        : selector
    if (!(element instanceof Element)) return null
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        rect.width <= 0 ||
        rect.height <= 0
    ) return null
    return element
}

function ensureView(id) {
    const view = document.querySelector('#' + id)
    if (!view?.classList.contains('active'))
        document.querySelector(`nav [data-view="${id}"]`)?.click()
}

function viewTarget(viewId, selector) {
    return () => {
        ensureView(viewId)
        return visibleTarget(selector)
    }
}

function settingsTarget(panelId, selector, disclosureSelector = null) {
    return () => {
        ensureView('maintenance')
        const panel = document.querySelector(`#a87-${panelId}-panel`)
        if (!panel?.classList.contains('active'))
            document.querySelector(`#a87-${panelId}-tab`)?.click()
        if (panelId === 'maintenance' && selector === '#software-updates') {
            document.querySelectorAll('#a87-maintenance-panel > .tab').forEach((tab) =>
                tab.classList.toggle('active', tab.id === 'software-updates')
            )
            document.querySelectorAll('#a87-maintenance-panel > .tabs button').forEach((button) =>
                button.classList.toggle('active', button.dataset.tab === 'software-updates')
            )
        }
        if (disclosureSelector) {
            const disclosure = document.querySelector(disclosureSelector)
            if (disclosure instanceof HTMLDetailsElement) disclosure.open = true
        }
        return visibleTarget(selector)
    }
}

function makeSteps() {
    const copy = stepText()
    return [
        { element: viewTarget('library','nav [data-view="library"]'), waitForElement: 2500,
          popover: { title: copy.libraryTitle, description: copy.libraryBody } },
        { element: viewTarget('library','[data-tour="library-sync"]'), waitForElement: 2500,
          popover: { title: copy.syncTitle, description: copy.syncBody } },
        { element: viewTarget('library','[data-tour="library-filter"]'), waitForElement: 2500,
          popover: { title: copy.filterTitle, description: copy.filterBody } },
        { element: viewTarget('shelves','nav [data-view="shelves"]'), waitForElement: 2500,
          popover: { title: copy.shelvesTitle, description: copy.shelvesBody } },
        { element: viewTarget('shelves','[data-tour="shelf-create"]'), waitForElement: 2500,
          popover: { title: copy.shelfCreateTitle, description: copy.shelfCreateBody } },
        { element: viewTarget('discover','nav [data-view="discover"]'), waitForElement: 2500,
          popover: { title: copy.discoverTitle, description: copy.discoverBody } },
        { element: viewTarget('discover','[data-tour="recommend-run"]'), waitForElement: 2500,
          popover: { title: copy.recommendTitle, description: copy.recommendBody } },
        { element: viewTarget('maintenance','nav [data-view="maintenance"]'), waitForElement: 2500,
          popover: { title: copy.settingsTitle, description: copy.settingsBody } },
        { element: settingsTarget('recommendations','#a87-recommendations-tab'), waitForElement: 3500,
          popover: { title: copy.recSettingsTitle, description: copy.recSettingsBody } },
        { element: settingsTarget('recommendations','#visual-rerank-mode','#ux-visual-settings'), waitForElement: 3500, skipMissingElement: true,
          popover: { title: copy.visualModeTitle, description: copy.visualModeBody } },
        { element: settingsTarget('recommendations','#visual-strength','#ux-visual-settings'), waitForElement: 3500, skipMissingElement: true,
          popover: { title: copy.visualStrengthTitle, description: copy.visualStrengthBody } },
        { element: settingsTarget('connections','#a87-connections-tab'), waitForElement: 3500,
          popover: { title: copy.connectionsTitle, description: copy.connectionsBody } },
        { element: settingsTarget('connections','#a83-connections'), waitForElement: 3500, skipMissingElement: true,
          popover: { title: copy.connectionStatusTitle, description: copy.connectionStatusBody } },
        { element: settingsTarget('connections','#settings-mobile-bridge'), waitForElement: 3500, skipMissingElement: true,
          popover: { title: copy.mobileTitle, description: copy.mobileBody } },
        { element: settingsTarget('general','#settings-eh-account'), waitForElement: 3500, skipMissingElement: true,
          popover: { title: copy.ehTitle, description: copy.ehBody } },
        { element: settingsTarget('general','#a87-language-panel'), waitForElement: 3500,
          popover: { title: copy.languageTitle, description: copy.languageBody } },
        { element: settingsTarget('maintenance','#software-updates'), waitForElement: 3500,
          popover: { title: copy.updateTitle, description: copy.updateBody } },
        { popover: { title: copy.doneTitle, description: copy.doneBody,
            onNextClick: (_e,_s,opts) => {
                writeState({ completedVersion: TOUR_VERSION, dismissedVersion: 0 })
                opts.driver.destroy()
            } } }
    ]
}

function skipCopy() {
    return {
        skip: t('跳过','Skip','スキップ'),
        title: t('跳过新手引导？','Skip onboarding?','初回ガイドをスキップしますか？'),
        body: t(
            '之后仍可在“设置 → 帮助与新手引导”重新查看。',
            'You can replay it later from Settings → Help & Onboarding.',
            '後から「設定 → ヘルプと初回ガイド」で再表示できます。'
        ),
        cancel: t('继续引导','Continue tour','ガイドを続ける'),
        confirm: t('跳过','Skip','スキップ')
    }
}
async function confirmSkip(driver) {
    const copy = skipCopy()
    const confirmed = window.picaConfirmAction
        ? await window.picaConfirmAction(copy.body, copy.title)
        : window.confirm(`${copy.title}\n\n${copy.body}`)
    if (!confirmed) return
    writeState({ dismissedVersion: TOUR_VERSION })
    driver.destroy()
}

function addSkipButton(popover, opts) {
    if (popover.footerButtons.querySelector('.pica-tour-skip')) return
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'pica-tour-skip'
    button.textContent = skipCopy().skip
    button.onclick = () => void confirmSkip(opts.driver)
    popover.footerButtons.prepend(button)
    popover.closeButton.setAttribute('aria-label', skipCopy().skip)
}

function startTour({ replay = false } = {}) {
    ensureSettingsPanel()
    markTourTargets()
    const factory = window.driver?.js?.driver
    if (typeof factory !== 'function') return false
    if (activeDriver?.isActive?.()) activeDriver.destroy()
    const steps = makeSteps()
    activeDriver = factory({
        steps,
        animate: true,
        smoothScroll: true,
        allowClose: true,
        allowScroll: true,
        overlayClickBehavior: 'none',
        showProgress: true,
        progressText: t('{{current}} / {{total}}','{{current}} / {{total}}','{{current}} / {{total}}'),
        nextBtnText: t('下一步','Next','次へ'),
        prevBtnText: t('上一步','Back','戻る'),
        doneBtnText: t('完成','Done','完了'),
        popoverClass: 'pica-tour-popover',
        stagePadding: 8,
        stageRadius: 12,
        waitForElement: 2500,
        skipMissingElement: true,
        onPopoverRender: addSkipButton,
        onDestroyStarted: (_element,_step,opts) => void confirmSkip(opts.driver),
        onDestroyed: () => { activeDriver = null }
    })
    if (replay) sessionStorage.removeItem(SESSION_DISMISSED_KEY)
    activeDriver.drive()
    return true
}

function settingsCopy() {
    return {
        title: t('帮助与新手引导','Help & Onboarding','ヘルプと初回ガイド'),
        text: t('可以随时重新查看完整任务引导：收藏同步、书架、推荐、画风和连接。关闭自动提示后，仍然可以手动启动。','Replay the full task-oriented tour at any time: favorite sync, shelves, recommendations, visual style and connections. Turning off automatic prompts never disables manual replay.','お気に入り同期、本棚、おすすめ、画風、接続を含む完全なタスクガイドをいつでも再表示できます。自動表示をオフにしても手動再生は利用できます。'),
        replay: t('重新查看新手引导','Replay onboarding','初回ガイドをもう一度見る'),
        auto: t('自动显示新版功能引导','Show new-feature onboarding automatically','新機能ガイドを自動表示')
    }
}
function ensureSettingsPanel() {
    const general = document.querySelector('#a87-general-panel')
    if (!general) return false
    let panel = document.querySelector('#a89-onboarding-panel')
    if (!panel) {
        panel = document.createElement('article')
        panel.id = 'a89-onboarding-panel'
        panel.className = 'panel'
        general.appendChild(panel)
    }
    renderSettingsPanel()
    return true
}
function renderSettingsPanel() {
    const panel = document.querySelector('#a89-onboarding-panel')
    if (!panel) return
    const copy = settingsCopy()
    const state = readState()
    panel.innerHTML = `<h3>${copy.title}</h3><p>${copy.text}</p>
        <div class="a89-actions">
            <button id="a89-onboarding-replay" type="button">${copy.replay}</button>
            <label class="a89-auto"><input id="a89-onboarding-auto" type="checkbox" ${state.autoShow ? 'checked' : ''}><span>${copy.auto}</span></label>
        </div>`
    panel.querySelector('#a89-onboarding-replay').onclick = () => startTour({ replay: true })
    panel.querySelector('#a89-onboarding-auto').onchange = (event) => {
        writeState({ autoShow: event.target.checked })
    }
}

function installObserver() {
    let queued = false
    let settingsPanelDirty = false
    let welcomeReadinessDirty = false
    const pendingRoots = new Set()
    const schedule = () => {
        if (queued) return
        queued = true
        requestAnimationFrame(() => {
            queued = false
            const roots = [...pendingRoots]
            pendingRoots.clear()
            for (const root of roots) markTourTargets(root)
            if (
                settingsPanelDirty &&
                !document.querySelector('#a89-onboarding-panel')
            )
                ensureSettingsPanel()
            if (welcomeReadinessDirty)
                queueWelcomeReadinessCheck()
            settingsPanelDirty = false
            welcomeReadinessDirty = false
        })
    }
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                const root =
                    node instanceof Element ? node : node.parentElement
                if (!root) continue
                pendingRoots.add(root)
                if (
                    root.id === 'a87-general-panel' ||
                    root.querySelector?.('#a87-general-panel')
                )
                    settingsPanelDirty = true
                if (
                    root.id === 'pica-disclaimer-gate' ||
                    root.querySelector?.('#pica-disclaimer-gate')
                )
                    welcomeReadinessDirty = true
            }
            for (const node of mutation.removedNodes) {
                if (
                    node instanceof Element &&
                    (node.id === 'pica-disclaimer-gate' ||
                        node.querySelector?.('#pica-disclaimer-gate'))
                )
                    welcomeReadinessDirty = true
            }
        }
        if (
            pendingRoots.size ||
            settingsPanelDirty ||
            welcomeReadinessDirty
        )
            schedule()
    })
    observer.observe(document.body, { childList: true, subtree: true })
}

function bootstrap() {
    markTourTargets()
    ensureSettingsPanel()
    installObserver()
    scheduleWelcome()
    document.addEventListener('pica-language-change', () => {
        if (document.querySelector('#pica-onboarding-welcome')?.open) ensureWelcomeDialog()
        renderSettingsPanel()
    })
    window.picaOnboarding = {
        version: TOUR_VERSION,
        start: () => startTour({ replay: true }),
        state: () => ({ ...readState() }),
        resetForTesting: () => {
            localStorage.removeItem(STATE_KEY)
            sessionStorage.removeItem(SESSION_DISMISSED_KEY)
        }
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap)
else bootstrap()
