/** Source-independent decisions only. DOM ownership and rendering stay in app.js. */
export function readerKeyboardAction(event, context) {
    if (
        !context.active ||
        context.blocked ||
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
    )
        return null
    // Let the browser leave fullscreen first; do not also close the Reader.
    if (event.key === 'Escape') return context.fullscreen ? null : 'exit'
    if (context.mode !== 'single' && context.mode !== 'double') return null
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') return -1
    if (event.key === 'ArrowRight' || event.key === 'PageDown') return 1
    return null
}

export function readerPageIndex({ pageIndex, total, mode, direction }, delta) {
    if (
        !Number.isSafeInteger(total) ||
        total <= 0 ||
        !Number.isSafeInteger(pageIndex) ||
        pageIndex < 0 ||
        pageIndex >= total ||
        (delta !== -1 && delta !== 1) ||
        (mode !== 'single' && mode !== 'double') ||
        (direction !== 'ltr' && direction !== 'rtl')
    )
        return null
    const step = mode === 'double' ? 2 : 1
    const sign = direction === 'rtl' ? -1 : 1
    return Math.max(0, Math.min(total - 1, pageIndex + delta * step * sign))
}
