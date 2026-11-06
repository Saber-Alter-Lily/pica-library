export function createReaderViewportTracker(environment: {
    window: Window & { IntersectionObserver?: typeof IntersectionObserver; ResizeObserver?: typeof ResizeObserver }
    document: Pick<Document, 'elementFromPoint' | 'documentElement'>
    onPage: (index: number) => void
}): {
    start(options: { target: HTMLElement; resumePage: number; pageCount: number; isCurrent: () => boolean }): boolean
    stop(): void
}
