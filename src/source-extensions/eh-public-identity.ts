import { externalComicIdentity } from './reader-contract'

/**
 * The first explicitly app-authorized legacy provider migration uses its
 * existing database IDs. No user records or bookmarks are re-keyed.
 *
 * This pure identity codec knows no network URL, credential or provider SDK.
 * It only converts legacy E-H IDs to the restricted opaque work identifier
 * accepted on the source-worker IPC boundary.
 */
export const EH_PUBLIC_WORKER_ID = 'eh-public-reader'

const LEGACY_EH = /^eh:(\d{1,15}):([0-9a-f]{10})$/i
const WORKER_EH = /^eh-public-reader:(\d{1,15})_([0-9a-f]{10})$/i

function validGid(value: string) {
    const gid = Number(value)
    if (!Number.isSafeInteger(gid) || gid < 1)
        throw new Error('Invalid E-H gallery identity')
}

export function toEhPublicWorkerId(legacy: string): string {
    if (typeof legacy !== 'string') throw new Error('Invalid E-H gallery identity')
    const match = LEGACY_EH.exec(legacy)
    if (!match) throw new Error('Invalid E-H gallery identity')
    validGid(match[1])
    const result = EH_PUBLIC_WORKER_ID + ':' + match[1] + '_' + match[2]
    externalComicIdentity(EH_PUBLIC_WORKER_ID, result)
    return result
}

export function fromEhPublicWorkerId(workerId: string): string {
    if (typeof workerId !== 'string')
        throw new Error('Invalid E-H worker identity')
    const match = WORKER_EH.exec(workerId)
    if (!match) throw new Error('Invalid E-H worker identity')
    validGid(match[1])
    return 'eh:' + match[1] + ':' + match[2]
}

export function ownsLegacyEhId(comicId: string): boolean {
    try {
        toEhPublicWorkerId(comicId)
        return true
    } catch {
        return false
    }
}
