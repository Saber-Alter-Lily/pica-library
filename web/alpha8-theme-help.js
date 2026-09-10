const $$ = (selector) => [...document.querySelectorAll(selector)]
const $ = (selector) => document.querySelector(selector)

const CREATOR_MAX_FILES = 4
const CREATOR_MAX_FILE_BYTES = 4 * 1024 * 1024
const CREATOR_MAX_TOTAL_BYTES = 5 * 1024 * 1024
const THEME_MAX_BYTES = 24 * 1024 * 1024
const referenceFiles = []
const progressHeads = new WeakMap()
const viewScroll = new Map()
let desktopStatus = null
let activeDescriptor = null
let progressTimer = null
let recommendationTimer = null
let lastActiveView = $('.view.active')?.id || 'home'

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
        reader.onerror = () => reject(reader.error || new Error('无法读取图片'))
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
#a85-recommend-progress.active{display:grid}#a85-recommend-progress img#a85-recommend-art{display:none;width:100%;max-height:150px;object-fit:cover;border-radius:14px}#a85-recommend-progress.has-art img#a85-recommend-art{display:block}.a85-progress-copy strong{display:block;margin-bottom:5px}.a85-progress-line{height:9px;background:var(--a85-progress-track,var(--a83-accent-soft,#eee));border-radius:999px;position:relative;margin-top:10px;overflow:visible}.a85-progress-line>span{display:block;height:100%;width:0;border-radius:999px;background:var(--a85-progress-fill,var(--a83-accent,#7457b9));transition:width .28s ease}.a85-progress-line.indeterminate>span{width:38%;animation:a85-indeterminate 1.1s ease-in-out infinite}
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
        remove.title = '移除图片'
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
        `${referenceFiles.length} / ${CREATOR_MAX_FILES} 张 · ${bytes(total)} / ${bytes(CREATOR_MAX_TOTAL_BYTES)}`
}

function acceptReferences(files) {
    for (const file of [...(files || [])]) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            updateReferenceHint('仅支持 PNG / JPEG / WebP 参考图。')
            continue
        }
        if (file.size > CREATOR_MAX_FILE_BYTES) {
            updateReferenceHint(
                `${file.name} 超过单张 ${bytes(CREATOR_MAX_FILE_BYTES)} 限制。`
            )
            continue
        }
        if (referenceFiles.length >= CREATOR_MAX_FILES) {
            updateReferenceHint(`最多上传 ${CREATOR_MAX_FILES} 张参考图。`)
            break
        }
        const total = referenceFiles.reduce((sum, item) => sum + item.size, 0)
        if (total + file.size > CREATOR_MAX_TOTAL_BYTES) {
            updateReferenceHint(
                `参考图总大小请控制在 ${bytes(CREATOR_MAX_TOTAL_BYTES)} 内。`
            )
            break
        }
        referenceFiles.push(file)
    }
    renderReferences()
    updateReferenceHint()
}

function studioMarkup() {
    return `<div class="section-heading"><div><p class="eyebrow">Theme Studio</p><h3>个性化装扮</h3></div><span class="a83-state a83-good">已解锁</span></div>
<p>只需要写一句你想要的风格并上传角色参考图。网页会把固定提示词、规范、模板和参考图一起打包给 AI；AI 返回装扮包后，拖回来即可应用。</p>
<div class="a85-steps"><span class="a85-step">1 · 描述与参考图</span><span class="a85-step">2 · 导出 ZIP 给 AI</span><span class="a85-step">3 · 导入 AI 返回包</span><span class="a85-step">4 · 自动同步手机</span></div>
<div class="a85-workflow">
<section class="a85-box"><h4>制作装扮 · Theme Creator Kit</h4><p class="status">主题描述是唯一必填项；角色图建议 1 张，额外风格图可选。</p>
<textarea id="a85-description" maxlength="4000" placeholder="例如：紫发二次元漫画向导，星空与白猫，薰衣草紫为主色，整体轻盈、可爱，但不要遮抢漫画封面。"></textarea>
<label class="a85-upload" id="a85-reference-drop"><strong>上传角色 / 风格参考图</strong><br><span>PNG / JPEG / WebP · 最多 4 张</span><input id="a85-reference-input" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden></label>
<div id="a85-reference-grid" class="a85-reference-grid"></div><p id="a85-reference-message" class="status"></p>
<div class="a83-row"><button id="a85-export" type="button" class="primary">导出给 AI</button><a class="button-link" href="./theme-pack-creator-prompt.txt" download>查看固定提示词</a><a class="button-link" href="./theme-pack-spec-v1.txt" download>查看装扮规范</a></div><p id="a85-export-message" class="status"></p></section>
<section class="a85-box"><h4>导入并应用</h4><p class="status">把 AI 返回的 <code>.pica-theme</code> 或 ZIP 直接拖入。Desktop 会独立安全校验，校验通过后立即应用到当前网页。</p>
<label class="a85-theme-drop" id="a85-theme-drop"><strong>拖入 AI 返回的装扮包</strong><br><span>或点击选择文件 · 上限 24 MiB</span><input id="a85-theme-input" type="file" accept=".pica-theme,.zip,application/zip" hidden></label>
<p id="a85-import-message" class="status"></p><div id="a85-theme-list"></div><div class="a85-mobile-note" id="a85-mobile-note">手机与电脑在同一局域网重新配对/同步一次后，会自动取得 Desktop 的已安装装扮，并跟随当前启用的装扮。</div></section>
</div>`
}

async function exportCreatorKit() {
    const message = $('#a85-export-message')
    const button = $('#a85-export')
    const description = $('#a85-description')?.value?.trim() || ''
    if (description.length < 3) {
        message.textContent = '先写一句主题描述。'
        return
    }
    button.disabled = true
    message.textContent = '正在整理固定提示词、规范、模板和参考图…'
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
        message.textContent = `已导出 ${result.fileName} · ${bytes(result.size)}。直接把这个 ZIP 交给 AI，并让它按包内说明返回完成的装扮包。`
    } catch (error) {
        message.textContent = `导出失败：${error.message}`
    } finally {
        button.disabled = false
    }
}

async function importTheme(file) {
    const message = $('#a85-import-message')
    if (!file) return
    if (!/\.(pica-theme|zip)$/i.test(file.name)) {
        message.textContent = '请选择 .pica-theme 或 .zip。'
        return
    }
    if (!file.size || file.size > THEME_MAX_BYTES) {
        message.textContent = `装扮包必须小于 ${bytes(THEME_MAX_BYTES)}。`
        return
    }
    message.textContent = '正在校验、安装并应用装扮…'
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
        message.textContent = `已安装并启用：${result.themePack?.name || file.name}。`
        await refreshStudio(true)
    } catch (error) {
        message.textContent = `安装失败：${error.message}`
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
    target.innerHTML = `<h4>已安装装扮</h4>${packs.length ? '' : '<p class="status">暂时没有装扮包。</p>'}`
    packs.forEach((pack) => {
        const row = document.createElement('div')
        row.className = 'a85-pack'
        const active = pack.id === p.activeThemeId
        row.innerHTML = `<div class="a85-pack-main"><strong>${escapeHtml(pack.name || pack.id)}</strong><div class="status">${escapeHtml(pack.author || '')} · ${escapeHtml(pack.version || '')} · ${bytes(pack.size)}</div>${pack.description ? `<div class="status">${escapeHtml(pack.description)}</div>` : ''}</div><div class="a85-pack-actions">${active ? '<span class="a85-active">使用中</span>' : `<button type="button" data-a85-use="${escapeHtml(pack.id)}">应用</button>`}</div>`
        target.appendChild(row)
    })
    const reset = document.createElement('div')
    reset.className = 'a83-row'
    reset.innerHTML = `<button type="button" id="a85-reset" ${p.activeThemeId ? '' : 'disabled'}>恢复默认外观</button>`
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
                    `应用失败：${error.message}`
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
                    `恢复失败：${error.message}`
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
            ? `已配对 ${mobile.pairedDevices.length} 台设备。手机下次启动或重新配对/同步时会自动取得装扮包并跟随当前启用装扮。`
            : '尚未配对手机。完成一次局域网配对后，手机会自动取得 Desktop 的装扮包并跟随当前启用装扮。'
}

function ensureRecommendationProgress() {
    const host = $('#recommend .page-heading')
    if (!host || $('#a85-recommend-progress')) return
    const card = document.createElement('div')
    card.id = 'a85-recommend-progress'
    card.innerHTML = `<img id="a85-recommend-art" alt=""><div class="a85-progress-copy"><strong id="a85-recommend-phase">正在准备推荐…</strong><span id="a85-recommend-detail" class="status">正在读取推荐状态。</span><div class="a85-progress-line indeterminate" id="a85-recommend-line"><span></span></div></div>`
    host.insertAdjacentElement('afterend', card)
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

const buildPhaseLabels = {
    profile: '分析收藏与兴趣画像',
    intents: '规划推荐方向',
    routes: '准备多路召回',
    retrieve: '从 Pica 召回候选漫画',
    rank: '排序与去重候选',
    complete: '正在保存推荐结果'
}

function startRecommendationWatch() {
    ensureRecommendationProgress()
    updateRecommendationArtwork()
    const card = $('#a85-recommend-progress')
    if (!card) return
    card.classList.add('active')
    $('#a85-recommend-phase').textContent = '正在启动推荐生成…'
    $('#a85-recommend-detail').textContent =
        '进度会直接显示在这里，完成后自动收起。'
    $('#a85-recommend-line').classList.add('indeterminate')
    $('#a85-recommend-line').querySelector('span').style.width = ''
    if (recommendationTimer) clearInterval(recommendationTimer)
    recommendationTimer = setInterval(pollRecommendationProgress, 500)
    void pollRecommendationProgress()
}

async function pollRecommendationProgress() {
    const card = $('#a85-recommend-progress')
    if (!card) return
    try {
        const current = await api(
            '/api/v1/recommendation-sessions/status?mode=final'
        )
        const progress = current.buildProgress || {}
        if (current.buildingCycleId) {
            card.classList.add('active')
            $('#a85-recommend-phase').textContent =
                buildPhaseLabels[progress.phase] || '正在生成推荐…'
            const done = Number(progress.done || 0),
                total = Number(progress.total || 0)
            if (total > 0) {
                const percent = Math.max(
                    0,
                    Math.min(100, Math.round((done * 100) / total))
                )
                $('#a85-recommend-detail').textContent =
                    `${done} / ${total} · ${percent}%`
                $('#a85-recommend-line').classList.remove('indeterminate')
                $('#a85-recommend-line').querySelector('span').style.width =
                    `${percent}%`
            } else {
                $('#a85-recommend-detail').textContent = '正在处理…'
                $('#a85-recommend-line').classList.add('indeterminate')
            }
            decorateProgress()
            return true
        }
        card.classList.remove('active')
        if (recommendationTimer) clearInterval(recommendationTimer)
        recommendationTimer = null
        return false
    } catch {
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
    window.addEventListener(
        'scroll',
        () => viewScroll.set(lastActiveView, window.scrollY),
        { passive: true }
    )
    const viewObserver = new MutationObserver(() => {
        const active = $('.view.active')?.id
        if (!active || active === lastActiveView) return
        lastActiveView = active
        const restore = viewScroll.get(active) || 0
        requestAnimationFrame(() =>
            window.scrollTo({ top: restore, left: 0, behavior: 'auto' })
        )
    })
    $$('.view').forEach((view) =>
        viewObserver.observe(view, {
            attributes: true,
            attributeFilter: ['class']
        })
    )
    const themeObserver = new MutationObserver(() => {
        if (activeDescriptor) applyDescriptor(activeDescriptor)
    })
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-pica-theme']
    })
    progressTimer = setInterval(() => {
        if (activeDescriptor) {
            decorateProgress()
            renderEmptyArt()
        }
    }, 650)
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
    if (progressTimer) clearInterval(progressTimer)
    if (recommendationTimer) clearInterval(recommendationTimer)
})
