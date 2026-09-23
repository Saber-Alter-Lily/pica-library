import { expect, test } from '@playwright/test'

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO0sAAAAASUVORK5CYII='

test('Remote Web read-only shell supports login, browse, detail and downloaded reader', async ({ page }) => {
    const pageErrors = []
    const consoleErrors = []
    const requests = []

    page.on('pageerror', (error) =>
        pageErrors.push(String(error?.stack || error))
    )
    page.on('console', (message) => {
        if (
            message.type() === 'error' &&
            !message.text().includes('Failed to load resource')
        )
            consoleErrors.push(message.text())
    })

    await page.route('**/remote/v1/session', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Browser session required' })
            })
            return
        }
        await route.fallback()
    })

    await page.route('**/remote/v1/session/bootstrap', async (route) => {
        requests.push({
            path: '/remote/v1/session/bootstrap',
            authorization: route.request().headers().authorization || ''
        })
        await route.fulfill({
            status: 201,
            headers: {
                'content-type': 'application/json',
                'set-cookie':
                    '__Host-pica_session=fixture-session; Path=/; HttpOnly; Secure; SameSite=Strict'
            },
            body: JSON.stringify({
                authenticated: true,
                csrfToken: 'fixture-csrf',
                expiresAt: new Date(Date.now() + 60_000).toISOString()
            })
        })
    })

    await page.route('**/remote/v1/session/logout', async (route) => {
        requests.push({
            path: '/remote/v1/session/logout',
            csrf: route.request().headers()['x-pica-csrf'] || ''
        })
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ authenticated: false })
        })
    })

    await page.route('**/api/v1/library/query', async (route) => {
        requests.push({
            path: '/api/v1/library/query',
            csrf: route.request().headers()['x-pica-csrf'] || '',
            body: route.request().postDataJSON()
        })
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                total: 2,
                query: { scope: 'library' },
                items: [
                    {
                        comicId: 'remote-1',
                        title: 'Remote Fixture One',
                        author: 'Fixture Author',
                        canonicalAuthor: 'Fixture Author',
                        tags: ['Drama', 'Remote'],
                        downloadedPictures: 2
                    },
                    {
                        comicId: 'remote-2',
                        title: 'Remote Fixture Two',
                        author: 'Second Author',
                        tags: ['Comedy'],
                        downloadedPictures: 0
                    }
                ]
            })
        })
    })

    await page.route('**/api/v1/shelves', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                { id: 'shelf-1', name: 'Favorites', count: 1 }
            ])
        })
    })

    await page.route('**/api/v1/shelves/shelf-1', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                shelf: { id: 'shelf-1', name: 'Favorites', count: 1 },
                items: [
                    {
                        comicId: 'remote-1',
                        title: 'Remote Fixture One',
                        author: 'Fixture Author',
                        tags: ['Drama'],
                        downloadedPictures: 2
                    }
                ]
            })
        })
    })

    await page.route('**/api/v1/downloaded', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    comicId: 'remote-1',
                    title: 'Remote Fixture One',
                    author: 'Fixture Author',
                    downloadedChapters: 1,
                    knownChapters: 1,
                    downloadedPictures: 2
                }
            ])
        })
    })

    await page.route('**/api/v1/comics/remote-1', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                comicId: 'remote-1',
                title: 'Remote Fixture One',
                author: 'Fixture Author',
                canonicalAuthor: 'Fixture Author',
                tags: ['Drama', 'Remote'],
                downloadedPictures: 2,
                knownChapters: 1,
                finished: true
            })
        })
    })

    await page.route('**/api/v1/reader/comics/remote-1/chapters', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    id: 'episode-1',
                    title: 'Chapter One',
                    downloadedPictures: 2
                }
            ])
        })
    })

    await page.route(
        '**/api/v1/reader/comics/remote-1/chapters/episode-1',
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    episode: { id: 'episode-1', title: 'Chapter One' },
                    pages: [
                        {
                            id: 'page-1',
                            position: 1,
                            url: '/api/v1/reader/pictures/page-1'
                        },
                        {
                            id: 'page-2',
                            position: 2,
                            url: '/api/v1/reader/pictures/page-2'
                        }
                    ]
                })
            })
        }
    )

    await page.route('**/api/v1/covers/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: Buffer.from(png, 'base64')
        })
    })

    await page.route('**/api/v1/reader/pictures/**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: Buffer.from(png, 'base64')
        })
    })

    await page.goto('/remote/', { waitUntil: 'domcontentloaded' })

    await expect(page.locator('#auth-panel')).toBeVisible()
    await expect(page.locator('#app-shell')).toBeHidden()

    await page.locator('#bearer-input').fill('fixture-bearer-token')
    await page.locator('#auth-form button[type="submit"]').click()

    await expect(page.locator('#app-shell')).toBeVisible()
    await expect(page.locator('#bearer-input')).toHaveValue('')
    await expect(page.locator('#library-results .card')).toHaveCount(2)
    await expect(page.locator('#library-count')).toContainText('2')

    const bootstrap = requests.find(
        (request) => request.path === '/remote/v1/session/bootstrap'
    )
    expect(bootstrap?.authorization).toBe('Bearer fixture-bearer-token')

    const query = requests.find(
        (request) => request.path === '/api/v1/library/query'
    )
    expect(query?.csrf).toBe('fixture-csrf')
    expect(query?.body?.scope).toBe('library')

    await page.locator('#library-results .card').first().getByRole('button', {
        name: '查看'
    }).click()
    await expect(page.locator('#detail-panel')).toBeVisible()
    await expect(page.locator('#detail-title')).toHaveText('Remote Fixture One')
    await expect(page.locator('#detail-read')).toBeEnabled()

    await page.locator('#detail-read').click()
    await expect(page.locator('#reader-panel')).toBeVisible()
    await expect(page.locator('#reader-title')).toHaveText('Remote Fixture One')
    await expect(page.locator('#reader-position')).toHaveText('1 / 2')
    await page.locator('#reader-next').click()
    await expect(page.locator('#reader-position')).toHaveText('2 / 2')
    await expect(page.locator('#reader-next')).toBeDisabled()

    await page.locator('#reader-close').click()
    await page.locator('.tabs [data-view="shelves"]').click()
    await expect(page.locator('#shelf-list button')).toHaveCount(1)
    await expect(page.locator('#shelf-items .card')).toHaveCount(1)

    await page.locator('.tabs [data-view="downloaded"]').click()
    await expect(page.locator('#downloaded-results .card')).toHaveCount(1)

    await page.locator('#language-select').selectOption('en')
    await expect(page.locator('h1')).toHaveText('Remote Library')
    await expect(page.locator('#logout')).toHaveText('Sign out')

    await page.locator('#logout').click()
    await expect(page.locator('#auth-panel')).toBeVisible()
    await expect(page.locator('#app-shell')).toBeHidden()

    const logout = requests.find(
        (request) => request.path === '/remote/v1/session/logout'
    )
    expect(logout?.csrf).toBe('fixture-csrf')

    expect(
        await page.evaluate(() => Object.keys(localStorage))
    ).toEqual([])
    expect(
        await page.evaluate(() => Object.keys(sessionStorage))
    ).toEqual([])

    expect(pageErrors, pageErrors.join('\n\n')).toEqual([])
    expect(consoleErrors, consoleErrors.join('\n\n')).toEqual([])
})
