import pLimit from 'p-limit'

interface ProgressWriter {
    lanes: Map<string, ReturnType<typeof pLimit>>
    pending: number
}
const writers = new WeakMap<object, ProgressWriter>()

/** Same state-port identity + persisted progress key means one ordered write lane. */
export function orderReaderProgress<T>(
    owner: object,
    key: string,
    write: () => Promise<T>
): Promise<T> {
    if (!key || key.length > 512 || key.includes('\0'))
        return Promise.reject(new Error('Invalid Reader progress namespace'))
    let writer = writers.get(owner)
    if (!writer) {
        writer = { lanes: new Map(), pending: 0 }
        writers.set(owner, writer)
    }
    let lane = writer.lanes.get(key)
    if (!lane) {
        if (writer.lanes.size >= 128) {
            for (const [name, idle] of writer.lanes)
                if (idle.activeCount + idle.pendingCount === 0) {
                    writer.lanes.delete(name)
                    break
                }
        }
        if (writer.lanes.size >= 128)
            return Promise.reject(new Error('Reader progress writer is busy'))
        lane = pLimit(1)
        writer.lanes.set(key, lane)
    }
    if (lane.activeCount + lane.pendingCount >= 64 || writer.pending >= 256)
        return Promise.reject(new Error('Reader progress writer is busy'))
    writer.pending++
    const activeWriter = writer
    return lane(write).finally(() => {
        activeWriter.pending--
    })
}
