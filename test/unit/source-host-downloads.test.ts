import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HostedLibraryReader } from '../../src/source-hosts/library-reader'
import { SourceHostConnections } from '../../src/source-hosts/connections'
import { LibraryDatabase } from '../../src/library/database'
import { LocalLibraryIngestion } from '../../src/local-library/ingestion'
import { ReaderService } from '../../src/services/reader-service'
import { RuntimeResourceCoordinator } from '../../src/runtime/resource-coordinator'
import { build } from 'esbuild'

const HOST = '64d223e0-5d29-4320-babb-5a2da654d345'
const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6FkwAAAAASUVORK5CYII=',
    'base64'
)
const cleanups: Array<() => Promise<void>> = []
type Job = {
    id: string
    status: string
    localComicId?: string
    localEpisodeId?: string
    progressCompleted: number
    progressTotal: number
    cancelRequested: boolean
    phase: string
    error: string | null
}
afterEach(async () => {
    for (const close of cleanups.splice(0)) await close()
})
function fixture(basic = false) {
    const root = fs.realpathSync.native(
            fs.mkdtempSync(path.join(os.tmpdir(), 'pica-host-save-'))
        ),
        dataDir = path.join(root, 'data')
    fs.mkdirSync(dataDir)
    let db = new LibraryDatabase(path.join(dataDir, 'library.db')),
        stored: unknown = null,
        clock = 1000
    db.setAppState('protected-recommendation-visual-tags-sync', {
        visual: 'OFF',
        batch: 'unchanged'
    })
    const resources = new RuntimeResourceCoordinator({
        mode: 'enforce',
        budgets: {
            'filesystem-heavy': 1,
            'media-network': 1,
            'sqlite-write-heavy': 1
        }
    })
    const connections = new SourceHostConnections(
        {
            load: () => stored,
            save: (value) => {
                stored = structuredClone(value)
            }
        },
        {
            inspect: async () => {
                throw Error('Unexpected inspection')
            }
        },
        () => HOST
    )
    connections.command({
        action: 'save',
        kind: 'suwayomi',
        label: 'My host',
        endpoint: 'https://host.invalid/owned/',
        authMode: basic ? 'basic' : 'none',
        allowInsecureLan: false,
        consent: true,
        scope: 'inspect-only'
    })
    connections.command({
        action: 'set-enabled',
        id: HOST,
        expectedRevision: 0,
        enabled: true,
        consent: true
    })
    const manga = {
        id: 1,
        sourceId: '9007199254740993',
        url: '/private-book',
        title: 'Chosen book',
        inLibrary: true
    }
    const chapters = [1, 2].map((number, index) => ({
        id: number + 10,
        mangaId: 1,
        url: '/chapter-' + number,
        name: 'Chapter ' + number,
        sourceOrder: index,
        pageCount: 2,
        chapterNumber: number
    }))
    const calls: Array<{ operation: string; url: string }> = [],
        releases: Array<() => void> = []
    let stallAt = -1,
        failAt = -1,
        delayCommit = false,
        commitRelease: (() => void) | undefined
    const wire = vi.fn(
        async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
            const request = init?.body ? JSON.parse(String(init.body)) : null,
                operation = request?.operationName ?? 'IMAGE'
            calls.push({ operation, url: String(url) })
            if (operation === 'IMAGE') {
                const index = Number(String(url).split('/').at(-1))
                if (index === stallAt)
                    await new Promise<void>((resolve) => {
                        releases.push(resolve)
                    }) // deliberately ignores AbortSignal
                if (index === failAt)
                    throw Error(
                        'Never expose https://private.invalid/?password=secret'
                    )
                return new Response(png, {
                    headers: { 'content-type': 'image/png' }
                })
            }
            const chapter =
                chapters.find(
                    (chapter) => chapter.id === request?.variables?.id
                ) ?? chapters[0]
            const value =
                operation === 'PicaSourceHostInfo'
                    ? {
                          aboutServer: {
                              name: 'Suwayomi-Server',
                              version: '2.4.2366'
                          }
                      }
                    : operation === 'PicaHostLibrary'
                      ? {
                            mangas: {
                                nodes: [manga],
                                pageInfo: { hasNextPage: false }
                            }
                        }
                      : operation === 'PicaHostManga'
                        ? { manga: { ...manga, chapters: { nodes: chapters } } }
                        : operation === 'PicaHostChapter'
                          ? { chapter }
                          : operation === 'PicaHostChapterPages'
                            ? {
                                  fetchChapterPages: {
                                      chapter,
                                      pages: Array.from(
                                          { length: chapter.pageCount },
                                          (_, index) =>
                                              `/api/v1/manga/1/chapter/${chapter.sourceOrder}/page/${index}`
                                      )
                                  }
                              }
                            : null
            if (!value) throw Error('Unexpected operation ' + operation)
            return new Response(JSON.stringify({ data: value }), {
                headers: { 'content-type': 'application/json' }
            })
        }
    )
    const importer = new LocalLibraryIngestion(db, dataDir)
    const reader = new HostedLibraryReader(
        connections,
        db,
        () => ({
            get: () => null,
            put: () => {
                throw Error('Downloads must not use the transient Reader cache')
            }
        }),
        wire,
        () => clock,
        {
            resources,
            saveChapter: async (input) => {
                const result = await importer.importGeneratedChapter(input)
                if (delayCommit)
                    await new Promise<void>((resolve) => {
                        commitRelease = resolve
                    })
                return result
            }
        }
    )
    const command = async <T = unknown>(
        input: Record<string, unknown>,
        signal = new AbortController().signal
    ) => (await reader.command(input, signal)) as T
    const start = async () =>
        await command<{
            sessionId: string
            capabilities: { downloads: boolean; native: boolean }
        }>({
            action: 'start',
            id: HOST,
            expectedRevision: 1,
            consent: true,
            scope: 'library-read',
            acceptHostFetchSideEffects: true,
            auth: basic
                ? {
                      mode: 'basic',
                      username: 'private-user',
                      password: 'private-pass'
                  }
                : { mode: 'none' }
        })
    const choose = async (sessionId: string) => {
        const page = await command<{ books: Array<{ comicId: string }> }>({
            action: 'list',
            sessionId
        })
        const comicId = page.books[0].comicId
        const value = await command<{ chapters: Array<{ id: string }> }>({
            action: 'download-chapters',
            sessionId,
            comicId
        })
        return {
            comicId,
            episodeId: value.chapters[0].id,
            laterEpisodeId: value.chapters[1].id
        }
    }
    const jobs = async (sessionId: string) =>
        (await command<{ jobs: Job[] }>({ action: 'downloads', sessionId }))
            .jobs
    const save = async (
        sessionId: string,
        comicId: string,
        episodeId: string
    ) =>
        await command<Job>({
            action: 'download-start',
            sessionId,
            comicId,
            episodeId,
            consent: true,
            acceptLocalCopy: true
        })
    const finished = async (
        sessionId: string,
        id: string,
        status = 'COMPLETED'
    ) => {
        let job!: Job
        await vi.waitFor(async () => {
            job = (await jobs(sessionId)).find((job) => job.id === id)!
            expect(job.status).toBe(status)
        })
        return job
    }
    cleanups.push(async () => {
        for (const release of releases) release()
        commitRelease?.()
        await reader.close()
        db.close()
        if (
            path.dirname(root) === root ||
            !path.basename(root).startsWith('pica-host-save-')
        )
            throw Error('Unsafe fixture cleanup')
        fs.rmSync(root, { recursive: true, force: true })
    })
    return {
        reader,
        connections,
        resources,
        dataDir,
        manga,
        chapters,
        calls,
        wire,
        command,
        start,
        choose,
        jobs,
        save,
        finished,
        get db() {
            return db
        },
        release: () => {
            for (const release of releases.splice(0)) release()
            commitRelease?.()
        },
        stall: (index: number) => {
            stallAt = index
        },
        fail: (index: number) => {
            failAt = index
        },
        advance: () => {
            clock += 16 * 60 * 1000
        },
        delayCommit: () => {
            delayCommit = true
        },
        reopen: () => {
            db.close()
            db = new LibraryDatabase(path.join(dataDir, 'library.db'))
            return db
        }
    }
}

describe('explicit hosted chapter saves — existing scheduler + actual SQLite/inventory/Reader, fake HTTP only', () => {
    it('does nothing on construction; advertises the wired Desktop capability but not native or automatic jobs', async () => {
        const f = fixture()
        expect(f.calls).toEqual([])
        expect(f.reader.busy).toBe(false)
        expect(f.db.listDownloadJobs()).toEqual([])
        const session = await f.start()
        expect(session.capabilities).toMatchObject({
            downloads: true,
            native: false
        })
        const calls = f.calls.length
        expect(await f.jobs(session.sessionId)).toEqual([])
        expect(f.calls).toHaveLength(calls)
        expect(f.db.listComics({})).toEqual([])
    })
    it('requires separate explicit save consent and actual chapter selection; rejects path/URL injection without work', async () => {
        const f = fixture(),
            { sessionId } = await f.start(),
            ids = await f.choose(sessionId),
            before = f.calls.length
        for (const patch of [
            { consent: false },
            { acceptLocalCopy: false },
            { url: 'https://outside.invalid/' },
            { path: '../escape' },
            { episodeId: 'host-chapter:' + 'f'.repeat(64) }
        ]) {
            await expect(
                f.command({
                    action: 'download-start',
                    sessionId,
                    comicId: ids.comicId,
                    episodeId: ids.episodeId,
                    consent: true,
                    acceptLocalCopy: true,
                    ...patch
                })
            ).rejects.toThrow()
        }
        expect(await f.jobs(sessionId)).toEqual([])
        expect(f.calls).toHaveLength(before)
        expect(f.db.listComics({})).toEqual([])
    })
    it('bounds chapter pages before body retrieval and retains an empty local library on rejection', async () => {
        const f = fixture(),
            { sessionId } = await f.start(),
            ids = await f.choose(sessionId)
        f.chapters[0].pageCount = 2001
        const job = await f.finished(
            sessionId,
            (await f.save(sessionId, ids.comicId, ids.episodeId)).id,
            'FAILED'
        )
        expect(job.error).toBe('SOURCE_HOST_TOO_LARGE')
        expect(f.calls.filter((call) => call.operation === 'IMAGE')).toEqual([])
        expect(f.db.listComics({})).toEqual([])
    })
    it('bounds active session jobs at twenty without starting extra network work', async () => {
        const f = fixture(),
            { sessionId } = await f.start()
        for (let index = 3; index <= 21; index++)
            f.chapters.push({
                id: index + 10,
                mangaId: 1,
                url: '/chapter-' + index,
                name: 'Chapter ' + index,
                sourceOrder: index - 1,
                pageCount: 2,
                chapterNumber: index
            })
        const page = await f.command<{ books: Array<{ comicId: string }> }>({
            action: 'list',
            sessionId
        })
        const comicId = page.books[0].comicId
        const listed = await f.command<{ chapters: Array<{ id: string }> }>({
            action: 'download-chapters',
            sessionId,
            comicId
        })
        f.stall(0)
        for (const chapter of listed.chapters.slice(0, 20))
            await f.save(sessionId, comicId, chapter.id)
        await expect(
            f.save(sessionId, comicId, listed.chapters[20].id)
        ).rejects.toThrow('SOURCE_HOST_BUSY')
        expect(await f.jobs(sessionId)).toHaveLength(20)
        await f.reader.close()
        f.release()
        expect(f.db.listComics({})).toEqual([])
    })
    it('saves one selected chapter, ends authority, reopens SQLite and reads/resumes without any host/cache access', async () => {
        const f = fixture(true),
            { sessionId } = await f.start(),
            ids = await f.choose(sessionId)
        const job = await f.finished(
            sessionId,
            (await f.save(sessionId, ids.comicId, ids.episodeId)).id
        )
        expect(job.localComicId).toMatch(/^local:/)
        expect(job.progressCompleted).toBe(2)
        const serialized = JSON.stringify(await f.jobs(sessionId))
        for (const secret of [
            'private-user',
            'private-pass',
            '/private-book',
            'host.invalid',
            'https:'
        ])
            expect(serialized).not.toContain(secret)
        const local = new ReaderService(f.db, f.dataDir),
            chapters = local.chapters(job.localComicId!)
        expect(chapters).toHaveLength(1)
        local.saveProgress(job.localComicId!, chapters[0].id, 1)
        await f.reader.close()
        const calls = f.calls.length,
            cold = new ReaderService(f.reopen(), f.dataDir)
        const chapter = cold.chapter(job.localComicId!, job.localEpisodeId!)
        expect(chapter.progress?.pageIndex).toBe(1)
        expect(cold.picture(chapter.pages[0].id).data).toEqual(png)
        expect(f.calls).toHaveLength(calls)
        expect(f.db.listDownloadJobs()).toEqual([])
        expect(
            f.db.getAppState('protected-recommendation-visual-tags-sync')
        ).toEqual({ visual: 'OFF', batch: 'unchanged' })
    })
    it('queues distinct chapters into ONE durable local book; duplicate clicks do not fetch/store a second copy', async () => {
        const f = fixture(),
            { sessionId } = await f.start(),
            ids = await f.choose(sessionId)
        f.stall(0)
        const first = await f.save(sessionId, ids.comicId, ids.episodeId),
            duplicate = await f.save(sessionId, ids.comicId, ids.episodeId)
        expect(duplicate.id).toBe(first.id)
        const second = await f.save(sessionId, ids.comicId, ids.laterEpisodeId)
        f.stall(-1)
        f.release()
        const a = await f.finished(sessionId, first.id),
            b = await f.finished(sessionId, second.id)
        expect(b.localComicId).toBe(a.localComicId)
        expect(
            new ReaderService(f.db, f.dataDir).chapters(a.localComicId!)
        ).toHaveLength(2)
        expect(
            f.calls.filter((call) => call.operation === 'IMAGE')
        ).toHaveLength(4)
        expect(f.db.listComics({})).toHaveLength(1)
    })
    it('shows fetched-page progress; cancellation discards an uncommitted chapter but does not revoke reading authority', async () => {
        const f = fixture(),
            { sessionId } = await f.start(),
            ids = await f.choose(sessionId)
        f.stall(1)
        const job = await f.save(sessionId, ids.comicId, ids.episodeId)
        await vi.waitFor(async () => {
            expect((await f.jobs(sessionId))[0]).toMatchObject({
                status: 'RUNNING',
                progressCompleted: 1,
                progressTotal: 2
            })
            expect(
                f.calls.filter((call) => call.operation === 'IMAGE')
            ).toHaveLength(2)
        })
        await f.command({ action: 'download-cancel', sessionId, jobId: job.id })
        await f.finished(sessionId, job.id, 'CANCELLED')
        expect(f.db.listComics({})).toEqual([])
        expect(f.reader.busy).toBe(false)
        f.stall(-1)
        f.release()
        const retried = await f.save(sessionId, ids.comicId, ids.episodeId)
        expect(retried.id).not.toBe(job.id)
        await f.finished(sessionId, retried.id)
    })
    it.each(['disable', 'expire', 'close'] as const)(
        'revocation %s cancels running and queued work without a partial local book',
        async (kind) => {
            const f = fixture(),
                { sessionId } = await f.start(),
                ids = await f.choose(sessionId)
            f.stall(0)
            await f.save(sessionId, ids.comicId, ids.episodeId)
            await f.save(sessionId, ids.comicId, ids.laterEpisodeId)
            await vi.waitFor(() =>
                expect(
                    f.calls.filter((call) => call.operation === 'IMAGE')
                ).toHaveLength(1)
            )
            if (kind === 'disable')
                f.connections.command({
                    action: 'set-enabled',
                    id: HOST,
                    expectedRevision: 1,
                    enabled: false,
                    consent: true
                })
            else if (kind === 'expire') {
                f.advance()
                await expect(f.jobs(sessionId)).rejects.toThrow(
                    'SOURCE_HOST_CANCELLED'
                )
            } else await f.reader.close()
            await vi.waitFor(() => expect(f.reader.busy).toBe(false))
            f.release()
            await Promise.resolve()
            expect(f.db.listComics({})).toEqual([])
            expect(
                f.calls.filter((call) => call.operation === 'IMAGE')
            ).toHaveLength(1)
        }
    )
    it('cancels while waiting for the existing resource coordinator, before any metadata/body fetch or local save', async () => {
        const f = fixture(),
            { sessionId } = await f.start(),
            ids = await f.choose(sessionId)
        const lease = await f.resources.acquire({
            ownerId: 'synthetic-other-job',
            taskType: 'synthetic-hold',
            resources: { 'filesystem-heavy': 1 }
        })
        const before = f.calls.length,
            job = await f.save(sessionId, ids.comicId, ids.episodeId)
        await vi.waitFor(async () =>
            expect((await f.jobs(sessionId))[0].phase).toBe('waiting-resources')
        )
        await f.command({ action: 'download-cancel', sessionId, jobId: job.id })
        await f.finished(sessionId, job.id, 'CANCELLED')
        lease.release()
        expect(f.calls).toHaveLength(before)
        expect(f.db.listComics({})).toEqual([])
        expect(f.resources.activeTaskTypes()).toEqual([])
    })
    it('does not auto-retry failed fetches or expose raw errors; an explicit new save can retry', async () => {
        const f = fixture(),
            { sessionId } = await f.start(),
            ids = await f.choose(sessionId)
        f.fail(1)
        const failed = await f.finished(
            sessionId,
            (await f.save(sessionId, ids.comicId, ids.episodeId)).id,
            'FAILED'
        )
        expect(failed.error).toMatch(/^SOURCE_HOST_/)
        expect(JSON.stringify(failed)).not.toContain('password')
        expect(
            f.calls.filter((call) => call.operation === 'IMAGE')
        ).toHaveLength(2)
        expect(f.db.listComics({})).toEqual([])
        f.fail(-1)
        await f.finished(
            sessionId,
            (await f.save(sessionId, ids.comicId, ids.episodeId)).id
        )
    })
    it('a fresh explicit replacement can fail without removing the saved chapter, favorite or local progress', async () => {
        const f = fixture(),
            { sessionId } = await f.start(),
            ids = await f.choose(sessionId)
        const saved = await f.finished(
            sessionId,
            (await f.save(sessionId, ids.comicId, ids.episodeId)).id
        )
        f.db.setLocalFavoriteState(saved.localComicId!, true)
        const reader = new ReaderService(f.db, f.dataDir)
        reader.saveProgress(saved.localComicId!, saved.localEpisodeId!, 1)
        const before = reader
            .chapter(saved.localComicId!, saved.localEpisodeId!)
            .pages.map((page) => page.id)
        f.fail(1)
        const replacement = await f.save(sessionId, ids.comicId, ids.episodeId)
        expect(replacement.id).not.toBe(saved.id)
        await f.finished(sessionId, replacement.id, 'FAILED')
        const after = reader.chapter(saved.localComicId!, saved.localEpisodeId!)
        expect(after.pages.map((page) => page.id)).toEqual(before)
        expect(after.progress?.pageIndex).toBe(1)
        expect(f.db.getComic(saved.localComicId!)?.isFavorite).toBe(true)
        expect(reader.picture(after.pages[1].id).data).toEqual(png)
    })
    it('scope-checks snapshots/cancellation without doing HTTP; another session cannot cancel this job', async () => {
        const f = fixture(),
            first = await f.start(),
            ids = await f.choose(first.sessionId),
            second = await f.start()
        f.stall(0)
        const job = await f.save(first.sessionId, ids.comicId, ids.episodeId)
        await vi.waitFor(() =>
            expect(
                f.calls.filter((call) => call.operation === 'IMAGE')
            ).toHaveLength(1)
        )
        const calls = f.calls.length
        expect(await f.jobs(second.sessionId)).toEqual([])
        await expect(
            f.command({
                action: 'download-cancel',
                sessionId: second.sessionId,
                jobId: job.id
            })
        ).rejects.toThrow('SOURCE_HOST_STALE')
        expect(f.calls).toHaveLength(calls)
        await f.command({
            action: 'download-cancel',
            sessionId: first.sessionId,
            jobId: job.id
        })
        await f.finished(first.sessionId, job.id, 'CANCELLED')
    })
    it('a late cancel after storage acceptance reports the complete copy, not a false cancelled/unwritten result', async () => {
        const f = fixture(),
            { sessionId } = await f.start(),
            ids = await f.choose(sessionId)
        f.delayCommit()
        const job = await f.save(sessionId, ids.comicId, ids.episodeId)
        await vi.waitFor(() => expect(f.db.listComics({})).toHaveLength(1))
        await f.command({ action: 'download-cancel', sessionId, jobId: job.id })
        f.release()
        const saved = await f.finished(sessionId, job.id)
        expect(saved.cancelRequested).toBe(true)
        expect(
            new ReaderService(f.db, f.dataDir).chapter(
                saved.localComicId!,
                saved.localEpisodeId!
            ).pages
        ).toHaveLength(2)
    })
    it('detects reused remote ownership before saving, and no raw exception creates a local catalogue row', async () => {
        const f = fixture(),
            { sessionId } = await f.start(),
            ids = await f.choose(sessionId)
        f.manga.url = '/different-work'
        const job = await f.finished(
            sessionId,
            (await f.save(sessionId, ids.comicId, ids.episodeId)).id,
            'FAILED'
        )
        expect(job.error).toBe('SOURCE_HOST_STALE')
        expect(f.db.listComics({})).toEqual([])
        expect(f.calls.filter((call) => call.operation === 'IMAGE')).toEqual([])
    })
    it('aborting a local task snapshot before/after execution does not revoke the session or cancel its running save', async () => {
        const f = fixture(),
            { sessionId } = await f.start(),
            ids = await f.choose(sessionId)
        f.stall(0)
        const job = await f.save(sessionId, ids.comicId, ids.episodeId)
        await vi.waitFor(() =>
            expect(
                f.calls.filter((call) => call.operation === 'IMAGE')
            ).toHaveLength(1)
        )
        const before = f.calls.length,
            after = new AbortController()
        const snapshot = f.command(
            { action: 'downloads', sessionId },
            after.signal
        )
        after.abort()
        await snapshot
        const early = new AbortController()
        early.abort()
        await expect(
            f.command({ action: 'downloads', sessionId }, early.signal)
        ).rejects.toThrow('SOURCE_HOST_CANCELLED')
        expect((await f.jobs(sessionId))[0].status).toBe('RUNNING')
        expect(f.calls).toHaveLength(before)
        await f.command({ action: 'download-cancel', sessionId, jobId: job.id })
        await f.finished(sessionId, job.id, 'CANCELLED')
    })
    it('a disconnected cancel reply cancels only that task; another confirmed chapter continues in the same session', async () => {
        const f = fixture(),
            { sessionId } = await f.start(),
            ids = await f.choose(sessionId)
        f.stall(0)
        const first = await f.save(sessionId, ids.comicId, ids.episodeId)
        const second = await f.save(sessionId, ids.comicId, ids.laterEpisodeId)
        await vi.waitFor(() =>
            expect(
                f.calls.filter((call) => call.operation === 'IMAGE')
            ).toHaveLength(1)
        )
        const controller = new AbortController(),
            cancelled = f.command(
                { action: 'download-cancel', sessionId, jobId: first.id },
                controller.signal
            )
        controller.abort()
        f.stall(-1)
        f.release()
        await cancelled
        await f.finished(sessionId, first.id, 'CANCELLED')
        await f.finished(sessionId, second.id)
        expect(f.db.listComics({})).toHaveLength(1)
    })
    it('the emitted adapter reuses existing scheduler/gate/state machine without SQL, filesystem, provider or process modules', async () => {
        const output = await build({
            entryPoints: ['src/source-hosts/local-downloads.ts'],
            bundle: true,
            platform: 'node',
            format: 'esm',
            write: false,
            metafile: true,
            logLevel: 'silent'
        })
        const inputs = Object.keys(output.metafile!.inputs).map((file) =>
            file.replaceAll('\\', '/')
        )
        for (const module of ['scheduler', 'media-gate', 'state-machine'])
            expect(inputs).toContain('src/core/downloads/' + module + '.ts')
        expect(
            inputs.some((file) =>
                /library\/database|local-library\/ingestion|sources\/providers|library\/service/.test(
                    file
                )
            )
        ).toBe(false)
        expect(output.outputFiles[0].text).not.toMatch(
            /node:fs|node:net|node:child_process/
        )
        const main = fs.readFileSync('src/desktop/main.ts', 'utf8')
        expect(main).toContain(
            "if (hostedReader?.busy) leases.push('host-library-reader')"
        )
        expect(main).toContain(
            "await shutdownStep('Hosted local downloads', async () => { await hostedReader?.close() }, errors)"
        )
    })
})
