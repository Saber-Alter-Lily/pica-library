import fs from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { inertReadingDom } from '../helpers/fake-reading-dom'
import { inertHostWebModules } from '../helpers/inert-host-web-modules'

const SESSION = '74d223e0-5d29-4320-babb-5a2da654d345',
    OTHER = '84d223e0-5d29-4320-babb-5a2da654d345',
    JOB = '94d223e0-5d29-4320-babb-5a2da654d345',
    LOCAL = 'local:' + 'a'.repeat(64)
class Event {
    constructor(readonly type: string) {}
}
type View = { refresh(): Promise<void>; dispose(): void }
const cleanups: Array<() => void> = []
afterEach(() => {
    for (const close of cleanups.splice(0)) close()
})
function fixture(initialLanguage = 0) {
    const dom = inertReadingDom(),
        target = dom.document.createElement('section'),
        boundary = dom.document.createElement('button')
    target.id = 'host-downloads'
    dom.body.append(target, boundary)
    let sequence = 0,
        visible = false,
        allowed = true,
        modal = false,
        language = initialLanguage,
        scope: string | null = SESSION
    let stallQuery = false,
        stallCancel = false,
        failQuery = false
    const releases: Array<() => void> = [],
        timers = new Map<number, { action: () => void; milliseconds: number }>()
    const job = {
        id: JOB,
        status: 'RUNNING',
        progressCompleted: 1,
        progressTotal: 2,
        cancelRequested: false,
        phase: 'fetching',
        comicTitle: '<img inert title>',
        chapterTitle: 'Chapter 1',
        localComicId: LOCAL
    }
    const query = vi.fn(async (_scope: string, _signal: AbortSignal) => {
        const value = structuredClone({ sessionBound: true, jobs: [job] })
        if (stallQuery) {
            stallQuery = false
            await new Promise<void>((resolve) => {
                releases.push(resolve)
            })
        }
        if (failQuery) {
            failQuery = false
            throw Error('https://never-expose.invalid/?credential=secret')
        }
        return value
    })
    const cancel = vi.fn(
        async (_scope: string, _job: string, _signal: AbortSignal) => {
            if (stallCancel) {
                stallCancel = false
                await new Promise<void>((resolve) => {
                    releases.push(resolve)
                })
            }
            job.status = 'CANCELLED'
        }
    )
    const openReader = vi.fn(async (_comic: string, _online: boolean) => {})
    const load = inertHostWebModules(
        {
            document: dom.document,
            window: dom.window,
            AbortController,
            Error,
            setTimeout: (action: () => void, milliseconds: number) => {
                timers.set(++sequence, { action, milliseconds })
                return sequence
            },
            clearTimeout: (id: number) => timers.delete(id)
        },
        (...values) => values[language]
    )
    const install = load('web/host-downloads.js')
        .installHostedDownloadProjection as (
        options: Record<string, unknown>
    ) => View
    const options = {
        target,
        boundaryNote: boundary,
        canQuery: () => allowed,
        isVisible: () => visible && !modal,
        hostSession: () => (scope ? { sessionId: scope } : null),
        query,
        cancel,
        openReader
    }
    const view = install(options)
    const get = (id: string) => dom.document.getElementById(id)
    const event = (name: string) => dom.document.dispatchEvent(new Event(name))
    cleanups.push(() => {
        for (const release of releases) release()
        view.dispose()
    })
    return {
        ...dom,
        target,
        boundary,
        job,
        view,
        get,
        query,
        cancel,
        openReader,
        event,
        install,
        options,
        visible: (value = true) => {
            visible = value
        },
        allowed: (value: boolean) => {
            allowed = value
        },
        modal: (value: boolean) => {
            modal = value
        },
        scope: (value: string | null) => {
            scope = value
        },
        language: (value: number) => {
            language = value
        },
        stallQuery: () => {
            stallQuery = true
        },
        stallCancel: () => {
            stallCancel = true
        },
        failQuery: () => {
            failQuery = true
        },
        release: () => {
            for (const release of releases.splice(0)) release()
        },
        pollCount: () =>
            [...timers.values()].filter((timer) => timer.milliseconds === 1000)
                .length,
        poll: () => {
            const timer = [...timers].find(
                ([, value]) => value.milliseconds === 1000
            )
            if (!timer) return false
            timers.delete(timer[0])
            timer[1].action()
            return true
        }
    }
}

it.each([0, 1, 2])(
    'constructing/opening an ungranted projection is lazy and localized (%s)',
    async (language) => {
        const f = fixture(language)
        expect(f.query).not.toHaveBeenCalled()
        expect(f.cancel).not.toHaveBeenCalled()
        expect(f.target.hidden).toBe(true)
        expect(f.pollCount()).toBe(0)
        await f.view.refresh()
        expect(f.query).not.toHaveBeenCalled()
        f.visible()
        f.allowed(false)
        await f.view.refresh()
        expect(f.target.hidden).toBe(true)
        f.allowed(true)
        f.scope(null)
        await f.view.refresh()
        expect(f.query).not.toHaveBeenCalled()
        expect(f.get('host-downloads-refresh')!.disabled).toBe(true)
        expect(f.target.textContent).toContain(
            ['当前没有可查询', 'No authorized Host-save', '参照できるホスト'][
                language
            ]
        )
        expect(f.boundary.dataset.infoTip).toContain(
            ['重启不会自动恢复', 'Restart does not resume', '自動再開しません'][
                language
            ]
        )
    }
)
it('projects the same scoped jobs safely, keeps Host identities out of legacy SQL controls and polls only while visible/active', async () => {
    const f = fixture()
    f.visible()
    await f.view.refresh()
    expect(f.query).toHaveBeenCalledWith(SESSION, expect.any(AbortSignal))
    expect(f.target.textContent).toContain('<img inert title>')
    expect(f.target.textContent).toContain('1/2')
    const card = f.get('host-downloads-list')!.children[0]
    expect(card.dataset.hostJobId).toBe(JOB)
    expect(card.dataset.jobId).toBeUndefined()
    expect(f.pollCount()).toBe(1)
    expect(f.poll()).toBe(true)
    await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(f.pollCount()).toBe(1))
    f.visible(false)
    await f.view.refresh()
    expect(f.pollCount()).toBe(0)
    expect(f.poll()).toBe(false)
    expect(f.cancel).not.toHaveBeenCalled()
})
it('aborts hidden-page status reads and fences a deliberately ignored-abort late snapshot without cancelling any task', async () => {
    const f = fixture()
    f.visible()
    f.stallQuery()
    const pending = f.view.refresh()
    await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(1))
    f.visible(false)
    await f.view.refresh()
    expect(f.query.mock.calls[0][1].aborted).toBe(true)
    f.release()
    await pending
    expect(f.get('host-downloads-list')!.children).toHaveLength(0)
    expect(f.pollCount()).toBe(0)
    expect(f.cancel).not.toHaveBeenCalled()
})
it('cancel addresses one current-session job, deduplicates clicks and reloads only its projection', async () => {
    const f = fixture()
    f.visible()
    await f.view.refresh()
    f.stallCancel()
    const button = f.get('host-task-cancel-' + JOB)!,
        pending = button.click()
    await button.click()
    expect(f.cancel).toHaveBeenCalledTimes(1)
    expect(f.cancel).toHaveBeenCalledWith(SESSION, JOB, expect.any(AbortSignal))
    f.release()
    await pending
    expect(f.query).toHaveBeenCalledTimes(2)
    expect(f.target.textContent).toContain('已取消')
    expect(f.pollCount()).toBe(0)
    expect(f.get('host-task-cancel-' + JOB)).toBe(null)
})
it('leaving during a cancel fences its late UI result; it does not replay the mutation or reload a hidden view', async () => {
    const f = fixture()
    f.visible()
    await f.view.refresh()
    f.stallCancel()
    const pending = f.get('host-task-cancel-' + JOB)!.click()
    f.visible(false)
    await f.view.refresh()
    expect(f.cancel.mock.calls[0][2].aborted).toBe(true)
    f.release()
    await pending
    expect(f.cancel).toHaveBeenCalledTimes(1)
    expect(f.query).toHaveBeenCalledTimes(1)
    expect(f.pollCount()).toBe(0)
})
it('completed copies route to the existing local Reader, never to an online source or a new downloader', async () => {
    const f = fixture()
    f.visible()
    f.job.status = 'COMPLETED'
    f.job.progressCompleted = 2
    await f.view.refresh()
    await f.get('host-task-read-' + JOB)!.click()
    expect(f.openReader).toHaveBeenCalledTimes(1)
    expect(f.openReader).toHaveBeenCalledWith(LOCAL, false)
    expect(f.cancel).not.toHaveBeenCalled()
    expect(f.pollCount()).toBe(0)
})
it('a malformed completion cannot leave an actionable stale card or send a raw URL into the Reader', async () => {
    const f = fixture()
    f.visible()
    f.job.status = 'COMPLETED'
    f.job.progressCompleted = 2
    await f.view.refresh()
    const old = f.get('host-task-read-' + JOB)!
    f.job.localComicId = 'https://outside.invalid/'
    await f.view.refresh()
    expect(f.get('host-task-read-' + JOB)).toBe(null)
    await old.click()
    expect(f.openReader).not.toHaveBeenCalled()
    expect(f.target.textContent).toContain('暂时无法读取')
})
it('ending/changing a scope clears its records and prevents detached buttons from acting on a new session', async () => {
    const f = fixture()
    f.visible()
    await f.view.refresh()
    const old = f.get('host-task-cancel-' + JOB)!
    f.scope(null)
    f.event('pica-hosted-reading-scope-changed')
    expect(f.get('host-downloads-list')!.children).toHaveLength(0)
    await old.click()
    expect(f.cancel).not.toHaveBeenCalled()
    f.scope(OTHER)
    f.event('pica-hosted-reading-scope-changed')
    await vi.waitFor(() =>
        expect(f.query).toHaveBeenLastCalledWith(OTHER, expect.any(AbortSignal))
    )
})
it('a new-scope response wins over a pending old-scope response', async () => {
    const f = fixture()
    f.visible()
    f.stallQuery()
    f.job.comicTitle = 'OLD SCOPE'
    const old = f.view.refresh()
    f.scope(OTHER)
    f.job.comicTitle = 'NEW SCOPE'
    f.event('pica-hosted-reading-scope-changed')
    await vi.waitFor(() => expect(f.target.textContent).toContain('NEW SCOPE'))
    f.release()
    await old
    expect(f.target.textContent).not.toContain('OLD SCOPE')
    expect(f.target.textContent).toContain('NEW SCOPE')
})
it('errors reveal no raw exception, schedule no retries, and an explicit refresh remains available', async () => {
    const f = fixture()
    f.visible()
    f.failQuery()
    await f.view.refresh()
    expect(f.target.textContent).toContain('未启动或重试')
    expect(f.target.textContent).not.toContain('credential')
    expect(f.pollCount()).toBe(0)
    expect(f.query).toHaveBeenCalledTimes(1)
    await f.get('host-downloads-refresh')!.click()
    await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(2))
})
it('the Host modal pauses the underlying projection, and closing it resumes a single current-scope query', async () => {
    const f = fixture()
    f.visible()
    await f.view.refresh()
    f.modal(true)
    f.event('pica-hosted-download-panel-changed')
    expect(f.pollCount()).toBe(0)
    f.event('pica-hosted-downloads-changed')
    expect(f.query).toHaveBeenCalledTimes(1)
    f.modal(false)
    f.event('pica-hosted-download-panel-changed')
    await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(f.pollCount()).toBe(1))
})
it('language refresh updates both groups without starting jobs or extending the grant', async () => {
    const f = fixture()
    f.visible()
    await f.view.refresh()
    f.language(2)
    f.event('pica-language-change')
    await vi.waitFor(() =>
        expect(f.target.textContent).toContain('自分のホストセッションの保存')
    )
    expect(f.query).toHaveBeenLastCalledWith(SESSION, expect.any(AbortSignal))
    expect(f.cancel).not.toHaveBeenCalled()
})
it('dispose/page exit clears owned records and stops callbacks, timers and stale actions', async () => {
    const f = fixture()
    f.visible()
    await f.view.refresh()
    const old = f.get('host-task-cancel-' + JOB)!,
        calls = f.query.mock.calls.length
    f.view.dispose()
    f.event('pica-hosted-reading-scope-changed')
    f.event('pica-hosted-downloads-changed')
    await old.click()
    await f.view.refresh()
    expect(f.target.hidden).toBe(true)
    expect(f.target.children).toHaveLength(0)
    expect(f.pollCount()).toBe(0)
    expect(f.query).toHaveBeenCalledTimes(calls)
    expect(f.cancel).not.toHaveBeenCalled()
})
it('page exit and hidden tabs stop polling; returning without a grant never creates or restores source authority', async () => {
    const f = fixture()
    f.visible()
    await f.view.refresh()
    f.visible(false)
    f.event('visibilitychange')
    expect(f.pollCount()).toBe(0)
    f.visible()
    f.event('visibilitychange')
    await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(f.pollCount()).toBe(1))
    f.window.dispatchEvent(new Event('pagehide'))
    const calls = f.query.mock.calls.length
    f.event('pica-hosted-downloads-changed')
    await f.view.refresh()
    expect(f.query).toHaveBeenCalledTimes(calls)
    expect(f.get('host-downloads-list')!.children).toHaveLength(0)
    expect(f.pollCount()).toBe(0)
    f.scope(null)
    f.window.dispatchEvent(new Event('pageshow'))
    expect(f.query).toHaveBeenCalledTimes(calls)
    expect(f.target.textContent).toContain('当前没有可查询')
})
it('the actual app wires shared scope/query/cancel ports inside Downloads and does not repurpose platform queue actions', () => {
    const app = fs.readFileSync('web/app.js', 'utf8'),
        html = fs.readFileSync('web/index.html', 'utf8')
    const start = html.indexOf('<section id="downloads"'),
        end = html.indexOf('<section id="downloaded"')
    expect(start).toBeGreaterThan(-1)
    expect(html.slice(start, end)).toContain('id="host-downloads"')
    expect(app).toContain("target: $('#host-downloads')")
    expect(app).toContain(
        'hostSession: currentHostedDownloadSession, query: queryHostedLocalDownloads, cancel: cancelHostedLocalDownload'
    )
    expect(app).toContain(
        "activeView === 'downloads' && !document.hidden && !document.getElementById('host-library-dialog')?.open"
    )
    const projection =
        fs.readFileSync('web/host-downloads.js', 'utf8') +
        fs.readFileSync('web/host-download-view.js', 'utf8')
    expect(projection).not.toMatch(
        /fetch\(|localStorage|sessionStorage|\.innerHTML|insertAdjacentHTML|setInterval|download-start|download-chapters|\/api\/v1\/downloads/
    )
})
