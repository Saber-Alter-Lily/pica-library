import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export interface InstanceInfo {
    pid: number
    url: string
    startedAt: string
}
export type InstanceLiveness = 'alive' | 'dead' | 'unknown'
export class InstanceOwnershipError extends Error {
    constructor() {
        super('DESKTOP_INSTANCE_OWNERSHIP')
        this.name = 'InstanceOwnershipError'
    }
}
interface FileRecord {
    stat: fs.BigIntStats
    bytes: Buffer
}
const sameIdentity = (a: fs.BigIntStats, b: fs.BigIntStats) =>
    a.dev === b.dev && a.ino === b.ino
const sameRecord = (a: FileRecord | undefined, b: FileRecord | undefined) =>
    !a || !b
        ? a === b
        : sameIdentity(a.stat, b.stat) &&
          a.stat.size === b.stat.size &&
          a.stat.mtimeNs === b.stat.mtimeNs &&
          a.bytes.equals(b.bytes)
const pidValue = (value: unknown) =>
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 2147483647
        ? value
        : null
function processState(pid: number): InstanceLiveness {
    try {
        process.kill(pid, 0)
        return 'alive'
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'ESRCH'
            ? 'dead'
            : 'unknown'
    }
}
function readRecord(file: string, limit = 16384): FileRecord | undefined {
    let stat: fs.BigIntStats
    try {
        stat = fs.lstatSync(file, { bigint: true })
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
        throw new InstanceOwnershipError()
    }
    if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.nlink !== 1n ||
        stat.size < 0n ||
        stat.size > BigInt(limit)
    )
        throw new InstanceOwnershipError()
    const descriptor = fs.openSync(
        file,
        fs.constants.O_RDONLY |
            (fs.constants.O_NOFOLLOW ?? 0) |
            (process.platform === 'win32' ? 0 : fs.constants.O_NONBLOCK ?? 0)
    )
    try {
        const opened = fs.fstatSync(descriptor, { bigint: true })
        if (!sameIdentity(stat, opened) || opened.size !== stat.size)
            throw new InstanceOwnershipError()
        const bytes = Buffer.alloc(Number(stat.size))
        let position = 0
        while (position < bytes.length) {
            const count = fs.readSync(
                descriptor,
                bytes,
                position,
                bytes.length - position,
                position
            )
            if (!count) throw new InstanceOwnershipError()
            position += count
        }
        const final = fs.lstatSync(file, { bigint: true })
        if (
            !sameIdentity(stat, final) ||
            stat.size !== final.size ||
            stat.mtimeNs !== final.mtimeNs
        )
            throw new InstanceOwnershipError()
        return { stat: final, bytes }
    } finally {
        fs.closeSync(descriptor)
    }
}
function infoValue(record: FileRecord | undefined): InstanceInfo | null {
    try {
        const value: unknown = JSON.parse(record?.bytes.toString('utf8') ?? '')
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return null
        const row = value as Record<string, unknown>
        if (
            !pidValue(row.pid) ||
            typeof row.url !== 'string' ||
            row.url.length > 2048 ||
            /[\x00-\x1f\x7f]/.test(row.url) ||
            typeof row.startedAt !== 'string' ||
            !Number.isFinite(Date.parse(row.startedAt))
        )
            return null
        return {
            pid: row.pid as number,
            url: row.url,
            startedAt: row.startedAt
        }
    } catch {
        return null
    }
}

/** Existing desktop single-instance mechanism; not a general cross-process file sandbox. */
export class InstanceLock {
    private owned: {
        handle: number | null
        lock: FileRecord
        info?: FileRecord
        parent: fs.BigIntStats
        directory: string
    } | null = null
    constructor(
        readonly lockFile: string,
        readonly infoFile: string,
        private readonly options: {
            recoverStale?: boolean
            probeProcess?: (pid: number) => InstanceLiveness
        } = {}
    ) {}
    private state(pid: number) {
        try {
            const state = this.options.probeProcess?.(pid) ?? processState(pid)
            return ['alive', 'dead', 'unknown'].includes(state)
                ? state
                : 'unknown'
        } catch {
            return 'unknown'
        }
    }
    private parent() {
        const directory = path.resolve(path.dirname(this.lockFile))
        if (
            directory !== path.resolve(path.dirname(this.infoFile)) ||
            path.resolve(this.lockFile) === path.resolve(this.infoFile)
        )
            throw new InstanceOwnershipError()
        const stat = fs.lstatSync(directory, { bigint: true })
        if (!stat.isDirectory() || stat.isSymbolicLink())
            throw new InstanceOwnershipError()
        return { directory, stat }
    }
    /** Read-only ownership fence, including metadata we actually adopted. */
    assertHeld() {
        const owned = this.owned
        if (!owned) throw new InstanceOwnershipError()
        const parent = this.parent()
        if (
            parent.directory !== owned.directory ||
            !sameIdentity(parent.stat, owned.parent) ||
            !sameRecord(readRecord(this.lockFile, 64), owned.lock) ||
            !sameRecord(readRecord(this.infoFile), owned.info)
        )
            throw new InstanceOwnershipError()
    }
    private abandonFreshClaim() {
        const owned = this.owned
        if (!owned) return
        if (owned.handle !== null) {
            fs.closeSync(owned.handle)
            owned.handle = null
        }
        const parent = this.parent()
        if (
            !sameIdentity(parent.stat, owned.parent) ||
            !sameRecord(readRecord(this.lockFile, 64), owned.lock)
        )
            throw new InstanceOwnershipError()
        fs.unlinkSync(this.lockFile)
        this.owned = null
    }
    acquire() {
        if (this.owned) {
            this.assertHeld()
            return true
        }
        fs.mkdirSync(path.dirname(this.lockFile), { recursive: true })
        const parent = this.parent()
        let oldInfo: FileRecord | undefined,
            provedDead: number | null = null
        let handle: number
        try {
            handle = fs.openSync(this.lockFile, 'wx', 0o600)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
            // Maintenance never reclaims a stale slot or probes its process.
            if (this.options.recoverStale === false) return false
            let record: FileRecord | undefined
            try {
                record = readRecord(this.lockFile, 64)
                const text = record?.bytes.toString('utf8') ?? ''
                const pid = /^[1-9][0-9]{0,9}$/.test(text.trim())
                    ? pidValue(Number(text.trim()))
                    : null
                if (!record || !pid || this.state(pid) !== 'dead') return false
                provedDead = pid
                oldInfo = readRecord(this.infoFile)
                const info = infoValue(oldInfo)
                if (info && info.pid !== pid && this.state(info.pid) !== 'dead')
                    return false
                if (
                    !sameRecord(readRecord(this.lockFile, 64), record) ||
                    !sameRecord(readRecord(this.infoFile), oldInfo)
                )
                    return false
            } catch {
                return false
            }
            fs.unlinkSync(this.lockFile)
            try {
                handle = fs.openSync(this.lockFile, 'wx', 0o600)
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'EEXIST')
                    return false
                throw error
            }
        }
        try {
            fs.writeFileSync(handle, String(process.pid))
            fs.fsyncSync(handle)
            const lock = readRecord(this.lockFile, 64)
            const opened = fs.fstatSync(handle, { bigint: true })
            if (
                !lock ||
                !sameIdentity(lock.stat, opened) ||
                lock.bytes.toString() !== String(process.pid)
            )
                throw new InstanceOwnershipError()
            this.owned = {
                handle,
                lock,
                directory: parent.directory,
                parent: parent.stat
            }
            const infoRecord = readRecord(this.infoFile),
                info = infoValue(infoRecord)
            const adoptedDeadInfo =
                provedDead !== null && sameRecord(infoRecord, oldInfo)
            if (
                infoRecord &&
                !adoptedDeadInfo &&
                (!info || this.state(info.pid) !== 'dead')
            ) {
                this.abandonFreshClaim()
                return false
            }
            this.owned.info = infoRecord
            this.assertHeld()
            return true
        } catch (error) {
            if (this.owned) {
                // acquire() has not returned ownership to its caller yet. Close
                // the fresh descriptor and remove only our unchanged lock;
                // existing/changed metadata is never adopted or deleted here.
                this.abandonFreshClaim()
            } else {
                try {
                    fs.closeSync(handle)
                } catch {
                    /* retained exclusive slot needs explicit recovery */
                }
            }
            throw error
        }
    }
    readInfo(): InstanceInfo | null {
        try {
            return infoValue(readRecord(this.infoFile))
        } catch {
            return null
        }
    }
    publish(url: string) {
        this.assertHeld()
        if (
            typeof url !== 'string' ||
            url.length > 2048 ||
            /[\x00-\x1f\x7f]/.test(url)
        )
            throw new InstanceOwnershipError()
        const bytes = Buffer.from(
            JSON.stringify({
                pid: process.pid,
                url,
                startedAt: new Date().toISOString()
            })
        )
        const temporary = this.infoFile + '.tmp-' + randomUUID()
        let created: FileRecord | undefined
        try {
            fs.writeFileSync(temporary, bytes, { mode: 0o600, flag: 'wx' })
            created = readRecord(temporary)
            if (!created || !created.bytes.equals(bytes))
                throw new InstanceOwnershipError()
            this.assertHeld()
            fs.renameSync(temporary, this.infoFile)
            created = undefined
            this.owned!.info = readRecord(this.infoFile)
            if (!this.owned!.info?.bytes.equals(bytes))
                throw new InstanceOwnershipError()
            this.assertHeld()
        } finally {
            if (created && sameRecord(readRecord(temporary), created))
                fs.unlinkSync(temporary)
        }
    }
    release() {
        const owned = this.owned
        // Failed/never-acquired startup must not remove the actual owner's files.
        if (!owned) return
        if (owned.handle !== null) {
            fs.closeSync(owned.handle)
            owned.handle = null
        }
        this.assertHeld()
        if (owned.info) {
            fs.unlinkSync(this.infoFile)
            owned.info = undefined
        }
        this.assertHeld()
        fs.unlinkSync(this.lockFile)
        this.owned = null
    }
}
