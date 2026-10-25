/** Browser viewport adapter only: no source identities, persistence or global app state. */
export function createReaderViewportTracker({
    window: browser,
    document,
    onPage
}) {
    let owner = null
    function stop() {
        const previous = owner
        owner = null
        if (!previous) return
        previous.abort.abort()
        for (const id of previous.frames) browser.cancelAnimationFrame(id)
        previous.frames.clear()
        previous.observer?.disconnect()
        if (previous.scroll)
            browser.removeEventListener('scroll', previous.scroll)
    }
    function start({ target, resumePage, pageCount, isCurrent }) {
        stop()
        const validPage = (index) =>
            Number.isSafeInteger(index) && index >= 0 && index < pageCount
        if (
            !Number.isSafeInteger(pageCount) ||
            pageCount <= 0 ||
            !validPage(resumePage) ||
            !target?.isConnected ||
            !isCurrent()
        )
            return false
        const session = {
            abort: new AbortController(),
            frames: new Set(),
            observer: null,
            scroll: null
        }
        owner = session
        function current() {
            if (owner !== session || session.abort.signal.aborted) return false
            if (!target.isConnected || !isCurrent()) {
                stop()
                return false
            }
            return true
        }
        function frame(callback) {
            if (!current()) return
            const id = browser.requestAnimationFrame(() => {
                session.frames.delete(id)
                if (current()) callback()
            })
            session.frames.add(id)
        }
        function record(index) {
            if (current() && validPage(index)) onPage(index)
        }
        function sample() {
            const bounds = target.getBoundingClientRect(),
                centerY = browser.innerHeight / 2
            const xs = [
                bounds.left + bounds.width / 2,
                bounds.left + bounds.width * 0.35,
                bounds.left + bounds.width * 0.65
            ]
            const ys = [
                centerY,
                Math.max(0, centerY - browser.innerHeight * 0.08),
                Math.min(
                    browser.innerHeight - 1,
                    centerY + browser.innerHeight * 0.08
                )
            ]
            for (const y of ys)
                for (const x of xs) {
                    const image = document
                        .elementFromPoint(x, y)
                        ?.closest?.('[data-reader-page]')
                    if (
                        image &&
                        target.contains(image) &&
                        validPage(Number(image.dataset.readerPage))
                    ) {
                        record(Number(image.dataset.readerPage))
                        return
                    }
                }
        }
        frame(() => {
            target
                .querySelector(`[data-reader-page="${resumePage}"]`)
                ?.scrollIntoView({ block: 'center' })
            frame(() => {
                if ('IntersectionObserver' in browser) {
                    const observer = new browser.IntersectionObserver(
                        (entries) => {
                            if (!current()) return
                            const center = browser.innerHeight / 2
                            const nearest = entries
                                .filter(
                                    (entry) =>
                                        entry.isIntersecting &&
                                        target.contains(entry.target) &&
                                        validPage(
                                            Number(
                                                entry.target.dataset.readerPage
                                            )
                                        )
                                )
                                .map((entry) => ({
                                    pageIndex: Number(
                                        entry.target.dataset.readerPage
                                    ),
                                    distance: Math.abs(
                                        entry.boundingClientRect.top +
                                            entry.boundingClientRect.height /
                                                2 -
                                            center
                                    )
                                }))
                                .sort((a, b) => a.distance - b.distance)[0]
                            if (nearest) record(nearest.pageIndex)
                        },
                        {
                            root: null,
                            rootMargin: '-45% 0px -45% 0px',
                            threshold: [0, 0.01]
                        }
                    )
                    session.observer = observer
                    target
                        .querySelectorAll('[data-reader-page]')
                        .forEach((image) => observer.observe(image))
                    record(resumePage)
                } else {
                    let queued = false
                    session.scroll = () => {
                        if (!current() || queued) return
                        queued = true
                        frame(() => {
                            queued = false
                            sample()
                        })
                    }
                    browser.addEventListener('scroll', session.scroll, {
                        passive: true
                    })
                    session.scroll()
                }
            })
        })
        return true
    }
    return { start, stop }
}
