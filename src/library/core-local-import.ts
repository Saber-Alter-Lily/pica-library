import type { LocalLibraryIngestion } from '../local-library/ingestion'

/**
 * Source-neutral bridge for the existing, user-selected folder/CBZ importer.
 * HTTP must never supply filesystem paths: selection is an injected, trusted
 * native UI capability. The same controller also serves disposable CLI QA.
 */
export type CoreLocalKind = 'folder' | 'cbz'
export type CoreLocalAction = 'preview' | 'confirm' | 'cancel' | 'unknown'
export type CoreLocalIngestionPort = Pick<
    LocalLibraryIngestion, 'preview' | 'confirm' | 'cancel'
>

export interface CoreLocalPicker {
    configured(): boolean
    status(): Record<string, unknown>
    chooseLocalComic?: (kind: CoreLocalKind) => Promise<string | null>
}
export interface CoreLocalReply {
    status: 200 | 400 | 404 | 409
    value: unknown
}

const PREFIX = '/api/v1/desktop/local-import/'

export function coreLocalImportMatch(
    method: string, pathname: string
): CoreLocalAction | null {
    if (method !== 'POST' || !pathname.startsWith(PREFIX)) return null
    const operation = pathname.slice(PREFIX.length)
    return operation === 'preview' || operation === 'confirm' ||
        operation === 'cancel' ? operation : 'unknown'
}

/** An available picker must be locally configured and non-headless. */
export function coreLocalImportReady(
    picker?: CoreLocalPicker
): picker is CoreLocalPicker & { chooseLocalComic: NonNullable<CoreLocalPicker['chooseLocalComic']> } {
    if (!picker?.chooseLocalComic) return false
    const runtime = picker.status().runtime
    return !(runtime && typeof runtime === 'object' &&
        (runtime as Record<string, unknown>).mode === 'headless')
}

export class CoreLocalImportController {
    private pickerBusy = false
    constructor(private readonly importer: CoreLocalIngestionPort) {}

    /**
     * Choose is a trusted in-process callback (native file dialog / explicit
     * disposable CLI argument), never an HTTP request field.
     */
    async previewChosen(
        kind: CoreLocalKind, choose: (kind: CoreLocalKind) => Promise<string | null>
    ): Promise<Awaited<ReturnType<CoreLocalIngestionPort['preview']>> | { cancelled: true }> {
        if (this.pickerBusy) throw new Error('Another local import picker is open')
        this.pickerBusy = true
        try {
            const selected = await choose(kind)
            return selected ? await this.importer.preview(selected, kind) : { cancelled: true }
        } finally {
            this.pickerBusy = false
        }
    }

    confirm(token: string) {
        return this.importer.confirm(token)
    }

    cancel(token: string) {
        this.importer.cancel(token)
        return { cancelled: true as const }
    }

    async http(
        action: CoreLocalAction,
        input: Record<string, unknown>,
        picker?: CoreLocalPicker
    ): Promise<CoreLocalReply> {
        if (!coreLocalImportReady(picker))
            return { status: 409, value: {
                error: 'Local import requires the interactive Desktop file picker'
            } }
        // Keep the original request contract. Raw filesystem paths, other
        // metadata and provider/account fields are never accepted from Web.
        if (Object.keys(input).some(key => key !== 'kind' && key !== 'token'))
            return { status: 400, value: {
                error: 'Local paths cannot be submitted through HTTP'
            } }
        if (action === 'preview') {
            if (input.kind !== 'folder' && input.kind !== 'cbz')
                return { status: 400, value: { error: 'Unsupported local import kind' } }
            if (!picker.configured())
                return { status: 409, value: {
                    error: 'Set up the local library directory first'
                } }
            if (this.pickerBusy)
                return { status: 409, value: {
                    error: 'Another local import picker is open'
                } }
            return {
                status: 200,
                value: await this.previewChosen(input.kind, picker.chooseLocalComic)
            }
        }
        if (action === 'confirm')
            return { status: 200, value: await this.confirm(String(input.token ?? '')) }
        if (action === 'cancel')
            return { status: 200, value: this.cancel(String(input.token ?? '')) }
        return { status: 404, value: { error: 'Unknown local import operation' } }
    }
}
