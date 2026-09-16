from pathlib import Path

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')

def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:120]!r}')
    text = text.replace(old, new, 1)
    write(path, text)

# Desktop main: wire controlled E-H browser login into the existing DPAPI session flow.
replace_once(
    'src/desktop/main.ts',
    "import { GitHubAccountAuthService } from '../services/github-account-auth'\n",
    "import { GitHubAccountAuthService } from '../services/github-account-auth'\nimport { DesktopEhWebLogin, type EhCapturedSession } from './eh-web-login'\n"
)
replace_once(
    'src/desktop/main.ts',
    "let remoteStorageManager: RemoteStorageDesktopManager | null = null\n",
    "let remoteStorageManager: RemoteStorageDesktopManager | null = null\nlet ehWebLogin: DesktopEhWebLogin | null = null\n"
)
replace_once(
    'src/desktop/main.ts',
    "    await mobileBridge?.close()\n    mobileBridge = null\n    await service?.quiesceLocalDownloads()\n",
    "    await mobileBridge?.close()\n    mobileBridge = null\n    await ehWebLogin?.cancel()\n    ehWebLogin = null\n    await service?.quiesceLocalDownloads()\n"
)
main = read('src/desktop/main.ts')
anchor = "async function startEngine(preferredPort: number) {\n"
if anchor not in main:
    raise SystemExit('startEngine anchor missing')
helper = """async function persistEhSession(candidate: EhCapturedSession) {
    if (!service) throw new Error('Library is not ready')
    if (!candidate.memberId || !candidate.passHash)
        throw new Error('E-H 登录会话不完整')
    const previousSession =
        credentials?.ehMemberId && credentials?.ehPassHash
            ? {
                  memberId: credentials.ehMemberId,
                  passHash: credentials.ehPassHash,
                  igneous: credentials.ehIgneous,
                  cfClearance: credentials.ehCfClearance
              }
            : null
    service.setEhSession(candidate)
    try {
        await service.verifyEhAccount()
    } catch (error) {
        service.setEhSession(previousSession)
        throw error
    }
    const next: StoredCredentials = {
        ...(credentials ?? { account: '', password: '' }),
        ehMemberId: candidate.memberId,
        ehPassHash: candidate.passHash,
        ehIgneous: candidate.igneous,
        ehCfClearance: candidate.cfClearance
    }
    credentialsStore.save(next)
    credentials = next
    return {
        configured: true,
        verified: true,
        exHentai: await service.probeExHentai()
    }
}

"""
main = main.replace(anchor, helper + anchor, 1)
write('src/desktop/main.ts', main)
replace_once(
    'src/desktop/main.ts',
    "    service = new LibraryService(database, dataDir)\n    service.setEhSession(\n",
    "    service = new LibraryService(database, dataDir)\n    ehWebLogin = new DesktopEhWebLogin(\n        path.join(paths.runtimeState, 'eh-web-login'),\n        async (candidate) => { await persistEhSession(candidate) }\n    )\n    service.setEhSession(\n"
)
replace_once(
    'src/desktop/main.ts',
    "    const desktop: DesktopServerController = {\n        csrfToken,\n        configured: () => Boolean(config && credentials),\n",
    "    const desktop: DesktopServerController = {\n        csrfToken,\n        startEhWebLogin: async () => {\n            if (!ehWebLogin) throw new Error('E-H 网页登录不可用')\n            return await ehWebLogin.start()\n        },\n        ehWebLoginStatus: () =>\n            ehWebLogin?.status() ?? {\n                state: 'idle',\n                message: '尚未开始网页登录'\n            },\n        cancelEhWebLogin: async () =>\n            ehWebLogin\n                ? await ehWebLogin.cancel()\n                : { state: 'cancelled', message: '网页登录已取消' },\n        configured: () => Boolean(config && credentials),\n"
)
main = read('src/desktop/main.ts')
start = main.index("                if (ehAccountAction === 'save-session') {")
end = main.index("                if (ehAccountAction === 'clear-session') {", start)
replacement = """                if (ehAccountAction === 'save-session') {
                    const candidate: EhCapturedSession = {
                        memberId: String(input.memberId ?? '').trim(),
                        passHash: String(input.passHash ?? '').trim(),
                        igneous: String(input.igneous ?? '').trim() || undefined,
                        cfClearance:
                            String(input.cfClearance ?? '').trim() || undefined
                    }
                    return {
                        success: true,
                        ehAccount: await persistEhSession(candidate)
                    }
                }
"""
main = main[:start] + replacement + main[end:]
write('src/desktop/main.ts', main)

# Desktop HTTP API for the managed login window.
replace_once(
    'src/library/server.ts',
    "    configured: () => boolean\n    status: () => Record<string, unknown>\n",
    "    configured: () => boolean\n    status: () => Record<string, unknown>\n    startEhWebLogin?: () => Promise<Record<string, unknown>>\n    ehWebLoginStatus?: () => Record<string, unknown>\n    cancelEhWebLogin?: () => Promise<Record<string, unknown>>\n"
)
server = read('src/library/server.ts')
anchor = "            if (\n                url.pathname === '/api/v1/desktop/settings' &&\n"
if anchor not in server:
    raise SystemExit('desktop settings route anchor missing')
routes = """            if (
                url.pathname === '/api/v1/desktop/eh-web-login/status' &&
                request.method === 'GET'
            ) {
                if (!options.desktop?.ehWebLoginStatus)
                    return json(response, 409, { error: '受控 E-H 网页登录不可用' })
                return json(response, 200, options.desktop.ehWebLoginStatus())
            }
            if (
                url.pathname === '/api/v1/desktop/eh-web-login/start' &&
                request.method === 'POST'
            ) {
                if (!options.desktop?.startEhWebLogin)
                    return json(response, 409, { error: '受控 E-H 网页登录不可用' })
                return json(response, 200, await options.desktop.startEhWebLogin())
            }
            if (
                url.pathname === '/api/v1/desktop/eh-web-login/cancel' &&
                request.method === 'POST'
            ) {
                if (!options.desktop?.cancelEhWebLogin)
                    return json(response, 409, { error: '受控 E-H 网页登录不可用' })
                return json(response, 200, await options.desktop.cancelEhWebLogin())
            }
"""
server = server.replace(anchor, routes + anchor, 1)
write('src/library/server.ts', server)

# Web E-H account UI: recommended managed login + manual fallback.
replace_once(
    'web/index.html',
    "                    <p>E-H 公共搜索、阅读和下载无需登录。账号仅用于云收藏与 ExH 访问探测；Pica Library 不保存 E-H 密码，只保存你从官方站点会话中导入的 cookie，并由 Windows DPAPI 加密。</p>\n",
    "                    <p>E-H 公共搜索、阅读和下载无需登录。推荐使用“网页登录”：Pica Library 会打开独立的 E-H 官方登录窗口，登录成功后自动检测、验证并加密保存会话；账号密码始终只提交给 E-H 官方页面。手动 Cookie 导入仅作为高级兜底。</p>\n"
)
replace_once(
    'web/index.html',
    "                    <div class=\"actions\">\n                        <a class=\"button-control\" href=\"https://forums.e-hentai.org/index.php?act=Login\" target=\"_blank\" rel=\"noreferrer\">打开官方登录页</a>\n",
    "                    <div class=\"actions\">\n                        <button id=\"eh-web-login-start\" type=\"button\" class=\"primary\">网页登录（推荐）</button>\n                        <button id=\"eh-web-login-cancel\" type=\"button\" hidden>取消网页登录</button>\n                        <a class=\"button-control\" href=\"https://forums.e-hentai.org/index.php?act=Login\" target=\"_blank\" rel=\"noreferrer\">默认浏览器打开官方登录页（手动）</a>\n"
)

eh = read('web/eh-account.js')
eh = eh.replace("let csrf = ''\n", "let csrf = ''\nlet webLoginPoll = null\n", 1)
anchor = "function clearInputs() {\n"
if anchor not in eh:
    raise SystemExit('eh account clearInputs anchor missing')
managed = """async function desktopLoginRequest(path, method = 'GET') {
    if (!csrf) await status()
    const response = await fetch(path, {
        method,
        headers: method === 'POST' ? { 'x-pica-csrf': csrf } : undefined,
        cache: 'no-store'
    })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || 'E-H 网页登录失败')
    return value
}

function stopWebLoginPoll() {
    if (webLoginPoll) clearInterval(webLoginPoll)
    webLoginPoll = null
}

function renderWebLoginState(value) {
    const message = $('#eh-account-message')
    const start = $('#eh-web-login-start')
    const cancel = $('#eh-web-login-cancel')
    const active = ['opening', 'waiting', 'verifying'].includes(value?.state)
    if (start) start.disabled = active
    if (cancel) cancel.hidden = !active
    if (message && value?.message) message.textContent = value.message
    if (value?.state === 'complete') {
        stopWebLoginPoll()
        void status().then(() => {
            if (message) message.textContent = 'E-H 登录成功，会话已自动验证并加密保存。'
        })
    } else if (value?.state === 'failed' || value?.state === 'cancelled') {
        stopWebLoginPoll()
    }
}

async function pollWebLogin() {
    try {
        renderWebLoginState(
            await desktopLoginRequest('/api/v1/desktop/eh-web-login/status')
        )
    } catch (error) {
        stopWebLoginPoll()
        const message = $('#eh-account-message')
        if (message)
            message.textContent = error instanceof Error ? error.message : String(error)
    }
}

async function startWebLogin() {
    const message = $('#eh-account-message')
    try {
        if (message) message.textContent = '正在打开 E-H 官方登录窗口…'
        renderWebLoginState(
            await desktopLoginRequest('/api/v1/desktop/eh-web-login/start', 'POST')
        )
        stopWebLoginPoll()
        webLoginPoll = setInterval(() => void pollWebLogin(), 900)
        void pollWebLogin()
    } catch (error) {
        if (message)
            message.textContent = error instanceof Error ? error.message : String(error)
    }
}

async function cancelWebLogin() {
    try {
        renderWebLoginState(
            await desktopLoginRequest('/api/v1/desktop/eh-web-login/cancel', 'POST')
        )
    } catch (error) {
        const message = $('#eh-account-message')
        if (message)
            message.textContent = error instanceof Error ? error.message : String(error)
    }
}

"""
eh = eh.replace(anchor, managed + anchor, 1)
listener_anchor = "$('#eh-account-save')?.addEventListener('click', async () => {\n"
if listener_anchor not in eh:
    raise SystemExit('eh save listener anchor missing')
eh = eh.replace(
    listener_anchor,
    "$('#eh-web-login-start')?.addEventListener('click', () => void startWebLogin())\n$('#eh-web-login-cancel')?.addEventListener('click', () => void cancelWebLogin())\n" + listener_anchor,
    1
)
eh = eh.replace(
    "void status().catch(() => {})\n",
    "void status().then(() => pollWebLogin()).catch(() => {})\n",
    1
)
write('web/eh-account.js', eh)

# Desktop settings hub: E-H belongs in General with Pica; only recommendation/visual stays separate.
hub = read('web/alpha8-7-desktop-hub.js')
hub = hub.replace("        accounts: '账号与来源',\n", '', 1)
hub = hub.replace("        accounts: 'Accounts & Providers',\n", '', 1)
hub = hub.replace("    ['accounts', 'accounts'],\n", '', 1)
hub = hub.replace(
    "        panels.get('accounts').appendChild(ehAccount)\n",
    "        panels.get('general').appendChild(ehAccount)\n",
    1
)
old = "    hub$('#setup-open-eh')?.addEventListener('click', () => setTimeout(() => openSettingsHubPanel('accounts'), 0))\n"
new = "    hub$('#setup-open-eh')?.addEventListener('click', () => setTimeout(() => { openSettingsHubPanel('general'); const panel = hub$('#settings-eh-account'); if (panel) { panel.open = true; panel.scrollIntoView({ behavior: 'smooth', block: 'start' }) } }, 0))\n"
if old not in hub:
    raise SystemExit('setup-open-eh hub anchor missing')
hub = hub.replace(old, new, 1)
write('web/alpha8-7-desktop-hub.js', hub)

# Mobile bridge exposes Desktop visual state/settings; model still runs only on Desktop.
bridge = read('src/mobile/bridge-server.ts')
anchor = "            if (url.pathname === '/mobile/v1/star-access' && request.method === 'GET') {\n"
if anchor not in bridge:
    raise SystemExit('mobile bridge authenticated route anchor missing')
visual_routes = """            if (
                url.pathname === '/mobile/v1/visual/status' &&
                request.method === 'GET'
            ) {
                return json(response, 200, options.service.visualIndexStatus())
            }

            if (
                url.pathname === '/mobile/v1/visual/settings' &&
                request.method === 'POST'
            ) {
                const input = await body(request)
                options.service.updateVisualSettings({
                    enabled: input.enabled,
                    rerankMode: input.rerankMode
                })
                return json(response, 200, options.service.visualIndexStatus())
            }

"""
bridge = bridge.replace(anchor, visual_routes + anchor, 1)
write('src/mobile/bridge-server.ts', bridge)

client = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/BridgeClient.java')
anchor = "    static JSONObject atlas(Context c) throws Exception { return new JSONObject(get(c,\"/mobile/v1/atlas\")); }\n"
if anchor not in client:
    raise SystemExit('BridgeClient atlas anchor missing')
methods = """    static JSONObject visualStatus(Context c) throws Exception {return new JSONObject(get(c,"/mobile/v1/visual/status"));}
    static JSONObject updateVisualSettings(Context c,Boolean enabled,String rerankMode) throws Exception {JSONObject body=new JSONObject();if(enabled!=null)body.put("enabled",enabled.booleanValue());if(rerankMode!=null&&!rerankMode.isEmpty())body.put("rerankMode",rerankMode);return new JSONObject(post(c,"/mobile/v1/visual/settings",body));}
"""
client = client.replace(anchor, methods + anchor, 1)
write('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/BridgeClient.java', client)

settings = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/SettingsActivity.java')
old = "content.addView(SettingsRow.row(this,\"推荐反馈原因\",RecommendationFeedbackStore.askReasons(this)?\"开启\":\"关闭\",v->{RecommendationFeedbackStore.setAskReasons(this,!RecommendationFeedbackStore.askReasons(this));renderContent();}));"
new = "content.addView(SettingsRow.row(this,\"推荐与画风\",BridgeStore.paired(this)?\"桌面联动\":\"本机反馈\",v->startActivity(new Intent(this,RecommendationStyleActivity.class))));"
if old not in settings:
    raise SystemExit('Android feedback row anchor missing')
settings = settings.replace(old, new, 1)
write('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/SettingsActivity.java', settings)

manifest = read('mobile/android-alpha2/app/src/main/AndroidManifest.xml')
anchor = '        <activity android:name=".SettingsActivity" android:exported="false" />\n'
if anchor not in manifest:
    raise SystemExit('Android manifest SettingsActivity anchor missing')
manifest = manifest.replace(anchor, anchor + '        <activity android:name=".RecommendationStyleActivity" android:exported="false" />\n', 1)
write('mobile/android-alpha2/app/src/main/AndroidManifest.xml', manifest)

# Focused tests for the two regressions reported during manual QA.
(ROOT / 'test/unit/desktop-eh-web-login.test.ts').write_text("""import { describe, expect, it } from 'vitest'\nimport { ehSessionFromCdpCookies } from '../../src/desktop/eh-web-login'\n\ndescribe('desktop controlled E-H web login', () => {\n    it('extracts the official E-H cookie session and ignores unrelated cookies', () => {\n        expect(\n            ehSessionFromCdpCookies([\n                { name: 'noise', value: 'x', domain: 'example.com' },\n                { name: 'ipb_member_id', value: '123', domain: '.e-hentai.org' },\n                { name: 'ipb_pass_hash', value: 'abc', domain: 'forums.e-hentai.org' },\n                { name: 'igneous', value: 'igneous-value', domain: 'exhentai.org' },\n                { name: 'cf_clearance', value: 'cf-value', domain: '.e-hentai.org' }\n            ])\n        ).toEqual({\n            memberId: '123',\n            passHash: 'abc',\n            igneous: 'igneous-value',\n            cfClearance: 'cf-value'\n        })\n    })\n\n    it('does not promote an incomplete browser session', () => {\n        expect(\n            ehSessionFromCdpCookies([\n                { name: 'ipb_member_id', value: '123', domain: '.e-hentai.org' }\n            ])\n        ).toBeNull()\n    })\n})\n""", encoding='utf-8')

(ROOT / 'test/unit/recommendation-v4-mobile-settings.test.ts').write_text("""import fs from 'node:fs'\nimport { describe, expect, it } from 'vitest'\n\nconst read = (path: string) => fs.readFileSync(path, 'utf8')\n\ndescribe('Recommendation V4 mobile settings surface', () => {\n    it('exposes a visible recommendation and visual-style settings entry', () => {\n        const settings = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/SettingsActivity.java')\n        const activity = read('mobile/android-alpha2/app/src/main/java/com/picalibrary/android/RecommendationStyleActivity.java')\n        expect(settings).toContain('推荐与画风')\n        expect(settings).toContain('RecommendationStyleActivity.class')\n        expect(activity).toContain('画风分析由 Windows / Desktop 完成')\n        expect(activity).toContain('BridgeClient.visualStatus')\n        expect(activity).toContain('BridgeClient.updateVisualSettings')\n    })\n\n    it('keeps E-H with Pica in General instead of a separate desktop account section', () => {\n        const hub = read('web/alpha8-7-desktop-hub.js')\n        expect(hub).not.toContain("['accounts', 'accounts']")\n        expect(hub).toContain("panels.get('general').appendChild(ehAccount)")\n        expect(hub).toContain("['recommendations', 'recommendations']")\n    })\n})\n""", encoding='utf-8')

# Document the implementation boundary explicitly.
docs = read('docs/RECOMMENDATION_V4_VISUAL_BETA.md')
needle = "## Beta validation gates\n"
addition = """## Account and mobile UX corrections

- Desktop General settings now contains both Pica and E-H / ExH account controls; there is no separate E-H-only account section in the settings sidebar.
- Recommended Desktop E-H login uses an isolated Microsoft Edge profile controlled by the local Desktop process. Official credentials are entered only on E-H pages; Pica Library captures only the resulting E-H session cookies, verifies them, stores the accepted session through DPAPI, then removes the temporary browser profile.
- Android now exposes a visible `推荐与画风` settings screen. Android keeps feedback-reason preferences locally and, when paired, reads/controls the Desktop visual index and OFF/SHADOW/LIVE mode through the authenticated Mobile Bridge. Android still does not run DINOv2 locally.

"""
if needle not in docs:
    raise SystemExit('docs validation heading missing')
docs = docs.replace(needle, addition + needle, 1)
write('docs/RECOMMENDATION_V4_VISUAL_BETA.md', docs)

print('V4 account + visual UX integration patch applied')
