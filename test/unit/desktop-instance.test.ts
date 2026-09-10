import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { InstanceLock } from '../../src/desktop/instance'

const directories: string[] = []
afterEach(() =>
    directories
        .splice(0)
        .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }))
)

describe('desktop single instance lock', () => {
    it('rejects a second live instance and publishes the first URL', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-lock-'))
        directories.push(dir)
        const first = new InstanceLock(
            path.join(dir, 'lock'),
            path.join(dir, 'instance.json')
        )
        const second = new InstanceLock(
            path.join(dir, 'lock'),
            path.join(dir, 'instance.json')
        )
        expect(first.acquire()).toBe(true)
        first.publish('http://127.0.0.1:4789')
        expect(second.acquire()).toBe(false)
        expect(second.readInfo()?.url).toBe('http://127.0.0.1:4789')
        first.release()
    })

    it('recovers a stale lock after abnormal termination', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pica-lock-'))
        directories.push(dir)
        const lock = path.join(dir, 'lock')
        const info = path.join(dir, 'instance.json')
        fs.writeFileSync(lock, '99999999')
        fs.writeFileSync(info, '{}')
        const instance = new InstanceLock(lock, info)
        expect(instance.acquire()).toBe(true)
        instance.release()
    })
})
