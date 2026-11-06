export type LocalImportKind = 'folder' | 'cbz'
export interface LocalPageV1 {
    name: string
    sha256: string
    bytes: number
    extension: string
}
export interface LocalInventoryV1 {
    schemaVersion: 1
    comicId: string
    kind: LocalImportKind
    title: string
    revision: string
    directory: string
    pages: Array<
        LocalPageV1 & {
            id: string
            episodeId: string
            position: number
            localPath: string
        }
    >
    chapters: Array<{
        id: string
        name: string
        order: number
        title: string
        orderHint?: number
    }>
}
export const localInventoryKey = (comicId: string) =>
    `local-library.inventory.${comicId}`

/** Application adapter port; ingestion does not own SQLite, source login or user policy. */
export interface LocalInventoryStore {
    getAppState<T>(key: string): T | undefined
    commitLocalInventory(inventory: LocalInventoryV1): void
}

/** Internal page producer, not an HTTP path/URL or executable source adapter. */
export interface GeneratedLocalChapter {
    comicKey: string
    title: string
    chapterKey: string
    chapterTitle: string
    orderHint: number
    pageCount: number
    assertAccess(): void
    readPage(index: number): Promise<{ data: Buffer; extension: string }>
}
