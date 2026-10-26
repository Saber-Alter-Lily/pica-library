import { createUpdateAbortScope } from './abort-scope'

export type UpdatePackageDownload = (
    url: string,
    version?: string
) => Promise<Buffer>
type FetchPackage = (
    url: string,
    limit: number,
    onProgress: (current: number, total: number | null) => void,
    signal: AbortSignal
) => Promise<Buffer>
/** One shared application-download slot. A cancelled old task cannot clear a newer task's state. */
export class UpdateDownloadTask {
    private active: { controller: AbortController } | null = null
    private value: Record<string, unknown> | null = null
    constructor(private readonly fetchPackage: FetchPackage) {}
    progress() {
        return this.value ? { ...this.value } : null
    }
    cancel() {
        this.active?.controller.abort()
        this.active = null
        this.value = { phase: 'cancelled', updatedAt: new Date().toISOString() }
    }
    async run<T>(
        task: (
            download: UpdatePackageDownload,
            signal: AbortSignal
        ) => Promise<T>,
        limit: number,
        version?: string,
        externalSignal?: AbortSignal
    ): Promise<T> {
        if (this.active) throw Error('An update download is already running')
        if (externalSignal?.aborted)
            throw Object.assign(Error('Update download was cancelled'), {
                name: 'AbortError'
            })
        const owned = { controller: new AbortController() }
        const scope = createUpdateAbortScope([
            owned.controller.signal,
            externalSignal
        ])
        this.active = owned
        const write = (value: Record<string, unknown>) => {
            if (this.active === owned)
                this.value = { ...value, updatedAt: new Date().toISOString() }
        }
        write({
            phase: 'downloading',
            current: 0,
            total: 0,
            targetVersion: version
        })
        try {
            const result = await task(async (url, targetVersion) => {
                if (scope.signal.aborted)
                    throw Object.assign(
                        Error('Update download was cancelled'),
                        {
                            name: 'AbortError'
                        }
                    )
                version = targetVersion ?? version
                write({
                    phase: 'downloading',
                    current: 0,
                    total: 0,
                    targetVersion: version
                })
                const bytes = await this.fetchPackage(
                    url,
                    limit,
                    (current, total) =>
                        write({
                            phase: 'downloading',
                            current,
                            total: total ?? 0,
                            targetVersion: version
                        }),
                    scope.signal
                )
                if (scope.signal.aborted)
                    throw Object.assign(
                        Error('Update download was cancelled'),
                        { name: 'AbortError' }
                    )
                if (this.active === owned) this.value = null
                return bytes
            }, scope.signal)
            if (scope.signal.aborted)
                throw Object.assign(Error('Update download was cancelled'), {
                    name: 'AbortError'
                })
            return result
        } catch (error) {
            const cancelled =
                scope.signal.aborted ||
                (error instanceof Error && error.name === 'AbortError')
            write({
                phase: cancelled ? 'cancelled' : 'failed',
                error: cancelled
                    ? 'Update download was cancelled'
                    : error instanceof Error
                      ? error.message
                      : String(error),
                targetVersion: version
            })
            if (cancelled)
                throw Object.assign(Error('Update download was cancelled'), {
                    name: 'AbortError'
                })
            throw error
        } finally {
            scope.dispose()
            if (this.active === owned) this.active = null
        }
    }
}
