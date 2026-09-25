import { copy as t } from './locale-runtime.js'

const $$ = (selector) => [...document.querySelectorAll(selector)]
const $ = (selector) => document.querySelector(selector)

const CREATOR_MAX_FILES = 4
const CREATOR_MAX_FILE_BYTES = 4 * 1024 * 1024
const CREATOR_MAX_TOTAL_BYTES = 5 * 1024 * 1024
const THEME_MAX_BYTES = 24 * 1024 * 1024
const referenceFiles = []
const progressHeads = new WeakMap()
let desktopStatus = null
let activeDescriptor = null
let recommendationTimer = null
let recommendationCompletionTimer = null
let recommendationWatchBaselineCycleId = null
let recommendationWatchStartedAt = 0
let decorationQueued = false

function escapeHtml(value) {
    return String(value ?? '').replace(
        /[&<>"']/g,
        (character) =>
            ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[character]
    )
}

function bytes(value) {
    const number = Number(value || 0)
    if (number < 1024) return `${number} B`
    if (number < 1024 * 1024) return `${(number / 1024).toFixed(1)} KB`
    return `${(number / 1024 / 1024).toFixed(1)} MB`
}

async function api(path, options = {}) {
    const response = await fetch(path, { cache: 'no-store', ...options })
    const text = await response.text()
    let value = null
    try {
        value = text ? JSON.parse(text) : null
    } catch {
        value = { error: text }
    }
    if (!response.ok) throw new Error(value?.error || `HTTP ${response.status}`)
    return value
}

async function status(refresh = false) {
    if (!desktopStatus || refresh)
        desktopStatus = await api('/api/v1/desktop/status')
    return desktopStatus
}

async function action(personalizationAction, payload = {}) {
    const current = await status()
    return api('/api/v1/desktop/settings', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-pica-csrf': current.csrfToken || ''
        },
        body: JSON.stringify({ personalizationAction, ...payload })
    })
}

function fileBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(reader.error || new Error(t('无法读取图片','Could not read the image','画像を読み込めませんでした')))
        reader.onload = () =>
            resolve(String(reader.result || '').split(',', 2)[1] || '')
        reader.readAsDataURL(file)
    })
}

function downloadBase64(name, encoded, type = 'application/zip') {
    const binary = atob(encoded)
    const chunks = []
    for (let offset = 0; offset < binary.length; offset += 65536) {
        const end = Math.min(binary.length, offset + 65536)
        const array = new Uint8Array(end - offset)
        for (let index = offset; index < end; index += 1)
            array[index - offset] = binary.charCodeAt(index)
        chunks.push(array)
    }
    const href = URL.createObjectURL(new Blob(chunks, { type }))
    const link = document.createElement('a')
    link.href = href
    link.download = name
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(href), 2500)
}

function injectStyles() {
    if ($('#a85-theme-studio-style')) return
    const style = document.createElement('style')
    style.id = 'a85-theme-studio-style'
    style.textContent = `
#a83-personalization.a85-studio{overflow:hidden}
.a85-workflow{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin-top:14px}
.a85-box{border:1px solid var(--a83-line,#d8d2dc);border-radius:18px;padding:16px;background:color-mix(in srgb,var(--a83-surface,#fff) 96%,transparent)}
.a85-box h4{margin:0 0 6px}.a85-box p{margin:6px 0}.a85-steps{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.a85-step{padding:5px 10px;border-radius:999px;background:var(--a83-accent-soft,#eee);font-size:.84rem}
#a85-description{width:100%;min-height:112px;resize:vertical;box-sizing:border-box;margin-top:8px}
.a85-upload{display:block;margin-top:10px;border:1.5px dashed var(--a83-line,#bbb);border-radius:14px;padding:14px;cursor:pointer;text-align:center}.a85-upload.drag{border-color:var(--a83-accent,#7457b9);background:var(--a83-accent-soft,#eee)}
.a85-reference-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;margin-top:10px}.a85-reference{position:relative;border-radius:12px;overflow:hidden;background:var(--a83-accent-soft,#eee);aspect-ratio:1}.a85-reference img{width:100%;height:100%;object-fit:cover}.a85-reference button{position:absolute;right:4px;top:4px;min-width:28px!important;min-height:28px!important;padding:2px 7px!important;border-radius:999px!important}
.a85-theme-drop{display:block;border:2px dashed var(--a83-line,#bbb);border-radius:16px;padding:22px;text-align:center;cursor:pointer;margin:10px 0}.a85-theme-drop.drag{border-color:var(--a83-accent,#7457b9);background:var(--a83-accent-soft,#eee)}
.a85-pack{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--a83-line,#ddd)}.a85-pack:first-child{border-top:0}.a85-pack-main{min-width:0;flex:1}.a85-pack-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.a85-active{font-size:.78rem;padding:3px 8px;border-radius:999px;background:var(--a83-accent-soft,#eee);color:var(--a83-accent,#7457b9)}
.a85-mobile-note{margin-top:12px;padding:10px 12px;border-radius:12px;background:var(--a83-accent-soft,#eee)}
#a85-recommend-progress{display:none;grid-template-columns:minmax(150px,260px) 1fr;gap:16px;align-items:center;margin:10px 0 16px;padding:14px;border-radius:var(--a85-card-radius,18px);border:1px solid var(--a83-line,#ddd);background:var(--a83-surface,#fff)}
#a85-recommend-progress.active{display:grid}#a85-recommend-progress img#a85-recommend-art{display:none;width:100%;max-height:150px;object-fit:cover;border-radius:14px}#a85-recommend-progress.has-art img#a85-recommend-art{display:block}.a85-progress-copy strong{display:block;margin-bottom:5px}.a85-task-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.a85-task-actions button[hidden]{display:none!important}.a85-progress-line{height:9px;background:var(--a85-progress-track,var(--a83-accent-soft,#eee));border-radius:999px;position:relative;margin-top:10px;overflow:visible}.a85-progress-line>span{display:block;height:100%;width:0;border-radius:999px;background:var(--a85-progress-fill,var(--a83-accent,#7457b9));transition:width .28s ease}.a85-progress-line.indeterminate>span{width:38%;animation:a85-indeterminate 1.1s ease-in-out infinite}
.a85-progress-head{position:absolute;width:26px;height:26px;object-fit:contain;pointer-events:none;z-index:8;transform-origin:center;filter:drop-shadow(0 2px 4px rgb(0 0 0 / .16));transition:left .28s ease,top .28s ease}.a85-progress-head.bobble{animation:a85-bobble .65s ease-in-out infinite alternate}.a85-progress-head.hop{animation:a85-hop .7s ease-in-out infinite}.a85-progress-head.sparkle{filter:drop-shadow(0 0 5px var(--a83-accent,#7457b9)) drop-shadow(0 2px 4px rgb(0 0 0 / .16))}
.a85-theme-active{--a85-card-radius:20px;--a85-cover-radius:14px;background-color:var(--a83-bg)!important}.a85-pattern-layer{position:fixed;inset:0;pointer-events:none;z-index:0;background-repeat:repeat;background-position:center;background-size:320px}.a85-theme-active .app-header,.a85-theme-active .app-nav,.a85-theme-active main,.a85-theme-active .app-dialog{position:relative;z-index:1}
.a85-theme-active .app-header{position:relative;overflow:hidden}.a85-header-mascot{position:absolute;right:20px;bottom:-35px;width:128px;height:128px;object-fit:contain;pointer-events:none;opacity:.88}.a85-theme-active .app-header>.app-brand,.a85-theme-active .app-header>.header-controls{position:relative;z-index:2}
.a85-theme-active .app-nav button[data-view]{display:inline-flex;align-items:center;justify-content:center;gap:6px}.a85-theme-active .app-nav button[data-view]::before{content:'';display:inline-block;width:var(--a85-nav-icon-size,20px);height:var(--a85-nav-icon-size,20px);background-image:var(--a85-nav-icon);background-size:contain;background-position:center;background-repeat:no-repeat;flex:0 0 auto}.a85-theme-active .app-nav button[data-view].active.a85-glow{box-shadow:0 0 0 1px var(--a83-accent),0 0 15px color-mix(in srgb,var(--a83-accent) 34%,transparent)}
.a85-theme-active .panel,.a85-theme-active .comic-card,.a85-theme-active .result,.a85-theme-active .list-item,.a85-theme-active .metric,.a85-theme-active .notice,.a85-theme-active dialog,.a85-theme-active .onboarding-card,.a85-theme-active .shelf-card{border-radius:var(--a85-card-radius)!important}.a85-theme-active .cover-shell,.a85-theme-active .cover-shell img{border-radius:var(--a85-cover-radius)!important}.a85-theme-active button,.a85-theme-active .button-link,.a85-theme-active input,.a85-theme-active select,.a85-theme-active textarea{border-radius:min(14px,var(--a85-card-radius))!important}.a85-theme-active .tag,.a85-theme-active .filter-chip{border-color:var(--a83-line)!important}
.a85-title-rounded .page-heading h2,.a85-title-rounded h1{font-family:ui-rounded,'Arial Rounded MT Bold','Microsoft YaHei UI',sans-serif}.a85-title-comic .page-heading h2,.a85-title-comic h1{font-family:'Segoe Print','Comic Sans MS','Microsoft YaHei UI',sans-serif;letter-spacing:.02em}.a85-title-cute .page-heading h2,.a85-title-cute h1{font-family:'Microsoft YaHei UI',ui-rounded,sans-serif;font-weight:700;letter-spacing:.04em}
.a85-nav-rounded .app-nav{font-family:ui-rounded,'Microsoft YaHei UI',sans-serif}.a85-nav-comic .app-nav{font-family:'Segoe Print','Comic Sans MS','Microsoft YaHei UI',sans-serif}.a85-nav-cute .app-nav{font-family:'Microsoft YaHei UI',ui-rounded,sans-serif;font-weight:700;letter-spacing:.02em}
.a85-theme-active progress{accent-color:var(--a85-progress-fill,var(--a83-accent))}.a85-theme-active progress::-webkit-progress-bar{background:var(--a85-progress-track,var(--a83-accent-soft));border-radius:999px}.a85-theme-active progress::-webkit-progress-value{background:var(--a85-progress-fill,var(--a83-accent));border-radius:999px}.a85-theme-active .progress{background:var(--a85-progress-track,var(--a83-accent-soft))!important;position:relative;overflow:visible!important}.a85-theme-active .progress>span{background:var(--a85-progress-fill,var(--a83-accent))!important}
.a85-theme-active .chronicle-metric,.a85-theme-active .chronicle-tag,.a85-theme-active .universe-node{border-color:var(--a83-accent)!important}.a85-theme-active .reader-header,.a85-theme-active .reader-chapters{background:var(--a83-surface)!important;border-color:var(--a83-line)!important}
.a85-empty-art{display:block;max-width:280px;width:min(48vw,280px);margin:18px auto;opacity:.9;border-radius:var(--a85-card-radius)}
@keyframes a85-bobble{from{transform:translateY(-1px) rotate(-5deg)}to{transform:translateY(2px) rotate(5deg)}}@keyframes a85-hop{0%,100%{transform:translateY(1px)}50%{transform:translateY(-5px)}}@keyframes a85-indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(265%)}}
@media(max-width:850px){.a85-workflow{grid-template-columns:1fr}.a85-header-mascot{display:none}#a85-recommend-progress{grid-template-columns:1fr}#a85-recommend-progress img#a85-recommend-art{max-height:120px}}
@media(prefers-reduced-motion:reduce){.a85-progress-head,.a85-progress-line.indeterminate>span{animation:none!important;transition:none!important}}
`
    document.head.appendChild(style)
}

function hasThemeAccess(current) {
    const p = current?.personalization || {}
    return Boolean(
        p.supporter &&
            Array.isArray(p.features) &&
            p.features.includes('theme-packs')
    )
}

function renderReferences() {
    const target = $('#a85-reference-grid')
    if (!target) return
    target.innerHTML = ''
    referenceFiles.forEach((file, index) => {
        const card = document.createElement('div')
        card.className = 'a85-reference'
        const image = document.createElement('img')
        image.src = URL.createObjectURL(file)
        image.alt = ''
        image.onload = () => URL.revokeObjectURL(image.src)
        const remove = document.createElement('button')
        remove.type = 'button'
        remove.textContent = '×'
        remove.title = t('移除图片','Remove image','画像を削除')
        remove.onclick = () => {
            referenceFiles.splice(index, 1)
            renderReferences()
            updateReferenceHint()
        }
        card.append(image, remove)
        target.appendChild(card)
    })
}

function updateReferenceHint(message = '') {
    const node = $('#a85-reference-message')
    if (!node) return
    const total = referenceFiles.reduce((sum, file) => sum + file.size, 0)
    node.textContent =
        message ||
        `${referenceFiles.length} / ${CREATOR_MAX_FILES} ${t('张','images','枚')} · ${bytes(total)} / ${bytes(CREATOR_MAX_TOTAL_BYTES)}`
}

function acceptReferences(files) {
    for (const file of [...(files || [])]) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            updateReferenceHint(t('仅支持 PNG / JPEG / WebP 参考图。','Only PNG / JPEG / WebP reference images are supported.','参照画像は PNG / JPEG / WebP のみに対応しています。'))
            continue
        }
        if (file.size > CREATOR_MAX_FILE_BYTES) {
            updateReferenceHint(
                t(`${file.name} 超过单张 ${bytes(CREATOR_MAX_FILE_BYTES)} 限制。`,`${file.name} exceeds the ${bytes(CREATOR_MAX_FILE_BYTES)} per-image limit.`,`${file.name} は1枚あたり ${bytes(CREATOR_MAX_FILE_BYTES)} の上限を超えています。`)
            )
            continue
        }
        if (referenceFiles.length >= CREATOR_MAX_FILES) {
            updateReferenceHint(t(`最多上传 ${CREATOR_MAX_FILES} 张参考图。`,`You can upload up to ${CREATOR_MAX_FILES} reference images.`,`参照画像は最大 ${CREATOR_MAX_FILES} 枚までアップロードできます。`))
            break
        }
        const total = referenceFiles.reduce((sum, item) => sum + item.size, 0)
        if (total + file.size > CREATOR_MAX_TOTAL_BYTES) {
            updateReferenceHint(
                t(`参考图总大小请控制在 ${bytes(CREATOR_MAX_TOTAL_BYTES)} 内。`,`Keep the total reference-image size under ${bytes(CREATOR_MAX_TOTAL_BYTES)}.`,`参照画像の合計サイズは ${bytes(CREATOR_MAX_TOTAL_BYTES)} 未満にしてください。`)
            )
            break
        }
        referenceFiles.push(file)
    }
    renderReferences()
    updateReferenceHint()
}

function studioMarkup() {
    return `<div class="section-heading"><div><p class="eyebrow">Theme Studio</p><div class="help-heading"><h3>${t('个性化装扮','Personalization','カスタマイズ')}</h3><button type="button" class="info-tip" aria-label="${t('查看个性化装扮说明','View personalization help','カスタマイズの説明を見る')}" data-info-tip="${t('只需要写一句你想要的风格并上传角色参考图。网页会把固定提示词、规范、模板和参考图一起打包给 AI；AI 返回装扮包后，拖回来即可应用。','Describe the style you want and upload character references. Pica Library packages the fixed prompt, specification, template and references for the AI; drop the returned theme pack here to apply it.','希望するスタイルを一文で説明し、キャラクター参照画像をアップロードします。固定プロンプト・仕様・テンプレート・参照画像をAI向けにまとめ、AIが返したテーマパックをここへドロップすると適用できます。')}">!</button></div></div><span class="a83-state a83-good">${t('已解锁','Unlocked','利用可能')}</span></div>
<div class="a85-steps"><span class="a85-step">1 · ${t('描述与参考图','Description & references','説明と参照画像')}</span><span class="a85-step">2 · ${t('导出 ZIP 给 AI','Export ZIP for AI','AI用ZIPを書き出す')}</span><span class="a85-step">3 · ${t('导入 AI 返回包','Import AI result','AIの返却パックを読み込む')}</span><span class="a85-step">4 · ${t('自动同步手机','Sync to phone','スマートフォンへ同期')}</span></div>
<div class="a85-workflow">
<section class="a85-box"><div class="help-heading"><h4>${t('制作装扮 · Theme Creator Kit','Create a theme · Theme Creator Kit','テーマ作成 · Theme Creator Kit')}</h4><button type="button" class="info-tip" aria-label="${t('查看 Theme Creator Kit 说明','View Theme Creator Kit help','Theme Creator Kit の説明を見る')}" data-info-tip="${t('主题描述是唯一必填项；角色图建议 1 张，额外风格图可选。','The theme description is the only required field. One character reference is recommended; extra style references are optional.','テーマ説明だけが必須です。キャラクター画像は1枚推奨、追加のスタイル参照画像は任意です。')}">!</button></div>
<textarea id="a85-description" maxlength="4000" placeholder="${t('例如：紫发二次元漫画向导，星空与白猫，薰衣草紫为主色，整体轻盈、可爱，但不要遮抢漫画封面。','Example: a purple-haired manga guide with stars and a white cat, lavender as the main color, light and cute without covering comic covers.','例：紫髪の漫画ガイド、星空と白猫、ラベンダーを基調に軽く可愛らしく、表紙を邪魔しないデザイン。')}"></textarea>
<label class="a85-upload" id="a85-reference-drop"><strong>${t('上传角色 / 风格参考图','Upload character / style references','キャラクター / スタイル参照画像をアップロード')}</strong><br><span>PNG / JPEG / WebP · ${t('最多 4 张','up to 4 images','最大4枚')}</span><input id="a85-reference-input" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden></label>
<div id="a85-reference-grid" class="a85-reference-grid"></div><p id="a85-reference-message" class="status"></p>
<div class="a83-row"><button id="a85-export" type="button" class="primary">${t('导出给 AI','Export for AI','AI向けに書き出す')}</button><a class="button-link" href="./theme-pack-creator-prompt.txt" download>${t('查看固定提示词','View fixed prompt','固定プロンプトを見る')}</a><a class="button-link" href="./theme-pack-spec-v1.txt" download>${t('查看装扮规范','View theme specification','テーマ仕様を見る')}</a></div><p id="a85-export-message" class="status"></p></section>
<section class="a85-box"><div class="help-heading"><h4>${t('导入并应用','Import and apply','読み込んで適用')}</h4><button type="button" class="info-tip" aria-label="${t('查看装扮导入说明','View theme import help','テーマ読み込みの説明を見る')}" data-info-tip="${t('把 AI 返回的 .pica-theme 或 ZIP 直接拖入。Desktop 会独立安全校验，校验通过后立即应用到当前网页。','Drop the .pica-theme or ZIP returned by the AI here. Desktop validates it independently and applies it after the safety checks pass.','AIが返した .pica-theme または ZIP をここへドロップします。Desktop が独立して安全性を検証し、通過後すぐに現在の画面へ適用します。')}">!</button></div>
<label class="a85-theme-drop" id="a85-theme-drop"><strong>${t('拖入 AI 返回的装扮包','Drop the AI-returned theme pack','AIが返したテーマパックをドロップ')}</strong><br><span>${t('或点击选择文件 · 上限 24 MiB','or click to choose a file · 24 MiB max','またはクリックしてファイルを選択 · 上限24 MiB')}</span><input id="a85-theme-input" type="file" accept=".pica-theme,.zip,application/zip" hidden></label>
<p id="a85-import-message" class="status"></p><div id="a85-theme-list"></div><div class="a85-mobile-note" id="a85-mobile-note">${t('手机与电脑在同一局域网重新配对/同步一次后，会自动取得 Desktop 的已安装装扮，并跟随当前启用的装扮。','After the phone reconnects or syncs on the same LAN, it automatically receives Desktop theme packs and follows the active theme.','同じLANでスマートフォンを再接続または同期すると、Desktopのテーマパックを自動取得し、現在の有効テーマに追従します。')}</div></section>
</div>`
}
async function exportCreatorKit() {
    const message = $('#a85-export-message')
    const button = $('#a85-export')
    const description = $('#a85-description')?.value?.trim() || ''
    if (description.length < 3) {
        message.textContent = t('先写一句主题描述。','Write a short theme description first.','まずテーマの説明を入力してください。')
        return
    }
    button.disabled = true
    message.textContent = t('正在整理固定提示词、规范、模板和参考图…','Packaging the fixed prompt, specification, template and references…','固定プロンプト・仕様・テンプレート・参照画像をまとめています…')
    try {
        const references = []
        for (const file of referenceFiles)
            references.push({
                name: file.name,
                mimeType: file.type,
                dataBase64: await fileBase64(file)
            })
        const result = await action('export-theme-creator-kit', {
            description,
            references
        })
        downloadBase64(
            result.fileName || 'Pica-Library-Theme-Creator-Kit.zip',
            result.dataBase64
        )
        message.textContent = t(`已导出 ${result.fileName} · ${bytes(result.size)}。直接把这个 ZIP 交给 AI，并让它按包内说明返回完成的装扮包。`,`Exported ${result.fileName} · ${bytes(result.size)}. Give this ZIP to the AI and ask it to return a completed theme pack following the package instructions.`,`${result.fileName} · ${bytes(result.size)} を書き出しました。このZIPをAIに渡し、同梱の説明に従って完成したテーマパックを返すよう依頼してください。`)
    } catch (error) {
        message.textContent = t(`导出失败：${error.message}`,`Export failed: ${error.message}`,`書き出しに失敗しました：${error.message}`)
    } finally {
        button.disabled = false
    }
}

async function importTheme(file) {
    const message = $('#a85-import-message')
    if (!file) return
    if (!/\.(pica-theme|zip)$/i.test(file.name)) {
        message.textContent = t('请选择 .pica-theme 或 .zip。','Choose a .pica-theme or .zip file.','.pica-theme または .zip を選択してください。')
        return
    }
    if (!file.size || file.size > THEME_MAX_BYTES) {
        message.textContent = t(`装扮包必须小于 ${bytes(THEME_MAX_BYTES)}。`,`Theme pack must be smaller than ${bytes(THEME_MAX_BYTES)}.`,`テーマパックは ${bytes(THEME_MAX_BYTES)} 未満にしてください。`)
        return
    }
    message.textContent = t('正在校验、安装并应用装扮…','Validating, installing and applying the theme…','テーマを検証・インストール・適用中…')
    try {
        const current = await status()
        const response = await fetch('/api/v1/desktop/theme-import', {
            method: 'POST',
            headers: {
                'content-type': 'application/zip',
                'x-pica-csrf': current.csrfToken || '',
                'x-theme-filename': encodeURIComponent(file.name)
            },
            body: file
        })
        const result = await response.json()
        if (!response.ok)
            throw new Error(result.error || `HTTP ${response.status}`)
        desktopStatus = null
        message.textContent = t(`已安装并启用：${result.themePack?.name || file.name}。`,`Installed and enabled: ${result.themePack?.name || file.name}.`,`インストールして有効化しました：${result.themePack?.name || file.name}。`)
        await refreshStudio(true)
    } catch (error) {
        message.textContent = t(`安装失败：${error.message}`,`Installation failed: ${error.message}`,`インストールに失敗しました：${error.message}`)
    } finally {
        const input = $('#a85-theme-input')
        if (input) input.value = ''
    }
}

async function renderInstalled(current) {
    const target = $('#a85-theme-list')
    if (!target) return
    const p = current.personalization || {}
    const packs = Array.isArray(p.themePacks) ? p.themePacks : []
    target.innerHTML = `<h4>${t('已安装装扮','Installed themes','インストール済みテーマ')}</h4>${packs.length ? '' : `<p class="status">${t('暂时没有装扮包。','No theme packs installed yet.','テーマパックはまだありません。')}</p>`}`
    packs.forEach((pack) => {
        const row = document.createElement('div')
        row.className = 'a85-pack'
        const active = pack.id === p.activeThemeId
        row.innerHTML = `<div class="a85-pack-main"><strong>${escapeHtml(pack.name || pack.id)}</strong><div class="status">${escapeHtml(pack.author || '')} · ${escapeHtml(pack.version || '')} · ${bytes(pack.size)}</div>${pack.description ? `<div class="status">${escapeHtml(pack.description)}</div>` : ''}</div><div class="a85-pack-actions">${active ? `<span class="a85-active">${t('使用中','Active','使用中')}</span>` : `<button type="button" data-a85-use="${escapeHtml(pack.id)}">${t('应用','Apply','適用')}</button>`}</div>`
        target.appendChild(row)
    })
    const reset = document.createElement('div')
    reset.className = 'a83-row'
    reset.innerHTML = `<button type="button" id="a85-reset" ${p.activeThemeId ? '' : 'disabled'}>${t('恢复默认外观','Restore default appearance','既定の外観に戻す')}</button>`
    target.appendChild(reset)
    target.querySelectorAll('[data-a85-use]').forEach((button) => {
        button.onclick = async () => {
            button.disabled = true
            try {
                await action('activate-theme', {
                    themeId: button.dataset.a85Use
                })
                desktopStatus = null
                await refreshStudio(true)
            } catch (error) {
                $('#a85-import-message').textContent =
                    t(`应用失败：${error.message}`,`Apply failed: ${error.message}`,`適用に失敗しました：${error.message}`)
                button.disabled = false
            }
        }
    })
    const resetButton = $('#a85-reset')
    if (resetButton)
        resetButton.onclick = async () => {
            try {
                await action('deactivate-theme')
                desktopStatus = null
                await refreshStudio(true)
            } catch (error) {
                $('#a85-import-message').textContent =
                    t(`恢复失败：${error.message}`,`Restore failed: ${error.message}`,`復元に失敗しました：${error.message}`)
            }
        }
}

const THEME_VARIABLES = [
    '--a83-bg',
    '--a83-surface',
    '--a83-nav',
    '--a83-text',
    '--a83-muted',
    '--a83-line',
    '--a83-accent',
    '--a83-accent-soft',
    '--a83-action',
    '--a85-secondary',
    '--a85-highlight',
    '--a85-card-radius',
    '--a85-cover-radius',
    '--a85-progress-track',
    '--a85-progress-fill',
    '--a85-nav-icon-size'
]

function clearTheme() {
    activeDescriptor = null
    const root = document.documentElement
    document.body.classList.remove('a85-theme-active')
    root.classList.remove(
        'a85-title-rounded',
        'a85-title-comic',
        'a85-title-cute',
        'a85-nav-rounded',
        'a85-nav-comic',
        'a85-nav-cute'
    )
    THEME_VARIABLES.forEach((key) => root.style.removeProperty(key))
    $$('.app-nav button[data-view]').forEach((button) => {
        button.style.removeProperty('--a85-nav-icon')
        button.classList.remove('a85-glow')
    })
    $('#a85-header-mascot')?.remove()
    $('#a85-pattern-layer')?.remove()
    $$('.a85-progress-head').forEach((node) => node.remove())
}

function themeMode() {
    return document.documentElement.dataset.picaTheme === 'dark'
        ? 'dark'
        : 'light'
}

function navAssetFamily(view) {
    if (['home', 'library', 'shelves', 'downloaded'].includes(view))
        return 'nav-library.webp'
    if (['discover', 'chronicle'].includes(view)) return 'nav-recommend.webp'
    if (view === 'downloads') return 'nav-online.webp'
    return 'nav-connect.webp'
}

function setColorVariable(root, key, value) {
    if (/^#[0-9a-f]{6}$/i.test(String(value || '')))
        root.style.setProperty(key, value)
}

function applyDescriptor(descriptor) {
    const retained = descriptor
    clearTheme()
    if (!retained) return
    activeDescriptor = retained
    const mode = themeMode()
    const palette = retained.palette?.[mode] || {}
    const root = document.documentElement
    setColorVariable(root, '--a83-accent', palette.primary)
    setColorVariable(root, '--a83-accent-soft', palette.primarySoft)
    setColorVariable(root, '--a85-secondary', palette.secondary)
    setColorVariable(root, '--a85-highlight', palette.accent)
    setColorVariable(root, '--a83-bg', palette.background)
    setColorVariable(root, '--a83-surface', palette.surface)
    setColorVariable(root, '--a83-nav', palette.nav)
    setColorVariable(root, '--a83-text', palette.text)
    setColorVariable(root, '--a83-muted', palette.muted)
    setColorVariable(root, '--a83-line', palette.outline)
    setColorVariable(root, '--a83-action', palette.action)
    setColorVariable(root, '--a85-progress-track', palette.progressTrack)
    setColorVariable(root, '--a85-progress-fill', palette.progressFill)
    const cardRadius = Math.max(
        8,
        Math.min(28, Number(retained.layout?.cardRadiusDp || 20))
    )
    const coverRadius = Math.max(
        4,
        Math.min(24, Number(retained.layout?.coverRadiusDp || 14))
    )
    root.style.setProperty('--a85-card-radius', `${cardRadius}px`)
    root.style.setProperty('--a85-cover-radius', `${coverRadius}px`)
    document.body.classList.add('a85-theme-active')

    const pattern = retained.assets?.['pattern.webp']
    const opacityKey =
        mode === 'dark' ? 'patternOpacityDark' : 'patternOpacityLight'
    const opacity = Math.max(
        0,
        Math.min(
            0.18,
            Number(retained.components?.background?.[opacityKey] ?? 0.08)
        )
    )
    if (pattern && opacity > 0) {
        const layer = document.createElement('div')
        layer.id = 'a85-pattern-layer'
        layer.className = 'a85-pattern-layer'
        layer.style.backgroundImage = `url("${pattern}")`
        layer.style.opacity = String(opacity)
        document.body.prepend(layer)
    }

    const title = String(retained.components?.typography?.title || 'default')
    const nav = String(retained.components?.typography?.navigation || 'default')
    if (['rounded', 'comic', 'cute'].includes(title))
        root.classList.add(`a85-title-${title}`)
    if (['rounded', 'comic', 'cute'].includes(nav))
        root.classList.add(`a85-nav-${nav}`)
    const scale =
        { small: 17, standard: 20, large: 23 }[
            retained.components?.navigation?.iconScale
        ] || 20
    root.style.setProperty('--a85-nav-icon-size', `${scale}px`)
    const effect = retained.components?.navigation?.selectedEffect
    $$('.app-nav button[data-view]').forEach((button) => {
        const asset = retained.assets?.[navAssetFamily(button.dataset.view)]
        if (asset) button.style.setProperty('--a85-nav-icon', `url("${asset}")`)
        button.classList.toggle('a85-glow', effect === 'glow')
    })

    updateRecommendationArtwork()
    decorateProgress()
    renderEmptyArt()
}

async function loadActiveTheme(current = null) {
    const value = current || (await status())
    const id = value.personalization?.activeThemeId
    if (!id) {
        clearTheme()
        return
    }
    try {
        const result = await action('theme-descriptor', { themeId: id })
        applyDescriptor(result.theme || null)
    } catch {
        clearTheme()
    }
}

function setupStudioEvents() {
    const refDrop = $('#a85-reference-drop')
    const refInput = $('#a85-reference-input')
    refInput.onchange = () => {
        acceptReferences(refInput.files)
        refInput.value = ''
    }
    ;['dragenter', 'dragover'].forEach((name) =>
        refDrop.addEventListener(name, (event) => {
            event.preventDefault()
            refDrop.classList.add('drag')
        })
    )
    ;['dragleave', 'drop'].forEach((name) =>
        refDrop.addEventListener(name, (event) => {
            event.preventDefault()
            refDrop.classList.remove('drag')
        })
    )
    refDrop.addEventListener('drop', (event) =>
        acceptReferences(event.dataTransfer?.files)
    )
    $('#a85-export').onclick = exportCreatorKit

    const themeDrop = $('#a85-theme-drop')
    const themeInput = $('#a85-theme-input')
    themeInput.onchange = () => importTheme(themeInput.files?.[0])
    ;['dragenter', 'dragover'].forEach((name) =>
        themeDrop.addEventListener(name, (event) => {
            event.preventDefault()
            themeDrop.classList.add('drag')
        })
    )
    ;['dragleave', 'drop'].forEach((name) =>
        themeDrop.addEventListener(name, (event) => {
            event.preventDefault()
            themeDrop.classList.remove('drag')
        })
    )
    themeDrop.addEventListener('drop', (event) =>
        importTheme(event.dataTransfer?.files?.[0])
    )
    updateReferenceHint()
}

async function waitForStudioPanel() {
    for (let attempt = 0; attempt < 24; attempt += 1) {
        const panel = $('#a83-personalization')
        if (panel) return panel
        await new Promise((resolve) => setTimeout(resolve, 200))
    }
    return null
}

async function refreshStudio(force = false) {
    let current
    try {
        current = await status(force)
    } catch {
        return
    }
    if (!hasThemeAccess(current)) return
    const panel = $('#a83-personalization') || (await waitForStudioPanel())
    if (!panel) return
    if (!panel.classList.contains('a85-studio')) {
        panel.classList.add('a85-studio')
        panel.innerHTML = studioMarkup()
        setupStudioEvents()
    }
    await renderInstalled(current)
    await loadActiveTheme(current)
    const mobile = current.mobileBridge
    if ($('#a85-mobile-note') && mobile?.enabled)
        $('#a85-mobile-note').textContent = mobile.pairedDevices?.length
            ? t(`已配对 ${mobile.pairedDevices.length} 台设备。手机下次启动或重新配对/同步时会自动取得装扮包并跟随当前启用装扮。`,`Paired with ${mobile.pairedDevices.length} device(s). On next start or reconnect/sync, the phone will receive theme packs and follow the active theme.`,`${mobile.pairedDevices.length} 台とペアリング済みです。次回起動または再接続/同期時にテーマパックを取得し、有効なテーマに追従します。`)
            : t('尚未配对手机。完成一次局域网配对后，手机会自动取得 Desktop 的装扮包并跟随当前启用装扮。','No phone is paired yet. Pair once on the LAN and the phone will receive Desktop theme packs and follow the active theme.','スマートフォンはまだペアリングされていません。LANで一度ペアリングすると、Desktopのテーマパックを取得して有効テーマに追従します。')
}

function ensureRecommendationProgress() {
    const host = $('#recommend .page-heading')
    if (!host || $('#a85-recommend-progress')) return
    const card = document.createElement('div')
    card.id = 'a85-recommend-progress'
    card.innerHTML = `<img id="a85-recommend-art" alt=""><div class="a85-progress-copy"><strong id="a85-recommend-phase">${t('正在准备推荐…','Preparing recommendations…','おすすめを準備中…')}</strong><span id="a85-recommend-detail" class="status">${t('正在读取推荐状态。','Reading recommendation status.','おすすめ状態を読み込み中。')}</span><div class="a85-progress-line indeterminate" id="a85-recommend-line"><span></span></div><div class="a85-task-actions"><button id="a85-recommend-pause" type="button">${t('暂停','Pause','一時停止')}</button><button id="a85-recommend-resume" type="button" hidden>${t('继续','Resume','再開')}</button><button id="a85-recommend-cancel" type="button">${t('取消本轮','Cancel run','この処理を中止')}</button></div></div>`
    host.insertAdjacentElement('afterend', card)
    $('#a85-recommend-pause').onclick = () => void controlRecommendationBuild('pause_build')
    $('#a85-recommend-resume').onclick = () => void controlRecommendationBuild('resume_build')
    $('#a85-recommend-cancel').onclick = () => void controlRecommendationBuild('cancel_build')
}

async function controlRecommendationBuild(actionName) {
    const buttons = [
        $('#a85-recommend-pause'),
        $('#a85-recommend-resume'),
        $('#a85-recommend-cancel')
    ].filter(Boolean)
    buttons.forEach((button) => (button.disabled = true))
    try {
        await api('/api/v1/recommendation-sessions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ engine: 'v3', action: actionName })
        })
        await pollRecommendationProgress()
    } catch (error) {
        const detail = $('#a85-recommend-detail')
        if (detail)
            detail.textContent =
                t('任务控制失败：','Task control failed: ','タスク操作に失敗：') +
                String(error?.message || error)
    } finally {
        buttons.forEach((button) => (button.disabled = false))
    }
}

function updateRecommendationTaskControls(progress = {}) {
    const pause = $('#a85-recommend-pause')
    const resume = $('#a85-recommend-resume')
    const cancel = $('#a85-recommend-cancel')
    if (!pause || !resume || !cancel) return
    pause.hidden = !progress.canPause
    resume.hidden = !progress.canResume
    cancel.hidden = !progress.canCancel
}

function updateRecommendationArtwork() {
    ensureRecommendationProgress()
    const card = $('#a85-recommend-progress')
    const image = $('#a85-recommend-art')
    if (!card || !image) return
    const art = activeDescriptor?.assets?.['recommendation-loading.webp']
    if (art) {
        image.src = art
        card.classList.add('has-art')
    } else {
        image.removeAttribute('src')
        card.classList.remove('has-art')
    }
}

function buildPhaseLabel(phase) {
    return ({
        recovered:t('恢复上次中断状态','Recovering an interrupted run','中断された処理を復旧'),
        profile:t('分析收藏与兴趣画像','Analyzing collection and preference profile','コレクションと嗜好プロフィールを解析'),
        intents:t('规划推荐方向','Planning recommendation intent','おすすめ方向を計画'),
        routes:t('准备多路召回','Preparing retrieval routes','複数の検索ルートを準備'),
        providers:t('检查 Pica / E-H / ExH 可用性','Checking Pica / E-H / ExH availability','Pica / E-H / ExH の利用可否を確認'),
        retrieve:t('跨来源召回候选漫画','Retrieving candidates across providers','複数配信元から候補を取得'),
        rank:t('排序、去重与偏好调节','Ranking, deduplicating and applying preferences','順位付け・重複排除・嗜好調整'),
        visual:t('应用画风信号与最终重排','Applying visual-style signals and final reranking','画風シグナルを適用して最終再順位付け'),
        complete:t('正在保存推荐结果','Saving recommendation results','おすすめ結果を保存中')
    })[phase] || ''
}

function publishRecommendationStatus(status) {
    document.dispatchEvent(
        new CustomEvent('pica-recommendation-status', {
            detail: { status, observedAt: Date.now() }
        })
    )
}

function startRecommendationWatch() {
    ensureRecommendationProgress()
    updateRecommendationArtwork()
    const card = $('#a85-recommend-progress')
    if (!card) return
    if (recommendationCompletionTimer) {
        clearTimeout(recommendationCompletionTimer)
        recommendationCompletionTimer = null
    }
    recommendationWatchBaselineCycleId = null
    recommendationWatchStartedAt = Date.now()
    card.classList.add('active')
    $('#a85-recommend-phase').textContent = t('正在启动推荐生成…','Starting recommendation generation…','おすすめ生成を開始中…')
    $('#a85-recommend-detail').textContent =
        t('下方暂时保留上一轮推荐；新一轮完成后会自动切换。','The previous recommendations stay visible until the new round finishes, then they switch automatically.','新しいラウンドが完了するまで前回のおすすめを表示し、完了後に自動で切り替えます。')
    $('#a85-recommend-line').classList.add('indeterminate')
    $('#a85-recommend-line').querySelector('span').style.width = ''
    if (recommendationTimer) clearInterval(recommendationTimer)
    recommendationTimer = setInterval(pollRecommendationProgress, 500)
    void pollRecommendationProgress()
}

async function pollRecommendationProgress() {
    const card = $('#a85-recommend-progress')
    if (!card) return false
    try {
        const current = await api(
            '/api/v1/recommendation-sessions/status?mode=final'
        )
        publishRecommendationStatus(current)
        const progress = current.buildProgress || {}
        updateRecommendationTaskControls(progress)
        if (
            recommendationWatchBaselineCycleId === null &&
            current.activeCycleId
        )
            recommendationWatchBaselineCycleId = current.activeCycleId
        if (current.buildingCycleId) {
            card.classList.add('active')
            const phaseLabel =
                buildPhaseLabel(progress.phase) ||
                t('正在生成推荐…','Generating recommendations…','おすすめを生成中…')
            $('#a85-recommend-phase').textContent =
                progress.state === 'paused'
                    ? t('已暂停 · ','Paused · ','一時停止 · ') + phaseLabel
                    : progress.state === 'pausing'
                      ? t('正在暂停 · ','Pausing · ','一時停止中 · ') + phaseLabel
                      : progress.state === 'cancelling'
                        ? t('正在取消 · ','Cancelling · ','キャンセル中 · ') + phaseLabel
                        : phaseLabel
            const done = Number(progress.done || 0)
            const total = Number(progress.total || 0)
            const elapsed = recommendationWatchStartedAt
                ? Math.max(
                      0,
                      Math.round(
                          (Date.now() - recommendationWatchStartedAt) / 1000
                      )
                  )
                : 0
            if (total > 0) {
                const percent = Math.max(
                    0,
                    Math.min(100, Math.round((done * 100) / total))
                )
                $('#a85-recommend-detail').textContent =
                    t('下方仍显示上一轮结果，完成后自动切换','Previous results stay visible and switch automatically when complete','前回の結果を表示中。完了後に自動で切り替え') + ' · ' +
                    done +
                    ' / ' +
                    total +
                    ' · ' +
                    percent +
                    '% · ' + t('已用时','Elapsed','経過') + ' ' +
                    elapsed +
                    's'
                $('#a85-recommend-line').classList.remove('indeterminate')
                $('#a85-recommend-line').querySelector('span').style.width =
                    percent + '%'
            } else {
                $('#a85-recommend-detail').textContent =
                    t('后台仍在处理；下方不是新结果','Processing continues in the background; the results below are not new yet','バックグラウンドで処理中。下の結果はまだ新しいものではありません') + ' · ' + t('已用时','Elapsed','経過') + ' ' +
                    elapsed +
                    's'
                $('#a85-recommend-line').classList.add('indeterminate')
            }
            decorateProgress()
            return true
        }

        const watched =
            Boolean(recommendationTimer) || recommendationWatchStartedAt > 0
        if (recommendationTimer) clearInterval(recommendationTimer)
        recommendationTimer = null
        if (!watched) {
            card.classList.remove('active')
            return false
        }
        const elapsedMs = recommendationWatchStartedAt
            ? Date.now() - recommendationWatchStartedAt
            : 0
        const changed = Boolean(
            current.activeCycleId &&
                (!recommendationWatchBaselineCycleId ||
                    current.activeCycleId !==
                        recommendationWatchBaselineCycleId)
        )
        if (!changed && elapsedMs < 1200) {
            card.classList.remove('active')
            recommendationWatchStartedAt = 0
            return false
        }
        card.classList.add('active')
        $('#a85-recommend-line').classList.remove('indeterminate')
        $('#a85-recommend-line').querySelector('span').style.width = '100%'
        updateRecommendationTaskControls({})
        if (progress.state === 'cancelled') {
            $('#a85-recommend-phase').textContent =
                t('本轮推荐已取消','Recommendation run cancelled','おすすめ生成をキャンセルしました')
            $('#a85-recommend-detail').textContent =
                t('上一轮可用推荐保持不变，可以随时重新生成。','The previous usable recommendations were kept. You can restart whenever you want.','前回の利用可能なおすすめは保持されています。いつでも再生成できます。')
        } else if (progress.state === 'failed') {
            $('#a85-recommend-phase').textContent =
                t('推荐生成失败','Recommendation generation failed','おすすめ生成に失敗しました')
            $('#a85-recommend-detail').textContent =
                t('上一轮可用推荐已保留：','The previous usable recommendations were kept: ','前回の利用可能なおすすめは保持されています：') +
                String(progress.error || t('请稍后重试','Try again later','後でもう一度お試しください'))
        } else if (changed) {
            $('#a85-recommend-phase').textContent = t('新一轮推荐已更新','New recommendation round is ready','新しいおすすめラウンドを更新しました')
            const shortCycle = String(current.activeCycleId || '').slice(0, 8)
            $('#a85-recommend-detail').textContent =
                t('已切换到新结果','Switched to the new results','新しい結果に切り替えました') +
                (shortCycle ? ' · cycle ' + shortCycle : '') +
                ' · ' +
                new Date().toLocaleTimeString()
        } else {
            $('#a85-recommend-phase').textContent =
                '推荐生成已结束，但当前结果未切换'
            $('#a85-recommend-detail').textContent =
                t('下方仍是上一轮结果；请查看页面错误提示后重试。','The previous results are still shown. Check the page error and try again.','前回の結果が表示されたままです。ページのエラーを確認して再試行してください。')
        }
        decorateProgress()
        recommendationCompletionTimer = window.setTimeout(() => {
            card.classList.remove('active')
            recommendationCompletionTimer = null
        }, 4800)
        recommendationWatchStartedAt = 0
        return false
    } catch (error) {
        $('#a85-recommend-phase').textContent = t('正在等待推荐服务响应','Waiting for the recommendation service','おすすめサービスの応答待ち')
        $('#a85-recommend-detail').textContent =
            t('暂时无法读取实时进度：','Could not read live progress: ','リアルタイム進捗を読み込めません：') +
            String(error?.message || error)
        return false
    }
}

function progressHeadFor(bar, host, source, motion, sparkle) {
    let image = progressHeads.get(bar)
    if (!image || !image.isConnected || image.parentElement !== host) {
        image = document.createElement('img')
        image.className = 'a85-progress-head'
        image.alt = ''
        host.appendChild(image)
        progressHeads.set(bar, image)
    }
    image.src = source
    image.classList.toggle('bobble', motion === 'bobble')
    image.classList.toggle('hop', motion === 'hop')
    image.classList.toggle('sparkle', sparkle)
    return image
}

function positionProgressHead(bar, host, ratio, source, motion, sparkle) {
    if (!host || !bar || !Number.isFinite(ratio)) return
    const hostRect = host.getBoundingClientRect(),
        barRect = bar.getBoundingClientRect()
    if (barRect.width < 20 || barRect.height < 2 || !hostRect.width) return
    if (getComputedStyle(host).position === 'static')
        host.style.position = 'relative'
    const image = progressHeadFor(bar, host, source, motion, sparkle)
    image.style.display = ''
    image.style.left = `${barRect.left - hostRect.left + Math.max(0, Math.min(1, ratio)) * barRect.width - 13}px`
    image.style.top = `${barRect.top - hostRect.top + barRect.height / 2 - 13}px`
}

function decorateProgress() {
    const descriptor = activeDescriptor
    const source = descriptor?.assets?.['mascot-head.webp']
    const config = descriptor?.components?.progress || {}
    if (!source || !['mascot', 'star', 'paw'].includes(config.style)) {
        $$('.a85-progress-head').forEach((node) => node.remove())
        return
    }
    const motion = ['bobble', 'hop'].includes(config.motion)
        ? config.motion
        : 'none'
    const sparkle = config.effect === 'sparkle'
    $$('progress').forEach((bar) => {
        if (!bar.hasAttribute('value') || !Number(bar.max)) {
            progressHeads.get(bar)?.style.setProperty('display', 'none')
            return
        }
        positionProgressHead(
            bar,
            bar.parentElement,
            Number(bar.value) / Number(bar.max),
            source,
            motion,
            sparkle
        )
    })
    $$('.progress').forEach((bar) => {
        const fill = bar.querySelector(':scope > span')
        if (!fill) return
        let ratio = 0
        if (fill.style.width?.includes('%'))
            ratio = parseFloat(fill.style.width) / 100
        else
            ratio =
                fill.getBoundingClientRect().width /
                Math.max(1, bar.getBoundingClientRect().width)
        positionProgressHead(bar, bar, ratio, source, motion, sparkle)
    })
    const inline = $('#a85-recommend-line')
    if (inline && !inline.classList.contains('indeterminate')) {
        const fill = inline.querySelector('span')
        positionProgressHead(
            inline,
            inline,
            parseFloat(fill.style.width || '0') / 100,
            source,
            motion,
            sparkle
        )
    }
}

function renderEmptyArt() {
    const art = activeDescriptor?.assets?.['empty-state.webp']
    if (!art) {
        $$('.a85-empty-art').forEach((node) => node.remove())
        return
    }
    const candidates = [
        ['#recommend-results', '#recommend-message'],
        ['#comic-grid', '#library-count'],
        ['#downloaded-grid-items', '#downloaded-count']
    ]
    candidates.forEach(([targetSelector, afterSelector]) => {
        const target = $(targetSelector),
            after = $(afterSelector)
        const id = `a85-empty-${targetSelector.replace(/\W/g, '')}`
        const existing = document.getElementById(id)
        const empty =
            target &&
            target.children.length === 0 &&
            !String(target.textContent || '').trim()
        if (!empty) {
            existing?.remove()
            return
        }
        if (!existing && after) {
            const image = document.createElement('img')
            image.id = id
            image.className = 'a85-empty-art'
            image.src = art
            image.alt = ''
            after.insertAdjacentElement('afterend', image)
        }
    })
}

function scheduleThemeDecoration() {
    if (
        decorationQueued ||
        !activeDescriptor ||
        document.visibilityState === 'hidden'
    )
        return
    decorationQueued = true
    requestAnimationFrame(() => {
        decorationQueued = false
        if (!activeDescriptor || document.visibilityState === 'hidden') return
        decorateProgress()
        renderEmptyArt()
    })
}

function setupRuntimeObservers() {
    ensureRecommendationProgress()
    $('#recommend-button')?.addEventListener(
        'click',
        startRecommendationWatch,
        true
    )
    $('#recommend-restart')?.addEventListener(
        'click',
        startRecommendationWatch,
        true
    )

    // Main app.js owns view navigation and scroll restoration. Theme support
    // must never maintain a competing scroll-position system.
    const themeObserver = new MutationObserver(() => {
        if (activeDescriptor) {
            applyDescriptor(activeDescriptor)
            scheduleThemeDecoration()
        }
    })
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-pica-theme']
    })

    const decorationObserver = new MutationObserver((mutations) => {
        const relevant = mutations.some((mutation) => {
            const target =
                mutation.target instanceof Element
                    ? mutation.target
                    : mutation.target.parentElement
            return (
                !target?.closest?.('.a85-progress-head') &&
                !target?.classList?.contains('a85-empty-art')
            )
        })
        if (relevant) scheduleThemeDecoration()
    })
    for (const selector of [
        '#recommend',
        '#downloads',
        '#library',
        '#downloaded'
    ]) {
        const root = $(selector)
        if (!root) continue
        decorationObserver.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'hidden', 'style', 'value']
        })
    }
    window.addEventListener('resize', scheduleThemeDecoration, {
        passive: true
    })
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible')
            scheduleThemeDecoration()
    })

    // Decoration is event-driven: relevant DOM mutations, theme changes,
    // viewport resize, visibility restoration, and explicit theme application
    // all schedule one coalesced animation-frame pass.
    scheduleThemeDecoration()
}

async function bootstrap() {
    injectStyles()
    setupRuntimeObservers()
    try {
        const current = await status(true)
        if (hasThemeAccess(current)) {
            await refreshStudio(false)
            await loadActiveTheme(current)
        }
        const recommendation = await api(
            '/api/v1/recommendation-sessions/status?mode=final'
        )
        if (recommendation.buildingCycleId) startRecommendationWatch()
    } catch {
        // Browser Lite and older engines keep the base UI.
    }
}

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => void bootstrap())
else void bootstrap()

window.addEventListener('pagehide', () => {
    if (recommendationTimer) clearInterval(recommendationTimer)
})


document.addEventListener('pica-language-change', () => {
    void refreshStudio(true)
    const progress = $('#a85-recommend-progress')
    if (progress) {
        progress.remove()
        ensureRecommendationProgress()
        updateRecommendationArtwork()
    }
})
