import fs from 'node:fs'
import path from 'node:path'

export interface InstanceInfo {
    pid: number
    url: string
    startedAt: string
}

function processAlive(pid: number) {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

export class InstanceLock {
    private handle: number | null = null
    constructor(
        readonly lockFile: string,
        readonly infoFile: string
    ) {}

    acquire() {
        fs.mkdirSync(path.dirname(this.lockFile), { recursive: true })
        try {
            this.handle = fs.openSync(this.lockFile, 'wx', 0o600)
            fs.writeFileSync(this.handle, String(process.pid))
            return true
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
            const pid = Number(fs.readFileSync(this.lockFile, 'utf8'))
            if (Number.isInteger(pid) && processAlive(pid)) return false
            fs.rmSync(this.lockFile, { force: true })
            fs.rmSync(this.infoFile, { force: true })
            this.handle = fs.openSync(this.lockFile, 'wx', 0o600)
            fs.writeFileSync(this.handle, String(process.pid))
            return true
        }
    }

    readInfo(): InstanceInfo | null {
        try {
            return JSON.parse(
                fs.readFileSync(this.infoFile, 'utf8')
            ) as InstanceInfo
        } catch {
            return null
        }
    }

    publish(url: string) {
        fs.writeFileSync(
            this.infoFile,
            JSON.stringify({
                pid: process.pid,
                url,
                startedAt: new Date().toISOString()
            }),
            { encoding: 'utf8', mode: 0o600 }
        )
    }

    release() {
        if (this.handle !== null) fs.closeSync(this.handle)
        this.handle = null
        fs.rmSync(this.infoFile, { force: true })
        fs.rmSync(this.lockFile, { force: true })
    }
}
