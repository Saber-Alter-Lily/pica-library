import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { readLegacyRegularFile } from './legacy-transition-identity'

export interface LegacyTransitionLock { file: string; nonce: string }
export function legacyTransitionLock(applicationRoot: string, nonce: string): LegacyTransitionLock {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(nonce)) throw Error('LEGACY_TRANSITION_LOCK_IDENTITY_INVALID')
    const root = path.resolve(applicationRoot)
    const key = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 24)
    return { file: path.join(path.dirname(root), '.pica-transition-' + key + '.lock.json'), nonce }
}
export function acquireLegacyTransitionLock(lock: LegacyTransitionLock, applicationRoot: string) {
    if (legacyTransitionLock(applicationRoot, lock.nonce).file !== lock.file) throw Error('LEGACY_TRANSITION_LOCK_IDENTITY_INVALID')
    try { fs.writeFileSync(lock.file, JSON.stringify({ formatVersion: 1, nonce: lock.nonce, applicationRoot: path.resolve(applicationRoot) }), { flag: 'wx' }) }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw Error('LEGACY_TRANSITION_ALREADY_IN_PROGRESS_OR_RECOVERY_PENDING')
        throw Error('LEGACY_TRANSITION_LOCK_WRITE_FAILED')
    }
}
export function assertLegacyTransitionLockOwned(lock: LegacyTransitionLock, applicationRoot: string) {
    try {
        if (legacyTransitionLock(applicationRoot, lock.nonce).file !== lock.file) throw Error('wrong path')
        const value = JSON.parse(readLegacyRegularFile(path.dirname(lock.file), path.basename(lock.file), 4096).toString('utf8'))
        if (value.formatVersion !== 1 || value.nonce !== lock.nonce || value.applicationRoot !== path.resolve(applicationRoot) ||
            Object.keys(value).some(key => !['formatVersion', 'nonce', 'applicationRoot'].includes(key))) throw Error('wrong identity')
    } catch { throw Error('LEGACY_TRANSITION_LOCK_OWNERSHIP_UNKNOWN') }
}
/** Never steal/retry/unlock someone else's or an uncertain-recovery lock. */
export function releaseLegacyTransitionLock(lock: LegacyTransitionLock, applicationRoot: string) {
    try { assertLegacyTransitionLockOwned(lock, applicationRoot); fs.unlinkSync(lock.file); return true }
    catch { return false }
}
