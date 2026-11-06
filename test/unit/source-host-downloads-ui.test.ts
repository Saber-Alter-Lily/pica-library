import { afterEach, expect, it, vi } from 'vitest'
import { inertReadingDom } from '../helpers/fake-reading-dom'
import { inertHostWebModules } from '../helpers/inert-host-web-modules'

const HOST = '64d223e0-5d29-4320-babb-5a2da654d345',
    SESSION = '74d223e0-5d29-4320-babb-5a2da654d345'
const COMIC = 'hosted:' + HOST + ':' + 'a'.repeat(64),
    EPISODE = 'host-chapter:' + 'b'.repeat(64),
    LOCAL = 'local:' + 'c'.repeat(64),
    JOB = '94d223e0-5d29-4320-babb-5a2da654d345'
class Event {
    constructor(
        readonly type: string,
        readonly options: { detail?: unknown } = {}
    ) {}
    get detail() {
        return this.options.detail
    }
}
const cleanups: Array<() => void> = []
afterEach(() => {
    for (const close of cleanups.splice(0)) close()
})
function fixture(language = 0) {
    const dom = inertReadingDom(),
        timers = new Map<number, { action: () => void; milliseconds: number }>()
    let clock = 0,
        hasJob = false,
        stall = false,
        release = () => {}
    const opens: unknown[] = [],
        job = {
            id: JOB,
            comicId: COMIC,
            episodeId: EPISODE,
            status: 'RUNNING',
            progressCompleted: 1,
            progressTotal: 2,
            cancelRequested: false,
            phase: 'fetching',
            comicTitle: '<img inert title>',
            chapterTitle: 'Chapter 1',
            localComicId: LOCAL
        }
    const wire = vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toMatch(/^\/api\/v1\/desktop\//)
        if (url.endsWith('/status'))
            return {
                ok: true,
                json: async () => ({
                    configured: true,
                    startupReady: true,
                    csrfToken: 'synthetic-csrf',
                    hostedLibraryReader: { available: true }
                })
            }
        const input = JSON.parse(String(init?.body))
        expect((init?.headers as Record<string, string>)['x-pica-csrf']).toBe(
            'synthetic-csrf'
        )
        if (input.action === 'downloads' && stall)
            await new Promise<void>((resolve) => {
                release = resolve
            })
        const value =
            input.action === 'start'
                ? {
                      sessionId: SESSION,
                      expiresAt: Date.now() + 60000,
                      capabilities: {
                          libraryRead: true,
                          downloads: true,
                          native: false,
                          libraryImport: false
                      },
                      history: []
                  }
                : input.action === 'list'
                  ? {
                        books: [
                            {
                                comicId: COMIC,
                                sourceId: '9007199254740993',
                                title: '<img inert title>'
                            }
                        ],
                        offset: 0,
                        hasNext: false
                    }
                  : input.action === 'download-chapters'
                    ? {
                          chapters: [
                              { id: EPISODE, title: 'Chapter 1', order: 1 }
                          ]
                      }
                    : input.action === 'download-start'
                      ? ((hasJob = true), { ...job })
                      : input.action === 'downloads'
                        ? {
                              sessionBound: true,
                              jobs: hasJob ? [{ ...job }] : []
                          }
                        : input.action === 'download-cancel'
                          ? ((job.status = 'CANCELLED'), { ...job })
                          : input.action === 'close'
                            ? { closed: true }
                            : null
        if (!value) throw Error('Unexpected command')
        return { ok: true, json: async () => value }
    })
    const context = {
        exports: {},
        require: (name: string) => {
            expect(name).toBe('./locale-runtime.js')
            return { copy: (...values: string[]) => values[language] }
        },
        document: dom.document,
        window: dom.window,
        fetch: wire,
        CustomEvent: Event,
        AbortController,
        DOMException,
        Date,
        Error,
        setTimeout: (action: () => void, milliseconds: number) => {
            timers.set(++clock, { action, milliseconds })
            return clock
        },
        clearTimeout: (id: number) => timers.delete(id)
    }
    dom.document.addEventListener('pica-open-reader', (event) =>
        opens.push(event.detail)
    )
    inertHostWebModules(context, (...values) => values[language])('web/host-library.js')
    dom.document.dispatchEvent(
        new Event('pica-host-library-config', {
            detail: {
                id: HOST,
                revision: 1,
                enabled: true,
                label: 'My host',
                endpoint: 'https://host.invalid/',
                authMode: 'none'
            }
        })
    )
    const get = (id: string) =>
        dom.document.getElementById('host-library-' + id)!
    const commands = (action: string) =>
        wire.mock.calls
            .filter(
                ([, options]) =>
                    options?.body &&
                    JSON.parse(String(options.body)).action === action
            )
            .map(([, options]) => JSON.parse(String(options?.body)))
    const start = async () => {
        get('consent').checked = true
        get('form').onsubmit?.({ preventDefault() {} })
        await vi.waitFor(() =>
            expect(get('save-' + COMIC)?.disabled).toBe(false)
        )
    }
    const choose = async () => {
        await get('save-' + COMIC).click()
        await vi.waitFor(() =>
            expect(get('download-start').disabled).toBe(false)
        )
    }
    const save = () => {
        get('download-consent').checked = true
        get('download-form').onsubmit?.({ preventDefault() {} })
    }
    cleanups.push(() => {
        release()
        dom.window.dispatchEvent(new Event('pagehide'))
    })
    return {
        ...dom,
        get,
        start,
        choose,
        save,
        commands,
        wire,
        opens,
        job,
        stall: () => {
            stall = true
        },
        release: () => release(),
        poll: () => {
            const timer = [...timers].find(
                ([, value]) => value.milliseconds === 1000
            )
            if (!timer) return false
            timers.delete(timer[0])
            timer[1].action()
            return true
        },
        pollTimers: () =>
            [...timers.values()].filter((value) => value.milliseconds === 1000)
                .length
    }
}

it.each([0, 1, 2])(
    'download UI is lazy and localized; browsing/choosing a chapter is never save consent (%s)',
    async (language) => {
        const f = fixture(language)
        expect(f.wire).not.toHaveBeenCalled()
        expect(f.get('download-panel').hidden).toBe(true)
        expect(f.pollTimers()).toBe(0)
        await f.start()
        await f.choose()
        expect(f.get('download-panel').hidden).toBe(false)
        expect(f.get('download-title').textContent).toBe('<img inert title>')
        expect(f.get('download-chapter').value).toBe(EPISODE)
        expect(f.get('download-consent').checked).toBe(false)
        f.get('download-form').onsubmit?.({ preventDefault() {} })
        expect(f.commands('download-start')).toEqual([])
        expect(f.commands('downloads')).toEqual([])
        expect(f.get('download-panel').textContent).toContain(
            [
                '保存到我的本地书库',
                'Save to my local library',
                '自分のローカル書庫に保存'
            ][language]
        )
    }
)
it('explicit submit uses only selected identities/consent, protects duplicate clicks and polls only the local job view', async () => {
    const f = fixture()
    await f.start()
    await f.choose()
    f.save()
    f.save()
    await vi.waitFor(() =>
        expect(f.get('download-jobs').textContent).toContain('1/2')
    )
    expect(f.commands('download-start')).toEqual([
        {
            action: 'download-start',
            sessionId: SESSION,
            comicId: COMIC,
            episodeId: EPISODE,
            consent: true,
            acceptLocalCopy: true
        }
    ])
    expect(f.get('download-consent').checked).toBe(false)
    expect(f.pollTimers()).toBe(1)
    f.job.progressCompleted = 2
    f.job.status = 'COMPLETED'
    expect(f.poll()).toBe(true)
    await vi.waitFor(() => expect(f.get('download-read-' + JOB)).not.toBe(null))
    expect(f.pollTimers()).toBe(0)
    await f.get('download-read-' + JOB).click()
    expect(f.opens).toEqual([{ comicId: LOCAL, online: false }])
})
it('cancels only the selected job, preserving the current reading session and showing the terminal state', async () => {
    const f = fixture()
    await f.start()
    await f.choose()
    f.save()
    await vi.waitFor(() =>
        expect(f.get('download-cancel-' + JOB)).not.toBe(null)
    )
    await f.get('download-cancel-' + JOB).click()
    await vi.waitFor(() =>
        expect(f.get('download-jobs').textContent).toContain('已取消')
    )
    expect(f.commands('download-cancel')).toEqual([
        { action: 'download-cancel', sessionId: SESSION, jobId: JOB }
    ])
    expect(f.commands('close')).toEqual([])
    expect(f.get('start').disabled).toBe(true)
})
it('closing the panel stops polling without cancelling the session/job; refresh remains an explicit action', async () => {
    const f = fixture()
    await f.start()
    await f.choose()
    f.save()
    await vi.waitFor(() => expect(f.pollTimers()).toBe(1))
    const before = f.commands('downloads').length
    await f.get('hide').click()
    expect(f.poll()).toBe(false)
    expect(f.commands('downloads')).toHaveLength(before)
    expect(f.commands('download-cancel')).toEqual([])
    expect(f.commands('close')).toEqual([])
})
it('ending a session hides its job state and fences a late ignored-abort response', async () => {
    const f = fixture()
    await f.start()
    await f.choose()
    f.stall()
    f.save()
    await vi.waitFor(() => expect(f.commands('downloads')).toHaveLength(1))
    await f.get('end').click()
    f.release()
    await Promise.resolve()
    await Promise.resolve()
    expect(f.get('download-panel').hidden).toBe(true)
    expect(f.get('download-jobs').textContent).toBe('')
    expect(f.commands('close')).toHaveLength(1)
    expect(f.opens).toEqual([])
    expect(f.pollTimers()).toBe(0)
})
it('does not route an invalid local identity from a malformed completion into the Reader', async () => {
    const f = fixture()
    await f.start()
    await f.choose()
    f.job.status = 'COMPLETED'
    f.job.localComicId = 'https://outside.invalid/'
    f.save()
    await vi.waitFor(() =>
        expect(f.get('download-jobs').textContent).toContain('暂时无法读取')
    )
    expect(f.get('download-read-' + JOB)).toBe(null)
    expect(f.opens).toEqual([])
})
