import fs from 'node:fs'
function read(f){return fs.readFileSync(f,'utf8')}function write(f,t){fs.writeFileSync(f,t)}function rep(t,a,b,l){const i=t.indexOf(a);if(i<0)throw new Error(`missing ${l}`);if(t.indexOf(a,i+a.length)>=0)throw new Error(`duplicate ${l}`);return t.slice(0,i)+b+t.slice(i+a.length)}

{
 const file='src/desktop/types.ts';let text=read(file)
 text=rep(text,
`    remoteStorageCredentials?: Record<string, RemoteTargetStoredCredentials>
`,
`    remoteStorageCredentials?: Record<string, RemoteTargetStoredCredentials>
    /** Optional E-Hentai cookie-session material. The whole credential object is DPAPI-protected. */
    ehMemberId?: string
    ehPassHash?: string
    ehIgneous?: string
    ehCfClearance?: string
`, 'desktop E-H credential fields')
 write(file,text)
}

{
 const file='src/desktop/main.ts';let text=read(file)
 const serviceAnchor=`    service = new LibraryService(database, dataDir)
`
 const serviceReplacement=`    service = new LibraryService(database, dataDir)
    service.setEhSession(
        credentials?.ehMemberId && credentials?.ehPassHash
            ? {
                  memberId: credentials.ehMemberId,
                  passHash: credentials.ehPassHash,
                  igneous: credentials.ehIgneous,
                  cfClearance: credentials.ehCfClearance
              }
            : null
    )
`
 const serviceParts=text.split(serviceAnchor);if(serviceParts.length!==3)throw new Error(`expected exactly two LibraryService construction sites, got ${serviceParts.length-1}`);text=serviceParts.join(serviceReplacement)
 text=rep(text,
`            remoteStorage: remoteStorageManager?.status() ?? { configured: false, kind: 'webdav' },
            personalization: {
`,
`            remoteStorage: remoteStorageManager?.status() ?? { configured: false, kind: 'webdav' },
            ehAccount: {
                configured: Boolean(
                    credentials?.ehMemberId && credentials?.ehPassHash
                )
            },
            personalization: {
`, 'desktop status E-H account')
 const saveAnchor=`        save: async (input) => {
            const themeAction = String(input.personalizationAction ?? '')
`
 const saveReplacement=`        save: async (input) => {
            const ehAccountAction = String(input.ehAccountAction ?? '')
            if (ehAccountAction) {
                if (!service) throw new Error('Library is not ready')
                if (ehAccountAction === 'save-session') {
                    const candidate = {
                        memberId: String(input.memberId ?? '').trim(),
                        passHash: String(input.passHash ?? '').trim(),
                        igneous: String(input.igneous ?? '').trim() || undefined,
                        cfClearance:
                            String(input.cfClearance ?? '').trim() || undefined
                    }
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
                    const next = {
                        ...(credentials ?? { account: '', password: '' }),
                        ehMemberId: candidate.memberId,
                        ehPassHash: candidate.passHash,
                        ehIgneous: candidate.igneous,
                        ehCfClearance: candidate.cfClearance
                    }
                    credentialsStore.save(next)
                    credentials = next
                    return {
                        success: true,
                        ehAccount: {
                            configured: true,
                            verified: true,
                            exHentai: await service.probeExHentai()
                        }
                    }
                }
                if (ehAccountAction === 'clear-session') {
                    const next = {
                        ...(credentials ?? { account: '', password: '' }),
                        ehMemberId: undefined,
                        ehPassHash: undefined,
                        ehIgneous: undefined,
                        ehCfClearance: undefined
                    }
                    credentialsStore.save(next)
                    credentials = next
                    service.setEhSession(null)
                    return {
                        success: true,
                        ehAccount: { configured: false, exHentai: 'UNAVAILABLE' }
                    }
                }
                if (ehAccountAction === 'verify-session')
                    return {
                        success: true,
                        ehAccount: {
                            configured: service.ehAccountStatus().configured,
                            verified: true,
                            ...(await service.verifyEhAccount()),
                            exHentai: await service.probeExHentai()
                        }
                    }
                if (ehAccountAction === 'probe-exh')
                    return {
                        success: true,
                        ehAccount: {
                            configured: service.ehAccountStatus().configured,
                            exHentai: await service.probeExHentai()
                        }
                    }
                if (ehAccountAction === 'sync-favorites')
                    return {
                        success: true,
                        ehAccount: {
                            configured: service.ehAccountStatus().configured,
                            sync: await service.syncEhFavorites()
                        }
                    }
                throw new Error('Unknown E-H account action')
            }
            const themeAction = String(input.personalizationAction ?? '')
`
 text=rep(text,saveAnchor,saveReplacement,'desktop E-H account actions')
 text=rep(text,
`            credentialsStore.save(built.credentials)
`,
`            built.credentials.ehMemberId = previousCredentials?.ehMemberId
            built.credentials.ehPassHash = previousCredentials?.ehPassHash
            built.credentials.ehIgneous = previousCredentials?.ehIgneous
            built.credentials.ehCfClearance = previousCredentials?.ehCfClearance
            credentialsStore.save(built.credentials)
`, 'preserve E-H credentials on ordinary settings save')
 write(file,text)
}

{
 const file='web/index.html';let text=read(file)
 const anchor=`                <article id="settings-remote-storage" class="panel">
`
 const panel=`                <article id="settings-eh-account" class="panel">
                    <h3>E-Hentai / ExHentai 账号</h3>
                    <p>E-H 公共搜索、阅读和下载无需登录。账号仅用于云收藏与 ExH 访问探测；Pica Library 不保存 E-H 密码，只保存你从官方站点会话中导入的 cookie，并由 Windows DPAPI 加密。</p>
                    <p id="eh-account-state" class="status"></p>
                    <div class="settings-form">
                        <label>ipb_member_id<input id="eh-member-id" autocomplete="off" /></label>
                        <label>ipb_pass_hash<input id="eh-pass-hash" type="password" autocomplete="new-password" /></label>
                        <label>igneous（可选）<input id="eh-igneous" type="password" autocomplete="new-password" /></label>
                        <label>cf_clearance（仅遇到 Cloudflare 时可选）<input id="eh-cf-clearance" type="password" autocomplete="new-password" /></label>
                    </div>
                    <div class="actions">
                        <a class="button-control" href="https://forums.e-hentai.org/index.php?act=Login" target="_blank" rel="noreferrer">打开官方登录页</a>
                        <a class="button-control" href="https://forums.e-hentai.org/index.php?act=Reg&amp;CODE=00" target="_blank" rel="noreferrer">打开官方注册页</a>
                        <button id="eh-account-save" type="button" class="primary">保存并验证会话</button>
                        <button id="eh-account-verify" type="button">重新验证</button>
                        <button id="eh-exh-probe" type="button">探测 ExH</button>
                        <button id="eh-favorites-sync" type="button">同步 E-H 云收藏</button>
                        <button id="eh-account-clear" type="button">清除 E-H 会话</button>
                    </div>
                    <p id="eh-account-message" class="status" role="status"></p>
                </article>
`
 text=rep(text,anchor,panel+anchor,'E-H settings panel')
 text=rep(text,
`        <script type="module" src="./alpha8-star-access.js"></script>
`,
`        <script type="module" src="./alpha8-star-access.js"></script>
        <script type="module" src="./eh-account.js"></script>
`, 'E-H account module')
 write(file,text)
}

write('web/eh-account.js',`const $ = (selector) => document.querySelector(selector)
let csrf = ''

async function status() {
    const response = await fetch('/api/v1/desktop/status', { cache: 'no-store' })
    if (!response.ok) throw new Error('Desktop status unavailable')
    const value = await response.json()
    csrf = value.csrfToken || csrf
    render(value.ehAccount || { configured: false })
}

function render(value) {
    const configured = Boolean(value.configured)
    const state = $('#eh-account-state')
    if (state)
        state.textContent = configured
            ? 'E-H 会话已加密保存；公共模式仍可独立使用。'
            : '未配置 E-H 会话；公共 E-H 功能可正常使用。'
    if (value.exHentai && $('#eh-account-message'))
        $('#eh-account-message').textContent = 'ExH: ' + value.exHentai
}

async function action(payload) {
    const response = await fetch('/api/v1/desktop/settings', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-pica-csrf': csrf
        },
        body: JSON.stringify(payload)
    })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || 'E-H account action failed')
    render(value.ehAccount || {})
    return value
}

function clearInputs() {
    for (const id of ['#eh-member-id','#eh-pass-hash','#eh-igneous','#eh-cf-clearance']) {
        const input = $(id)
        if (input) input.value = ''
    }
}

$('#eh-account-save')?.addEventListener('click', async () => {
    const message = $('#eh-account-message')
    try {
        message.textContent = '正在验证 E-H 会话…'
        await action({
            ehAccountAction: 'save-session',
            memberId: $('#eh-member-id').value,
            passHash: $('#eh-pass-hash').value,
            igneous: $('#eh-igneous').value,
            cfClearance: $('#eh-cf-clearance').value
        })
        clearInputs()
        message.textContent = 'E-H 会话验证成功并已加密保存。'
    } catch (error) {
        message.textContent = error instanceof Error ? error.message : String(error)
    }
})
$('#eh-account-verify')?.addEventListener('click', async () => {
    const message = $('#eh-account-message')
    try { message.textContent = '正在验证…'; await action({ ehAccountAction: 'verify-session' }); message.textContent = 'E-H 会话有效。' }
    catch (error) { message.textContent = error instanceof Error ? error.message : String(error) }
})
$('#eh-exh-probe')?.addEventListener('click', async () => {
    const message = $('#eh-account-message')
    try { const value = await action({ ehAccountAction: 'probe-exh' }); message.textContent = 'ExH: ' + value.ehAccount.exHentai }
    catch (error) { message.textContent = error instanceof Error ? error.message : String(error) }
})
$('#eh-favorites-sync')?.addEventListener('click', async () => {
    const message = $('#eh-account-message')
    try { message.textContent = '正在同步 E-H 云收藏…'; const value = await action({ ehAccountAction: 'sync-favorites' }); message.textContent = 'E-H 云收藏已同步：' + Number(value.ehAccount.sync?.remoteFavoriteCount || 0) + ' 本。' }
    catch (error) { message.textContent = error instanceof Error ? error.message : String(error) }
})
$('#eh-account-clear')?.addEventListener('click', async () => {
    const message = $('#eh-account-message')
    try { await action({ ehAccountAction: 'clear-session' }); clearInputs(); message.textContent = 'E-H 会话已从本机删除；公共功能不受影响。' }
    catch (error) { message.textContent = error instanceof Error ? error.message : String(error) }
})

void status().catch(() => {})
`)

write('test/unit/eh-desktop-account-ui.test.ts',`import fs from 'node:fs'\nimport { describe, expect, it } from 'vitest'\n\ndescribe('E-H Desktop account UI contracts',()=>{\n it('stores session only in DPAPI credentials and never exposes cookie values in status',()=>{\n   const types=fs.readFileSync('src/desktop/types.ts','utf8');const main=fs.readFileSync('src/desktop/main.ts','utf8')\n   expect(types).toContain('ehMemberId?: string');expect(types).toContain('ehPassHash?: string')\n   expect(main).toContain('credentialsStore.save(next)');expect(main).toContain('ehAccount: {')\n   const statusBlock=main.slice(main.indexOf('status: () => ({'),main.indexOf('importThemePack:',main.indexOf('status: () => ({')));expect(statusBlock).not.toContain('ehPassHash:');expect(statusBlock).not.toContain('ehMemberId:')\n })\n it('keeps public E-H explicitly independent from account setup',()=>{const html=fs.readFileSync('web/index.html','utf8');const js=fs.readFileSync('web/eh-account.js','utf8');expect(html).toContain('公共搜索、阅读和下载无需登录');expect(js).toContain("ehAccountAction: 'clear-session'");expect(html).toContain('https://forums.e-hentai.org/index.php?act=Login')})\n})\n`)
console.log('EH_DESKTOP_ACCOUNT_UI_PATCH=APPLIED')
