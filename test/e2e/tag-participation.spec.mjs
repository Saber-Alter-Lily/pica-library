import { expect, test } from '@playwright/test'
import AdmZip from 'adm-zip'

async function setup(page, language = 'zh-CN') {
    await page.addInitScript(lang => {
        localStorage.setItem('pica-library-language', lang)
        localStorage.setItem('pica-onboarding-state-v1', JSON.stringify({ completedVersion: 2, dismissedVersion: 0, autoShow: true }))
    }, language)
    const fixture = {
        revision: 1, tagExchange: { canUndo: false }, tagPolicy: { schemaVersion: 1, mode: 'ALL', selected: [], disabled: [], privateTags: [] },
        rows: Array.from({ length: 1205 }, (_, i) => ({ identity: `pica|tag-${i}`, label: `Tag ${String(i).padStart(4, '0')}`, key: `tag-${i}`, provider: 'pica', facet: 'GENRE_THEME', supportCount: 1205 - i })),
        comics: [{ comicId: 'synthetic-work', title: '<img src=x onerror=alert(1)>Synthetic work', author: 'Fixture creator', providerId: 'pica' }]
    }
    const writes = [], reads = [], errors = []; let conflict = false
    page.on('pageerror', error => errors.push(String(error)))
    await page.route('**/api/v1/**', async route => {
        const pathname = new URL(route.request().url()).pathname
        let body, status = 200
        if (pathname === '/api/v1/desktop/status') body = { configured: true, csrfToken: 'fixture', startupReady: true }
        else if (pathname === '/api/v1/recommendation-v5/tag-policy') {
            if (route.request().method() === 'GET') { reads.push(pathname); body = fixture }
            else {
                const input = route.request().postDataJSON(); writes.push(input)
                if (conflict) { status = 409; body = { error: 'TAG_POLICY_REVISION_CONFLICT' } }
                else { fixture.revision++; fixture.tagPolicy = structuredClone(input.tagPolicy); body = { ...fixture, recommendationRefresh: input.apply ? { state: 'BUILDING' } : null } }
            }
        } else if (pathname === '/api/v1/recommendation-v5') body = { ...fixture, controls: [], inferred: [], counts: {}, sessionIntent: { mode: 'DEFAULT' } }
        else if (pathname.endsWith('/preference-timescales')) body = { layers: { inferred: { lifetime: { positive: {}, positiveItemCount: 0 }, days30: { positive: {} }, session: { positive: {} } } } }
        else if (pathname.endsWith('/candidate-channels')) body = { summary: {}, channels: [], providerBudgets: {} }
        else if (pathname.endsWith('/serving-composition')) body = { available: false }
        else { status = 503; body = { error: 'synthetic-offline-fixture' } }
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (await page.locator('#pica-disclaimer-gate').isVisible().catch(() => false)) { await page.locator('#pica-disclaimer-check').check(); await page.locator('#pica-disclaimer-accept').click() }
    await page.locator('nav [data-view="maintenance"]').click(); await page.locator('#a87-recommendations-tab').click()
    await expect(page.locator('#v5-tag-section')).toBeVisible()
    expect(reads).toHaveLength(0) // Opening ordinary settings does not scan the tag directory.
    await page.locator('#v5-tag-section > summary').click()
    await expect(page.locator('[data-tag-id]')).toHaveCount(100)
    if (process.env.PICA_WEB_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.PICA_WEB_EVIDENCE_DIR}/tag-editor-${language}.png`, fullPage: true })
    return { fixture, writes, reads, errors, conflict: () => { conflict = true } }
}
test('tag editor is lazy, bounded, staged, undoable and CAS-safe in the actual settings hub', async ({ page }) => {
    const result = await setup(page)
    await page.locator('[data-tag-none]').click(); expect(result.writes).toHaveLength(0)
    await page.locator('[data-tag-id="pica|tag-0"]').check()
    await page.locator('[data-tag-query]').fill('Tag 1204'); await page.locator('[data-tag-find]').click(); await expect(page.locator('[data-tag-id]')).toHaveCount(1)
    await page.locator('[data-tag-id="pica|tag-1204"]').check(); await page.locator('[data-tag-save]').click()
    await expect.poll(() => result.writes.length).toBe(1)
    expect(result.writes[0]).toMatchObject({ baseRevision: 1, apply: false, tagPolicy: { mode: 'SELECTED', selected: ['pica|tag-0', 'pica|tag-1204'] } })
    await expect(page.locator('#v5-tag-body')).toContainText('现有批次不会')
    await page.locator('[data-tag-all]').click(); await page.locator('[data-tag-undo]').click(); expect(result.writes).toHaveLength(1)
    result.conflict(); await page.locator('[data-tag-none]').click(); await page.locator('[data-tag-save]').click()
    await expect(page.locator('#v5-tag-body')).toContainText('草稿已保留'); await expect(page.locator('[data-tag-save]')).toBeEnabled()
    expect(result.errors).toEqual([])
})
test('private work binding and mapped labels remain drafts, escape metadata and regenerate only explicitly', async ({ page }) => {
    const result = await setup(page)
    await page.locator('[data-tag-manual]').click(); const modal = page.locator('.v5-private-dialog')
    await modal.locator('[data-private-name]').fill('My <b>lines</b>'); await modal.locator('[data-binding]').check(); await modal.locator('[data-private-commit]').click()
    expect(result.writes).toHaveLength(0); await expect(page.locator('#v5-tag-body b')).toHaveCount(0)
    await page.locator('[data-tag-mapped]').click(); await modal.locator('[data-private-name]').fill('My theme')
    await modal.locator('[data-binding="pica|tag-0"]').check(); await modal.locator('[data-private-query]').fill('Tag 1204'); await modal.locator('[data-private-find]').click(); await modal.locator('[data-binding="pica|tag-1204"]').check(); await modal.locator('[data-private-commit]').click()
    await page.locator('[data-tag-apply]').click(); await expect.poll(() => result.writes.length).toBe(1)
    expect(result.writes[0].apply).toBe(true)
    expect(result.writes[0].tagPolicy.privateTags).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'My <b>lines</b>', kind: 'MANUAL', comicIds: ['synthetic-work'], mappings: [] }),
        expect.objectContaining({ name: 'My theme', kind: 'MAPPED', comicIds: [], mappings: ['pica|tag-0', 'pica|tag-1204'] })
    ]))
    await expect(page.locator('#v5-tag-body')).toContainText('旧批次保留');expect(result.errors).toEqual([])
})
for (const language of ['en', 'ja']) test(`tag editor works on a narrow ${language} layout without background writes`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });const result = await setup(page, language)
    await page.locator('[data-tag-none]').click();await page.locator('[data-tag-manual]').click()
    await page.locator('[data-private-name]').fill('My label');await page.locator('[data-private-cancel]').click()
    expect(result.writes).toHaveLength(0);expect(result.errors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

async function exchangeRoutes(page, fixture, invalid = false) {
    const calls = []
    await page.route('**/api/v1/desktop/recommendation-v5/tag-profile/**', async route => {
        const action = new URL(route.request().url()).pathname.split('/').pop(), input = route.request().postDataJSON();calls.push({ action, input })
        if (action === 'export') { const zip = new AdmZip();zip.addFile('edit_template.json', Buffer.from('{"changes":[]}'));await route.fulfill({ status: 200, contentType: 'application/zip', headers: { 'content-disposition': 'attachment; filename="Pica-Tag-Profile.zip"' }, body: zip.toBuffer() });return }
        if (action === 'preview') { await route.fulfill({ status: invalid ? 400 : 200, contentType: 'application/json', body: JSON.stringify(invalid ? { error: 'TAG_EXCHANGE_UNKNOWN_OR_DUPLICATE_ID' } : { previewId: 'synthetic-preview', changed: true, summary: { changedEntries: 1, participation: 0, privateLabels: 1, modeChanged: false }, details: [{ type: 'PRIVATE', after: { name: '<img src=x onerror=window.fixturePwned=1>' } }] }) });return }
        fixture.revision++;fixture.tagPolicy = action === 'undo' ? { ...fixture.tagPolicy, mode: 'ALL' } : { ...fixture.tagPolicy, mode: 'SELECTED', selected: ['pica|tag-0'] };fixture.tagExchange.canUndo = action !== 'undo'
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: fixture.revision, recommendationRefresh: null }) })
    })
    await page.locator('[data-tag-exchange] > summary').click()
    return calls
}

test('AI tag files export only opted-in fields and block exchanging unsaved drafts', async ({ page }) => {
    const result = await setup(page), calls = await exchangeRoutes(page, result.fixture)
    await page.locator('[data-tag-file-export]').click()
    await expect(page.locator('[data-tag-export-counts]')).not.toBeChecked();await expect(page.locator('[data-tag-export-works]')).not.toBeChecked()
    if (process.env.PICA_WEB_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.PICA_WEB_EVIDENCE_DIR}/ai-tag-export-privacy.png` })
    const download = page.waitForEvent('download');await page.locator('[data-tag-export-confirm]').click();expect((await download).suggestedFilename()).toBe('Pica-Tag-Profile.zip')
    expect(calls[0]).toEqual({ action: 'export', input: { includeFavoriteCounts: false, includeManualBindings: false } });expect(result.writes).toHaveLength(0)
    await page.locator('[data-tag-none]').click();await page.locator('[data-tag-exchange] > summary').click();await page.locator('[data-tag-file-export]').click()
    await expect(page.locator('[data-tag-exchange]')).toContainText('先保存或撤销');await expect(page.locator('[data-tag-export-confirm]')).toHaveCount(0)
})

test('AI import previews escaped data, cancels without writing and requires explicit confirmation', async ({ page }) => {
    const result = await setup(page), calls = await exchangeRoutes(page, result.fixture)
    const file = { name: 'STYLE_TAG_CHANGES.json', mimeType: 'application/json', buffer: Buffer.from('{"synthetic":"preview fixture"}') }
    await page.locator('[data-tag-import-file]').setInputFiles(file)
    await expect(page.locator('[data-tag-import-confirm]')).toBeEnabled();expect(calls.map(c => c.action)).toEqual(['preview'])
    if (process.env.PICA_WEB_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.PICA_WEB_EVIDENCE_DIR}/ai-tag-import-preview.png` })
    await expect(page.locator('[data-tag-import-details]')).toContainText('<img');expect(await page.evaluate(() => window.fixturePwned)).toBeUndefined()
    await page.getByRole('button', { name: '取消，不应用', exact: true }).click();expect(calls.map(c => c.action)).toEqual(['preview'])
    await page.locator('[data-tag-import-file]').setInputFiles(file);await expect(page.locator('[data-tag-import-regenerate]')).not.toBeChecked()
    await page.locator('[data-tag-import-confirm]').click();await expect(page.locator('#v5-tag-body')).toContainText('导入已保存')
    expect(calls.at(-1)).toMatchObject({ action: 'apply', input: { previewId: 'synthetic-preview', apply: false } });await expect(page.locator('[data-tag-file-undo]')).toBeEnabled()
    await page.locator('[data-tag-exchange] > summary').click();await page.locator('[data-tag-file-undo]').click()
    await expect(page.locator('#app-confirm-dialog')).toBeVisible();await page.locator('#app-confirm-submit').click()
    await expect(page.locator('#v5-tag-body')).toContainText('已撤销上次导入')
    expect(calls.at(-1)).toMatchObject({ action: 'undo', input: { apply: false } });await expect(page.locator('[data-tag-file-undo]')).toBeDisabled()
    expect(result.errors).toEqual([]);expect(result.writes).toHaveLength(0)
})

test('invalid AI imports and oversized files never offer an enabled apply action', async ({ page }) => {
    const result = await setup(page), calls = await exchangeRoutes(page, result.fixture, true)
    await page.locator('[data-tag-import-file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"bad":"id"}') })
    await expect(page.locator('.v5-private-dialog')).toContainText('校验失败');await expect(page.locator('[data-tag-import-confirm]')).toBeDisabled()
    await page.getByRole('button', { name: '取消，不应用', exact: true }).click()
    await page.locator('[data-tag-import-file]').setInputFiles({ name: 'huge.json', mimeType: 'application/json', buffer: Buffer.alloc(1024 * 1024 + 1) })
    await expect(page.locator('[data-tag-exchange]')).toContainText('不超过 1 MiB');expect(calls).toHaveLength(1);expect(result.writes).toHaveLength(0)
})

for (const language of ['zh-CN', 'en', 'ja']) test(`AI export and import previews fit a narrow ${language} screen`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });const result = await setup(page, language);await exchangeRoutes(page, result.fixture)
    await page.locator('[data-tag-file-export]').click()
    const box = await page.locator('.v5-private-dialog').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x + box.width).toBeLessThanOrEqual(391)
    expect(await page.locator('.v5-private-dialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await page.locator('.v5-private-dialog').evaluate(node => node.close())
    await page.locator('[data-tag-import-file]').setInputFiles({ name: 'changes.json', mimeType: 'application/json', buffer: Buffer.from('{}') })
    await expect(page.locator('[data-tag-import-confirm]')).toBeEnabled()
    expect(await page.locator('.v5-private-dialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    if (process.env.PICA_WEB_EVIDENCE_DIR) await page.screenshot({ path: `${process.env.PICA_WEB_EVIDENCE_DIR}/ai-tag-import-${language}.png` })
    expect(result.errors).toEqual([])
})
