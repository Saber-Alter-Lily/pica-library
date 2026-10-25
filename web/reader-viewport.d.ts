export function createReaderViewportTracker(environment: {
    window: Window & { IntersectionObserver?: typeof IntersectionObserver }
    document: Pick<Document, 'elementFromPoint'>
    onPage: (index: number) => void
}): {
    start(options: { target: HTMLElement; resumePage: number; pageCount: number; isCurrent: () => boolean }): boolean
    stop(): void
}
