import { randomUUID } from 'node:crypto'
import { DownloadScheduler, type QueueStore } from '../core/downloads/scheduler'
import { MediaRequestGate } from '../core/downloads/media-gate'
import { performanceProfiles } from '../core/downloads/profiles'
import { assertTransition, isTerminal } from '../core/downloads/state-machine'
import type { DownloadJob } from '../core/downloads/types'
import type { GeneratedLocalChapter } from '../local-library/types'
import type { RuntimeResourceCoordinator } from '../runtime/resource-coordinator'
import { SourceHostError, sourceHostAbort } from './contract'

export interface HostedLocalDownloadPorts {
    saveChapter(input: GeneratedLocalChapter): Promise<{
        comicId: string
        episodeId: string
        previousGenerationRetained: boolean
    }>
    resources: Pick<RuntimeResourceCoordinator, 'acquire'>
}
export interface HostedLocalDownloadPlan {
    sessionId: string
    comicId: string
    episodeId: string
    assertAccess(): void
    prepare(signal: AbortSignal): Promise<
        Omit<GeneratedLocalChapter, 'assertAccess' | 'readPage'> & {
            readPage(
                index: number,
                signal: AbortSignal
            ): Promise<{ data: Buffer; extension: string }>
        }
    >
}
interface Entry {
    plan: HostedLocalDownloadPlan
    job: DownloadJob
    controller: AbortController
    cancelRequested: boolean
    phase: 'queued' | 'waiting-resources' | 'fetching' | 'saved' | 'stopped'
    result?: {
        comicId: string
        episodeId: string
        previousGenerationRetained: boolean
    }
}

/** Session-bound adapter to the EXISTING scheduler/state machine, not a second download engine.
 * Only complete saved chapters are durable. No credentials, URLs or unfinished jobs are persisted.
 */
export class HostedLocalDownloads {
    private readonly entries = new Map<string, Entry>()
    private readonly media = new MediaRequestGate(
        performanceProfiles.balanced.globalMediaConcurrency,
        performanceProfiles.balanced.requestIntervalMs
    )
    private readonly scheduler: DownloadScheduler
    private readonly store: QueueStore
    private running: Promise<void> | null = null
    private closed = false

    constructor(private readonly ports: HostedLocalDownloadPorts) {
        const store: QueueStore = {
            nextDownloadJobs: (limit) =>
                [...this.entries.values()]
                    .filter((entry) => entry.job.status === 'QUEUED')
                    .slice(0, limit)
                    .map((entry) => ({ ...entry.job })),
            getDownloadJob: (id) => ({ ...this.entry(id).job }),
            transitionDownloadJob: (id, status, patch = {}) => {
                const entry = this.entry(id)
                assertTransition(entry.job.status, status)
                const now = new Date().toISOString()
                Object.assign(entry.job, patch, {
                    status,
                    startedAt: status === 'RUNNING' ? now : entry.job.startedAt,
                    finishedAt: isTerminal(status) ? now : null
                })
                if (status === 'COMPLETED') entry.phase = 'saved'
                if (status === 'CANCELLED' || status === 'FAILED')
                    entry.phase = 'stopped'
                return { ...entry.job }
            }
        }
        this.store = store
        this.scheduler = new DownloadScheduler(
            store,
            async (job) => {
                const entry = this.entry(job.id)
                let lease:
                    | Awaited<
                          ReturnType<
                              HostedLocalDownloadPorts['resources']['acquire']
                          >
                      >
                    | undefined
                try {
                    this.guard(entry)
                    entry.phase = 'waiting-resources'
                    lease = await ports.resources.acquire({
                        ownerId: 'host-local-save',
                        taskType: 'host-local-download',
                        priority: 'user',
                        resources: {
                            'media-network': 1,
                            'filesystem-heavy': 1,
                            'sqlite-write-heavy': 1
                        },
                        signal: entry.controller.signal
                    })
                    this.guard(entry)
                    const plan = await entry.plan.prepare(
                        entry.controller.signal
                    )
                    this.guard(entry)
                    entry.phase = 'fetching'
                    Object.assign(entry.job, {
                        comicTitle: plan.title,
                        chapterTitle: plan.chapterTitle,
                        progressTotal: plan.pageCount,
                        progressCompleted: 0,
                        bytes: 0
                    })
                    entry.result = await ports.saveChapter({
                        ...plan,
                        assertAccess: () => this.guard(entry),
                        readPage: (index) =>
                            this.media.run(async () => {
                                this.guard(entry)
                                const image = await plan.readPage(
                                    index,
                                    entry.controller.signal
                                )
                                this.guard(entry)
                                entry.job.progressCompleted = index + 1
                                entry.job.bytes += image.data.length
                                return image
                            })
                    })
                    // The inventory's synchronous commit is the acceptance point. A late cancel/revoke
                    // cannot undo a complete local copy while nonfatal old-generation cleanup finishes.
                } catch (error) {
                    if (entry.controller.signal.aborted) {
                        if (!isTerminal(entry.job.status))
                            store.transitionDownloadJob(job.id, 'CANCELLED')
                        throw new SourceHostError('SOURCE_HOST_CANCELLED')
                    }
                    throw new SourceHostError(
                        error instanceof SourceHostError
                            ? error.code
                            : 'SOURCE_HOST_STORAGE'
                    )
                } finally {
                    lease?.release()
                }
            },
            { jobConcurrency: 1, maxRetries: 0 }
        )
    }

    get busy() {
        return this.running !== null
    }
    private entry(id: string) {
        const entry = this.entries.get(id)
        if (!entry) throw new SourceHostError('SOURCE_HOST_STALE')
        return entry
    }
    private guard(entry: Entry) {
        if (this.closed) throw new SourceHostError('SOURCE_HOST_CANCELLED')
        sourceHostAbort(entry.controller.signal)
        entry.plan.assertAccess()
    }
    private view(entry: Entry) {
        const {
            id,
            comicId,
            status,
            progressCompleted,
            progressTotal,
            bytes,
            error,
            comicTitle,
            chapterTitle
        } = entry.job
        return {
            id,
            comicId,
            episodeId: entry.plan.episodeId,
            status,
            progressCompleted,
            progressTotal,
            bytes,
            error,
            comicTitle,
            chapterTitle,
            phase: entry.phase,
            cancelRequested: entry.cancelRequested,
            ...(entry.result
                ? {
                      localComicId: entry.result.comicId,
                      localEpisodeId: entry.result.episodeId,
                      previousGenerationRetained:
                          entry.result.previousGenerationRetained
                  }
                : {})
        }
    }
    snapshot(sessionId: string) {
        return [...this.entries.values()]
            .filter((entry) => entry.plan.sessionId === sessionId)
            .map((entry) => this.view(entry))
    }
    enqueue(plan: HostedLocalDownloadPlan) {
        if (this.closed) throw new SourceHostError('SOURCE_HOST_CANCELLED')
        plan.assertAccess()
        const duplicate = [...this.entries.values()].find(
            (entry) =>
                entry.plan.sessionId === plan.sessionId &&
                entry.plan.comicId === plan.comicId &&
                entry.plan.episodeId === plan.episodeId &&
                !isTerminal(entry.job.status)
        )
        if (duplicate) return this.view(duplicate)
        if (
            [...this.entries.values()].filter(
                (entry) => !isTerminal(entry.job.status)
            ).length >= 20
        )
            throw new SourceHostError('SOURCE_HOST_BUSY')
        while (this.entries.size >= 50) {
            const old = [...this.entries].find(([, entry]) =>
                isTerminal(entry.job.status)
            )
            if (!old) throw new SourceHostError('SOURCE_HOST_BUSY')
            this.entries.delete(old[0])
        }
        const id = randomUUID(),
            entry: Entry = {
                plan: { ...plan },
                controller: new AbortController(),
                cancelRequested: false,
                phase: 'queued',
                job: {
                    id,
                    comicId: plan.comicId,
                    episodeOrders: [],
                    source: 'manual',
                    priority: 0,
                    runner: 'LOCAL',
                    status: 'QUEUED',
                    createdAt: new Date().toISOString(),
                    startedAt: null,
                    finishedAt: null,
                    retryCount: 0,
                    progressCompleted: 0,
                    progressTotal: 0,
                    bytes: 0,
                    error: null
                }
            }
        this.entries.set(id, entry)
        const result = this.view(entry)
        this.kick()
        return result
    }
    cancel(sessionId: string, id: string) {
        const entry = this.entry(id)
        if (entry.plan.sessionId !== sessionId)
            throw new SourceHostError('SOURCE_HOST_STALE')
        if (isTerminal(entry.job.status)) return this.view(entry)
        entry.cancelRequested = true
        entry.controller.abort()
        if (entry.job.status === 'QUEUED')
            this.store.transitionDownloadJob(id, 'CANCELLED')
        return this.view(entry)
    }
    revoke(sessionId: string) {
        for (const [id, entry] of this.entries)
            if (entry.plan.sessionId === sessionId) this.cancel(sessionId, id)
    }
    close() {
        this.closed = true
        this.scheduler.stop()
        for (const entry of this.entries.values())
            this.revoke(entry.plan.sessionId)
        return this.running ?? Promise.resolve()
    }
    private kick() {
        if (this.closed || this.running) return
        this.running = this.scheduler
            .drain()
            .catch(() => {
                for (const entry of this.entries.values())
                    if (!isTerminal(entry.job.status)) {
                        entry.controller.abort()
                        this.store.transitionDownloadJob(
                            entry.job.id,
                            'CANCELLED',
                            { error: 'SOURCE_HOST_STORAGE' }
                        )
                    }
            })
            .finally(() => {
                this.running = null
                if (
                    !this.closed &&
                    [...this.entries.values()].some(
                        (entry) => entry.job.status === 'QUEUED'
                    )
                )
                    this.kick()
            })
    }
}
