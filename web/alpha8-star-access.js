import './alpha8-disclaimer.js'
import './alpha8-7-desktop-hub.js'
import { copy as starT } from './locale-runtime.js'

const a88$ = (selector) => document.querySelector(selector)
const wait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds))
let authAttempt = 0

async function status() {
    const response = await fetch('/api/v1/desktop/status', {
        cache: 'no-store'
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
}

async function post(body) {
    const current = await status()
    const response = await fetch('/api/v1/desktop/settings', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-pica-csrf': current.csrfToken || ''
        },
        body: JSON.stringify(body)
    })
    const value = await response.json()
    if (!response.ok)
        throw new Error(value.error || `HTTP ${response.status}`)
    return value
}

function supportCopy() {
    const star = a88$('#a83-star')
    if (star)
        star.textContent = starT(
            '⭐ 给项目 Star',
            '⭐ Star this project',
            '⭐ プロジェクトに Star'
        )
}

function fallbackCopy(text) {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
}

async function copyCode(text) {
    try {
        await navigator.clipboard.writeText(text)
    } catch {
        fallbackCopy(text)
    }
}

function authenticated(personalization) {
    return (
        personalization?.starUnlocked === true &&
        Number(personalization?.starUserId || 0) > 0 &&
        personalization?.starAuthMethod === 'github-account-device-flow'
    )
}

function lockedMarkup() {
    return `<div class="a86-star-hero"><div><h3>${starT(
        'GitHub 账号验证',
        'GitHub account verification',
        'GitHub アカウント認証'
    )}</h3><p>${starT(
        '使用本人 GitHub 账号验证 Star 后解锁个性化装扮。',
        'Verify the Star with your own GitHub account to unlock personalization themes.',
        '本人の GitHub アカウントで Star を確認すると、カスタマイズテーマを利用できます。'
    )}</p></div><div class="a86-star-actions"><button type="button" id="a88-open-repo">${starT(
        '⭐ 打开项目页面',
        '⭐ Open project page',
        '⭐ プロジェクトページを開く'
    )}</button><button type="button" class="primary" id="a88-start-auth">${starT(
        '生成 GitHub 验证码',
        'Generate GitHub verification code',
        'GitHub 認証コードを生成'
    )}</button><div id="a88-device-box" class="a86-star-note" hidden><strong>${starT(
        '步骤 1 · 复制验证码',
        'Step 1 · Copy the verification code',
        'ステップ 1 · 認証コードをコピー'
    )}</strong><div id="a88-device-code" style="font-size:1.65rem;font-weight:800;letter-spacing:.12em;margin:8px 0"></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><button type="button" id="a88-copy-device">${starT(
        '复制验证码',
        'Copy code',
        'コードをコピー'
    )}</button><button type="button" class="primary" id="a88-open-device">${starT(
        '步骤 2 · 打开 GitHub',
        'Step 2 · Open GitHub',
        'ステップ 2 · GitHub を開く'
    )}</button></div><p id="a88-auth-state" class="status"></p></div></div></div><p id="a88-star-message" class="status a86-star-note"></p>`
}

async function beginAuth() {
    const attempt = ++authAttempt
    const button = a88$('#a88-start-auth')
    const message = a88$('#a88-star-message')
    const box = a88$('#a88-device-box')
    const code = a88$('#a88-device-code')
    const state = a88$('#a88-auth-state')
    const open = a88$('#a88-open-device')
    const copy = a88$('#a88-copy-device')
    button.disabled = true
    message.textContent = starT(
        '正在生成验证码…',
        'Generating verification code…',
        '認証コードを生成しています…'
    )
    try {
        const started = await post({
            personalizationAction: 'github-auth-start'
        })
        if (attempt !== authAttempt) return
        const flow = started.githubAuth
        if (!flow?.flowId || !flow?.userCode || !flow?.verificationUri)
            throw new Error(
                starT(
                    'GitHub 登录启动响应不完整',
                    'The GitHub sign-in response is incomplete',
                    'GitHub サインイン開始応答が不完全です'
                )
            )
        box.hidden=false
        code.textContent = flow.userCode
        state.textContent = starT(
            '完成 GitHub 授权后返回本页即可。',
            'Complete authorization on GitHub, then return to this page.',
            'GitHub で認証を完了してから、このページに戻ってください。'
        )
        message.textContent = ''
        copy.onclick=async()=>{
            await copyCode(flow.userCode)
            message.textContent = starT(
                '验证码已复制',
                'Verification code copied',
                '認証コードをコピーしました'
            )
        }
        open.onclick=async()=>{
            await copyCode(flow.userCode)
            state.textContent = starT(
                '已打开 GitHub，完成授权后返回本页。',
                'GitHub has been opened. Complete authorization, then return here.',
                'GitHub を開きました。認証を完了してからここに戻ってください。'
            )
            window.open(flow.verificationUri, '_blank', 'noopener')
        }
        button.textContent = starT(
            '重新生成验证码',
            'Generate a new code',
            '認証コードを再生成'
        )
        let delay = Math.max(1200, Number(flow.pollAfterMs || 5000))
        while (attempt === authAttempt) {
            await wait(delay)
            if (attempt !== authAttempt) return
            const result = await post({
                personalizationAction: 'github-auth-poll',
                flowId: flow.flowId
            })
            const auth = result.githubAuth
            if (auth?.state === 'pending') {
                delay = Math.max(1200, Number(auth.pollAfterMs || 5000))
                continue
            }
            if (auth?.state === 'complete') {
                const personalization = result.personalization || {}
                if (!authenticated(personalization))
                    throw new Error(
                        starT(
                            'GitHub 账号已认证，但 Star 状态没有解锁',
                            'The GitHub account is verified, but the Star status did not unlock personalization',
                            'GitHub アカウントは認証されましたが、Star 状態でカスタマイズが解除されませんでした'
                        )
                    )
                state.textContent = starT(
                    `已验证 ${personalization.starUser || 'GitHub 账号'}`,
                    `Verified ${personalization.starUser || 'GitHub account'}`,
                    `${personalization.starUser || 'GitHub アカウント'} を認証済み`
                )
                message.textContent = starT(
                    '验证成功，正在载入装扮…',
                    'Verification succeeded. Loading themes…',
                    '認証に成功しました。テーマを読み込んでいます…'
                )
                setTimeout(() => location.reload(), 350)
                return
            }
            throw new Error(
                starT(
                    'GitHub 登录状态异常',
                    'Unexpected GitHub sign-in state',
                    'GitHub サインイン状態が不正です'
                )
            )
        }
    } catch (error) {
        if (attempt === authAttempt)
            message.textContent = starT(
                `验证失败：${error.message}`,
                `Verification failed: ${error.message}`,
                `認証に失敗しました：${error.message}`
            )
    } finally {
        if (attempt === authAttempt) button.disabled = false
    }
}

async function render() {
    supportCopy()
    let current
    try {
        current = await status()
    } catch {
        return
    }
    const personalization = current.personalization || {}
    if (authenticated(personalization)) return
    const settings = a88$('#settings')
    if (!settings) return
    let panel = a88$('#a83-personalization')
    if (!panel) {
        panel = document.createElement('article')
        panel.id = 'a83-personalization'
        panel.className = 'panel a83-panel a86-star-panel'
        settings.appendChild(panel)
    }
    panel.classList.add('a86-star-panel')
    panel.innerHTML = lockedMarkup()
    a88$('#a88-open-repo').onclick = () =>
        window.open(
            'https://github.com/Saber-Alter-Lily/pica-library',
            '_blank',
            'noopener'
        )
    a88$('#a88-start-auth').onclick = () => void beginAuth()
}

async function bootstrap() {
    for (let index = 0; index < 25; index++) {
        if (a88$('#settings')) break
        await wait(160)
    }
    supportCopy()
    await render()
}

document.addEventListener('pica-language-change', () => {
    supportCopy()
    const panel = a88$('#a83-personalization')
    if (panel && a88$('#a88-start-auth')) void render()
})

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => void bootstrap())
else void bootstrap()
