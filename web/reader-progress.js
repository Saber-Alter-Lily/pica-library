/** Deterministic transient Reader state transitions; no transport, source or storage. */
function validPage(reader, index) {
    return (
        Number.isSafeInteger(index) &&
        index >= 0 &&
        index < (reader.chapter?.pages?.length || 0)
    )
}
export function recordReaderProgress(reader, pageIndex) {
    if (!validPage(reader, pageIndex)) return false
    const changed = reader.pageIndex !== pageIndex
    if (changed || !Number.isSafeInteger(reader.progressRevision))
        reader.progressRevision =
            (Number.isSafeInteger(reader.progressRevision)
                ? reader.progressRevision
                : 0) + 1
    reader.pageIndex = pageIndex
    // Returning to the last ACKed page can still supersede an in-flight different page.
    reader.dirty =
        changed || Boolean(reader.dirty) || reader.progressSaved !== pageIndex
    return true
}
export function captureReaderProgress(reader) {
    if (
        !reader.dirty ||
        !reader.comicId ||
        !reader.episodeId ||
        !validPage(reader, reader.pageIndex)
    )
        return null
    return Object.freeze({
        owner: reader,
        chapter: reader.chapter,
        revision: reader.progressRevision ?? 0,
        payload: Object.freeze({
            comicId: reader.comicId,
            episodeId: reader.episodeId,
            pageIndex: reader.pageIndex
        })
    })
}
export function acknowledgeReaderProgress(reader, snapshot) {
    if (
        reader !== snapshot.owner ||
        reader.chapter !== snapshot.chapter ||
        reader.comicId !== snapshot.payload.comicId ||
        reader.episodeId !== snapshot.payload.episodeId ||
        reader.pageIndex !== snapshot.payload.pageIndex ||
        (reader.progressRevision ?? 0) !== snapshot.revision
    )
        return false
    reader.progressSaved = snapshot.payload.pageIndex
    reader.dirty = false
    return true
}
