import { copy as t, currentLanguage } from './locale-runtime.js'

const TOUR_VERSION = 1
const STATE_KEY = 'pica-onboarding-state-v1'
const SESSION_DISMISSED_KEY = 'pica-onboarding-session-dismissed-v1'
let activeDriver = null
let promptScheduled = false

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
function markTourTargets() {
    const targets = [
        ['nav [data-view="library"]','library-nav'],
        ['#filter-text','library-filter'],
        ['nav [data-view="discover"]','discover-nav'],
        ['#recommend-button','recommend-run'],
        ['nav [data-view="maintenance"]','settings-nav'],
        ['#a87-recommendations-tab','recommend-settings-tab'],
        ['#settings-recommendation-v5, #settings-recommendation-v4','recommend-settings'],
        ['#a87-connections-tab','connections-tab'],
        ['#settings-mobile-bridge','mobile-bridge'],
        ['#a87-general-tab','general-tab'],
        ['#a87-language-panel','language-panel'],
        ['#a87-software-tab','software-tab']
    ]
    for (const [selector,name] of targets)
        document.querySelector(selector)?.setAttribute('data-tour', name)
}

function welcomeCopy() {
    return {
        title: t('欢迎使用新版 Pica Library','Welcome to the new Pica Library','新しい Pica Library へようこそ'),
        body: t(
            '花一分钟了解书库、推荐、连接与设置。引导可以随时跳过；之后也可以在“设置 → 帮助与新手引导”重新查看。',
            'Take a minute to see the library, recommendations, connections and settings. You can skip the tour at any time and replay it later from Settings → Help & Onboarding.',
            'ライブラリ、おすすめ、接続、設定を短時間で確認できます。いつでもスキップでき、後から「設定 → ヘルプと初回ガイド」で再表示できます。'
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
function scheduleWelcome() {
    if (promptScheduled) return
    promptScheduled = true
    const tryPrompt = () => {
        if (promptWelcomeIfNeeded()) return
        if (!shouldPrompt()) return
        window.setTimeout(tryPrompt, 500)
    }
    window.setTimeout(tryPrompt, 650)
}

function stepText() {
    return {
        libraryTitle: t('统一书库','Unified library','統合ライブラリ'),
        libraryBody: t('Pica、E-H、本地下载和远程副本都在这里统一整理。点击“下一步”会真正打开书库。','Organize Pica, E-H, local downloads and remote copies in one library. Next opens the library itself.','Pica、E-H、ローカルダウンロード、リモートコピーを1つのライブラリで整理します。「次へ」で実際にライブラリを開きます。'),
        filterTitle: t('搜索与筛选','Search & filters','検索と絞り込み'),
        filterBody: t('可以按标题、作者、标签、来源、存储位置等缩小范围。','Narrow the library by title, author, tags, provider, storage location and more.','タイトル、作者、タグ、配信元、保存場所などで絞り込めます。'),
        discoverTitle: t('推荐与在线发现','Recommendations & discovery','おすすめとオンライン発見'),
        discoverBody: t('推荐与在线搜索共用同一套书库身份。下一步会打开推荐页。','Recommendations and online search share the same library identities. Next opens discovery.','おすすめとオンライン検索は同じライブラリIDを共有します。「次へ」で発見ページを開きます。'),
        recommendTitle: t('专属推荐','Personal recommendations','パーソナルおすすめ'),
        recommendBody: t('推荐结合长期收藏、最近行为、显式偏好和本次想看；批次可独立刷新。','Recommendations combine long-term favorites, recent behavior, explicit preferences and current-session intent.','長期のお気に入り、最近の行動、明示的な嗜好、今回見たいものを組み合わせておすすめします。'),
        settingsTitle: t('设置中心','Settings hub','設定センター'),
        settingsBody: t('语言、推荐、连接、外观、存储和更新都集中在这里。','Language, recommendations, connections, appearance, storage and updates live here.','言語、おすすめ、接続、外観、保存先、更新をここで管理します。'),
        recSettingsTitle: t('推荐与画风','Recommendations & visual style','おすすめと画風'),
        recSettingsBody: t('可以查看推荐画像、用 0–10 档纠正偏好，并独立开关画风推荐。','Inspect the recommendation profile, correct preferences on a 0–10 scale, and toggle visual-style recommendations independently.','おすすめプロフィールを確認し、0–10で嗜好を調整し、画風おすすめを独立して切り替えられます。'),
        connectionsTitle: t('连接与同步','Connections & sync','接続と同期'),
        connectionsBody: t('这里管理 Android 配对、跨端同步和 WebDAV。下一步会打开连接设置。','Manage Android pairing, cross-device sync and WebDAV here. Next opens connection settings.','Android ペアリング、端末間同期、WebDAV を管理します。「次へ」で接続設定を開きます。'),
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

function moveAfterClick(selector, opts) {
    return () => {
        document.querySelector(selector)?.click()
        window.setTimeout(() => opts.driver.moveNext(), 140)
    }
}

function makeSteps() {
    const copy = stepText()
    return [
        { element: '[data-tour="library-nav"]', advanceOnClick: true, waitForElement: 2500,
          popover: { title: copy.libraryTitle, description: copy.libraryBody,
            onNextClick: (_e,_s,opts) => moveAfterClick('[data-tour="library-nav"]',opts)() } },
        { element: '[data-tour="library-filter"]', waitForElement: 2500,
          popover: { title: copy.filterTitle, description: copy.filterBody } },
        { element: '[data-tour="discover-nav"]', advanceOnClick: true,
          popover: { title: copy.discoverTitle, description: copy.discoverBody,
            onNextClick: (_e,_s,opts) => moveAfterClick('[data-tour="discover-nav"]',opts)() } },
        { element: '[data-tour="recommend-run"]', waitForElement: 2500,
          popover: { title: copy.recommendTitle, description: copy.recommendBody } },
        { element: '[data-tour="settings-nav"]', advanceOnClick: true,
          popover: { title: copy.settingsTitle, description: copy.settingsBody,
            onNextClick: (_e,_s,opts) => moveAfterClick('[data-tour="settings-nav"]',opts)() } },
        { element: '[data-tour="recommend-settings-tab"]', waitForElement: 3500, advanceOnClick: true,
          popover: { title: copy.recSettingsTitle, description: copy.recSettingsBody,
            onNextClick: (_e,_s,opts) => moveAfterClick('[data-tour="recommend-settings-tab"]',opts)() } },
        { element: '[data-tour="connections-tab"]', waitForElement: 3500, advanceOnClick: true,
          popover: { title: copy.connectionsTitle, description: copy.connectionsBody,
            onNextClick: (_e,_s,opts) => moveAfterClick('[data-tour="connections-tab"]',opts)() } },
        { element: '[data-tour="mobile-bridge"]', waitForElement: 2500, skipMissingElement: true,
          popover: { title: copy.mobileTitle, description: copy.mobileBody,
            onNextClick: (_e,_s,opts) => {
                openSettingsPanel('general')
                window.setTimeout(() => opts.driver.moveNext(), 140)
            } } },
        { element: '[data-tour="language-panel"]', waitForElement: 2500,
          popover: { title: copy.languageTitle, description: copy.languageBody,
            onNextClick: (_e,_s,opts) => {
                document.querySelector('[data-tour="software-tab"]')?.click()
                window.setTimeout(() => opts.driver.moveNext(), 140)
            } } },
        { element: '[data-tour="software-tab"]', waitForElement: 2500,
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
        text: t('可以随时重新查看主要功能引导。关闭自动提示后，仍然可以手动启动。','Replay the main feature tour at any time. Turning off automatic prompts never disables manual replay.','主な機能ガイドはいつでも再表示できます。自動表示をオフにしても手動再生は利用できます。'),
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
    const observer = new MutationObserver(() => {
        if (queued) return
        queued = true
        requestAnimationFrame(() => {
            queued = false
            markTourTargets()
            if (!document.querySelector('#a89-onboarding-panel')) ensureSettingsPanel()
        })
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
