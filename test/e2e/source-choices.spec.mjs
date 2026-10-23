import { expect, test } from '@playwright/test'

for (const [language, title, read, save] of [
    ['zh-CN', '外部漫画来源 · 可选', '读取当前选择', '保存来源选择'],
    [
        'en',
        'External comic sources · optional',
        'Read current choices',
        'Save source choices'
    ],
    [
        'ja',
        '外部漫画配信元 · オプション',
        '現在の選択を読み込む',
        '配信元の選択を保存'
    ]
])
    test(`source choices are explicit, draft-only until Save, persistent and CAS protected (${language})`, async ({
        page
    }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.addInitScript((language) => {
            localStorage.setItem('pica-library-language', language)
            localStorage.setItem(
                'pica-onboarding-state-v1',
                JSON.stringify({ completedVersion: 2, autoShow: false })
            )
        }, language)
        let policy = { schemaVersion: 1, revision: 0, enabled: [] },
            stale = false
        const writes = [],
            errors = [],
            network = []
        page.on('pageerror', (error) => errors.push(String(error)))
        await page.route('**/api/v1/**', async (route) => {
            const request = route.request(),
                url = new URL(request.url())
            network.push(`${request.method()} ${url.pathname}`)
            let body = { error: 'synthetic-source-fixture' },
                status = 503
            if (url.pathname === '/api/v1/desktop/status') {
                status = 200
                body = {
                    configured: true,
                    startupReady: true,
                    csrfToken: 'synthetic-source-csrf',
                    externalSources: policy,
                    sourcePolicyOrigin: 'explicit'
                }
            } else if (
                url.pathname === '/api/v1/desktop/settings' &&
                request.method() === 'POST'
            ) {
                const value = request.postDataJSON()
                writes.push(value)
                expect(request.headers()['x-pica-csrf']).toBe(
                    'synthetic-source-csrf'
                )
                if (stale) {
                    status = 409
                    body = {
                        error: 'Source choices changed; refresh before saving'
                    }
                } else {
                    expect(value.expectedRevision).toBe(policy.revision)
                    policy = {
                        schemaVersion: 1,
                        revision: policy.revision + 1,
                        enabled: value.enabled
                    }
                    status = 200
                    body = { success: true, externalSources: policy }
                }
            }
            await route.fulfill({
                status,
                contentType: 'application/json',
                body: JSON.stringify(body)
            })
        })
        async function open() {
            await page.goto('/', { waitUntil: 'domcontentloaded' })
            if (await page.locator('#pica-disclaimer-gate').isVisible()) {
                await page.locator('#pica-disclaimer-check').check()
                await page.locator('#pica-disclaimer-accept').click()
            }
            await page.locator('nav [data-view="maintenance"]').click()
            await expect(
                page.locator('#a87-general-panel #settings-source-choices')
            ).toBeVisible()
            await expect(page.locator('#source-choices-title')).toHaveText(
                title
            )
            await expect(page.locator('#source-choices-save')).toBeDisabled()
            await page.getByRole('button', { name: read, exact: true }).click()
            await expect(page.locator('#source-choices-save')).toBeEnabled()
        }
        await open()
        for (const source of ['pica', 'eh', 'jm'])
            await expect(
                page.locator(`input[name="source"][value="${source}"]`)
            ).not.toBeChecked()
        await page.locator('input[name="source"][value="eh"]').check()
        expect(writes).toHaveLength(0)
        await page.getByRole('button', { name: save, exact: true }).click()
        await expect.poll(() => writes.length).toBe(1)
        expect(writes[0]).toEqual({
            sourceAction: 'save',
            enabled: ['eh'],
            expectedRevision: 0
        })
        await expect(page.locator('#source-choices-save')).toBeEnabled()
        await open()
        await expect(
            page.locator('input[name="source"][value="eh"]')
        ).toBeChecked()
        stale = true
        await page.locator('input[name="source"][value="jm"]').check()
        await page.getByRole('button', { name: save, exact: true }).click()
        await expect(page.locator('#source-choices-state')).toContainText(
            'refresh before saving'
        )
        await expect(page.locator('#source-choices-save')).toBeDisabled()
        await page.getByRole('button', { name: read, exact: true }).click()
        await expect(
            page.locator('input[name="source"][value="jm"]')
        ).not.toBeChecked()
        expect(errors).toEqual([])
        expect(
            network.filter((line) =>
                /sources\/jm|recommendations|eh\/search|online-reader/.test(
                    line
                )
            )
        ).toEqual([])
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1
            )
        ).toBe(true)
    })
