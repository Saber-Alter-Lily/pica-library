import { expect, test } from '@playwright/test'

const secret = 'synthetic-host-password-only', endpoint = 'http://127.0.0.1:4567/fixture-host/'
const hostileName = '<img src=x onerror="window.__hostInjected=1">'
function result(offset = 0) { return { kind: 'suwayomi', protocolVersion: 1, persisted: false, server: { name: 'Suwayomi-Server', version: '2.4.2366' }, page: { offset, size: 25, total: 60, hasNext: offset === 0, hasPrevious: offset > 0, sources: [{ id: '9223372036854775807', name: hostileName, language: 'zh', supportsLatest: true }] }, capabilities: { sourceInspection: true, reader: false, libraryImport: false, extensionInstall: false } } }
async function setup(page, language = 'zh-CN', options = {}) {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(language => { localStorage.setItem('pica-library-language', language); localStorage.setItem('pica-onboarding-state-v1', JSON.stringify({ completedVersion: 2, autoShow: false })) }, language)
    const requests = [], errors = [], all = []
    let failure = false
    page.on('pageerror', error => errors.push(String(error)))
    await page.route('**/api/v1/**', async route => {
        const req = route.request(), path = new URL(req.url()).pathname
        all.push({ method: req.method(), path })
        if (path === '/api/v1/desktop/status') {
            if (options.waitStatus) await options.waitStatus()
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true, startupReady: true, csrfToken: 'host-test-csrf', externalSources: { schemaVersion: 1, revision: 0, enabled: [] }, sourceHostInspection: { available: !options.remote } }) }).catch(() => {})
        } else if (path === '/api/v1/desktop/source-hosts/inspect') {
            const value = req.postDataJSON(); requests.push(value)
            expect(req.headers()['x-pica-csrf']).toBe('host-test-csrf')
            if (options.waitPost) await options.waitPost()
            await route.fulfill({ status: failure ? 401 : 200, contentType: 'application/json', body: JSON.stringify(failure ? { code: 'SOURCE_HOST_AUTH_REQUIRED', error: secret } : result(value.offset)) }).catch(() => {})
        } else await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'synthetic-only' }) })
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (await page.locator('#pica-disclaimer-gate').isVisible()) { await page.locator('#pica-disclaimer-check').check(); await page.locator('#pica-disclaimer-accept').click() }
    await page.locator('nav [data-view="maintenance"]').click()
    await expect(page.locator('#a87-general-panel #source-host-panel')).toBeAttached()
    return { requests, errors, all, fail: () => { failure = true } }
}
async function ready(page) { await page.locator('#source-host-summary').click(); await page.locator('#source-host-endpoint').fill(endpoint) }
async function inspect(page) { await page.locator('#source-host-consent').check(); await page.locator('#source-host-submit').click() }

for (const [language, title, authError] of [
    ['zh-CN', '外部宿主诊断（实验）', '宿主要求认证'],
    ['en', 'External host diagnostics (experimental)', 'The host requires authentication'],
    ['ja', '外部ホスト診断（実験）', 'ホストが認証を要求']
]) test(`source-host inspection is opt-in, paginated, lossless and never enables a source (${language})`, async ({ page }) => {
    const state = await setup(page, language)
    await expect(page.locator('#source-host-summary')).toHaveText(title)
    expect(await page.locator('#source-host-panel').getAttribute('open')).toBeNull()
    expect(state.requests).toHaveLength(0)
    await ready(page); expect(state.requests).toHaveLength(0)
    await expect(page.locator('#source-host-submit')).toBeDisabled()
    await inspect(page)
    await expect(page.locator('#source-host-results')).toBeVisible()
    await expect(page.locator('#source-host-results td').nth(0)).toHaveText(hostileName)
    await expect(page.locator('#source-host-results td').nth(2)).toHaveText('9223372036854775807')
    expect(await page.locator('#source-host-results img').count()).toBe(0)
    expect(await page.evaluate(() => window.__hostInjected)).toBeUndefined()
    expect(state.requests).toHaveLength(1); expect(state.requests[0]).toMatchObject({ consent: true, endpoint, kind: 'suwayomi', offset: 0, auth: { mode: 'none' } })
    await page.locator('#source-host-next').click()
    await expect.poll(() => state.requests.length).toBe(2)
    expect(state.requests[1].offset).toBe(25)
    await expect(page.locator('#source-host-next')).toBeDisabled()
    state.fail(); await page.locator('#source-host-previous').click()
    await expect(page.locator('#source-host-state')).toContainText(authError)
    await expect(page.locator('#source-host-results')).toBeHidden()
    expect(await page.locator('#source-host-panel').innerText()).not.toContain(secret)
    await page.locator('#source-host-endpoint').fill('https://other.example/explicit/')
    await expect(page.locator('#source-host-consent')).not.toBeChecked()
    await expect(page.locator('#source-host-next')).toBeDisabled()
    expect(state.all.filter(row => row.method === 'POST' && row.path !== '/api/v1/desktop/source-hosts/inspect')).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    expect(state.errors).toEqual([])
})

test('Basic host credentials remain panel-local through explicit paging and disappear on close/reload', async ({ page }) => {
    const state = await setup(page, 'en'); await ready(page)
    await page.locator('#source-host-auth').selectOption('basic')
    await page.locator('#source-host-username').fill('synthetic-host-user')
    await page.locator('#source-host-password').fill(secret)
    await inspect(page); await expect(page.locator('#source-host-results')).toBeVisible()
    await expect(page.locator('#source-host-password')).toHaveValue('')
    await page.locator('#source-host-next').click(); await expect.poll(() => state.requests.length).toBe(2)
    expect(state.requests.map(row => row.auth)).toEqual(Array(2).fill({ mode: 'basic', username: 'synthetic-host-user', password: secret }))
    await page.locator('#source-host-summary').click()
    await expect(page.locator('#source-host-username')).toHaveValue('')
    await expect(page.locator('#source-host-password')).toHaveValue('')
    await expect(page.locator('#source-host-consent')).not.toBeChecked()
    expect(await page.evaluate(secret => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }).includes(secret), secret)).toBe(false)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('nav [data-view="maintenance"]').click()
    await expect(page.locator('#source-host-results')).toBeHidden()
    await expect(page.locator('#source-host-password')).toHaveValue('')
    expect(state.requests).toHaveLength(2); expect(state.errors).toEqual([])
})

test('cancel fences both the status phase and a late POST result without retries', async ({ page }) => {
    let releaseStatus, blockStatus = false, releasePost
    const statusWait = new Promise(resolve => { releaseStatus = resolve }), postWait = new Promise(resolve => { releasePost = resolve })
    const state = await setup(page, 'en', { waitStatus: () => blockStatus ? statusWait : Promise.resolve(), waitPost: () => postWait })
    await ready(page); blockStatus = true; await inspect(page)
    await page.locator('#source-host-cancel').click(); blockStatus = false; releaseStatus()
    await expect(page.locator('#source-host-state')).toContainText('cancelled')
    await expect(page.locator('#source-host-cancel')).toBeDisabled()
    expect(state.requests).toHaveLength(0)
    await inspect(page); await expect.poll(() => state.requests.length).toBe(1)
    await page.locator('#source-host-cancel').click(); releasePost()
    await expect(page.locator('#source-host-cancel')).toBeDisabled()
    await expect(page.locator('#source-host-results')).toBeHidden()
    await expect(page.locator('#source-host-state')).toContainText('cancelled')
    expect(state.requests).toHaveLength(1); expect(state.errors).toEqual([])
})

test('remote or unsupported shells cannot invoke host inspection', async ({ page }) => {
    const state = await setup(page, 'en', { remote: true }); await ready(page); await inspect(page)
    await expect(page.locator('#source-host-state')).toContainText('local Desktop UI')
    expect(state.requests).toHaveLength(0)
    expect(state.errors).toEqual([])
})

for (const language of ['zh-CN', 'en', 'ja']) test(`saved hosts have no default content/service and require explicit separate inspection (${language})`, async ({ page }) => {
    const state = await setup(page, language), commands = [], reads = []
    let hosts = []
    const snapshot = () => ({ schemaVersion: 1, revision: commands.length, scope: 'inspect-only', credentials: 'per-request-not-stored', storage: 'available', capabilities: { sourceInspection: true, reader: false, libraryImport: false, extensionInstall: false }, hosts })
    await page.route('**/api/v1/desktop/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true, startupReady: true, csrfToken: 'host-test-csrf', sourceHostConnections: { available: true } }) }))
    await page.route('**/api/v1/desktop/source-hosts/connections', async route => {
        const input = route.request().postDataJSON(); commands.push(input)
        expect(route.request().headers()['x-pica-csrf']).toBe('host-test-csrf')
        if (input.action === 'save') hosts = [{ id: '64d223e0-5d29-4320-babb-5a2da654d345', label: input.label, endpoint: input.endpoint, authMode: input.authMode, enabled: false, revision: 0 }]
        if (input.action === 'set-enabled') hosts = hosts.map(host => ({ ...host, enabled: input.enabled, revision: host.revision + 1 }))
        if (input.action === 'remove') hosts = []
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot()) })
    })
    await page.route('**/api/v1/desktop/source-hosts/inspect-saved', async route => { reads.push(route.request().postDataJSON()); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result(0)) }) })
    await page.locator('#saved-host-summary').click()
    expect(commands).toHaveLength(0); expect(reads).toHaveLength(0)
    await page.locator('#saved-host-refresh').click()
    await expect.poll(() => commands.length).toBe(1)
    expect(hosts).toEqual([]); expect(reads).toHaveLength(0)
    await page.locator('#saved-host-label').fill(hostileName)
    await page.locator('#saved-host-endpoint').fill(endpoint)
    await page.locator('#saved-host-auth').selectOption('basic')
    await expect(page.locator('#saved-host-save')).toBeDisabled()
    await page.locator('#saved-host-consent').check(); await page.locator('#saved-host-save').click()
    await expect(page.locator('#saved-host-list h3')).toHaveText(hostileName)
    expect(await page.locator('#saved-host-list img').count()).toBe(0)
    expect(await page.evaluate(() => window.__hostInjected)).toBeUndefined()
    expect(commands[1]).toMatchObject({ action: 'save', scope: 'inspect-only', consent: true })
    const card = page.locator('#saved-host-list section')
    await expect(card.locator('button').last()).toBeDisabled()
    await card.locator('button').first().click()
    await expect(card.locator('input')).toHaveCount(2)
    expect(reads).toHaveLength(0)
    await card.locator('input').first().fill('this-host-only')
    await card.locator('input').last().fill(secret)
    await card.locator('button').last().click()
    await expect.poll(() => reads.length).toBe(1)
    expect(reads[0].auth).toEqual({ mode: 'basic', username: 'this-host-only', password: secret })
    await expect(card.locator('input').last()).toHaveValue('')
    expect(JSON.stringify(commands)).not.toContain(secret)
    expect(await page.evaluate(secret => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }).includes(secret), secret)).toBe(false)
    await card.locator('button').first().click()
    await expect(card.locator('button').last()).toBeDisabled()
    const removal = card.locator('button').nth(1); await removal.click()
    await card.locator('div').last().locator('button').first().click()
    await expect(card).toHaveCount(0)
    expect(reads).toHaveLength(1); expect(state.requests).toHaveLength(0); expect(state.errors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
})

for (const language of ['zh-CN', 'en', 'ja']) test(`hosted library uses the actual shared Reader and independent progress (${language})`, async ({ page }) => {
    const state = await setup(page, language), requests = [], progress = []
    const hostId = '64d223e0-5d29-4320-babb-5a2da654d345', sessionId = '64d223e0-5d29-4320-babb-5a2da654d346', comicId = 'hosted:' + hostId + ':' + 'b'.repeat(64), episodeId = 'host-chapter:' + 'c'.repeat(64)
    const root = '/api/v1/desktop/host-reader/' + sessionId, chapterPath = `${root}/comics/${encodeURIComponent(comicId)}/chapters/${encodeURIComponent(episodeId)}`
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/XFoAAAAASUVORK5CYII=', 'base64')
    await page.route('**/api/v1/desktop/status', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: true, startupReady: true, csrfToken: 'host-test-csrf', sourceHostConnections: { available: true }, hostedLibraryReader: { available: true } }) }))
    await page.route('**/api/v1/desktop/source-hosts/connections', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schemaVersion: 1, revision: 2, scope: 'inspect-only', credentials: 'per-request-not-stored', storage: 'available', capabilities: { sourceInspection: true, reader: false, libraryImport: false, extensionInstall: false }, hosts: [{ id: hostId, label: 'My host', endpoint, authMode: 'basic', enabled: true, revision: 1 }] }) }))
    await page.route('**/api/v1/desktop/host-reader**', async route => {
        const req = route.request(), path = new URL(req.url()).pathname, input = req.postData() ? req.postDataJSON() : null
        requests.push({ path, input, method: req.method() })
        if (req.method() === 'POST') expect(req.headers()['x-pica-csrf']).toBe('host-test-csrf')
        let value
        if (path === '/api/v1/desktop/host-reader') {
            if (input.action === 'start') { expect(input).toMatchObject({ scope: 'library-read', consent: true, acceptHostFetchSideEffects: true }); value = { sessionId, history: [], capabilities: { libraryRead: true, libraryImport: false } } }
            else if (input.action === 'list') value = { offset: 0, hasNext: false, books: [{ comicId, title: hostileName, sourceId: '9007199254740993' }] }
            else if (input.action === 'select') value = { sessionId, comicId, title: hostileName }
            else value = { closed: true }
        } else if (path.endsWith('/progress')) {
            if (input) { progress.splice(0, progress.length, input); value = input } else value = progress
        } else if (path.endsWith('/chapters')) value = [{ id: episodeId, title: 'Synthetic chapter', order: 1, source: 'provider' }]
        else if (path === chapterPath) value = { episode: { id: episodeId, title: 'Synthetic chapter' }, progress: progress[0], pages: [0,1].map(index => ({ index, url: chapterPath + '/pages/' + index })) }
        else { await route.fulfill({ status: 200, contentType: 'image/png', body: png }); return }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) })
    })
    await page.locator('#saved-host-summary').click(); await page.locator('#saved-host-refresh').click()
    await page.locator('[data-host-library]').click()
    await expect(page.locator('#host-library-dialog')).toBeVisible(); expect(requests).toHaveLength(0)
    await page.locator('#host-library-username').fill('this-host-only'); await page.locator('#host-library-password').fill(secret)
    await page.locator('#host-library-consent').check(); await page.locator('#host-library-start').click()
    await expect(page.locator('#host-library-books article strong')).toHaveText(hostileName)
    expect(await page.locator('#host-library-books img').count()).toBe(0)
    await page.locator('#host-library-books article button').click()
    await expect(page.locator('#reader')).toHaveClass(/active/)
    await expect(page.locator('#reader-title')).toHaveText(hostileName)
    await expect(page.locator('#reader-pages img')).toHaveCount(2)
    const readerOptions = page.locator('#reader .reader-options')
    await expect(page.locator('#reader-mode')).not.toBeVisible()
    await readerOptions.locator('summary').click()
    await expect(page.locator('#reader-mode')).toBeVisible()
    await page.locator('#reader-mode').selectOption('single')
    await expect(page.locator('#reader-pages')).toHaveClass(/reader-single/)
    await readerOptions.locator('summary').click()
    await expect(page.locator('#reader-mode')).not.toBeVisible()
    await page.locator('#reader-pages img').first().click(); await page.keyboard.press('ArrowRight')
    await expect.poll(() => progress.at(-1)?.pageIndex).toBe(1)
    expect(progress[0].comicId).toBe(comicId)
    expect(requests.some(row => row.path.startsWith('/api/v1/online-reader'))).toBe(false)
    expect(await page.evaluate(secret => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }).includes(secret), secret)).toBe(false)
    await page.locator('#reader-exit').click()
    await page.locator('[data-host-library]').click(); await page.locator('#host-library-end').click()
    await expect.poll(() => requests.some(row => row.input?.action === 'close')).toBe(true)
    expect(state.errors).toEqual([])
})
