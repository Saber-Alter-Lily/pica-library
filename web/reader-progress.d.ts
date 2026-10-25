export interface ReaderProgressOwner {
    comicId?: string
    episodeId?: string | null
    pageIndex?: number
    progressSaved?: number | null
    progressRevision?: number
    dirty?: boolean
    chapter?: { pages: unknown[] } | null
}
export interface ReaderProgressSnapshot {
    readonly owner: ReaderProgressOwner
    readonly chapter: ReaderProgressOwner['chapter']
    readonly revision: number
    readonly payload: Readonly<{ comicId: string; episodeId: string; pageIndex: number }>
}
export function recordReaderProgress(reader: ReaderProgressOwner, pageIndex: number): boolean
export function captureReaderProgress(reader: ReaderProgressOwner): ReaderProgressSnapshot | null
export function acknowledgeReaderProgress(reader: ReaderProgressOwner, snapshot: ReaderProgressSnapshot): boolean
