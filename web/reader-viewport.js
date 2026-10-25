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
        previous.resize?.disconnect()
        for (const [node, name, listener] of previous.listeners)
            node.removeEventListener(name, listener)
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
        const anchor = target.querySelector(
            `[data-reader-page="${resumePage}"]`
        )
        if (!anchor) return false
        const session = {
            abort: new AbortController(),
            frames: new Set(),
            observer: null,
            resize: null,
            listeners: [],
            interacted: false,
            restoreQueued: false,
            sampleQueued: false
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
            // Layout changes and the restore's own scroll are not new reading intent.
            if (
                current() &&
                validPage(index) &&
                (session.interacted || index === resumePage)
            )
                onPage(index)
        }
        const ready = (image) => image.complete && image.naturalHeight > 0
        function listen(node, name, callback) {
            node.addEventListener(name, callback, { passive: true })
            session.listeners.push([node, name, callback])
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
                        ready(image) &&
                        validPage(Number(image.dataset.readerPage))
                    ) {
                        record(Number(image.dataset.readerPage))
                        return
                    }
                }
        }
        function queueSample() {
            if (!current() || session.sampleQueued) return
            session.sampleQueued = true
            frame(() => {
                session.sampleQueued = false
                sample()
            })
        }
        function restore() {
            if (
                !current() ||
                session.interacted ||
                !ready(anchor) ||
                session.restoreQueued
            )
                return
            session.restoreQueued = true
            frame(() => {
                session.restoreQueued = false
                if (session.interacted || !ready(anchor)) return
                anchor.scrollIntoView({ block: 'center', behavior: 'instant' })
                // No write until actual loaded image geometry has been positioned.
                frame(() => {
                    if (!session.interacted) record(resumePage)
                })
            })
        }
        function intent(event) {
            if (!current() || event.defaultPrevented) return
            const node = event.target
            if (
                node?.isContentEditable ||
                node?.closest?.(
                    'input,select,textarea,button,dialog,[role="dialog"],[role="slider"],[role="textbox"],[contenteditable="true"],.driver-popover,.driver-overlay'
                )
            )
                return
            if (
                event.type === 'keydown' &&
                ![
                    'ArrowDown',
                    'ArrowUp',
                    'PageDown',
                    'PageUp',
                    'Home',
                    'End',
                    ' '
                ].includes(event.key)
            )
                return
            if (
                event.type === 'pointerdown' &&
                node !== document.documentElement &&
                !target.contains(node)
            )
                return
            session.interacted = true
            queueSample()
        }
        for (const name of ['wheel', 'touchmove', 'pointerdown', 'keydown'])
            listen(browser, name, intent)
        // Lazy pages reserve a box in CSS. Request only the saved page eagerly,
        // not the preceding chapter, and re-anchor if earlier images alter layout.
        for (const image of target.querySelectorAll('[data-reader-page]')) {
            if (Number(image.dataset.readerPage) <= resumePage) {
                listen(image, 'load', () =>
                    session.interacted ? queueSample() : restore()
                )
            }
        }
        if (!ready(anchor)) anchor.loading = 'eager'
        if ('ResizeObserver' in browser) {
            session.resize = new browser.ResizeObserver(() =>
                session.interacted ? queueSample() : restore()
            )
            session.resize.observe(target)
        }
        if ('IntersectionObserver' in browser) {
            session.observer = new browser.IntersectionObserver(
                () => {
                    if (!current()) return
                    if (session.interacted) queueSample()
                    else restore()
                },
                {
                    root: null,
                    rootMargin: '-45% 0px -45% 0px',
                    threshold: [0, 0.01]
                }
            )
            target
                .querySelectorAll('[data-reader-page]')
                .forEach((image) => session.observer.observe(image))
        }
        listen(browser, 'scroll', () => {
            if (session.interacted) queueSample()
        })
        restore()
        return true
    }
    return { start, stop }
}
