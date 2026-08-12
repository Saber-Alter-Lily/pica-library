export interface LiteState {
    records: Array<Record<string, unknown>>
    authors: Array<Record<string, unknown>>
    profile: Record<string, unknown> | null
    recommendations: Array<Record<string, unknown>>
    queue: Array<Record<string, unknown>>
}

export const LIBRARY_PAGE_SIZE: number

export function emptyLiteState(): LiteState
export function importLibraryBundle(value: unknown): LiteState
export function restoreLiteState(value: unknown): LiteState
export function addLiteQueueItems(
    state: LiteState,
    comicIds: string[],
    source?: string
): LiteState
export function visibleLibraryPage<T>(
    records: T[],
    page?: number,
    pageSize?: number
): T[]
export function selectDisplayTags(
    comic: { tags?: string[] },
    records: Array<{ tags?: string[] }>,
    limit?: number
): string[]
export function loadLiteState(indexedDB?: IDBFactory): Promise<LiteState>
export function saveLiteState(
    state: LiteState,
    indexedDB?: IDBFactory
): Promise<void>
export function clearLiteState(indexedDB?: IDBFactory): Promise<void>
